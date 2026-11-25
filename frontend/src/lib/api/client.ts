import type { components } from "./types.gen";

export type ProfessorLoginResponse = components["schemas"]["ProfessorLoginResponse"];
export type Course = components["schemas"]["CourseOut"];
export type Lecture = components["schemas"]["LectureOut"];
export type JoinPreview = components["schemas"]["JoinPreview"];
export type JoinResponse = components["schemas"]["JoinResponse"];
export type Heatmap = components["schemas"]["HeatmapResponse"];
export type Summary = components["schemas"]["LectureSummary"];
export type PrivacyManifest = components["schemas"]["PrivacyManifest"];
export type Status = components["schemas"]["StatusResponse"];
export type ControlResponse = components["schemas"]["ControlResponse"];
export type Cluster = components["schemas"]["ClusterOut"];
export type HeatmapBucket = components["schemas"]["HeatmapBucket"];
export type PublicLecture = components["schemas"]["PublicLecture"];
export type Insight = components["schemas"]["InsightOut"];
export type InsightContent = components["schemas"]["InsightContent"];
export type InsightCreate = components["schemas"]["InsightCreate"];
export type InsightEdit = components["schemas"]["InsightEdit"];
export type HandoffLink = components["schemas"]["HandoffLinkOut"];
export type HandoffPublic = components["schemas"]["HandoffPublicOut"];

export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;

  constructor(status: number, code: string, message: string, requestId: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "NETWORK_ERROR", "The server could not be reached.");
  }
  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const body = data as
      | { error?: { code?: string; message?: string; request_id?: string | null } }
      | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? "HTTP_ERROR",
      body?.error?.message ?? "The request could not be completed.",
      body?.error?.request_id ?? null,
    );
  }
  return data as T;
}

export const api = {
  loginProfessor: (inviteCode: string) =>
    request<ProfessorLoginResponse>("/api/v1/auth/professor", {
      method: "POST",
      body: { invite_code: inviteCode },
    }),

  listCourses: (token: string) =>
    request<Course[]>("/api/v1/courses", { token }),

  createCourse: (token: string, title: string) =>
    request<Course>("/api/v1/courses", {
      method: "POST",
      token,
      body: { title },
    }),

  createLecture: (
    token: string,
    body: { course_id: string; title: string; language: "en" | "ru" | "kk" },
  ) =>
    request<Lecture>("/api/v1/lectures", {
      method: "POST",
      token,
      body,
    }),

  listLectures: (token: string) =>
    request<Lecture[]>("/api/v1/lectures", { token }),

  getLecture: (token: string, lectureId: string, signal?: AbortSignal) =>
    request<Lecture>(`/api/v1/lectures/${lectureId}`, { token, signal }),

  controlLecture: (
    token: string,
    lectureId: string,
    action: "start" | "pause" | "resume" | "end",
  ) =>
    request<ControlResponse>(`/api/v1/lectures/${lectureId}/control`, {
      method: "POST",
      token,
      body: { action },
    }),

  getHeatmap: (token: string, lectureId: string) =>
    request<Heatmap>(`/api/v1/lectures/${lectureId}/heatmap`, { token }),

  getSummary: (token: string, lectureId: string) =>
    request<Summary>(`/api/v1/lectures/${lectureId}/summary`, { token }),

  previewJoin: (code: string) =>
    request<JoinPreview>(`/api/v1/join/${encodeURIComponent(code)}/preview`),

  join: (code: string) =>
    request<JoinResponse>("/api/v1/join", {
      method: "POST",
      body: { join_code: code },
    }),

  getStatus: () => request<Status>("/api/v1/status"),

  getPrivacyManifest: () => request<PrivacyManifest>("/api/v1/privacy/manifest"),

  listInsights: (token: string, lectureId: string, signal?: AbortSignal) =>
    request<Insight[]>(`/api/v1/lectures/${lectureId}/insights?limit=100`, { token, signal }),

  createInsight: (token: string, lectureId: string, body: InsightCreate) =>
    request<Insight>(`/api/v1/lectures/${lectureId}/insights`, {
      method: "POST", token, body,
    }),

  approveInsight: (token: string, lectureId: string, insightId: string) =>
    request<Insight>(`/api/v1/lectures/${lectureId}/insights/${insightId}/approve`, {
      method: "POST", token,
    }),

  editInsight: (token: string, lectureId: string, insightId: string, body: InsightEdit) =>
    request<Insight>(`/api/v1/lectures/${lectureId}/insights/${insightId}/edit`, {
      method: "POST", token, body,
    }),

  rejectInsight: (token: string, lectureId: string, insightId: string, reason: string) =>
    request<Insight>(`/api/v1/lectures/${lectureId}/insights/${insightId}/reject`, {
      method: "POST", token, body: { reason },
    }),

  publishHandoff: (token: string, lectureId: string, insightId: string) =>
    request<HandoffLink>(`/api/v1/lectures/${lectureId}/insights/${insightId}/publish`, {
      method: "POST", token,
    }),

  redeemHandoff: (token: string, signal?: AbortSignal) =>
    request<HandoffPublic>("/api/v1/handoff/redeem", {
      method: "POST", body: { token }, signal,
    }),
};
