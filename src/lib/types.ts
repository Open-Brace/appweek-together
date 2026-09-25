export type Event = {
  id: string;
  title: string;
  description: string;
  host: string;
  location: string;
  category: string;
  startsAt: string;
  endsAt: string;
  imageUrl: string | null;
  links: { label: string; url: string }[];
  sourceUrl: string | null;
  isListed: boolean;
  crewId: string | null;
  creatorId: string | null;
  updatedAt: string;
};
export type Member = { id: string; name: string; color: string };
export type Crew = {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
};
export type Plan = {
  user: { id: string; name: string; email: string } | null;
  events: Event[];
  crews: Crew[];
  crew: Crew | null;
  members: Member[];
  favorites: { userId: string; eventId: string }[];
};
export const COLORS = [
  "#4b63d1",
  "#a94b27",
  "#1e7564",
  "#8150a0",
  "#a83763",
  "#816018",
];
export const DAYS = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"];
export const TZ = "America/New_York";
export function dayOf(date: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}
export function timeOf(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}
export function dateOf(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}
export function minutesOf(date: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(date))
    .split(":");
  return Number(parts[0]) * 60 + Number(parts[1]);
}
