export type EventDraft = {
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  url: string;
  imageUrl: string;
};

export function lumaUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !["luma.com", "www.luma.com", "lu.ma", "www.lu.ma"].includes(
        url.hostname,
      ) ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname === "/"
    )
      return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

export function secureImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      value.length <= 2048 &&
      url.protocol === "https:" &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export const MAX_COVER_BYTES = 250_000;
