import { test, expect, type Page } from "@playwright/test";

async function signedIn(page: Page) {
  const catalog = await (await page.request.get("/api/plan")).json();
  const user = { id: "modal-fixture", name: "Modal test", email: "fixture@example.com" };
  const crew = { id: "modal-fixture", name: "Open Brace App Week", ownerId: user.id, inviteCode: "0".repeat(64) };
  await page.route("**/api/plan*", route => route.fulfill({ json: { ...catalog, user, crew, crews: [crew], members: [{ id: user.id, name: user.name, color: "#4b63d1" }], favorites: [] } }));
  await page.goto("/");
}

async function verifyCloseAtBottom(page: Page) {
  const dialog = page.getByRole("dialog");
  const close = dialog.getByRole("button", { name: "Close dialog" });
  const before = await close.boundingBox();
  await dialog.evaluate(el => {
    el.scrollTop = el.scrollHeight;
    const body = el.querySelector<HTMLElement>(".modal-body")!;
    body.scrollTop = body.scrollHeight;
  });
  const after = await close.boundingBox();
  expect(after!.width).toBeGreaterThanOrEqual(44);
  expect(after!.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(2);
  const bounds = await dialog.boundingBox();
  expect(after!.y).toBeGreaterThanOrEqual(bounds!.y);
  expect(after!.y + after!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
  expect(await close.evaluate(el => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  })).toBe(true);
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await close.click();
  await expect(dialog).toHaveCount(0);
}

for (const width of [320, 390, 1440]) {
  test(`event form retains close control and aligned controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await signedIn(page);
    const opener = page.getByRole("button", { name: "Add event", exact: true });
    await opener.focus();
    await opener.press("Enter");
    const dialog = page.getByRole("dialog");
    await page.evaluate(() => document.fonts.ready);
    const title = page.locator('[name="title"]');
    const reference = await title.boundingBox();
    for (const name of ["start", "end"]) {
      const input = page.locator(`[name="${name}"]`);
      const box = await input.boundingBox();
      expect(Math.abs(box!.x - reference!.x)).toBeLessThan(2);
      expect(Math.abs(box!.width - reference!.width)).toBeLessThan(2);
      expect(await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    }
    const label = await page.locator(".cover-field .field-label").boundingBox();
    const choose = await page.getByRole("button", { name: "Choose photo" }).boundingBox();
    expect(choose!.y).toBeGreaterThanOrEqual(label!.y + label!.height + 5);
    await page.locator('textarea[name="description"]').focus();
    await page.setViewportSize({ width, height: 490 });
    const close = dialog.getByRole("button", { name: "Close dialog" });
    await expect(close).toBeInViewport();
    await page.setViewportSize({ width, height: 844 });
    await page.locator(".modal-body").evaluate(el => el.scrollTop = 0);
    if (width === 390) await page.screenshot({ path: ".artifacts/modal-form-mobile-top.png" });
    await dialog.evaluate(el => { const body = el.querySelector<HTMLElement>(".modal-body")!; body.scrollTop = body.scrollHeight; });
    if (width === 390) await page.screenshot({ path: ".artifacts/modal-form-mobile-bottom.png" });
    await verifyCloseAtBottom(page);
    await expect(opener).toBeFocused();
  });
}

test("long event details and account use the same reachable close control", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signedIn(page);
  await page.getByLabel("Search events").fill("Recovery Mode");
  await page.getByRole("button", { name: "Recovery Mode: STRV & RevenueCat at NYC App Week", exact: true }).click();
  await expect(page.locator(".linked-about-text")).not.toBeEmpty();
  await verifyCloseAtBottom(page);
  await page.getByRole("button", { name: "Account settings" }).click();
  await verifyCloseAtBottom(page);
  await page.locator(".crew-button").click();
  await verifyCloseAtBottom(page);
});

test("desktop dialog preserves Escape, focus, and backdrop dismissal", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signedIn(page);
  const opener = page.getByRole("button", { name: "Add event", exact: true });
  await opener.focus();
    await opener.press("Enter");
  await page.getByRole("dialog").locator(".modal-heading").click({ position: { x: 5, y: 5 } });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.focus();
    await opener.press("Enter");
  await page.mouse.click(8, 8);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(opener).toBeFocused();
});
