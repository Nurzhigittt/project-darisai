import { SupabaseSocket } from "./supabase";

export type WsStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "reconnecting"
  | "offline"
  | "closed";

export type ClusterPayload = {
  cluster_id: string;
  started_offset_ms: number;
  peak_intensity: number;
};

export type WsEvent = {
  v: 1;
  type: string;
  msg_id: string;
  ts: string;
  lecture_id: string;
  payload: Record<string, unknown>;
};

export type HelloOkPayload = {
  offset_ms: number;
  lecture_status: "scheduled" | "live" | "paused" | "ended";
  signal_cooldown_ms: number;
  connecting_role: "student" | "professor";
  replay_scope_available: boolean;
  server_time: string;
};

export type SignalAckPayload = {
  client_seq: number;
  accepted: boolean;
  offset_ms: number;
  reason?: string | null;
  retry_after_ms?: number | null;
  duplicate?: boolean;
};

export type RipplePayload = {
  ripple_seq: number;
  offset_ms: number;
  intensity: number;
  state: "connected" | "rising" | "cluster" | "recovering";
  availability: "ok" | "insufficient_participation" | "connection_unavailable";
  status_label:
    | "few_signals"
    | "signals_increasing"
    | "clarification_may_be_helpful"
    | "signals_decreasing"
    | "insufficient_participation"
    | "connection_unavailable";
  cluster?: ClusterPayload | null;
  active_participants: number;
  unique_in_window: number;
  threshold: number;
  window_ms: number;
};

export type LectureStatePayload = {
  status: "live" | "paused" | "ended";
  offset_ms: number;
};

type Role = "student" | "professor";

export type SocketOptions = {
  url: string;
  lectureId: string;
  role: Role;
  token: string;
  onEvent: (event: WsEvent) => void;
  onStatus: (status: WsStatus) => void;
};

const WS_URL = (process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws").replace(
  /\/$/,
  "",
);

export function websocketUrl(): string {
  return WS_URL;
}

export function reconnectDelay(attempt: number, random = Math.random): number {
  const base = Math.min(15_000, 500 * 2 ** Math.max(0, attempt));
  const jitter = 0.7 + random() * 0.6;
  return Math.round(base * jitter);
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function envelope(type: string, lectureId: string, payload: Record<string, unknown>) {
  return {
    v: 1 as const,
    type,
    msg_id: uuid(),
    ts: new Date().toISOString(),
    lecture_id: lectureId,
    payload,
  };
}

export class DarisSocket {
  private readonly options: SocketOptions;
  private readonly supabase: SupabaseSocket | null;
  private socket: WebSocket | null = null;
  private manualClose = false;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private status: WsStatus = "idle";
  private readonly onlineHandler = () => {
    if (!this.manualClose && this.status !== "ready") this.open();
  };
  private readonly offlineHandler = () => {
    if (this.manualClose) return;
    this.setStatus("offline");
  };

  constructor(options: SocketOptions) {
    this.options = options;
    this.supabase = process.env.NEXT_PUBLIC_REALTIME_TRANSPORT === "supabase"
      ? new SupabaseSocket(options) : null;
  }

  connect(): void {
    if (this.supabase) { this.supabase.connect(); return; }
    this.manualClose = false;
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.onlineHandler);
      window.addEventListener("offline", this.offlineHandler);
    }
    this.open();
  }

  private open(): void {
    if (this.manualClose) return;
    this.clearReconnect();
    this.setStatus(this.attempt === 0 ? "connecting" : "reconnecting");
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.options.url || websocketUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      const hello =
        this.options.role === "student"
          ? { role: "student", signal_token: this.options.token }
          : { role: "professor", access_token: this.options.token };
      socket.send(JSON.stringify(envelope("hello", this.options.lectureId, hello)));
    };
    socket.onmessage = (message) => {
      if (typeof message.data !== "string") return;
      let event: WsEvent;
      try {
        event = JSON.parse(message.data) as WsEvent;
      } catch {
        return;
      }
      if (!event || event.v !== 1 || typeof event.type !== "string") return;
      if (event.type === "ping") {
        this.rawSend(envelope("pong", this.options.lectureId, {}));
      }
      if (event.type === "hello_ok") {
        this.attempt = 0;
        this.setStatus("ready");
        this.startHeartbeat();
      }
      this.options.onEvent(event);
    };
    socket.onerror = () => {
      // onclose owns retry policy; avoid duplicate retries here.
    };
    socket.onclose = (event) => {
      this.stopHeartbeat();
      this.socket = null;
      if (this.manualClose || event.code === 1000) {
        this.setStatus("closed");
        return;
      }
      if (event.code === 4401 || event.code === 4409 || event.code === 4429) {
        this.setStatus("closed");
        return;
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        this.setStatus("offline");
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.manualClose) return;
    this.setStatus("reconnecting");
    this.clearReconnect();
    const delay = reconnectDelay(this.attempt);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      this.rawSend(envelope("ping", this.options.lectureId, {}));
    }, 20_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private rawSend(payload: object): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(payload));
    return true;
  }

  sendStudentSignal(clientSeq: number, clientTsMs: number): boolean {
    if (this.supabase) return this.supabase.sendStudentSignal(clientSeq, clientTsMs);
    return this.rawSend(
      envelope("student_signal", this.options.lectureId, {
        client_seq: clientSeq,
        kind: "lost",
        client_ts_ms: clientTsMs,
      }),
    );
  }

  sendLectureControl(action: "start" | "pause" | "resume" | "end"): boolean {
    if (this.supabase) return this.supabase.sendLectureControl(action);
    return this.rawSend(
      envelope("lecture_control", this.options.lectureId, { action }),
    );
  }

  isReady(): boolean {
    if (this.supabase) return this.supabase.isReady();
    return this.status === "ready";
  }

  getStatus(): WsStatus {
    if (this.supabase) return this.supabase.getStatus();
    return this.status;
  }

  private setStatus(next: WsStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.options.onStatus(next);
  }

  dispose(): void {
    if (this.supabase) { this.supabase.dispose(); return; }
    this.manualClose = true;
    this.clearReconnect();
    this.stopHeartbeat();
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.onlineHandler);
      window.removeEventListener("offline", this.offlineHandler);
    }
    if (this.socket) {
      this.socket.close(1000, "client leaving");
      this.socket = null;
    }
    this.setStatus("closed");
  }
}
