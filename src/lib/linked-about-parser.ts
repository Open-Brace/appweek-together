import { load } from "cheerio";
import { z } from "zod";

type Provider = "luma" | "meetup" | "appgrowth";
const providers: Record<string, Provider> = {
  "luma.com": "luma",
  "www.luma.com": "luma",
  "lu.ma": "luma",
  "www.lu.ma": "luma",
  "meetup.com": "meetup",
  "www.meetup.com": "meetup",
  "appgrowthannual.com": "appgrowth",
  "www.appgrowthannual.com": "appgrowth",
};
const names: Record<Provider, string> = {
  luma: "Luma",
  meetup: "Meetup",
  appgrowth: "App Growth Annual",
};

export function normalizeAboutLink(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    if (providers[url.hostname] === "appgrowth")
      return "https://appgrowthannual.com/#about";
    return url.href;
  } catch {
    return null;
  }
}

export function aboutSourceName(value: string): string {
  const host = new URL(value).hostname;
  const provider = providers[host];
  return provider ? names[provider] : host.replace(/^www\./, "");
}

function approvedUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !providers[url.hostname]
  )
    throw new Error("Unsupported event source.");
  return url;
}

function cleanText(text: string): string {
  const cleaned = text
    .replace(/\r/g, "")
    .replace(/[\t \u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!cleaned || cleaned.length > 50_000)
    throw new Error("No complete event description was available.");
  return cleaned;
}

function mirrorText(root: unknown): string {
  let visited = 0;
  function read(value: unknown, depth: number): string {
    if (++visited > 20_000 || depth > 40)
      throw new Error("Description is too complex.");
    if (!value || typeof value !== "object") return "";
    const node = value as Record<string, unknown>;
    if (node.type === "text" && typeof node.text === "string") return node.text;
    if (node.type === "hard_break") return "\n";
    const children = Array.isArray(node.content) ? node.content : [];
    if (node.type === "bullet_list" || node.type === "ordered_list") {
      return (
        children
          .map(
            (child, index) =>
              `${node.type === "ordered_list" ? `${index + 1}.` : "•"} ${read(child, depth + 1).trim()}`,
          )
          .join("\n") + "\n\n"
      );
    }
    const text = children.map((child) => read(child, depth + 1)).join("");
    if (text.length > 50_000) throw new Error("Description is too long.");
    return (
      text +
      (["paragraph", "heading", "list_item"].includes(String(node.type))
        ? "\n\n"
        : "")
    );
  }
  return cleanText(read(root, 0));
}

const meetupData = z.object({
  props: z.object({
    pageProps: z.object({
      event: z.object({ description: z.string().min(1) }),
    }),
  }),
});
const lumaData = z.object({
  props: z.object({
    pageProps: z.object({
      initialData: z.object({
        kind: z.literal("event"),
        data: z.object({ description_mirror: z.unknown() }),
      }),
    }),
  }),
});

export function parseLinkedAbout(html: string, sourceUrl: string): string {
  const provider = providers[approvedUrl(sourceUrl).hostname];
  const $ = load(html);
  if (provider === "luma") {
    const data = lumaData.parse(JSON.parse($("script#__NEXT_DATA__").text()));
    return mirrorText(data.props.pageProps.initialData.data.description_mirror);
  }
  if (provider === "meetup") {
    const data = meetupData.parse(JSON.parse($("script#__NEXT_DATA__").text()));
    const text = data.props.pageProps.event.description;
    const plain = load(text.replace(/<br\s*\/?\s*>/gi, "\n"));
    plain("script,style,iframe").remove();
    return cleanText(
      plain
        .root()
        .text()
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
        .replace(/^(?:#{1,6}\s+|>\s?)/gm, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/__([^_]+)__/g, "$1")
        .replace(/(^|\s)\*([^*\n]+)\*(?=\s|$|[.,!?])/g, "$1$2")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/^\s*[-*+]\s+/gm, "• "),
    );
  }
  const about = $("#about").first().clone();
  if (!about.length) throw new Error("No About section found.");
  about.find("script,style,nav,footer,svg,img,button,a").remove();
  about.find("br").replaceWith("\n");
  about.find("h1,h2,h3,h4,p,div,address,article,span.block").each((_, node) => {
    $(node).append("\n\n");
  });
  return cleanText(about.text());
}

export async function fetchLinkedAbout(
  value: string,
  externalSignal?: AbortSignal,
) {
  let url = approvedUrl(value);
  const signal = externalSignal
    ? AbortSignal.any([AbortSignal.timeout(12_000), externalSignal])
    : AbortSignal.timeout(12_000);
  for (let redirects = 0; redirects < 4; redirects++) {
    const response = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal,
      headers: { Accept: "text/html", "User-Agent": "AppWeekTogether/1.0" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location) throw new Error("Missing redirect target.");
      url = approvedUrl(new URL(location, url).href);
      continue;
    }
    if (
      !response.ok ||
      !response.body ||
      !response.headers.get("content-type")?.includes("text/html")
    ) {
      await response.body?.cancel();
      throw new Error("The source could not share this event.");
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
        if (size > 2_000_000) throw new Error("The source page is too large.");
        html += decoder.decode(chunk.value, { stream: true });
      }
      html += decoder.decode();
    } finally {
      await reader.cancel();
    }
    const sourceUrl =
      providers[url.hostname] === "appgrowth"
        ? `${url.origin}/#about`
        : url.href;
    return {
      text: parseLinkedAbout(html, sourceUrl),
      sourceUrl,
      sourceName: aboutSourceName(sourceUrl),
    };
  }
  throw new Error("Too many source redirects.");
}
