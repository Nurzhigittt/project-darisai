import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WsEvent, WsStatus } from "./client";

const { channel, supabaseClient } = vi.hoisted(() => {
  const channel = {
    on: vi.fn(function (this: unknown) { return channel; }),
    subscribe: vi.fn(),
    track: vi.fn().mockResolvedValue(undefined),
  };
  const supabaseClient = {
    channel: vi.fn(() => channel),
    removeAllChannels: vi.fn().mockResolvedValue(undefined),
    realtime: {
      setAuth: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    },
  };
  return { channel, supabaseClient };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => supabaseClient),
}));

import { SupabaseSocket } from "./supabase";

const lectureId = "11111111-1111-4111-8111-111111111111";
const token = "student-capability";

function event(type: string, payload: Record<string, unknown>, seq?: number): WsEvent {
  return {
    v: 1,
    type,
    msg_id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    lecture_id: lectureId,
    payload: { ...payload, ...(seq === undefined ? {} : { ripple_seq: seq }) },
  } as WsEvent;
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("SupabaseSocket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    channel.subscribe.mockImplementation((callback: (state: string) => void) => {
      callback("SUBSCRIBED");
      return channel;
    });
    global.fetch = vi.fn();
  });

  it("exchanges the scoped credential for a private channel and syncs authority", async () => {
    const events: WsEvent[] = [];
    const statuses: WsStatus[] = [];
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({
          events: [],
          realtime_url: "https://ref.supabase.co",
          publishable_key: "publishable",
          channel: `daris:${lectureId}:student`,
          access_token: "realtime-ticket",
          expires_at: Math.floor(Date.now() / 1000) + 120,
          recovery_interval_ms: 5000,
        }),
      )
      .mockResolvedValueOnce(
        response({ events: [event("hello_ok", { offset_ms: 100 })], recovery_interval_ms: 5000 }),
      );

    const socket = new SupabaseSocket({
      url: "ws://unused",
      lectureId,
      role: "student",
      token,
      onEvent: (item) => events.push(item),
      onStatus: (status) => statuses.push(status),
    });
    socket.connect();

    await vi.waitFor(() => expect(statuses).toContain("ready"));
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      `http://localhost:8000/api/v1/lectures/${lectureId}/realtime`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
      }),
    );
    const connectBody = JSON.parse(
      (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(connectBody).toMatchObject({ role: "student", action: "connect" });
    expect(supabaseClient.channel).toHaveBeenCalledWith(
      `daris:${lectureId}:student`,
      { config: { private: true } },
    );
    expect(events.map((item) => item.type)).toContain("hello_ok");
    socket.dispose();
  });

  it("sends a Signal through HTTP and emits the acknowledgement", async () => {
    const events: WsEvent[] = [];
    const statuses: WsStatus[] = [];
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({
          events: [],
          realtime_url: "https://ref.supabase.co",
          publishable_key: "publishable",
          channel: `daris:${lectureId}:student`,
          access_token: "realtime-ticket",
          expires_at: Math.floor(Date.now() / 1000) + 120,
          recovery_interval_ms: 5000,
        }),
      )
      .mockResolvedValueOnce(response({ events: [], recovery_interval_ms: 5000 }))
      .mockResolvedValueOnce(
        response({ events: [event("signal_ack", { accepted: true, duplicate: false })], recovery_interval_ms: 5000 }),
      );

    const socket = new SupabaseSocket({
      url: "ws://unused",
      lectureId,
      role: "student",
      token,
      onEvent: (item) => events.push(item),
      onStatus: (status) => statuses.push(status),
    });
    socket.connect();
    await vi.waitFor(() => expect(statuses).toContain("ready"));

    expect(socket.sendStudentSignal(1, Date.now())).toBe(true);
    await vi.waitFor(() => expect(events.some((item) => item.type === "signal_ack")).toBe(true));
    const signalBody = JSON.parse(
      (vi.mocked(fetch).mock.calls[2]![1] as RequestInit).body as string,
    );
    expect(signalBody).toMatchObject({
      role: "student",
      action: "signal",
      signal: { client_seq: 1, kind: "lost" },
    });
    socket.dispose();
  });

  it("rejects professor access when constructed with a student token", async () => {
    const statuses: WsStatus[] = [];
    vi.mocked(fetch).mockResolvedValueOnce(response({ error: { code: "UNAUTHORIZED" } }, 401));

    const socket = new SupabaseSocket({
      url: "ws://unused",
      lectureId,
      role: "professor",
      token,
      onEvent: () => undefined,
      onStatus: (status) => statuses.push(status),
    });
    socket.connect();
    await vi.waitFor(() => expect(statuses).toContain("closed"));
    expect(supabaseClient.channel).not.toHaveBeenCalled();
    socket.dispose();
  });
});
