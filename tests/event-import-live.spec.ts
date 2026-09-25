import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";

const lumaURL = "https://luma.com/yqj0w6ql";
const title = "Pickleball Social by Noise & RevenueCat";

test("real Luma import and uploaded covers persist privately", { tag: ["@live", "@writes"] }, async ({
  page,
  playwright,
  baseURL,
}) => {
  const request = page.request;
  const origin = baseURL!;
  const headers = { origin };
  const suffix = randomBytes(5).toString("hex");
  const signup = await request.post("/api/auth/sign-up/email", {
    headers,
    data: {
      name: "Kyle Test",
      email: `test-kyle-${suffix}@example.com`,
      password: `WeekPlanner!${suffix}`,
    },
  });
  expect(signup.ok(), await signup.text()).toBe(true);
  const created = await request.post("/api/plan", {
    headers,
    data: { action: "create", name: "Cover import verification" },
  });
  expect(created.ok()).toBe(true);
  const { crewId } = await created.json();
  const outsider = await playwright.request.newContext({ baseURL });
  expect(
    (
      await outsider.post("/api/events/import", {
        headers,
        data: { url: lumaURL },
      })
    ).status(),
  ).toBe(401);
  for (const url of [
    "https://example.com/",
    "http://luma.com/yqj0w6ql",
    "https://luma.com.evil.test/event",
    "https://name:password@luma.com/event",
    "https://luma.com:444/event",
  ]) {
    expect(
      (
        await request.post("/api/events/import", { headers, data: { url } })
      ).status(),
    ).toBe(400);
  }
  expect(
    (
      await request.post("/api/events/import", {
        headers: { origin: "https://example.com" },
        data: { url: lumaURL },
      })
    ).status(),
  ).toBe(403);
  await page.goto("/");
  await page.getByRole("button", { name: "Add event", exact: true }).click();
  await page.locator('[name="url"]').fill(lumaURL);
  await expect(page.getByText(/Imported from Luma/i)).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator('[name="title"]')).toHaveValue(title);
  await expect(page.locator('[name="start"]')).toHaveValue("2026-10-20T09:00");
  await expect(page.locator('[name="end"]')).toHaveValue("2026-10-20T12:00");
  await expect(page.locator('[name="location"]')).toHaveValue(
    /1501 Broadway 8th Floor/,
  );
  await expect(page.locator('textarea[name="description"]')).toHaveValue(
    /Equipment provided\. See you soon!/,
  );
  await page
    .locator("form img")
    .evaluate((img: HTMLImageElement) => img.decode());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".artifacts/luma-import-mobile.png" });
  await page.getByRole("button", { name: "Add to my week" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  let plan = await (await request.get("/api/plan")).json();
  let event = plan.events.find(
    (e: { crewId: string; title: string }) =>
      e.crewId === crewId && e.title === title,
  );
  expect(event.imageUrl).toBe(
    "https://images.lumacdn.com/uploads/8k/4f7e7f04-a162-453e-9393-f5c5712430eb.png",
  );
  expect(event.startsAt).toBe("2026-10-20T13:00:00.000Z");
  await page.getByRole("button", { name: title, exact: true }).click();
  await page.getByRole("button", { name: "Edit event", exact: true }).click();
  await expect(page.getByText(/Importing.*Luma/i)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Import from Luma", exact: true })
    .click();
  await expect(page.getByText(/Imported from Luma/i)).toBeVisible({
    timeout: 30000,
  });
  const dataURL = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ff5930";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "white";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText("Test cover", 40, 128);
    return canvas.toDataURL("image/png");
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: Buffer.from(dataURL.split(",")[1], "base64"),
  });
  await expect(page.locator("form img")).toHaveAttribute(
    "src",
    /^data:image\/jpeg;base64,/,
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  plan = await (await request.get("/api/plan")).json();
  event = plan.events.find((e: { id: string }) => e.id === event.id);
  expect(event.imageUrl).toMatch(/^\/api\/events\/[^/]+\/cover\?v=/);
  const cover = await request.get(event.imageUrl);
  expect(cover.ok()).toBe(true);
  expect(cover.headers()["content-type"]).toContain("image/jpeg");
  expect((await cover.body()).byteLength).toBeGreaterThan(100);
  expect(cover.headers()["cache-control"]).toContain("private");
  expect((await outsider.get(event.imageUrl)).status()).toBe(401);
  await page.getByRole("button", { name: title, exact: true }).click();
  await page
    .locator(".detail-art")
    .evaluate((img: HTMLImageElement) => img.decode());
  await page.getByRole("button", { name: "Edit event", exact: true }).click();
  await page
    .locator('textarea[name="description"]')
    .fill("Updated note, same uploaded cover");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  plan = await (await request.get("/api/plan")).json();
  expect(
    plan.events.find((e: { id: string }) => e.id === event.id).imageUrl,
  ).toMatch(/\/cover\?v=/);
  const invalidCover = await request.post("/api/events", {
    headers,
    data: {
      id: event.id,
      crewId,
      title,
      start: "2026-10-20T09:00",
      end: "2026-10-20T12:00",
      imageUrl: "data:image/jpeg;base64,PHNjcmlwdD4=",
    },
  });
  expect(invalidCover.status()).toBe(400);
  await page.getByRole("button", { name: title, exact: true }).click();
  await page.getByRole("button", { name: "Edit event", exact: true }).click();
  await page.getByRole("button", { name: /Remove.*(cover|photo)/i }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  plan = await (await request.get("/api/plan")).json();
  expect(
    plan.events.find((e: { id: string }) => e.id === event.id).imageUrl,
  ).toBeNull();
  await outsider.dispose();
});
