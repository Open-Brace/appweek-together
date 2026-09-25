import { test, expect } from "@playwright/test";
import type { Plan } from "../src/lib/types";
import { DAYS, dayOf } from "../src/lib/types";

for (const width of [390, 1440]) {
  test(`agenda shows the whole week after selecting Thursday at ${width}px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const catalog: Plan = await (await request.get("/api/plan")).json();
    const selected = DAYS.flatMap((day, index) =>
      catalog.events
        .filter((event) => dayOf(event.startsAt) === day)
        .slice(0, index === 0 || index === 3 ? 2 : 1),
    );
    expect(selected).toHaveLength(6);
    const person = {
      id: "agenda-regression-viewer",
      name: "Planner test",
      email: "agenda@example.com",
    };
    const crew = {
      id: "agenda-regression-crew",
      name: "Test week",
      ownerId: person.id,
      inviteCode: "0".repeat(64),
    };
    await page.route("**/api/plan*", (route) =>
      route.fulfill({
        json: {
          ...catalog,
          user: person,
          crew,
          crews: [crew],
          members: [{ id: person.id, name: person.name, color: "#4b63d1" }],
          favorites: selected.map((event) => ({
            userId: person.id,
            eventId: event.id,
          })),
        },
      }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Thu 22", exact: true }).click();
    await page
      .getByRole("navigation", { name: "Planner views" })
      .getByRole("button", { name: "Our calendar" })
      .click();
    await page
      .getByRole("button", { name: "Agenda list", exact: true })
      .click();
    await expect(page.locator(".agenda > section")).toHaveCount(4, {
      timeout: 1500,
    });
    await expect(page.locator(".agenda h3")).toHaveText([
      "Monday, Oct 19",
      "Tuesday, Oct 20",
      "Wednesday, Oct 21",
      "Thursday, Oct 22",
    ]);
    await expect(page.locator(".agenda-event")).toHaveCount(6);
    await expect(page.locator(".agenda-event strong")).toHaveText(
      selected.map((event) => event.title),
    );
    await page.locator(".agenda-event").last().scrollIntoViewIfNeeded();
    await expect(page.locator(".agenda-event").last()).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390) await page.evaluate(() => window.scrollTo(0, 0));
    if (width === 390)
      await page.screenshot({
        path: ".artifacts/agenda-full-week-mobile.png",
        fullPage: true,
      });
  });
}
