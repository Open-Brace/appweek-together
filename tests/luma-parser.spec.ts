import { test, expect } from "@playwright/test";
import fixture from "./fixtures/luma-event.json";
import { parseLuma, importLuma } from "../src/lib/luma";

const html = (value: unknown) =>
  `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(value)}</script>`;

test("Luma parser keeps complete text, original cover and New York times", { tag: "@parser" }, () => {
  const event = parseLuma(html(fixture), "https://luma.com/example-workshop");
  expect(Object.keys(event).sort()).toEqual([
    "description",
    "end",
    "imageUrl",
    "location",
    "start",
    "title",
    "url",
  ]);
  expect(event.start).toBe("2026-10-20T09:00");
  expect(event.end).toBe("2026-10-20T12:00");
  expect(event.description).toContain("Paper Lantern and Sample Studio invite you");
  expect(event.description).toContain("\n\nAll experience levels are welcome");
  expect(event.description).toContain("Sample supplies are provided.");
  expect(event.imageUrl).toBe(
    fixture.props.pageProps.initialData.data.event.cover_url,
  );
  expect(event.location).toContain("100 Example Lane");
});

test("Luma parser hides private addresses and rejects unsafe cover schemes", { tag: "@parser" }, () => {
  const data = structuredClone(fixture);
  data.props.pageProps.initialData.data.event.geo_address_visibility =
    "private";
  data.props.pageProps.initialData.data.event.cover_url = "javascript:alert(1)";
  const event = parseLuma(html(data), "https://luma.com/example-workshop");
  expect(event.location).toBe("");
  expect(event.imageUrl).toBe("");
});

test("Luma redirects cannot escape the allowed host", { tag: ["@parser"] }, async () => {
  const original = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = async (input) => {
    requested.push(String(input));
    return new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/private" },
    });
  };
  try {
    await expect(importLuma("https://luma.com/example-workshop")).rejects.toThrow(
      /outside Luma/,
    );
    expect(requested).toEqual(["https://luma.com/example-workshop"]);
  } finally {
    globalThis.fetch = original;
  }
});

test("Luma import stops reading oversized pages", { tag: ["@parser"] }, async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("x".repeat(2_000_001), {
      headers: { "content-type": "text/html" },
    });
  try {
    await expect(importLuma("https://luma.com/example-workshop")).rejects.toThrow(
      /too large/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
