import { test, expect } from "@playwright/test";

const examples = [
  {
    title: "Recovery Mode: STRV & RevenueCat at NYC App Week",
    provider: "Luma",
    source: "luma.com",
    text: /RevenueCat|STRV/,
  },
  {
    title: "iOSoho IndieDev Talks",
    provider: "Meetup",
    source: "meetup.com",
    text: /Jennifer Brisbane/,
  },
  {
    title: "App Growth Annual",
    provider: "App Growth Annual",
    source: "appgrowthannual.com",
    text: /A full day of learnings and connections/,
  },
];

test("linked About content appears below the original description with attribution", { tag: ["@live"] }, async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const catalog = await (await page.request.get("/api/plan")).json();
  await page.goto("/");
  for (const example of examples) {
    const event = catalog.events.find(
      (item: { title: string }) => item.title === example.title,
    );
    await page.getByLabel("Search events").fill(example.title);
    await page
      .getByRole("button", { name: example.title, exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(".detail-description")).toHaveText(
      event.description,
    );
    const about = dialog.locator(".linked-about");
    await expect(
      about.getByText("About the event", { exact: true }),
    ).toBeVisible();
    const attribution = about.getByRole("link", {
      name: `From ${example.provider}`,
      exact: false,
    });
    await expect(attribution).toHaveAttribute(
      "href",
      new RegExp(example.source),
    );
    await expect(about).toContainText(example.text);
    expect(
      await about.evaluate(
        (el) =>
          el.compareDocumentPosition(
            document.querySelector(".detail-description")!,
          ) & Node.DOCUMENT_POSITION_PRECEDING,
      ),
    ).toBeTruthy();
    await about.scrollIntoViewIfNeeded();
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    if (example.provider === "Luma")
      await page.screenshot({ path: ".artifacts/linked-about-mobile.png" });
    await page.getByRole("button", { name: "Close dialog" }).click();
  }
  await page.getByLabel("Search events").fill("Oversubscribed");
  await page
    .getByRole("button", { name: "Oversubscribed", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").locator(".detail-description"),
  ).not.toBeEmpty();
  await expect(page.getByRole("dialog").locator(".linked-about")).toHaveCount(
    0,
  );
});

test("all linked public events have full cached About content without bloating plan", { tag: ["@live"] }, async ({
  request,
}) => {
  const plan = await (await request.get("/api/plan")).json();
  const linked = plan.events.filter(
    (event: { links: unknown[] }) => event.links.length,
  );
  expect(linked).toHaveLength(21);
  for (const event of linked) {
    expect(event).not.toHaveProperty("linkedAbout");
    const response = await request.get(`/api/events/${event.id}/about`);
    expect(response.ok()).toBe(true);
    expect(response.headers()["cache-control"]).toContain("private");
    const result = await response.json();
    expect(result.status).toBe("sources");
    expect(result.sources).toHaveLength(1);
    const [source] = result.sources;
    expect(source.status).toBe("ready");
    expect(source.text.length).toBeGreaterThan(100);
    expect(source.sourceUrl).toMatch(/^https:\/\//);
    expect(source.fetchedAt).toBeTruthy();
    if (source.sourceName === "Meetup") {
      expect(source.text.length).toBeGreaterThan(3000);
      expect(source.text).toContain("Jennifer Brisbane");
      expect(source.text).toContain("Code of Conduct");
    }
  }
  expect(
    (await request.get("/api/events/nonexistent-private-event/about")).status(),
  ).toBe(404);
});
