import type { Insight } from "@/lib/api/client";

/** Visibility only; the backend remains authoritative for every transition. */
export function insightActions(insight: Pick<Insight, "kind" | "status">) {
  return {
    approve: insight.status === "pending_approval" || insight.status === "edited",
    edit: insight.status !== "rejected",
    reject: insight.status !== "rejected",
    publish: insight.kind === "handoff" && (insight.status === "approved" || insight.status === "published"),
  };
}

export function safeHandoffUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const token = new URLSearchParams(url.hash.slice(1)).get("token");
    if (!/^https?:$/.test(url.protocol) || url.pathname !== "/handoff" || url.search ||
      url.username || url.password || !token || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;
    return url.href;
  } catch {
    return null;
  }
}
