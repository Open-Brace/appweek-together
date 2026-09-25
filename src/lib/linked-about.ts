import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import { events, linkedEventAbout } from "./schema";
import {
  aboutSourceName,
  fetchLinkedAbout,
  normalizeAboutLink,
} from "./linked-about-parser";
import type {
  LinkedAboutResult,
  LinkedAboutSource,
} from "./linked-about-types";

type AboutRow = typeof linkedEventAbout.$inferSelect;
function sourceResult(row: AboutRow): LinkedAboutSource {
  const source = {
    url: row.url,
    sourceUrl: row.sourceUrl,
    sourceName: row.sourceName,
  };
  return row.text && row.fetchedAt
    ? {
        ...source,
        status: row.status === "ready" ? "ready" : "stale",
        text: row.text,
        fetchedAt: row.fetchedAt.toISOString(),
      }
    : { ...source, status: "unavailable", text: null, fetchedAt: null };
}

const pending = new Map<string, Promise<LinkedAboutSource>>();
async function readSource(
  url: string,
  force: boolean,
  signal?: AbortSignal,
): Promise<LinkedAboutSource> {
  const [cached] = await db
    .select()
    .from(linkedEventAbout)
    .where(eq(linkedEventAbout.url, url));
  const ttl = cached?.status === "ready" ? 86_400_000 : 3_600_000;
  if (!force && cached && Date.now() - cached.checkedAt.getTime() < ttl)
    return sourceResult(cached);
  const checkedAt = new Date();
  let result: Awaited<ReturnType<typeof fetchLinkedAbout>>;
  try {
    result = await fetchLinkedAbout(url, signal);
  } catch {
    const [row] = await db
      .insert(linkedEventAbout)
      .values({
        url,
        sourceUrl: url,
        sourceName: aboutSourceName(url),
        text: null,
        status: "unavailable",
        fetchedAt: null,
        checkedAt,
      })
      .onConflictDoUpdate({
        target: linkedEventAbout.url,
        set: {
          checkedAt,
          status: sql`case when ${linkedEventAbout.text} is not null then 'stale' else 'unavailable' end`,
        },
        setWhere: sql`${linkedEventAbout.checkedAt} <= ${checkedAt}`,
      })
      .returning();
    if (row) return sourceResult(row);
    const [newer] = await db
      .select()
      .from(linkedEventAbout)
      .where(eq(linkedEventAbout.url, url));
    return sourceResult(newer);
  }
  const fields = {
    ...result,
    status: "ready" as const,
    fetchedAt: new Date(),
    checkedAt,
  };
  const [row] = await db
    .insert(linkedEventAbout)
    .values({ url, ...fields })
    .onConflictDoUpdate({
      target: linkedEventAbout.url,
      set: fields,
      setWhere: sql`${linkedEventAbout.checkedAt} <= ${checkedAt}`,
    })
    .returning();
  if (row) return sourceResult(row);
  const [newer] = await db
    .select()
    .from(linkedEventAbout)
    .where(eq(linkedEventAbout.url, url));
  return sourceResult(newer);
}

function getSource(url: string, force = false, signal?: AbortSignal) {
  const existing = pending.get(url);
  if (existing) return existing;
  const promise = readSource(url, force, signal).finally(() =>
    pending.delete(url),
  );
  pending.set(url, promise);
  return promise;
}

export function aboutLinks(links: { url: string }[]) {
  return [
    ...new Set(
      links
        .map((link) => normalizeAboutLink(link.url))
        .filter((url): url is string => url !== null),
    ),
  ];
}

export async function getLinkedAbout(
  links: { url: string }[],
): Promise<LinkedAboutResult> {
  const urls = aboutLinks(links);
  if (!urls.length) return { status: "none", sources: [] };
  return {
    status: "sources",
    sources: await Promise.all(urls.map((url) => getSource(url))),
  };
}

export async function refreshPublicAbout({
  force = true,
  budgetMs = 75_000,
} = {}) {
  const catalog = await db
    .select({ links: events.links })
    .from(events)
    .where(and(isNull(events.crewId), eq(events.isListed, true)));
  const urls = aboutLinks(catalog.flatMap((event) => event.links));
  const signal = AbortSignal.timeout(budgetMs);
  const results: {
    url: string;
    status: LinkedAboutSource["status"] | "error";
  }[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, urls.length) }, async () => {
      while (cursor < urls.length && !signal.aborted) {
        const url = urls[cursor++];
        try {
          const source = await getSource(url, force, signal);
          results.push({ url, status: source.status });
        } catch {
          results.push({ url, status: "error" });
        }
      }
    }),
  );
  return {
    total: urls.length,
    checked: results.length,
    skipped: urls.length - results.length,
    ready: results.filter((result) => result.status === "ready").length,
    stale: results.filter((result) => result.status === "stale").length,
    unavailable: results.filter((result) => result.status === "unavailable")
      .length,
    errors: results.filter((result) => result.status === "error").length,
    results,
  };
}
