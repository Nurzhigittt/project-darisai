import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { PublicLecture } from "@/lib/api/client";

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

export type StoredGapCard = {
  id: string;
  lectureId: string;
  front: string;
  quote: string;
  offsetMs: number;
  createdAt: string;
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
  gapcards: {
    key: string;
    value: StoredGapCard;
    indexes: { "by-lecture": string };
  };
}

const DB_NAME = "daris-local-v1";
const DB_VERSION = 1;
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
    const existing = await db.get("sessions", session.lectureId);
    await db.put("sessions", {
      ...session,
      nextSeq: Math.max(existing?.nextSeq ?? 1, session.nextSeq || 1),
    });
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
  const next = session.nextSeq || 1;
  await tx.store.put({ ...session, nextSeq: next + 1 });
  await tx.done;
  return next;
}

export async function setCooldownUntil(lectureId: string, epochMs: number): Promise<void> {
  try {
    const db = await getDb();
    const session = await db.get("sessions", lectureId);
    if (session) {
      await db.put("sessions", { ...session, cooldownUntil: epochMs });
    }
  } catch {
    // Local storage failure must not prevent server-confirmed participation.
  }
}

export async function addPendingSignal(pending: PendingSignal): Promise<void> {
  try {
    const db = await getDb();
    await db.put("pending", pending);
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
    const tx = db.transaction(["signals", "pending"], "readwrite");
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

export async function clearLectureHistory(lectureId: string): Promise<void> {
  try {
    const db = await getDb();
    const signals = await db.getAllFromIndex("signals", "by-lecture", lectureId);
    const pending = await db.getAllFromIndex("pending", "by-lecture", lectureId);
    const gapcards = await db.getAllFromIndex("gapcards", "by-lecture", lectureId);
    const tx = db.transaction(["signals", "pending", "gapcards"], "readwrite");
    await Promise.all([
      ...signals.map((signal) => tx.objectStore("signals").delete(signal.id)),
      ...pending.map((item) => tx.objectStore("pending").delete(item.id)),
      ...gapcards.map((card) => tx.objectStore("gapcards").delete(card.id)),
    ]);
    await tx.done;
  } catch {
    // ignore
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
