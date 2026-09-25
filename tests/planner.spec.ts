import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

test("two friends can plan privately and keep their picks across sessions", { tag: ["@writes"] }, async ({
  browser,
  baseURL,
}) => {
  const a = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    }),
    b = await browser.newContext({ viewport: { width: 390, height: 844 } }),
    outsider = await browser.newContext();
  const page = await a.newPage(),
    friend = await b.newPage();
  const suffix = randomBytes(5).toString("hex"),
    password = "WeekPlanner!" + suffix,
    emailA = `test-kyle-${suffix}@example.com`,
    emailB = `test-cole-${suffix}@example.com`;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  friend.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".event-card")).toHaveCount(23);
  await page
    .locator(".event-card img")
    .first()
    .evaluate((image: HTMLImageElement) => image.decode());
  await page.screenshot({ path: ".artifacts/browse-desktop.png", fullPage: false });
  await page.getByRole("button", { name: "RevenueCat", exact: true }).click();
  await expect(page.locator(".event-card")).toHaveCount(12);
  await page.getByLabel("Search events").fill("Shippies");
  await expect(page.locator(".event-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "The Shippies Award Show", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "RSVP", exact: false }),
  ).toHaveAttribute("href", "https://luma.com/revenu-dk6j");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("Search events").fill("");
  await page.getByRole("button", { name: "All events", exact: true }).click();
  await page.getByRole("button", { name: "Start planning" }).click();
  await page.getByLabel("Your name").fill("Kyle Test");
  await page.getByLabel("Email", { exact: true }).fill(emailA);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account & start planning" })
    .click();
  await expect(page.getByLabel("Private invite link")).toBeVisible();
  const invite = await page.getByLabel("Private invite link").inputValue();
  await page.getByRole("button", { name: "Close dialog" }).click();
  const baseline = await (await a.request.get("/api/plan")).json();
  writeFileSync(
    ".artifacts/test-users.json",
    JSON.stringify({ emails: [emailA, emailB], crewId: baseline.crew.id }),
  );
  expect(
    baseline.events.filter((e: any) => /revenuecat/i.test(e.host)),
  ).toHaveLength(12);
  await page
    .getByRole("button", {
      name: "Save Recovery Mode: STRV & RevenueCat at NYC App Week",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Unsave Recovery Mode: STRV & RevenueCat at NYC App Week",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await friend.goto(invite);
  await friend
    .getByRole("button", { name: "Join the week", exact: true })
    .click();
  await friend.getByLabel("Your name").fill("Cole Test");
  await friend.getByLabel("Email", { exact: true }).fill(emailB);
  await friend.getByLabel("Password", { exact: true }).fill(password);
  await friend
    .getByRole("button", { name: "Create account & start planning" })
    .click();
  await expect(friend.getByRole("status")).toContainText(
    "Your week is now shared",
  );
  const shared = await (await b.request.get("/api/plan")).json();
  expect(shared.crew.id).toBe(baseline.crew.id);
  expect(shared.members).toHaveLength(2);
  expect(shared.members[0].color).not.toBe(shared.members[1].color);
  expect(
    shared.favorites.some((f: any) => f.userId === baseline.user.id),
  ).toBeTruthy();
  await friend
    .getByRole("button", {
      name: "Save Recovery Mode: STRV & RevenueCat at NYC App Week",
      exact: true,
    })
    .click();
  await friend
    .getByRole("button", {
      name: "Save Sail & Scale: The RAGA Launch Cruise by Paddle",
      exact: true,
    })
    .click();
  await expect(
    page
      .locator(".event-card")
      .filter({ hasText: "Recovery Mode: STRV & RevenueCat at NYC App Week" })
      .locator(".saved-by"),
  ).toContainText("Saved together", { timeout: 25000 });
  await page.getByRole("button", { name: "Add event", exact: true }).click();
  await page.getByLabel("Event name").fill("Test dinner in the Village");
  await page
    .getByLabel("Location", { exact: true })
    .fill("West Village, New York");
  await page.getByLabel("Notes").fill("Shared test event for two friends.");
  await page
    .getByRole("button", { name: "Add to my week", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Test dinner in the Village",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    friend.getByRole("button", {
      name: "Test dinner in the Village",
      exact: true,
    }),
  ).toBeVisible({ timeout: 25000 });
  const withCustom = await (await a.request.get("/api/plan")).json(),
    custom = withCustom.events.find(
      (e: any) => e.title === "Test dinner in the Village",
    );
  const forbidden = await b.request.post("/api/events", {
    headers: { origin: baseURL! },
    data: {
      id: custom.id,
      crewId: baseline.crew.id,
      title: "Hijack",
      start: "2026-10-19T18:00",
      end: "2026-10-19T19:00",
      description: "",
      location: "",
      url: "",
    },
  });
  expect(forbidden.status()).toBe(403);
  const forbiddenDelete = await b.request.delete(
    `/api/events?id=${custom.id}`,
    { headers: { origin: baseURL! } },
  );
  expect(forbiddenDelete.status()).toBe(403);
  const anonymous = await (
    await outsider.request.get(`/api/plan?crew=${baseline.crew.id}`)
  ).json();
  expect(anonymous.crew).toBeNull();
  expect(anonymous.favorites).toHaveLength(0);
  expect(anonymous.events.some((e: any) => e.id === custom.id)).toBe(false);
  const csrf = await a.request.post("/api/plan", {
    headers: { origin: "https://untrusted.example" },
    data: { action: "favorite", eventId: custom.id, saved: false },
  });
  expect(csrf.status()).toBe(403);
  await page
    .getByRole("navigation", { name: "Planner views" })
    .getByRole("button", { name: "Our calendar" })
    .click();
  await expect(page.locator(".calendar-event")).toHaveCount(3);
  await expect(page.locator(".conflict-note")).toBeVisible();
  await page.screenshot({ path: ".artifacts/calendar-desktop.png", fullPage: false });
  await friend
    .getByRole("navigation", { name: "Planner views" })
    .getByRole("button", { name: "Our calendar" })
    .click();
  await expect(friend.locator(".grid-day.mobile-selected")).toBeVisible();
  await friend.screenshot({ path: ".artifacts/calendar-mobile.png", fullPage: false });
  expect(
    await friend.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await friend.getByRole("button", { name: "Agenda list" }).click();
  await expect(friend.locator(".agenda-event")).toHaveCount(3);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export my picks" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("my-app-week.ics");
  await download.saveAs(".artifacts/verified-calendar.ics");
  await page
    .locator(".calendar-event")
    .filter({ hasText: "Test dinner in the Village" })
    .click();
  await page.getByRole("button", { name: "Edit event", exact: true }).click();
  await page.getByLabel("Event name").fill("Dinner with Cole");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.locator(".calendar-event").filter({ hasText: "Dinner with Cole" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Account settings" }).click();
  await page.getByRole("button", { name: "Create recovery code" }).click();
  const code = await page.locator(".recovery-code code").innerText();
  expect(code.length).toBe(48);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start planning" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start planning" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(emailA);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .locator("form")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Account settings" }),
  ).toBeVisible();
  const restored = await (await a.request.get("/api/plan")).json();
  expect(
    restored.favorites.filter((f: any) => f.userId === baseline.user.id),
  ).toHaveLength(2);
  const recovery = await outsider.request.put("/api/recovery", {
    headers: { origin: baseURL! },
    data: { email: emailA, code, password: password + "new" },
  });
  expect(recovery.ok()).toBeTruthy();
  const revoked = await (await a.request.get("/api/plan")).json();
  expect(revoked.user).toBeNull();
  const reused = await outsider.request.put("/api/recovery", {
    headers: { origin: baseURL! },
    data: { email: emailA, code, password: password + "again" },
  });
  expect(reused.status()).toBe(400);
  expect(errors).toEqual([]);
  await a.close();
  await b.close();
  await outsider.close();
});
