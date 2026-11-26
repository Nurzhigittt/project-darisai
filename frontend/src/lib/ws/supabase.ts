import { createClient, type SupabaseClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { SocketOptions, WsEvent, WsStatus } from "./client";

type Session = {
  events: WsEvent[];
  realtime_url?: string;
  publishable_key?: string;
  channel?: string;
  access_token?: string;
  expires_at?: number;
  recovery_interval_ms: number;
};

const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

/** Broadcast is a notification, never authority. HTTP snapshots recover gaps. */
export class SupabaseSocket {
  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private controller: AbortController | null = null;
  private epoch = 0;
  private stopped = true;
  private status: WsStatus = "idle";
  private attempt = 0;
  private expiresAt = 0;
  private lastRipple = -1;
  private lastStateTime = 0;
  private readonly online = () => { if (!this.stopped) void this.open(); };
  private readonly offline = () => { this.cleanup(); this.setStatus("offline"); };

  constructor(private readonly options: SocketOptions) {}

  connect(): void {
    this.stopped = false;
    window.addEventListener("online", this.online);
    window.addEventListener("offline", this.offline);
    void this.open();
  }

  private setStatus(status: WsStatus): void {
    if (status !== this.status) { this.status = status; this.options.onStatus(status); }
  }

  private async command(action: string, signal?: Record<string, unknown>): Promise<Session> {
    const response = await fetch(`${apiUrl}/api/v1/lectures/${this.options.lectureId}/realtime`, {
      method: "POST", cache: "no-store", signal: this.controller?.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.options.token}` },
      body: JSON.stringify({ role: this.options.role, action, ...(signal ? { signal } : {}) }),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || response.status === 404) this.dispose();
      throw new Error(`Realtime request failed (${response.status})`);
    }
    return await response.json() as Session;
  }

  private emit(event: WsEvent): void {
    if (this.stopped || event.v !== 1 || event.lecture_id !== this.options.lectureId) return;
    if (event.type === "ripple_update") {
      const seq = Number(event.payload.ripple_seq);
      if (!Number.isFinite(seq) || seq < this.lastRipple) return;
      this.lastRipple = seq;
    }
    if (event.type === "lecture_state") {
      const stamp = Date.parse(event.ts);
      if (stamp < this.lastStateTime) return;
      this.lastStateTime = stamp;
    }
    this.options.onEvent(event);
  }

  private async open(): Promise<void> {
    if (this.stopped) return;
    this.cleanup();
    const epoch = this.epoch;
    this.controller = new AbortController();
    this.setStatus(this.attempt ? "reconnecting" : "connecting");
    try {
      const session = await this.command("connect");
      if (this.stopped || epoch !== this.epoch) return;
      if (!session.realtime_url || !session.publishable_key || !session.access_token || !session.channel) throw new Error("Missing realtime ticket");
      this.expiresAt = session.expires_at ?? 0;
      this.client = createClient(session.realtime_url, session.publishable_key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        accessToken: async () => session.access_token!,
      });
      await this.client.realtime.setAuth(session.access_token);
      if (epoch !== this.epoch) return;
      this.channel = this.client.channel(session.channel, { config: { private: true } });
      this.channel.on("broadcast", { event: "daris_event" }, ({ payload }) => {
        if (epoch === this.epoch) this.emit(payload as WsEvent);
      });
      this.channel.subscribe((state) => {
        if (this.stopped || epoch !== this.epoch) return;
        if (state === "SUBSCRIBED") {
          // Presence is advisory only. No identity, credential or client-supplied
          // participant count is used by the server's Ripple calculation.
          void this.channel?.track({ online: true });
          this.attempt = 0;
          void this.sync(epoch);
        } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
          this.retry();
        }
      });
    } catch { if (epoch === this.epoch) this.retry(); }
  }

  private async sync(epoch: number): Promise<void> {
    if (this.stopped || epoch !== this.epoch) return;
    if (Date.now() / 1000 > this.expiresAt - 20) { await this.open(); return; }
    try {
      // Subscribe first, THEN recover: a lifecycle event cannot fall into the
      // gap between initial HTTP authentication and channel subscription.
      const snapshot = await this.command("sync");
      if (this.stopped || epoch !== this.epoch) return;
      snapshot.events.forEach(event => this.emit(event));
      this.setStatus("ready");
      this.timer = setTimeout(() => void this.sync(epoch), snapshot.recovery_interval_ms);
    } catch { if (epoch === this.epoch) this.retry(); }
  }

  private retry(): void {
    if (this.stopped) return;
    this.cleanup();
    if (!navigator.onLine) { this.setStatus("offline"); return; }
    this.setStatus("reconnecting");
    const delay = Math.min(15000, 500 * 2 ** this.attempt++) * (0.7 + Math.random() * 0.6);
    this.timer = setTimeout(() => void this.open(), delay);
  }

  sendStudentSignal(clientSeq: number, clientTsMs: number): boolean {
    if (!this.isReady()) return false;
    const epoch = this.epoch;
    void this.command("signal", { client_seq: clientSeq, kind: "lost", client_ts_ms: clientTsMs })
      .then(result => { if (epoch === this.epoch) result.events.forEach(event => this.emit(event)); })
      .catch(() => { if (epoch === this.epoch) this.retry(); });
    return true;
  }

  sendLectureControl(action: "start" | "pause" | "resume" | "end"): boolean {
    if (!this.isReady() || this.options.role !== "professor") return false;
    const epoch = this.epoch;
    void fetch(`${apiUrl}/api/v1/lectures/${this.options.lectureId}/control`, {
      method: "POST", signal: this.controller?.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.options.token}` },
      body: JSON.stringify({ action }),
    }).then(response => { if (!response.ok) throw new Error("Control rejected"); })
      .catch(() => { if (epoch === this.epoch) this.retry(); });
    return true;
  }

  isReady(): boolean { return this.status === "ready"; }
  getStatus(): WsStatus { return this.status; }

  private cleanup(): void {
    this.epoch++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.controller?.abort(); this.controller = null;
    const client = this.client; this.client = null; this.channel = null;
    if (client) { void client.removeAllChannels(); client.realtime.disconnect(); }
  }

  dispose(): void {
    this.stopped = true;
    this.cleanup();
    window.removeEventListener("online", this.online);
    window.removeEventListener("offline", this.offline);
    this.setStatus("closed");
    // Abrupt disconnects expire through the server's bounded heartbeat window.
  }
}
