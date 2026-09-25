import { test, expect } from "@playwright/test";
import { parseLinkedAbout, fetchLinkedAbout } from "../src/lib/linked-about-parser";

function nextData(value: unknown) {
  return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(value)}</script>`;
}

test("About parser preserves content beyond the editable notes limit", { tag: ["@parser"] }, async () => {
  const longText = "Long event details. ".repeat(320) + "The final sentence must remain.";
  const html = nextData({ props: { pageProps: { initialData: { kind: "event", data: { description_mirror: {
    type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: longText }] }],
  } } } } } });
  const source = await parseLinkedAbout(html, "https://luma.com/example");
  expect(source).toContain("The final sentence must remain.");
  expect(source.length).toBeGreaterThan(5000);
});

test("Meetup uses the full Details instead of the truncated search preview", { tag: ["@parser"] }, async () => {
  const html = `<script type="application/ld+json">{"@type":"Event","description":"Truncated preview"}</script>` + nextData({ props: { pageProps: { event: { description: "**Agenda**\n\nDoors open at six.\n\nFinal speaker and venue details." } } } });
  const source = await parseLinkedAbout(html, "https://www.meetup.com/test/events/123/");
  expect(source).toContain("Final speaker and venue details.");
  expect(source).not.toContain("Truncated preview");
  expect(source).not.toContain("**Agenda**");
});

test("App Growth Annual extracts only its dedicated About section", { tag: ["@parser"] }, async () => {
  const html = `<nav>Navigation noise</nav><section id="about"><h2>About App Growth Annual</h2><article><h3>A full day</h3><div>Sessions and workshops.</div></article><article><h3>Venue</h3><address>The Glasshouse</address></article></section><footer>Footer noise</footer>`;
  const source = await parseLinkedAbout(html, "https://appgrowthannual.com/#about");
  expect(source).toContain("Sessions and workshops.");
  expect(source).toContain("The Glasshouse");
  expect(source).not.toContain("Navigation noise");
  expect(source).not.toContain("Footer noise");
});

test("linked fetch cannot follow a redirect to a private network", { tag: ["@parser"] }, async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async input => {
    urls.push(String(input));
    return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } });
  };
  try {
    const result = await fetchLinkedAbout("https://luma.com/example").catch(() => null);
    expect(result?.text ?? null).toBeNull();
    expect(urls).toEqual(["https://luma.com/example"]);
  } finally { globalThis.fetch = original; }
});

test("unsupported source hosts are never fetched", { tag: ["@parser"] }, async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Unexpected fetch"); };
  try {
    await fetchLinkedAbout("https://example.com/event").catch(() => null);
    expect(calls).toBe(0);
  } finally { globalThis.fetch = original; }
});
