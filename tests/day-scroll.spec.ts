import { test, expect } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`day navigation scrolls without filtering and follows scrolling at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.locator(".day-section")).toHaveCount(4);
    const count = await page.locator(".event-card").count();
    const dates = page.locator(".day-tabs");
    await expect(dates.getByRole("button", { name: "All days", exact: true })).toHaveCount(0);
    await expect(dates.getByRole("button", { name: "Mon 19", exact: true })).toHaveClass(/active/);
    await dates.getByRole("button", { name: "Wed 21", exact: true }).click();
    await expect(page.locator(".event-card")).toHaveCount(count, {
      timeout: 1500,
    });
    await expect(page.locator(".day-section")).toHaveCount(4);
    await expect(
      dates.getByRole("button", { name: "Wed 21", exact: true }),
    ).toHaveClass(/active/);
    await expect
      .poll(async () =>
        page
          .locator(".day-section")
          .nth(2)
          .evaluate((el) => {
            const heading = el.getBoundingClientRect();
            const nav = document
              .querySelector(".day-tabs")!
              .getBoundingClientRect();
            return Math.abs(heading.top - nav.bottom);
          }),
      )
      .toBeLessThan(45);
    await expect(dates).toBeInViewport();
    await page
      .locator(".day-section")
      .nth(1)
      .evaluate((el) => {
        const bar = document
          .querySelector(".day-tabs")!
          .getBoundingClientRect();
        window.scrollTo({
          top: window.scrollY + el.getBoundingClientRect().top - bar.bottom - 4,
          behavior: "instant",
        });
      });
    await expect(
      dates.getByRole("button", { name: "Tue 20", exact: true }),
    ).toHaveClass(/active/);
    await page.evaluate(() =>
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "instant",
      }),
    );
    await expect(
      dates.getByRole("button", { name: "Thu 22", exact: true }),
    ).toHaveClass(/active/);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeLessThan(5);
    await expect(
      dates.getByRole("button", { name: "Mon 19", exact: true }),
    ).toHaveClass(/active/);
    await page.getByLabel("Search events").fill("Shippies");
    await expect(page.locator(".event-card")).toHaveCount(1);
    await expect(
      dates.getByRole("button", { name: "Mon 19", exact: true }),
    ).toBeDisabled();
    await expect(dates.getByRole("button", { name: "Tue 20", exact: true })).toHaveClass(/active/);
    await page.getByLabel("Search events").fill("No such event xyz");
    await expect(page.locator(".event-card")).toHaveCount(0);
    await expect(dates.locator("button.active")).toHaveCount(0);
    await page.getByLabel("Search events").fill("");
    await expect(page.locator(".event-card")).toHaveCount(count);
    await dates.getByRole("button", { name: "Thu 22", exact: true }).click();
    await expect(
      dates.getByRole("button", { name: "Thu 22", exact: true }),
    ).toHaveClass(/active/);
    if (width === 390)
      await page.screenshot({ path: ".artifacts/day-jump-mobile.png" });
  });
}

test("short final day and wrapped header keep navigation usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const catalog = await (await page.request.get("/api/plan")).json();
  const dates = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"];
  const events = dates.map((day) =>
    catalog.events.find((event: { startsAt: string }) =>
      event.startsAt.startsWith(day),
    ),
  );
  const user = {
    id: "day-scroll-test",
    name: "Day scroll",
    email: "scroll@example.com",
  };
  const crew = {
    id: "day-scroll-test",
    name: "W".repeat(60),
    ownerId: user.id,
    inviteCode: "0".repeat(64),
  };
  await page.route("**/api/plan*", (route) =>
    route.fulfill({
      json: {
        ...catalog,
        user,
        crew,
        crews: [crew],
        events,
        members: [{ id: user.id, name: user.name, color: "#4b63d1" }],
        favorites: events.map((event) => ({
          userId: user.id,
          eventId: event.id,
        })),
      },
    }),
  );
  await page.goto("/");
  const bar = page.locator(".day-tabs");
  await bar.getByRole("button", { name: "Thu 22", exact: true }).click();
  await expect(
    bar.getByRole("button", { name: "Thu 22", exact: true }),
  ).toHaveClass(/active/);
  await expect(page.locator(".event-card")).toHaveCount(4);
  expect(
    await bar.evaluate((el) => {
      const header = document.querySelector(".topbar")!.getBoundingClientRect();
      const nav = document.querySelector(".sidebar")!.getBoundingClientRect();
      return (
        el.getBoundingClientRect().top >=
        Math.max(header.bottom, nav.bottom) - 1
      );
    }),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("navigation", { name: "Planner views" })
    .getByRole("button", { name: "Our calendar" })
    .click();
  await page
    .locator(".mobile-calendar-days")
    .getByRole("button", { name: "Tue 20" })
    .click();
  await expect(page.locator(".mobile-calendar-days button.active")).toHaveText(
    "Tue 20",
  );
  await page
    .getByRole("navigation", { name: "Planner views" })
    .getByRole("button", { name: "Explore events" })
    .click();
  await bar.getByRole("button", { name: "Wed 21", exact: true }).click();
  await expect(page.locator(".event-card")).toHaveCount(4);
  await page
    .getByRole("navigation", { name: "Planner views" })
    .getByRole("button", { name: "Our calendar" })
    .click();
  await expect(page.locator(".mobile-calendar-days button.active")).toHaveText(
    "Tue 20",
  );
});
