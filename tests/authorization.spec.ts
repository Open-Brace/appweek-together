import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";

test("group boundaries, invitation rotation and removal enforce access", { tag: ["@writes"] }, async ({
  browser,
  baseURL,
}) => {
  const owner = await browser.newContext(),
    friend = await browser.newContext();
  const suffix = randomBytes(6).toString("hex"),
    password = "PlannerBoundary!" + suffix;
  async function signup(context: typeof owner, name: string) {
    const result = await context.request.post("/api/auth/sign-up/email", {
      headers: { origin: baseURL! },
      data: {
        name,
        email: `test-${name.toLowerCase()}-${suffix}@example.com`,
        password,
      },
    });
    expect(result.ok()).toBeTruthy();
    return (await result.json()).user;
  }
  const a = await signup(owner, "Owner"),
    b = await signup(friend, "Friend");
  async function act(context: typeof owner, data: unknown) {
    return context.request.post("/api/plan", {
      headers: { origin: baseURL! },
      data,
    });
  }
  const crewA = await (
    await act(owner, { action: "create", name: "Boundary A" })
  ).json();
  const crewB = await (
    await act(owner, { action: "create", name: "Boundary B" })
  ).json();
  const stateA = await (
    await owner.request.get(`/api/plan?crew=${crewA.crewId}`)
  ).json();
  await act(friend, { action: "join", code: stateA.crew.inviteCode });
  const customResponse = await friend.request.post("/api/events", {
    headers: { origin: baseURL! },
    data: {
      crewId: crewA.crewId,
      title: "Friend-owned boundary event",
      start: "2026-10-20T12:00",
      end: "2026-10-20T13:00",
      description: "",
      location: "New York",
      url: "",
    },
  });
  expect(customResponse.ok()).toBeTruthy();
  const custom = await customResponse.json();
  const stateB = await (
    await owner.request.get(`/api/plan?crew=${crewB.crewId}`)
  ).json();
  expect(stateB.events.some((e: any) => e.id === custom.id)).toBe(false);
  const strangerCrew = await (
    await friend.request.get(`/api/plan?crew=${crewB.crewId}`)
  ).json();
  expect(strangerCrew.crew.id).toBe(crewA.crewId);
  const invalidDate = await friend.request.post("/api/events", {
    headers: { origin: baseURL! },
    data: {
      crewId: crewA.crewId,
      title: "Invalid",
      start: "2026-10-20T12:00",
      end: "2026-10-20T11:00",
      description: "",
      location: "",
      url: "",
    },
  });
  expect(invalidDate.status()).toBe(400);
  const ownerEdit = await owner.request.post("/api/events", {
    headers: { origin: baseURL! },
    data: {
      id: custom.id,
      crewId: crewA.crewId,
      title: "Cannot edit friend",
      start: "2026-10-20T12:00",
      end: "2026-10-20T13:00",
      description: "",
      location: "",
      url: "",
    },
  });
  expect(ownerEdit.status()).toBe(403);
  await act(owner, { action: "remove", crewId: crewA.crewId, userId: b.id });
  const removed = await (
    await friend.request.get(`/api/plan?crew=${crewA.crewId}`)
  ).json();
  expect(removed.crew).toBeNull();
  expect(removed.events.some((e: any) => e.id === custom.id)).toBe(false);
  expect(removed.favorites.some((f: any) => f.eventId === custom.id)).toBe(
    false,
  );
  const saveRemoved = await act(friend, {
    action: "favorite",
    eventId: custom.id,
    saved: true,
  });
  expect(saveRemoved.status()).toBe(403);
  const removeOwn = await friend.request.delete(`/api/events?id=${custom.id}`, {
    headers: { origin: baseURL! },
  });
  expect(removeOwn.status()).toBe(403);
  const moderation = await owner.request.delete(`/api/events?id=${custom.id}`, {
    headers: { origin: baseURL! },
  });
  expect(moderation.ok()).toBeTruthy();
  await act(owner, { action: "rotate", crewId: crewA.crewId });
  const stale = await act(friend, {
    action: "join",
    code: stateA.crew.inviteCode,
  });
  expect(stale.status()).toBe(404);
  expect(a.id).not.toBe(b.id);
  await owner.close();
  await friend.close();
});
