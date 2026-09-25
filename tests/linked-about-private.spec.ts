import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";

test("cached public source text cannot bypass private event membership", { tag: ["@live", "@writes"] }, async ({
  page,
  request: anonymous,
  playwright,
  baseURL,
}) => {
  const owner = page.request;
  const other = await playwright.request.newContext({ baseURL });
  const headers = { origin: baseURL! };
  const suffix = randomBytes(5).toString("hex");
  for (const [client, name, email] of [
    [owner, "Kyle Test", `test-kyle-${suffix}@example.com`],
    [other, "Cole Test", `test-cole-${suffix}@example.com`],
  ] as const) {
    expect(
      (
        await client.post("/api/auth/sign-up/email", {
          headers,
          data: { name, email, password: `EventAbout!${suffix}` },
        })
      ).ok(),
    ).toBe(true);
  }
  const created = await owner.post("/api/plan", {
    headers,
    data: { action: "create", name: "About privacy verification" },
  });
  const { crewId } = await created.json();
  const eventResponse = await owner.post("/api/events", {
    headers,
    data: {
      crewId,
      title: "Private sourced event",
      description: "Keep this original note.",
      start: "2026-10-19T18:00",
      end: "2026-10-19T19:00",
      url: "https://luma.com/strv-f4ju",
    },
  });
  expect(eventResponse.ok()).toBe(true);
  const { id } = await eventResponse.json();
  const path = `/api/events/${id}/about`;
  expect((await anonymous.get(path)).status()).toBe(404);
  expect((await other.get(path)).status()).toBe(404);
  const ownResult = await owner.get(path);
  expect(ownResult.ok()).toBe(true);
  expect((await ownResult.json()).sources[0].status).toBe("ready");
  const plan = await (await owner.get("/api/plan")).json();
  expect(plan.events.find((e: { id: string }) => e.id === id).description).toBe(
    "Keep this original note.",
  );
  expect(
    (
      await other.post("/api/plan", {
        headers,
        data: { action: "join", code: plan.crew.inviteCode },
      })
    ).ok(),
  ).toBe(true);
  expect((await other.get(path)).status()).toBe(200);
  const otherPlan = await (await other.get("/api/plan")).json();
  expect(
    (
      await owner.post("/api/plan", {
        headers,
        data: { action: "remove", crewId, userId: otherPlan.user.id },
      })
    ).ok(),
  ).toBe(true);
  expect((await other.get(path)).status()).toBe(404);
  const edited = await owner.post("/api/events", {
    headers,
    data: {
      id,
      crewId,
      title: "Private sourced event",
      description: "Keep this original note.",
      start: "2026-10-19T18:00",
      end: "2026-10-19T19:00",
      url: "https://example.com/no-about-parser",
    },
  });
  expect(edited.ok()).toBe(true);
  const changed = await (await owner.get(path)).json();
  expect(changed.sources).toHaveLength(1);
  expect(changed.sources[0].text).toBeNull();
  expect(changed.sources[0].status).toBe("unavailable");
  expect(changed.sources[0].sourceUrl).toContain("example.com");
  await other.dispose();
});
