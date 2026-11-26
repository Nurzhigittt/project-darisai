import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import type { AutonomyUpdate, CohortMemory, ConceptAutonomy, Course, Lecture } from "../src/lib/api/client";
import { dictionaries } from "../src/lib/i18n/dictionaries";
import { waitForCssTransitions } from "./helpers/wait-for-css-transitions";

// These contract responses exist only in intercepted browser test requests.
// There is no production demo route, fallback data, or contact with a real API.
test.use({ serviceWorkers: "block" });

const courseId = "11111111-1111-4111-8111-111111111111";
const lectureId = "22222222-2222-4222-8222-222222222222";
const conceptId = "33333333-3333-4333-8333-333333333333";
const zeroConceptId = "44444444-4444-4444-8444-444444444444";
const suppressedConceptId = "55555555-5555-4555-8555-555555555555";
const token = "test-only-course-tools-token";
const stamp = "2026-11-25T12:00:00Z";
const autonomyPath = `/api/v1/lectures/${lectureId}/concept-autonomy`;
const label = (key: string) => dictionaries.en[key] ?? key;

const course: Course = { id: courseId, title: "Mechanics", created_at: stamp };
const lecture: Lecture = {
  lecture_id: lectureId, course_id: courseId, course_title: course.title,
  title: "Forces and motion", language: "en", status: "ended",
  join_code: "ABC123", join_url: "http://localhost:3000/join/ABC123",
  started_at: "2026-11-25T11:00:00Z", ended_at: stamp, offset_ms: 3_600_000,
  accepted_signals: 16, unique_participants: 12, created_at: stamp,
};
const cohort: CohortMemory = {
  minimum_lectures_required: 5, minimum_participants_per_lecture: 3,
  generated_at: stamp,
  interpretation_note: "Signal and Ripple cluster metrics are observed events, not comprehension measures. Absence of signals or clusters is not evidence of understanding.",
  concepts: [
    { concept_canonical_id: conceptId, status: "ready", observed_lectures: 8, mean_signal_events_per_lecture: 2.125, signal_observed_lecture_share: 0.625, cluster_observed_lecture_share: 0.25, mean_cluster_peak_intensity: 0.375 },
    { concept_canonical_id: zeroConceptId, status: "ready", observed_lectures: 6, mean_signal_events_per_lecture: 0, signal_observed_lecture_share: 0, cluster_observed_lecture_share: 0, mean_cluster_peak_intensity: null },
    { concept_canonical_id: suppressedConceptId, status: "insufficient_history", observed_lectures: null, mean_signal_events_per_lecture: null, signal_observed_lecture_share: null, cluster_observed_lecture_share: null, mean_cluster_peak_intensity: null },
  ],
};

async function setup(page: Page, holdMutations = false) {
  await page.addInitScript((accessToken) => {
    localStorage.setItem("daris.locale", "en");
    localStorage.setItem("daris.theme", "light");
    localStorage.setItem("daris.professor.session", JSON.stringify({
      accessToken, professorId: "66666666-6666-4666-8666-666666666666", name: "Test Professor",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    }));
  }, token);

  let policy: ConceptAutonomy = {
    lecture_id: lectureId, course_id: courseId, concept_canonical_id: conceptId,
    concept_title: "Net force", mode: "locked", approvals: 0, rejections: 0, updated_at: null,
  };
  const changes: Array<{ path: string; method: string; body: AutonomyUpdate }> = [];
  const pendingResponses: Array<() => void> = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, content-type, accept",
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    expect(request.headers()["authorization"]).toBe(`Bearer ${token}`);
    let body: unknown;
    if (request.method() === "GET" && url.pathname === "/api/v1/courses") body = [course];
    else if (request.method() === "GET" && url.pathname === `/api/v1/courses/${courseId}/cohort-memory`) {
      expect(url.searchParams.get("limit")).toBe("200");
      body = cohort;
    } else if (request.method() === "GET" && url.pathname === `/api/v1/lectures/${lectureId}`) body = lecture;
    else if (request.method() === "GET" && url.pathname === autonomyPath) body = [policy];
    else if (request.method() === "PUT" && url.pathname === `${autonomyPath}/${conceptId}`) {
      const input = request.postDataJSON() as AutonomyUpdate;
      expect(input).toEqual({ mode: policy.mode === "locked" ? "whitelisted" : "locked" });
      changes.push({ path: url.pathname, method: request.method(), body: input });
      if (holdMutations) await new Promise<void>((resolve) => { pendingResponses.push(resolve); });
      policy = {
        ...policy, mode: input.mode, updated_at: stamp,
        approvals: policy.approvals + (input.mode === "whitelisted" ? 1 : 0),
        rejections: policy.rejections + (input.mode === "locked" ? 1 : 0),
      };
      body = policy;
    } else return route.fulfill({ status: 404, headers, json: { error: { code: "NOT_FOUND", message: "No contract fixture for this request." } } });
    await route.fulfill({ status: 200, headers, json: body });
  });

  return {
    changes,
    releaseResponse: () => {
      const release = pendingResponses.shift();
      expect(release, "A save must be pending before its server response is released.").toBeDefined();
      release?.();
    },
  };
}

async function assertAccessibleWithoutPageOverflow(page: Page) {
  await waitForCssTransitions(page);
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(result.violations, JSON.stringify(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("contract fixture: cohort zero, missing and suppressed values remain accessible on mobile in both themes", async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/cohort/${courseId}`);
  await expect(page.getByRole("table")).toBeVisible();
  const ready = page.getByRole("row", { name: new RegExp(conceptId) });
  await expect(ready.getByRole("cell", { name: "62.5%", exact: true })).toBeVisible();
  const zero = page.getByRole("row", { name: new RegExp(zeroConceptId) });
  await expect(zero.getByRole("cell", { name: "0", exact: true })).toHaveCount(1);
  await expect(zero.getByRole("cell", { name: "0%", exact: true })).toHaveCount(2);
  await expect(zero.getByRole("cell", { name: label("cohort.noValue"), exact: true })).toHaveCount(1);
  const suppressed = page.getByRole("row", { name: new RegExp(suppressedConceptId) });
  await expect(suppressed.getByRole("cell")).toHaveCount(1);
  await expect(suppressed.getByRole("cell")).toHaveAttribute("colspan", "5");
  await expect(suppressed.getByRole("cell")).toHaveText(label("cohort.suppressed"));
  await expect(page.getByText(label("cohort.interpretation"), { exact: true })).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  const region = page.getByRole("region", { name: label("cohort.tableRegion") });
  await region.focus();
  await expect(region).toBeFocused();
  expect(await region.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await assertAccessibleWithoutPageOverflow(page);
  await page.getByRole("button", { name: "Switch theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await assertAccessibleWithoutPageOverflow(page);
});

test("contract fixture: keyboard cancellation sends no PUT, and allow or revoke waits for the course permission response", async ({ page }) => {
  const fixture = await setup(page, true);
  await page.goto(`/settings/autonomy/${lectureId}`);
  const article = page.locator("article");
  const allow = page.getByRole("button", { name: label("autonomy.allow"), exact: true });
  await allow.focus();
  await page.keyboard.press("Enter");
  let dialog = page.getByRole("dialog", { name: label("autonomy.confirmAllowTitle") });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(label("autonomy.courseNotice").replace("{course}", course.title), { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: label("autonomy.cancel"), exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog).not.toBeVisible();
  expect(fixture.changes).toEqual([]);
  await expect(allow).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  const confirmAllow = dialog.getByRole("button", { name: label("autonomy.confirmAllow"), exact: true });
  await confirmAllow.focus();
  await expect(confirmAllow).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => fixture.changes.length).toBe(1);
  await expect(article.getByText(label("autonomy.mode.locked"), { exact: true })).toBeVisible();
  await expect(article.getByText(label("autonomy.mode.whitelisted"), { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: label("autonomy.confirmAllow"), exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  fixture.releaseResponse();
  await expect(dialog).not.toBeVisible();
  await expect(article.getByText(label("autonomy.mode.whitelisted"), { exact: true })).toBeVisible();

  await page.getByRole("button", { name: label("autonomy.revoke"), exact: true }).click();
  dialog = page.getByRole("dialog", { name: label("autonomy.confirmRevokeTitle") });
  await expect(dialog.getByText(label("autonomy.revokeExplanation"), { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: label("autonomy.confirmRevoke"), exact: true }).click();
  await expect.poll(() => fixture.changes.length).toBe(2);
  await expect(article.getByText(label("autonomy.mode.whitelisted"), { exact: true })).toBeVisible();
  await expect(article.getByText(label("autonomy.mode.locked"), { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: label("autonomy.confirmRevoke"), exact: true })).toBeDisabled();
  fixture.releaseResponse();
  await expect(dialog).not.toBeVisible();
  await expect(article.getByText(label("autonomy.mode.locked"), { exact: true })).toBeVisible();
  expect(fixture.changes).toEqual([
    { path: `${autonomyPath}/${conceptId}`, method: "PUT", body: { mode: "whitelisted" } },
    { path: `${autonomyPath}/${conceptId}`, method: "PUT", body: { mode: "locked" } },
  ]);
});

test("contract fixture: autonomy and confirmation dialog pass mobile light and dark accessibility checks", async ({ page }) => {
  const fixture = await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/settings/autonomy/${lectureId}`);
  await expect(page.getByRole("heading", { name: "Net force", exact: true })).toBeVisible();
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") await page.getByRole("button", { name: "Switch theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await assertAccessibleWithoutPageOverflow(page);
    const allow = page.getByRole("button", { name: label("autonomy.allow"), exact: true });
    await allow.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: label("autonomy.confirmAllowTitle") });
    await expect(dialog).toBeVisible();
    await assertAccessibleWithoutPageOverflow(page);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(allow).toBeFocused();
  }
  expect(fixture.changes).toEqual([]);
});
