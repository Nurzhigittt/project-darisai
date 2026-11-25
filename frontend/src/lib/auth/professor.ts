export type ProfessorSession = {
  accessToken: string;
  professorId: string;
  name: string;
  expiresAt: number;
};

const STORAGE_KEY = "daris.professor.session";

export function saveProfessorSession(session: ProfessorSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function getProfessorSession(): ProfessorSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProfessorSession>;
    if (
      typeof parsed.accessToken !== "string" ||
      typeof parsed.professorId !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }
    if (parsed.expiresAt * 1000 <= Date.now()) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed as ProfessorSession;
  } catch {
    return null;
  }
}

export function clearProfessorSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function buildProfessorSession(
  token: string,
  expiresIn: number,
  professor: { id: string; name: string },
): ProfessorSession {
  return {
    accessToken: token,
    professorId: professor.id,
    name: professor.name,
    expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
  };
}
