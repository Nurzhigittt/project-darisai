import { beforeEach, describe, expect, it } from "vitest";

import {
  addPendingSignal,
  allocateClientSeq,
  getSession,
  listConfirmedSignals,
  listPendingSignals,
  recordConfirmedSignal,
  resetLocalDbForTests,
  saveSession,
} from "@/lib/storage/db";

const baseSession = {
  lectureId: "lecture-test-1",
  joinCode: "ABC123",
  signalToken: "signal-token-placeholder",
  replayToken: "replay-token-placeholder",
  lecture: {
    id: "lecture-test-1",
    title: "Test lecture",
    status: "live" as const,
    language: "en" as const,
    course_title: "Course",
  },
  wsUrl: "ws://localhost:8000/ws",
  joinedAt: "2026-11-25T10:00:00Z",
  signalTokenExpiresAt: "2026-11-25T14:00:00Z",
  replayTokenExpiresAt: "2026-11-26T10:00:00Z",
  nextSeq: 1,
  cooldownUntil: 0,
};

describe("local IndexedDB history", () => {
  beforeEach(async () => {
    await resetLocalDbForTests();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("daris-local-v1");
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  });

  it("increments a durable client sequence and records only confirmed signals", async () => {
    expect(await saveSession(baseSession)).toBe(true);
    const first = await allocateClientSeq(baseSession.lectureId);
    const second = await allocateClientSeq(baseSession.lectureId);
    expect([first, second]).toEqual([1, 2]);
    expect((await getSession(baseSession.lectureId))?.nextSeq).toBe(3);

    await addPendingSignal({
      id: `${baseSession.lectureId}:2`,
      lectureId: baseSession.lectureId,
      clientSeq: 2,
      createdAt: Date.now(),
      clientTsMs: Date.now(),
    });
    expect(await listPendingSignals(baseSession.lectureId)).toHaveLength(1);

    await recordConfirmedSignal({
      id: `${baseSession.lectureId}:2`,
      lectureId: baseSession.lectureId,
      clientSeq: 2,
      offsetMs: 42_000,
      acceptedAt: "2026-11-25T10:01:00Z",
    });

    const confirmed = await listConfirmedSignals(baseSession.lectureId);
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]?.offsetMs).toBe(42_000);
    expect(await listPendingSignals(baseSession.lectureId)).toHaveLength(0);
  });

  it("returns safe defaults for an unknown lecture", async () => {
    expect(await getSession("missing")).toBeNull();
    expect(await listConfirmedSignals("missing")).toEqual([]);
  });
});
