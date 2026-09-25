import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

for (const interaction of ["touch", "keyboard"] as const) {
  test(`${interaction} opens with static heading focus and preserves keyboard controls`, async ({
    page,
    browserName,
  }) => {
    const user = {
      id: "focus-fixture",
      name: "Focus test",
      email: "focus@example.com",
    };
    const crew = {
      id: "focus-crew",
      name: "Focus test week",
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
          favorites: [],
          events: [{
            id: "focus-event", title: "Sample meetup", description: "A sample event.",
            host: "Sample host", location: "Sample venue", category: "Meetup",
            startsAt: "2026-10-19T22:00:00Z", endsAt: "2026-10-19T23:00:00Z",
            imageUrl: null, links: [], sourceUrl: null, isListed: true,
            crewId: null, creatorId: null, updatedAt: "2026-09-24T00:00:00Z",
          }],
        },
      }),
    );
    await page.goto("/");
    const opener = page.getByRole("button", { name: "Add event", exact: true });
    if (interaction === "touch") {
      await opener.tap();
    } else {
      await opener.focus();
      await opener.press("Enter");
    }
    const dialog = page.getByRole("dialog");
    const heading = dialog.getByRole("heading", { name: "Add event" });
    const close = dialog.getByRole("button", { name: "Close dialog" });
    await expect(heading).toBeFocused();
    await expect(heading).toHaveAttribute("tabindex", "-1");
    await expect(heading).toHaveCSS("outline-style", "none");
    await expect(close).not.toBeFocused();
    await expect(close).toHaveCSS("outline-style", "none");
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
    await expect(close).toBeFocused();
    await expect(close).toHaveCSS("outline-style", "solid");
    await expect(close).toHaveCSS("outline-width", "3px");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    if (interaction === "keyboard") await expect(opener).toBeFocused();
  });
}
