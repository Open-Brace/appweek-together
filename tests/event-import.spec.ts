import { test, expect, type Page } from "@playwright/test";

const imported = {
  title: "Paper Lantern App Workshop",
  start: "2026-10-20T09:00",
  end: "2026-10-20T12:00",
  location:
    "Example Workshop Studio, 100 Example Lane, New York, NY",
  description: "Bring a notebook. Sample supplies are provided.",
  imageUrl:
    "https://example.com/workshop-cover.svg",
  url: "https://luma.com/example-workshop",
};

async function openForm(page: Page) {
  await page.route(imported.imageUrl, (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#4b63d1"/></svg>',
    }),
  );
  const catalog = await (await page.request.get("/api/plan")).json();
  const user = {
    id: "import-fixture",
    name: "Import test",
    email: "fixture@example.com",
  };
  const crew = {
    id: "import-fixture",
    name: "Test week",
    ownerId: user.id,
    inviteCode: "0".repeat(64),
  };
  await page.route("**/api/plan*", (route) =>
    route.fulfill({
      json: {
        user,
        crew,
        crews: [crew],
        members: [{ id: user.id, name: user.name, color: "#4b63d1" }],
        events: catalog.events,
        favorites: [],
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Add event", exact: true }).click();
}

test("mobile dates are stacked and readable", async ({ page }) => {
  for (const width of [375, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await openForm(page);
    const start = page.locator('[name="start"]');
    const end = page.locator('[name="end"]');
    const a = await start.boundingBox(),
      b = await end.boundingBox();
    expect(b!.y).toBeGreaterThanOrEqual(a!.y + a!.height);
    expect(
      await start.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(16);
    expect(
      await page
        .locator("dialog")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.getByRole("button", { name: "Close dialog" }).click();
  }
});

test("Luma import shows progress and preserves edits made while loading", async ({
  page,
}) => {
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route("**/api/events/import", async (route) => {
    await waiting;
    await route.fulfill({ json: imported });
  });
  await openForm(page);
  await page.locator('[name="url"]').fill(imported.url);
  await expect(page.getByText(/Importing.*Luma/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add to my week" }),
  ).toBeDisabled();
  await page.locator('[name="title"]').fill("My workshop plans");
  finish();
  await expect(page.getByText(/Imported from Luma/i)).toBeVisible();
  await expect(page.locator('[name="title"]')).toHaveValue(
    "My workshop plans",
  );
  await expect(page.locator('[name="start"]')).toHaveValue(imported.start);
  await expect(page.locator('[name="end"]')).toHaveValue(imported.end);
  await expect(page.locator('textarea[name="description"]')).toHaveValue(
    imported.description,
  );
  await expect(page.locator("form img")).toHaveAttribute(
    "src",
    imported.imageUrl,
  );
});

test("changed links discard stale imports and failures remain editable", async ({
  page,
}) => {
  let finish!: () => void;
  let started!: () => void;
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route("**/api/events/import", async (route) => {
    started();
    await waiting;
    await route.fulfill({ json: imported }).catch(() => {});
  });
  await openForm(page);
  await page.locator('[name="url"]').fill(imported.url);
  await expect(page.getByText(/Importing.*Luma/i)).toBeVisible();
  await requested;
  await page.locator('[name="url"]').fill("https://example.com/my-event");
  finish();
  await expect(page.getByText(/Importing.*Luma/i)).toHaveCount(0);
  await expect(page.locator('[name="title"]')).toHaveValue("");
  await page.unroute("**/api/events/import");
  await page.route("**/api/events/import", (route) =>
    route.fulfill({
      status: 422,
      json: {
        error: "This event is unavailable. Fill in the details manually.",
      },
    }),
  );
  await page.locator('[name="url"]').fill(imported.url);
  await expect(
    page.getByText("This event is unavailable. Fill in the details manually."),
  ).toBeVisible();
  await page.locator('[name="title"]').fill("Manual event");
  await expect(
    page.getByRole("button", { name: "Add to my week" }),
  ).toBeEnabled();
});
