import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { GapCard, PublicLecture } from "@/lib/api/client";

export type LocalSession = {
  lectureId: string;
  joinCode: string;
  signalToken: string;
  replayToken: string;
  lecture: PublicLecture;
  wsUrl: string;
  joinedAt: string;
  signalTokenExpiresAt: string;
  replayTokenExpiresAt: string;
  nextSeq: number;
  cooldownUntil: number;
  historyRevision?: number;
  clearedSignalThroughSeq?: number;
};

export type ConfirmedSignal = {
  id: string;
  lectureId: string;
  clientSeq: number;
  offsetMs: number;
  acceptedAt: string;
};

export type PendingSignal = {
  id: string;
  lectureId: string;
  clientSeq: number;
  createdAt: number;
  clientTsMs: number;
};

export type GapCardRating = "again" | "hard" | "good" | "easy";

export type GapCardReview = {
  box: number;
  reviewCount: number;
  lastRating: GapCardRating;
  reviewedAt: string;
  dueAt: string;
};

export type StoredReplayMessage = {
  role: "axiom" | "student";
  text: string;
  kind?: "mcq" | "question" | "reflection" | "refusal";
  citations?: GapCard["back"]["citation"][];
  options?: Array<{ id: string; text: string }>;
  source?: "live" | "prebaked" | "template";
};

export type StoredReplayProgress = {
  id: string;
  lectureId: string;
  offsetMs: number;
  conceptTitle: string;
  recap: string;
  recapCitations: GapCard["back"]["citation"][];
  source: "live" | "prebaked" | "template";
  messages: StoredReplayMessage[];
  completed: boolean;
  outcome: "unclear" | "partial" | "clear";
  updatedAt: string;
};

export type StoredGapCard = {
  id: string;
  lectureId: string;
  front: string;
  quote: string;
  offsetMs: number;
  createdAt: string;
  // Optional fields preserve readability of cards created with database v1.
  conceptTitle?: string;
  source?: GapCard["source"];
  citation?: GapCard["back"]["citation"];
  difficulty?: GapCard["difficulty"];
  review?: GapCardReview;
};

interface DarisLocalDb extends DBSchema {
  sessions: {
    key: string;
    value: LocalSession;
  };
  signals: {
    key: string;
    value: ConfirmedSignal;
    indexes: { "by-lecture": string };
  };
  pending: {
    key: string;
    value: PendingSignal;
    indexes: { "by-lecture": string };
  };
  replay: {
    key: string;
    value: StoredReplayProgress;
    indexes: { "by-lecture": string };
  };
  gapcards: {
    key: string;
    value: StoredGapCard;
    indexes: { "by-lecture": string };
  };
}

const DB_NAME = "daris-local-v1";
const DB_VERSION = 2;
let dbPromise: Promise<IDBPDatabase<DarisLocalDb>> | null = null;

function getDb(): Promise<IDBPDatabase<DarisLocalDb>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable"));
  }
  if (!dbPromise) {
    dbPromise = openDB<DarisLocalDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("sessions")) {
          db.createObjectStore("sessions", { keyPath: "lectureId" });
        }
        if (!db.objectStoreNames.contains("signals")) {
          const store = db.createObjectStore("signals", { keyPath: "id" });
          store.createIndex("by-lecture", "lectureId");
        }
        if (!db.objectStoreNames.contains("pending")) {
          const store = db.createObjectStore("pending", { keyPath: "id" });
          store.createIndex("by-lecture", "lectureId");
        }
        if (!db.objectStoreNames.contains("replay")) {
          const store = db.createObjectStore("replay", { keyPath: "id" });
          store.createIndex("by-lecture", "lectureId");
        }
        if (!db.objectStoreNames.contains("gapcards")) {
          const store = db.createObjectStore("gapcards", { keyPath: "id" });
          store.createIndex("by-lecture", "lectureId");
        }
      },
    });
  }
  return dbPromise;
}

export async function resetLocalDbForTests(): Promise<void> {
  if (dbPromise) {
    try {
      (await dbPromise).close();
    } catch {
      // A failed open has no connection to close.
    }
    dbPromise = null;
  }
}

export async function saveSession(session: LocalSession): Promise<boolean> {
  try {
    const db = await getDb();
    const tx = db.transaction("sessions", "readwrite");
    const existing = await tx.store.get(session.lectureId);
    await tx.store.put({
      ...session,
      nextSeq: Math.max(existing?.nextSeq ?? 1, session.nextSeq || 1),
      historyRevision: Math.max(existing?.historyRevision ?? 0, session.historyRevision ?? 0),
      clearedSignalThroughSeq: Math.max(existing?.clearedSignalThroughSeq ?? 0, session.clearedSignalThroughSeq ?? 0),
    });
    await tx.done;
    return true;
  } catch {
    return false;
  }
}

export async function getSession(lectureId: string): Promise<LocalSession | null> {
  try {
    const db = await getDb();
    return (await db.get("sessions", lectureId)) ?? null;
  } catch {
    return null;
  }
}

export async function listSessions(): Promise<LocalSession[]> {
  try {
    const db = await getDb();
    return await db.getAll("sessions");
  } catch {
    return [];
  }
}

export async function allocateClientSeq(lectureId: string): Promise<number> {
  const db = await getDb();
  const tx = db.transaction("sessions", "readwrite");
  const session = await tx.store.get(lectureId);
  if (!session) {
    await tx.done;
    throw new Error("No local session");
  }
  const next = Math.max(session.nextSeq || 1, (session.clearedSignalThroughSeq ?? 0) + 1);
  await tx.store.put({ ...session, nextSeq: next + 1 });
  await tx.done;
  return next;
}

export async function setCooldownUntil(lectureId: string, epochMs: number): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction("sessions", "readwrite");
    const session = await tx.store.get(lectureId);
    if (session) await tx.store.put({ ...session, cooldownUntil: epochMs });
    await tx.done;
  } catch {
    // Local storage failure must not prevent server-confirmed participation.
  }
}

export async function addPendingSignal(pending: PendingSignal): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(["sessions", "pending"], "readwrite");
    const session = await tx.objectStore("sessions").get(pending.lectureId);
    if (pending.clientSeq > (session?.clearedSignalThroughSeq ?? 0)) {
      await tx.objectStore("pending").put(pending);
    }
    await tx.done;
  } catch {
    // In-memory state still reports the failed send.
  }
}

export async function removePendingSignal(id: string): Promise<void> {
  try {
    const db = await getDb();
    await db.delete("pending", id);
  } catch {
    // ignore
  }
}

export async function listPendingSignals(lectureId: string): Promise<PendingSignal[]> {
  try {
    const db = await getDb();
    return await db.getAllFromIndex("pending", "by-lecture", lectureId);
  } catch {
    return [];
  }
}

export async function recordConfirmedSignal(signal: ConfirmedSignal): Promise<boolean> {
  try {
    const db = await getDb();
    const tx = db.transaction(["sessions", "signals", "pending"], "readwrite");
    const session = await tx.objectStore("sessions").get(signal.lectureId);
    // An accepted/duplicate ack can arrive after another tab clears history.
    // Keep server participation intact without restoring a locally erased signal.
    if (signal.clientSeq <= (session?.clearedSignalThroughSeq ?? 0)) {
      await tx.done;
      return false;
    }
    await tx.objectStore("signals").put(signal);
    const pendingId = `${signal.lectureId}:${signal.clientSeq}`;
    await tx.objectStore("pending").delete(pendingId);
    await tx.done;
    return true;
  } catch {
    return false;
  }
}

export async function listConfirmedSignals(lectureId: string): Promise<ConfirmedSignal[]> {
  try {
    const db = await getDb();
    const signals = await db.getAllFromIndex("signals", "by-lecture", lectureId);
    return signals.sort((a, b) => a.offsetMs - b.offsetMs);
  } catch {
    return [];
  }
}

export async function clearLectureHistory(lectureId: string): Promise<boolean> {
  try {
    const db = await getDb();
    const tx = db.transaction(["sessions", "signals", "pending", "gapcards", "replay"], "readwrite");
    const [signals, pending, gapcards, replay] = await Promise.all([
      tx.objectStore("signals").index("by-lecture").getAll(lectureId),
      tx.objectStore("pending").index("by-lecture").getAll(lectureId),
      tx.objectStore("gapcards").index("by-lecture").getAll(lectureId),
      tx.objectStore("replay").index("by-lecture").getAll(lectureId),
    ]);
    const session = await tx.objectStore("sessions").get(lectureId);
    if (session) {
      const clearedSignalThroughSeq = [...signals, ...pending].reduce(
        (last, signal) => Math.max(last, signal.clientSeq),
        Math.max(session.clearedSignalThroughSeq ?? 0, (session.nextSeq || 1) - 1),
      );
      await tx.objectStore("sessions").put({
        ...session,
        historyRevision: (session.historyRevision ?? 0) + 1,
        clearedSignalThroughSeq,
      });
    }
    await Promise.all([
      ...signals.map((signal) => tx.objectStore("signals").delete(signal.id)),
      ...pending.map((item) => tx.objectStore("pending").delete(item.id)),
      ...gapcards.map((card) => tx.objectStore("gapcards").delete(card.id)),
      ...replay.map((item) => tx.objectStore("replay").delete(item.id)),
    ]);
    await tx.done;
    return true;
  } catch {
    return false;
  }
}

export async function listStoredGapCards(lectureId: string): Promise<StoredGapCard[]> {
  try {
    const db = await getDb();
    return await db.getAllFromIndex("gapcards", "by-lecture", lectureId);
  } catch {
    return [];
  }
}

export async function listReplayProgress(lectureId: string): Promise<StoredReplayProgress[]> {
  try {
    const db = await getDb();
    return (await db.getAllFromIndex("replay", "by-lecture", lectureId)).sort((a, b) => a.offsetMs - b.offsetMs);
  } catch {
    return [];
  }
}

export async function getHistoryRevision(lectureId: string): Promise<number> {
  try {
    const db = await getDb();
    return (await db.get("sessions", lectureId))?.historyRevision ?? 0;
  } catch {
    return -1;
  }
}

export async function saveReplayProgress(progress: StoredReplayProgress, expectedRevision?: number): Promise<boolean> {
  try {
    const db = await getDb();
    const tx = db.transaction(["sessions", "replay"], "readwrite");
    if (expectedRevision !== undefined) {
      const session = await tx.objectStore("sessions").get(progress.lectureId);
      if (!session || (session.historyRevision ?? 0) !== expectedRevision) { await tx.done; return false; }
    }
    // Persist an explicit allowlist: signed moment/state credentials stay in memory.
    await tx.objectStore("replay").put({
      id: progress.id, lectureId: progress.lectureId, offsetMs: progress.offsetMs,
      conceptTitle: progress.conceptTitle, recap: progress.recap, recapCitations: progress.recapCitations,
      source: progress.source,
      messages: progress.messages.map((message) => ({
        role: message.role, text: message.text, kind: message.kind, citations: message.citations,
        options: message.options, source: message.source,
      })),
      completed: progress.completed,
      outcome: progress.outcome, updatedAt: progress.updatedAt,
    });
    await tx.done;
    return true;
  } catch {
    return false;
  }
}

export async function saveStoredGapCards(lectureId: string, cards: StoredGapCard[], expectedRevision?: number): Promise<boolean> {
  if (cards.some((card) => card.lectureId !== lectureId)) return false;
  try {
    const db = await getDb();
    const tx = db.transaction(["sessions", "gapcards"], "readwrite");
    if (expectedRevision !== undefined) {
      const session = await tx.objectStore("sessions").get(lectureId);
      if (!session || (session.historyRevision ?? 0) !== expectedRevision) { await tx.done; return false; }
    }
    const store = tx.objectStore("gapcards");
    const previous = await store.index("by-lecture").getAll(lectureId);
    const latestReviews = new Map(previous.map((card) => [JSON.stringify([card.offsetMs, card.front, card.quote]), card.review]));
    await Promise.all(previous.map((card) => store.delete(card.id)));
    await Promise.all(cards.map((card) => store.put({
      id: card.id, lectureId: card.lectureId, front: card.front, quote: card.quote,
      offsetMs: card.offsetMs, createdAt: card.createdAt, conceptTitle: card.conceptTitle,
      source: card.source, citation: card.citation, difficulty: card.difficulty,
      review: latestReviews.get(JSON.stringify([card.offsetMs, card.front, card.quote])) ?? card.review,
    })));
    await tx.done;
    return true;
  } catch {
    return false;
  }
}

export function nextGapCardReview(previous: GapCardReview | undefined, rating: GapCardRating, now: number): GapCardReview {
  const oldBox = previous?.box ?? 0;
  const box = rating === "again" ? 0 : rating === "hard" ? Math.max(1, oldBox) : Math.min(5, oldBox + (rating === "easy" ? 2 : 1));
  const days = rating === "hard" ? 1 : rating === "easy" ? Math.min(60, 7 * 2 ** Math.max(0, box - 2)) : Math.min(30, 2 ** Math.max(0, box - 1));
  return {
    box, reviewCount: (previous?.reviewCount ?? 0) + 1, lastRating: rating,
    reviewedAt: new Date(now).toISOString(), dueAt: new Date(now + (rating === "again" ? 10 * 60_000 : days * 86_400_000)).toISOString(),
  };
}

export async function reviewStoredGapCard(id: string, rating: GapCardRating, now = Date.now(), expectedRevision?: number): Promise<StoredGapCard | null> {
  try {
    const db = await getDb();
    const tx = db.transaction(["sessions", "gapcards"], "readwrite");
    const store = tx.objectStore("gapcards");
    const card = await store.get(id);
    if (!card) { await tx.done; return null; }
    if (expectedRevision !== undefined) {
      const session = await tx.objectStore("sessions").get(card.lectureId);
      if (!session || (session.historyRevision ?? 0) !== expectedRevision) { await tx.done; return null; }
    }
    const updated = { ...card, review: nextGapCardReview(card.review, rating, now) };
    await store.put(updated);
    await tx.done;
    return updated;
  } catch {
    return null;
  }
}
