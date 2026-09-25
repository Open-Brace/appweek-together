import { load } from "cheerio";
import { createHash } from "node:crypto";
import { fromZonedTime } from "date-fns-tz";
import { db } from "./db";
import { events } from "./schema";
import { isNull, and, notInArray } from "drizzle-orm";
export async function syncSource() {
  const response = await fetch("https://www.appweek.events/", {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Schedule source unavailable");
  const $ = load(await response.text());
  const previous = await db.select().from(events).where(isNull(events.crewId));
  const records: (typeof events.$inferInsert)[] = [];
  $(".schedule-day").each((_, section) => {
    const day = $(section).find(".schedule-day-heading strong").text().trim();
    $(section)
      .find(".schedule-event-card")
      .each((_, card) => {
        const e = $(card),
          title = e.find("h3").text().trim();
        const time = e
          .find(".schedule-event-time strong")
          .text()
          .trim()
          .split(/[–—]/);
        function instant(text: string) {
          const m = text.match(/(\d+):(\d+)\s*(AM|PM)/);
          if (!m) throw new Error("Unknown event time");
          const hour = (Number(m[1]) % 12) + (m[3] === "PM" ? 12 : 0);
          return fromZonedTime(
            `2026-10-${day}T${String(hour).padStart(2, "0")}:${m[2]}:00`,
            "America/New_York",
          );
        }
        if (
          !title ||
          time.length !== 2 ||
          !["19", "20", "21", "22"].includes(day)
        )
          throw new Error("Unexpected source format");
        const links = e
          .find(".schedule-event-actions a")
          .map((_, a) => ({
            label: $(a).text().replace("→", "").trim(),
            url: new URL($(a).attr("href")!, "https://www.appweek.events").href,
          }))
          .get();
        const host = e.find("dd").eq(0).text().trim();
        const category = e.find(".schedule-event-format").text().trim();
        const stableKey = links[0]?.url ?? `${host}:${category}`;
        const existing =
          previous.find(
            (old) =>
              links[0]?.url &&
              old.links.some((link) => link.url === links[0].url),
          ) ??
          previous.find((old) => old.title === title) ??
          previous.find(
            (old) =>
              !links.length &&
              !old.links.length &&
              old.host === host &&
              old.category === category,
          );
        records.push({
          id:
            existing?.id ??
            "official-" +
              createHash("sha256").update(stableKey).digest("hex").slice(0, 20),
          isListed: true,
          title,
          description: e.find(".schedule-event-body > p").text().trim(),
          host: e.find("dd").eq(0).text().trim(),
          location: e.find("dd").eq(1).text().trim(),
          category: e.find(".schedule-event-format").text().trim(),
          startsAt: instant(time[0]),
          endsAt: instant(time[1]),
          imageUrl: e.find("img").attr("src")
            ? new URL(e.find("img").attr("src")!, "https://www.appweek.events")
                .href
            : null,
          links,
          sourceUrl: "https://www.appweek.events/#schedule",
          updatedAt: new Date(),
        });
      });
  });
  if (
    records.length < 10 ||
    !records.some((e) => e.title === "App Growth Annual") ||
    !records.some((e) => e.title === "The Shippies Award Show")
  )
    throw new Error("Source completeness check failed");
  const operations = records.map((event) =>
    db
      .insert(events)
      .values(event)
      .onConflictDoUpdate({ target: events.id, set: event }),
  );
  if (new Set(records.map((e) => e.id)).size !== records.length)
    throw new Error("Duplicate source event identity");
  await db.batch([
    db
      .update(events)
      .set({ isListed: false })
      .where(
        and(
          isNull(events.crewId),
          notInArray(
            events.id,
            records.map((e) => e.id),
          ),
        ),
      ),
    ...operations,
  ]);
  return {
    count: records.length,
    revenueCat: records.filter((e) => /revenuecat/i.test(e.host)).length,
  };
}
