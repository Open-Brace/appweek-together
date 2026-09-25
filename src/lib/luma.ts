import { load } from "cheerio";
import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";
import { lumaUrl, secureImageUrl, type EventDraft } from "./event-draft";

const lumaData = z.object({
  props: z.object({
    pageProps: z.object({
      initialData: z.object({
        kind: z.literal("event"),
        data: z.object({
          event: z.object({
            name: z.string().min(1),
            start_at: z.iso.datetime(),
            end_at: z.iso.datetime(),
            cover_url: z.string().nullish(),
            geo_address_visibility: z.string().nullish(),
            geo_address_info: z
              .object({
                mode: z.string().nullish(),
                full_address: z.string().nullish(),
                address: z.string().nullish(),
              })
              .nullish(),
          }),
          description_mirror: z.unknown(),
        }),
      }),
    }),
  }),
});

function descriptionText(value: unknown, depth = 0): string {
  if (depth > 20 || !value || typeof value !== "object") return "";
  const node = value as Record<string, unknown>;
  if (node.type === "text" && typeof node.text === "string")
    return node.text.slice(0, 5000);
  if (node.type === "hard_break") return "\n";
  const content = Array.isArray(node.content)
    ? node.content
        .slice(0, 1000)
        .map((child) => descriptionText(child, depth + 1))
        .join("")
    : "";
  return (
    content +
    (["paragraph", "heading", "list_item"].includes(String(node.type))
      ? "\n\n"
      : "")
  ).slice(0, 5000);
}

export function parseLuma(html: string, url: string): EventDraft {
  const json = load(html)("script#__NEXT_DATA__").text();
  const { event, description_mirror } = lumaData.parse(JSON.parse(json)).props
    .pageProps.initialData.data;
  const address = event.geo_address_info;
  return {
    title: event.name.trim().slice(0, 160),
    description: descriptionText(description_mirror)
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 5000),
    location:
      event.geo_address_visibility === "public" && address?.mode === "shown"
        ? (address.full_address || address.address || "").slice(0, 300)
        : "",
    start: formatInTimeZone(
      event.start_at,
      "America/New_York",
      "yyyy-MM-dd'T'HH:mm",
    ),
    end: formatInTimeZone(
      event.end_at,
      "America/New_York",
      "yyyy-MM-dd'T'HH:mm",
    ),
    url,
    imageUrl:
      event.cover_url && secureImageUrl(event.cover_url) ? event.cover_url : "",
  };
}

export async function importLuma(value: string): Promise<EventDraft> {
  const initialUrl = lumaUrl(value);
  if (!initialUrl) throw new Error("Paste a valid HTTPS Luma event link.");
  let url: URL = initialUrl;
  const signal = AbortSignal.timeout(12_000);
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal,
      headers: { Accept: "text/html", "User-Agent": "AppWeekTogether/1.0" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      const target = location ? lumaUrl(new URL(location, url).href) : null;
      if (!target)
        throw new Error(
          "This link redirects outside Luma. Paste the event's Luma link.",
        );
      url = target;
      continue;
    }
    if (
      !response.ok ||
      !response.body ||
      !response.headers.get("content-type")?.includes("text/html")
    ) {
      await response.body?.cancel();
      throw new Error(
        "Luma could not share this event. Check the link or enter the details yourself.",
      );
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = "",
      size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 2_000_000)
          throw new Error(
            "This Luma page is too large to import. Enter the details yourself.",
          );
        html += decoder.decode(chunk.value, { stream: true });
      }
      html += decoder.decode();
    } finally {
      await reader.cancel();
    }
    try {
      return parseLuma(html, value);
    } catch {
      throw new Error(
        "We couldn't read this Luma event. You can still enter the details yourself.",
      );
    }
  }
  throw new Error(
    "This Luma link redirects too many times. Try the direct event link.",
  );
}
