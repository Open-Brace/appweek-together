export type LinkedAboutSource = {
  url: string;
  sourceUrl: string;
  sourceName: string;
} & (
  | { status: "ready" | "stale"; text: string; fetchedAt: string }
  | { status: "unavailable"; text: null; fetchedAt: null }
);

export type LinkedAboutResult =
  | { status: "none"; sources: [] }
  | { status: "sources"; sources: LinkedAboutSource[] };
