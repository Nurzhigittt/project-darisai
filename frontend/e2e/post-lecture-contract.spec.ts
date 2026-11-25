import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Contract fixtures belong to this isolated browser test only. No production
// route, demo flag or application fallback serves these responses.
const lectureId = "11111111-1111-4111-8111-111111111111";
const insightId = "22222222-2222-4222-8222-222222222222";
const handoffToken = "test_handoff_token_for_contract_checks_12345";
const now = new Date().toISOString();
const content = {
  headline: "Review the force diagram",
  read_time_sec: 30,
  concepts: [{ title: "Net force", detail: "Resolve the components before adding vectors." }],
  task: { title: "Draw a free-body diagram", instructions: "Label the forces.\nExplain the resulting acceleration.", duration_minutes: 10 },
};

async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("daris.locale", "en");
    localStorage.setItem("daris.professor.session", JSON.stringify({
      accessToken: "test-only-professor-token", professorId: "professor-test", name: "Professor test",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    }));
  });
  let status = "pending_approval";
  let savedContent = structuredClone(content);
  let reason: string | null = null;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const item = { insight_id: insightId, lecture_id: lectureId, kind: "handoff", audience: "seminar_leader", status, source: "manual", content: savedContent, decision_reason: reason, created_at: now, updated_at: now };
    let body: unknown;
    if (path === `/api/v1/lectures/${lectureId}`) body = { lecture_id: lectureId, title: "Mechanics seminar", status: "ended" };
    else if (path.endsWith("/insights") && request.method() === "GET") body = [item];
    else if (path.endsWith("/approve")) { status = "approved"; body = { ...item, status }; }
    else if (path.endsWith("/edit")) {
      const input = request.postDataJSON();
      status = "edited"; savedContent = input.content; reason = input.reason;
      body = { ...item, status, content: savedContent, decision_reason: reason };
    } else if (path.endsWith("/publish")) {
      expect(status).toBe("approved");
      status = "published";
      body = { insight_id: insightId, handoff_url: `http://localhost:3000/handoff#token=${handoffToken}`, expires_at: new Date(Date.now() + 3600_000).toISOString() };
    } else if (path === "/api/v1/handoff/redeem") {
      expect(request.postDataJSON()).toEqual({ token: handoffToken });
      expect(request.headers()["authorization"]).toBeUndefined();
      body = { ...savedContent, lecture_title: "Mechanics seminar", language: "en", expires_at: new Date(Date.now() + 3600_000).toISOString() };
    } else return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "Test route unavailable" } } });
    if (path !== "/api/v1/handoff/redeem") expect(request.headers()["authorization"]).toBe("Bearer test-only-professor-token");
    await route.fulfill({ status: 200, json: body });
  });
}

test("contract fixture: review, edit, approve and publish without reusing a stale link", async ({ page }) => {
  await setup(page);
  await page.goto(`/brief/${lectureId}`);
  await page.getByRole("button", { name: /^Handoff/ }).click();
  await expect(page.getByRole("heading", { name: content.headline })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish for the seminar" })).toHaveCount(0);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Publish for the seminar" }).click();
  await expect(page.getByLabel("Seminar link", { exact: true })).toHaveValue(new RegExp("/handoff#token="));
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit material" });
  await dialog.getByLabel("Title", { exact: true }).fill("Review components carefully");
  await dialog.getByLabel("Reason", { exact: true }).fill("Clarified the exercise.");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Review components carefully" })).toBeVisible();
  await expect(page.getByLabel("Seminar link", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publish for the seminar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
});

test("contract fixture: mobile, keyboard, light and dark accessibility", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/brief/${lectureId}`);
  await page.getByRole("button", { name: /^Handoff/ }).click();
  await expect(page.getByRole("heading", { name: content.headline })).toBeVisible();
  const scan = async () => {
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(result.violations, JSON.stringify(result.violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => node.target) })))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  };
  await scan();
  await page.getByRole("button", { name: "Switch theme" }).click();
  await scan();
  await page.getByRole("button", { name: "Edit", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Edit material" })).toBeVisible();
  await scan();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Edit material" })).not.toBeVisible();
});

test("contract fixture: public Handoff and refresh use only the fragment credential", async ({ page }) => {
  await setup(page);
  await page.goto(`/handoff#token=${handoffToken}`);
  await expect(page.getByRole("heading", { name: content.headline })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: content.headline })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`#token=${handoffToken}$`));
  await expect(page.locator("main")).toBeFocused();
  await expect(page.getByRole("heading", { name: content.headline })).toBeVisible();
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(result.violations).toEqual([]);
});
