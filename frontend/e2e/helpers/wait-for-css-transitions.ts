import { expect, type Page } from "@playwright/test";

export async function waitForCssTransitions(page: Page) {
  // Theme changes animate foreground and background independently. Measure the
  // settled palette, while leaving normal motion and every axe rule enabled.
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(
    (animation) => animation instanceof CSSTransition && animation.playState === "running",
  ).length), {
    message: "CSS transitions should finish before measuring accessibility",
  }).toBe(0);
}
