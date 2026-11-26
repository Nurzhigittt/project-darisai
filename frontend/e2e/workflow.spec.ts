import { expect, test } from "@playwright/test";

const inviteCode = process.env.E2E_INVITE_CODE ?? "DARIS-TEACH-2026";
const title = `E2E Signal ${Date.now().toString().slice(-6)}`;

test("professor and student complete the Signal to Ripple workflow", async ({
  browser,
}) => {
  const professorContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const professor = await professorContext.newPage();
  const student = await studentContext.newPage();

  await professor.goto("/login");
  await professor.getByLabel("Invite code").fill(inviteCode);
  await professor.getByRole("button", { name: "Continue" }).click();
  await expect(professor).toHaveURL(/\/professor$/, { timeout: 15_000 });

  await professor.getByLabel("Lecture title").fill(title);
  await professor.getByRole("button", { name: "Create lecture" }).click();
  await expect(professor).toHaveURL(/\/p\/[0-9a-f-]+$/, { timeout: 15_000 });
  const lectureUrl = professor.url();
  const lectureId = lectureUrl.split("/").pop();
  expect(lectureId).toBeTruthy();

  await expect(professor.getByRole("heading", { name: title })).toBeVisible();
  const joinCode = await professor.getByTestId("join-code").innerText();
  expect(joinCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);

  await student.goto(`/join/${joinCode}`);
  await expect(student.getByTestId("lecture-title")).toHaveText(title, {
    timeout: 15_000,
  });
  await student.getByRole("button", { name: "Join lecture" }).click();
  await expect(student).toHaveURL(new RegExp(`/s/${lectureId}$`), {
    timeout: 15_000,
  });
  await expect(student.getByText("Waiting for the professor to begin")).toBeVisible();

  await professor.getByRole("button", { name: "Start lecture" }).click();
  await expect(student.getByTestId("signal-button")).toHaveAttribute(
    "data-state",
    "ready",
    { timeout: 15_000 },
  );

  await student.getByTestId("signal-button").click();
  await expect(student.getByText("Signal received").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(professor.getByTestId("ripple-unique")).toHaveText("1", {
    timeout: 15_000,
  });

  await professor.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(student.getByTestId("signal-button")).toHaveAttribute(
    "data-state",
    "paused",
    { timeout: 15_000 },
  );
  await expect(student.getByTestId("signal-button")).toBeDisabled();

  await professor.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(student.getByTestId("signal-button")).not.toHaveAttribute(
    "data-state",
    "paused",
    { timeout: 15_000 },
  );

  await professor.getByTestId("end-lecture").click();
  await expect(professor.getByRole("dialog")).toBeVisible();
  await professor.getByTestId("confirm-end-lecture").click();
  await expect(professor).toHaveURL(new RegExp(`/summary/${lectureId}$`), {
    timeout: 20_000,
  });
  await expect(professor.getByTestId("accepted-signals")).toContainText("1");
  await expect(professor.getByText("Moments that may need clarification")).toBeVisible();

  await expect(student.getByTestId("student-ended")).toBeVisible({
    timeout: 15_000,
  });
  await student.getByRole("button", { name: "My saved moments" }).first().click();
  const historyDialog = student.getByRole("dialog");
  await expect(historyDialog).toBeVisible();
  await expect(historyDialog.getByText(/Signal at \d{2}:\d{2}/).first()).toBeVisible();

  await professorContext.close();
  await studentContext.close();
});

test("invalid lecture code is explained without creating identity", async ({ page }) => {
  await page.goto("/join/ZZZZZZ");
  await expect(page.getByText("That code does not match a lecture")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("link", { name: "Try again" })).toBeVisible();
});

test("landing page is keyboard reachable and localisable", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.getByLabel("Language").selectOption("ru");
  await expect(
    page.getByRole("heading", { name: "Понимание начинается с одного сигнала." }),
  ).toBeVisible();
});
