import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";

afterEach(() => vi.unstubAllGlobals());

describe("API response failures", () => {
  it.each([401, 429, 503])("preserves HTTP %s when a proxy returns a non-JSON error", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Unavailable</html>", { status })));
    await expect(api.listConceptAutonomy("test-only-token", "lecture-id")).rejects.toMatchObject({
      name: "ApiError", status, code: "INVALID_RESPONSE",
    });
  });

  it("treats an unreadable successful mutation response as an uncertain server result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"mode":', { status: 200 })));
    await expect(api.updateConceptAutonomy("test-only-token", "lecture-id", "concept-id", { mode: "whitelisted" }))
      .rejects.toMatchObject({ name: "ApiError", status: 502, code: "INVALID_RESPONSE" });
  });
});
