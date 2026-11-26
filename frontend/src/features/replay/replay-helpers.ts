import type { ReplayHistoryItem } from "@/lib/api/client";
import type { StoredReplayMessage } from "@/lib/storage/db";

// Send only this discussion's actual messages within the server's history limits.
export function boundedReplayHistory(messages: StoredReplayMessage[]): ReplayHistoryItem[] {
  const result: ReplayHistoryItem[] = [];
  let remaining = 4_000;
  for (const item of messages.slice(-12).reverse()) {
    const text = item.text.slice(0, Math.min(2_000, remaining));
    if (!text.trim()) continue;
    result.unshift({ role: item.role, text });
    remaining -= text.length;
    if (remaining <= 0) break;
  }
  return result;
}
