import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { landingCopy } from "../src/features/landing/landing-copy";
import { dictionaries, type Locale } from "../src/lib/i18n/dictionaries";
import { waitForCssTransitions } from "./helpers/wait-for-css-transitions";

test.use({ serviceWorkers: "block" });

function label(locale: Locale, key: string): string {
  const value = dictionaries[locale][key];
  if (value === undefined) throw new Error(`Missing ${locale} translation: ${key}`);
  return value;
}

async function openLanding(page: Page, locale: Locale, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript((initialLocale) => {
    localStorage.setItem("daris.locale", initialLocale);
    localStorage.setItem("daris.theme", "light");
  }, locale);
  // These tests stop at the join route. They do not fabricate a lecture or
  // contact an API; the real Signal-to-Ripple workflow has separate coverage.
  await page.route("**/api/v1/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  const copy = landingCopy[locale];
  await expect(page.getByRole("heading", {
    name: `${copy.hero.title} ${copy.hero.accent}`, exact: true,
  })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return copy;
}

async function assertAccessibleAndFits(page: Page) {
  await waitForCssTransitions(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations, JSON.stringify(results.violations.map(({ id, nodes }) => ({
    id, targets: nodes.map((node) => node.target),
  })))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // The page clips decorative artwork. Check controls too, so clipping cannot
  // hide an overflowing input, menu action, FAQ or footer link from this test.
  const clippedControls = await page.locator(
    "header a, header button, header select, main input, main button, main summary, footer a",
  ).evaluateAll((elements) => elements.flatMap((element) => {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return [];
    return rect.left < -1 || rect.right > window.innerWidth + 1
      ? [element.textContent?.trim() || element.getAttribute("aria-label") || element.tagName]
      : [];
  }));
  expect(clippedControls).toEqual([]);
}

test("landing: Russian desktop supports code errors, FAQ and keyboard joining", async ({ page }, testInfo) => {
  const copy = await openLanding(page, "ru", 1440);
  await waitForCssTransitions(page);
  await page.screenshot({ path: testInfo.outputPath("landing-ru-desktop-light.png"), fullPage: true });
  const input = page.getByLabel(copy.join.label);
  await input.fill("ab");
  await input.press("Enter");
  await expect(page.getByRole("alert")).toHaveText(label("ru", "join.invalid.body"));
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toBeFocused();
  await expect(page).toHaveURL(/\/$/);

  const accountFaq = copy.faq.items[0];
  if (!accountFaq) throw new Error("The Russian account FAQ must be present");
  await page.locator("summary").filter({ hasText: accountFaq.question }).click();
  await expect(page.getByText(accountFaq.answer, { exact: true })).toBeVisible();
  await assertAccessibleAndFits(page);

  await input.fill("abc123");
  await expect(input).toHaveValue("ABC123");
  await expect(input).toHaveAttribute("aria-invalid", "false");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/join\/ABC123$/);
});

test("landing: Kazakh dark theme fits 320px with accessible menu and form states", async ({ page }, testInfo) => {
  const copy = await openLanding(page, "kk", 320);
  await page.getByRole("button", { name: label("kk", "theme.toggle"), exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await waitForCssTransitions(page);
  await page.screenshot({ path: testInfo.outputPath("landing-kk-mobile-dark.png"), fullPage: true });

  const menu = page.getByRole("button", { name: copy.nav.menu, exact: true });
  await menu.click();
  const panel = page.locator("#landing-navigation");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("link", { name: label("kk", "learning.title"), exact: true }))
    .toHaveAttribute("href", "/gapcards");
  await assertAccessibleAndFits(page);
  await panel.getByRole("link", { name: copy.nav.how, exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: copy.nav.menu, exact: true })).toBeFocused();

  const input = page.getByLabel(copy.join.label);
  await input.fill("a");
  await input.press("Enter");
  await expect(input).toBeFocused();
  await expect(page.getByRole("alert")).toHaveText(label("kk", "join.invalid.body"));
  const silenceFaq = copy.faq.items[2];
  if (!silenceFaq) throw new Error("The Kazakh silence FAQ must be present");
  await page.locator("summary").filter({ hasText: silenceFaq.question }).click();
  await expect(page.getByText(silenceFaq.answer, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: copy.demo.signal, exact: true }).click();
  await expect(page.getByRole("button", { name: copy.demo.signalSent, exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await assertAccessibleAndFits(page);
});

test("landing: English 390px join link returns keyboard focus to the code field", async ({ page }, testInfo) => {
  const copy = await openLanding(page, "en", 390);
  await waitForCssTransitions(page);
  await page.screenshot({ path: testInfo.outputPath("landing-en-mobile-light.png"), fullPage: true });
  const joinLink = page.getByRole("link", { name: copy.closing.studentCta, exact: true }).last();
  await joinLink.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/#join$/);
  await expect(page.getByLabel(copy.join.label)).toBeFocused();
  await assertAccessibleAndFits(page);
});
