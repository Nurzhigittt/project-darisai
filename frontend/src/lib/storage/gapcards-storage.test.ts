import { beforeEach, describe, expect, it } from "vitest";

import { addPendingSignal, allocateClientSeq, clearLectureHistory, getHistoryRevision, getSession, listConfirmedSignals, listPendingSignals, listReplayProgress, listStoredGapCards, nextGapCardReview, recordConfirmedSignal, resetLocalDbForTests, reviewStoredGapCard, saveReplayProgress, saveSession, saveStoredGapCards, setCooldownUntil, type LocalSession, type StoredGapCard, type StoredReplayProgress } from "@/lib/storage/db";

const lectureId = "storage-gap-lecture";
const card: StoredGapCard = { id: "local-card", lectureId, front: "What changes?", quote: "The force changes.", offsetMs: 12000, createdAt: "2026-11-26T10:00:00Z" };
const progress: StoredReplayProgress = { id: `${lectureId}:12000`, lectureId, offsetMs: 12000, conceptTitle: "Force", recap: "Force changes.", recapCitations: [], source: "template", messages: [{ role: "student", text: "More force." }], completed: true, outcome: "partial", updatedAt: "2026-11-26T10:00:00Z" };

const session: LocalSession = {
  lectureId, joinCode: "TEST01", signalToken: "test-signal", replayToken: "test-replay",
  lecture: { id: lectureId, title: "Physics", course_title: "Mechanics", status: "ended", language: "en" },
  wsUrl: "ws://localhost/ws", joinedAt: "2026-11-26T10:00:00Z", signalTokenExpiresAt: "2026-11-26T11:00:00Z", replayTokenExpiresAt: "2026-11-27T10:00:00Z", nextSeq: 1, cooldownUntil: 0,
};

beforeEach(async () => {
  await resetLocalDbForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("daris-local-v1");
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
});

describe("local review storage", () => {
  it("upgrades the existing v1 database without discarding legacy cards or sessions", async () => {
    const old = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("daris-local-v1", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("sessions", { keyPath: "lectureId" });
        for (const name of ["signals", "pending", "gapcards"]) request.result.createObjectStore(name, { keyPath: "id" }).createIndex("by-lecture", "lectureId");
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = old.transaction(["sessions", "gapcards"], "readwrite");
      tx.objectStore("sessions").put({ lectureId, lecture: { title: "Existing lecture" } });
      tx.objectStore("gapcards").put(card);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    old.close();
    expect(await listStoredGapCards(lectureId)).toEqual([card]);
    expect((await getSession(lectureId))?.lecture.title).toBe("Existing lecture");
    expect(await saveReplayProgress(progress)).toBe(true);
    expect(await listReplayProgress(lectureId)).toEqual([progress]);
  });

  it("persists ratings transactionally, with increasing local intervals and an Again reset", async () => {
    await saveStoredGapCards(lectureId, [card]);
    const now = Date.parse("2026-11-26T10:00:00Z");
    const good = await reviewStoredGapCard(card.id, "good", now);
    expect(good?.review).toMatchObject({ box: 1, reviewCount: 1, lastRating: "good", dueAt: "2026-11-27T10:00:00.000Z" });
    const easy = await reviewStoredGapCard(card.id, "easy", now);
    expect(easy?.review?.box).toBe(3);
    expect(easy?.review?.reviewCount).toBe(2);
    expect(new Date(easy!.review!.dueAt).getTime()).toBeGreaterThan(new Date(good!.review!.dueAt).getTime());
    const again = await reviewStoredGapCard(card.id, "again", now);
    expect(again?.review).toMatchObject({ box: 0, reviewCount: 3, dueAt: "2026-11-26T10:10:00.000Z" });
    expect(nextGapCardReview(again?.review, "hard", now)).toMatchObject({ box: 1, reviewCount: 4, dueAt: "2026-11-27T10:00:00.000Z" });
    await resetLocalDbForTests();
    expect((await listStoredGapCards(lectureId))[0]?.review).toEqual(again?.review);
  });

  it("does not store extra signed credentials and clears both Replay and card history per lecture", async () => {
    const extra = { ...progress, moment_id: "signed-moment-secret", state_token: "signed-state-secret", messages: [{ ...progress.messages[0]!, state_token: "signed-inner-secret" }] };
    await saveReplayProgress(extra);
    await saveStoredGapCards(lectureId, [{ ...card, moment_id: "signed-card-secret" } as StoredGapCard]);
    await saveStoredGapCards("other-lecture", [{ ...card, id: "other-card", lectureId: "other-lecture" }]);
    const serialized = JSON.stringify([await listReplayProgress(lectureId), await listStoredGapCards(lectureId)]);
    expect(serialized).not.toContain("signed-");
    expect(await clearLectureHistory(lectureId)).toBe(true);
    expect(await listReplayProgress(lectureId)).toEqual([]);
    expect(await listStoredGapCards(lectureId)).toEqual([]);
    expect(await listStoredGapCards("other-lecture")).toHaveLength(1);
  });

  it("rejects stale generated content atomically when history is cleared during generation", async () => {
    await saveSession(session);
    const revision = await getHistoryRevision(lectureId);
    await saveReplayProgress(progress, revision);
    await saveStoredGapCards(lectureId, [card], revision);
    // Simulate another tab clearing while both pending generations finish.
    const clearing = clearLectureHistory(lectureId);
    const replayWrite = saveReplayProgress(progress, revision);
    const cardWrite = saveStoredGapCards(lectureId, [card], revision);
    expect(await Promise.all([clearing, replayWrite, cardWrite])).toEqual([true, false, false]);
    expect(await getHistoryRevision(lectureId)).toBe(revision + 1);
    expect(await listReplayProgress(lectureId)).toEqual([]);
    expect(await listStoredGapCards(lectureId)).toEqual([]);
    // A new, intentionally started request may use the current revision.
    expect(await saveReplayProgress(progress, revision + 1)).toBe(true);
    expect(await saveStoredGapCards(lectureId, [card], revision + 1)).toBe(true);
    expect(await reviewStoredGapCard(card.id, "good", Date.now(), revision)).toBeNull();
    expect((await listStoredGapCards(lectureId))[0]?.review).toBeUndefined();
  });

  it("does not let a concurrent session refresh or cooldown update undo a privacy clear", async () => {
    await saveSession(session);
    await Promise.all([clearLectureHistory(lectureId), saveSession({ ...session, nextSeq: 8 }), setCooldownUntil(lectureId, 12345)]);
    expect(await getHistoryRevision(lectureId)).toBe(1);
    expect(await getSession(lectureId)).toMatchObject({ historyRevision: 1, nextSeq: 8, cooldownUntil: 12345 });
  });

  it("does not restore cleared signals when an in-flight live acknowledgement arrives late", async () => {
    await saveSession(session);
    const acceptedSeq = await allocateClientSeq(lectureId);
    const inFlightSeq = await allocateClientSeq(lectureId);
    const signal = { id: `${lectureId}:${acceptedSeq}`, lectureId, clientSeq: acceptedSeq, offsetMs: 12000, acceptedAt: "2026-11-26T10:00:00Z" };
    expect(await recordConfirmedSignal(signal)).toBe(true);
    // The online send is not queued in pending. Its sequence is already allocated.
    const inFlight = { ...signal, id: `${lectureId}:${inFlightSeq}`, clientSeq: inFlightSeq };
    expect(await Promise.all([clearLectureHistory(lectureId), recordConfirmedSignal(inFlight)])).toEqual([true, false]);
    expect(await listConfirmedSignals(lectureId)).toEqual([]);
    expect(await recordConfirmedSignal(signal)).toBe(false);
    // A stale join/session snapshot and cooldown write cannot reset the boundary.
    await Promise.all([saveSession(session), setCooldownUntil(lectureId, 12345)]);
    expect(await recordConfirmedSignal(inFlight)).toBe(false);
    const freshSeq = await allocateClientSeq(lectureId);
    expect(freshSeq).toBeGreaterThan(inFlightSeq);
    const fresh = { ...signal, id: `${lectureId}:${freshSeq}`, clientSeq: freshSeq };
    expect(await recordConfirmedSignal(fresh)).toBe(true);
    expect(await listConfirmedSignals(lectureId)).toEqual([fresh]);
  });

  it("does not requeue an offline send cleared in another tab, while accepting new sends", async () => {
    await saveSession(session);
    const oldSeq = await allocateClientSeq(lectureId);
    const pending = { id: `${lectureId}:${oldSeq}`, lectureId, clientSeq: oldSeq, createdAt: 1, clientTsMs: 1 };
    await Promise.all([clearLectureHistory(lectureId), addPendingSignal(pending)]);
    expect(await listPendingSignals(lectureId)).toEqual([]);
    const newSeq = await allocateClientSeq(lectureId);
    const fresh = { ...pending, id: `${lectureId}:${newSeq}`, clientSeq: newSeq };
    await addPendingSignal(fresh);
    expect(await listPendingSignals(lectureId)).toEqual([fresh]);
    expect(await recordConfirmedSignal({ id: fresh.id, lectureId, clientSeq: newSeq, offsetMs: 15000, acceptedAt: "2026-11-26T10:00:00Z" })).toBe(true);
    expect(await listPendingSignals(lectureId)).toEqual([]);
  });

  it("keeps a newer rating from another tab when refreshing matching card content", async () => {
    await saveSession(session);
    const revision = await getHistoryRevision(lectureId);
    await saveStoredGapCards(lectureId, [card], revision);
    const old = await reviewStoredGapCard(card.id, "good");
    const newer = await reviewStoredGapCard(card.id, "easy");
    expect(await saveStoredGapCards(lectureId, [{ ...card, id: "new-server-id", review: old!.review }], revision)).toBe(true);
    expect((await listStoredGapCards(lectureId))[0]?.review).toEqual(newer?.review);
  });

});
