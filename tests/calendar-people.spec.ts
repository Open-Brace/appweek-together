import { test, expect, type Page } from "@playwright/test";

async function openCalendar(page: Page) {
  const catalog = await (await page.request.get("/api/plan")).json();
  const user = { id: "kyle-calendar", name: "Kyle", email: "calendar@example.com" };
  const members = [
    { id: user.id, name: "Kyle", color: "#4b63d1" },
    { id: "cole-calendar", name: "Cole", color: "#aa4b28" },
  ];
  const crew = { id: "calendar-fixture", name: "Calendar check", ownerId: user.id, inviteCode: "0".repeat(64) };
  const events = [
    { ...catalog.events[0], id: "short-five", title: "Five minute coffee", startsAt: "2026-10-19T13:00:00Z", endsAt: "2026-10-19T13:05:00Z" },
    { ...catalog.events[0], id: "short-thirty", title: "Thirty minute catchup", startsAt: "2026-10-19T14:00:00Z", endsAt: "2026-10-19T14:30:00Z" },
    { ...catalog.events[0], id: "overlap", title: "Overlapping session", startsAt: "2026-10-19T14:00:00Z", endsAt: "2026-10-19T15:00:00Z" },
  ];
  await page.route("**/api/plan*", route => route.fulfill({ json: { ...catalog, user, crew, crews: [crew], members, events, favorites: events.flatMap(event => members.map(member => ({ userId: member.id, eventId: event.id }))) } }));
  await page.goto("/");
  await page.getByRole("navigation", { name: "Planner views" }).getByRole("button", { name: "Our calendar" }).click();
  await expect(page.locator(".calendar-event")).toHaveCount(3);
  await page.evaluate(() => document.fonts.ready);
}

for (const width of [320, 390, 768, 1440]) {
  test(`people stay in the top-right of short and overlapping events at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openCalendar(page);
    for (const event of await page.locator(".calendar-event").all()) {
      const people = event.locator(".calendar-people");
      await expect(people).toHaveAttribute("aria-label", "Saved by Kyle, Cole");
      await expect(people.locator("span")).toHaveText(["K", "C"]);
      const card = (await event.boundingBox())!;
      const attendees = (await people.boundingBox())!;
      expect(attendees.y).toBeGreaterThanOrEqual(card.y);
      expect(attendees.y + attendees.height).toBeLessThanOrEqual(card.y + card.height + 1);
      expect(attendees.y - card.y).toBeLessThanOrEqual(10);
      expect(card.x + card.width - attendees.x - attendees.width).toBeLessThanOrEqual(12);
      expect(attendees.x).toBeGreaterThanOrEqual(card.x);
      expect(await people.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      const time = (await event.locator(".calendar-event-time").boundingBox())!;
      expect(time.x + time.width).toBeLessThanOrEqual(attendees.x + 1);
    }
    const short = page.locator(".calendar-event").filter({ hasText: "Five minute coffee" });
    await short.scrollIntoViewIfNeeded();
    if (width === 390) await page.screenshot({ path: ".artifacts/calendar-people-mobile.png" });
    await short.click();
    await expect(page.getByRole("dialog").locator(".detail-attendees")).toContainText("Kyle");
    await expect(page.getByRole("dialog").locator(".detail-attendees")).toContainText("Cole");
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page.locator(".calendar-legend").getByRole("button", { name: "Cole", exact: true }).click();
    for (const people of await page.locator(".calendar-people").all()) {
      await expect(people).toHaveAttribute("aria-label", "Saved by Kyle");
      await expect(people.locator("span")).toHaveText(["K"]);
    }
  });
}
