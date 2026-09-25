"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  ExternalLink,
  Heart,
  LoaderCircle,
  LogOut,
  MapPin,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import {
  COLORS,
  DAYS,
  dayOf,
  dateOf,
  minutesOf,
  timeOf,
  type Event,
  type Plan,
} from "@/lib/types";
import { Modal } from "./modal";
import { LinkedEventAbout } from "./linked-event-about";
import { EventForm } from "./event-form";
const empty: Plan = {
  user: null,
  events: [],
  crews: [],
  crew: null,
  members: [],
  favorites: [],
};
async function request(path: string, body?: unknown, method = "POST") {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "Could not save. Please try again.");
  return result;
}
function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}
function Avatar({
  name,
  color,
  small = false,
}: {
  name: string;
  color: string;
  small?: boolean;
}) {
  return (
    <span
      className={`avatar ${small ? "small" : ""}`}
      style={{ background: color }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
function isRevenueCat(event: Event) {
  return /revenuecat/i.test(event.host);
}
function eventLabel(event: Event) {
  return `${timeOf(event.startsAt)} – ${timeOf(event.endsAt)}`;
}
export default function Planner() {
  const [plan, setPlan] = useState<Plan>(empty),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [tab, setTab] = useState<"browse" | "week">("browse");
  const [day, setDay] = useState("all"),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [calendarMode, setCalendarMode] = useState<"grid" | "agenda">("grid");
  const [authOpen, setAuthOpen] = useState(false),
    [crewOpen, setCrewOpen] = useState(false),
    [eventOpen, setEventOpen] = useState<Event | null>(null),
    [editEvent, setEditEvent] = useState<Event | null | undefined>(undefined),
    [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState(""),
    [pending, setPending] = useState<string[]>([]),
    [invite, setInvite] = useState(""),
    [joining, setJoining] = useState(false),
    [synced, setSynced] = useState(true),
    [hidden, setHidden] = useState<string[]>([]);
  const activeCrew = useRef<string | null>(null),
    joinLock = useRef(false);
  const headerRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const dayTabsRef = useRef<HTMLDivElement>(null);
  const daySections = useRef(new Map<string, HTMLElement>());
  const [activeBrowseDay, setActiveBrowseDay] = useState<string | null>(null);
  const notify = useCallback((message: string) => {
    setToast(message);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(
        "/api/plan" + (activeCrew.current ? `?crew=${activeCrew.current}` : ""),
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Could not load your week.");
      const next: Plan = await response.json();
      setPlan(next);
      activeCrew.current = next.crew?.id ?? null;
      setSynced(true);
      setLoadError("");
      return next;
    } catch (e) {
      setSynced(false);
      setLoadError(e instanceof Error ? e.message : "Could not connect.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    setInvite(new URLSearchParams(location.search).get("invite") ?? "");
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 15000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);
  useEffect(() => {
    const header = headerRef.current;
    const shell = header?.parentElement;
    if (!header || !shell) return;
    const updateHeight = () => {
      shell.style.setProperty(
        "--topbar-height",
        `${header.getBoundingClientRect().height}px`,
      );
      shell.style.setProperty(
        "--planner-nav-height",
        `${window.matchMedia("(max-width: 640px)").matches ? (sidebarRef.current?.getBoundingClientRect().height ?? 0) : 0}px`,
      );
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(header);
    if (sidebarRef.current) observer.observe(sidebarRef.current);
    window.addEventListener("resize", updateHeight);
    return () => {
      observer.disconnect();
      shell.style.removeProperty("--topbar-height");
      shell.style.removeProperty("--planner-nav-height");
      window.removeEventListener("resize", updateHeight);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  const join = useCallback(async () => {
    if (!invite || joinLock.current) return;
    joinLock.current = true;
    setJoining(true);
    try {
      const result = await request("/api/plan", {
        action: "join",
        code: invite,
      });
      activeCrew.current = result.crewId;
      setInvite("");
      history.replaceState(null, "", location.pathname);
      await refresh();
      notify("You’re in. Your week is now shared.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setJoining(false);
      joinLock.current = false;
    }
  }, [invite, refresh, notify]);
  async function afterAuth() {
    setAuthOpen(false);
    const current = await refresh();
    if (invite) {
      await join();
      return;
    }
    if (current?.user && current.crews.length === 0) {
      try {
        const result = await request("/api/plan", {
          action: "create",
          name: `${current.user.name.split(" ")[0]}’s week`,
        });
        activeCrew.current = result.crewId;
        await refresh();
        setCrewOpen(true);
      } catch (e) {
        notify((e as Error).message);
      }
    }
  }
  async function mutate(body: unknown) {
    const result = await request("/api/plan", body);
    await refresh();
    return result;
  }
  function requireAccount(action: () => void) {
    if (!plan.user) setAuthOpen(true);
    else action();
  }
  async function favorite(event: Event) {
    if (!plan.user) {
      setAuthOpen(true);
      return;
    }
    if (pending.includes(event.id)) return;
    const userId = plan.user.id,
      saved = plan.favorites.some(
        (f) => f.userId === userId && f.eventId === event.id,
      );
    setPending((p) => [...p, event.id]);
    setPlan((p) => ({
      ...p,
      favorites: saved
        ? p.favorites.filter(
            (f) => !(f.userId === userId && f.eventId === event.id),
          )
        : [...p.favorites, { userId, eventId: event.id }],
    }));
    try {
      await request("/api/plan", {
        action: "favorite",
        eventId: event.id,
        saved: !saved,
      });
      await refresh();
    } catch (e) {
      await refresh();
      notify((e as Error).message);
    } finally {
      setPending((p) => p.filter((id) => id !== event.id));
    }
  }
  const mine = (e: Event) =>
    plan.favorites.some(
      (f) => f.eventId === e.id && f.userId === plan.user?.id,
    );
  const attendees = (e: Event) =>
    plan.members.filter((m) =>
      plan.favorites.some((f) => f.eventId === e.id && f.userId === m.id),
    );
  const myEvents = plan.events.filter(mine);
  const visible = plan.events.filter(
    (e) =>
      (!query ||
        `${e.title} ${e.description} ${e.host} ${e.location} ${e.category}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (filter === "all" ||
        (filter === "mine" && mine(e)) ||
        (filter === "crew" && attendees(e).length > 0) ||
        (filter === "revenuecat" && isRevenueCat(e)) ||
        (filter === "custom" && e.creatorId)),
  );
  const browseDays = DAYS.map((date) => ({
    date,
    events: visible.filter((event) => dayOf(event.startsAt) === date),
  })).filter((group) => group.events.length > 0);
  const browseSectionKey = browseDays
    .map(
      (group) =>
        `${group.date}:${group.events.map((event) => event.id).join(",")}`,
    )
    .join(";");
  const browseOffset = useCallback(() => {
    const tabs = dayTabsRef.current;
    if (!tabs) return 0;
    return (
      parseFloat(getComputedStyle(tabs).top) +
      tabs.getBoundingClientRect().height +
      12
    );
  }, []);
  const jumpToBrowseDay = useCallback(
    (date: string) => {
      const section = daySections.current.get(date);
      if (!section) return;
      window.scrollTo({
        top: Math.max(
          0,
          window.scrollY + section.getBoundingClientRect().top - browseOffset(),
        ),
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    },
    [browseOffset],
  );
  useEffect(() => {
    if (tab !== "browse" || loading) return;
    let frame = 0;
    const updateDay = () => {
      frame = 0;
      const sections = DAYS.flatMap((date) => {
        const element = daySections.current.get(date);
        return element ? [{ date, element }] : [];
      });
      const offset = browseOffset();
      let active: string | null = sections[0]?.date ?? null;
      for (const section of sections) {
        if (section.element.getBoundingClientRect().top <= offset + 1)
          active = section.date;
      }
      const pageHeight = document.documentElement.scrollHeight;
      if (
        window.scrollY > 1 &&
        pageHeight > window.innerHeight + 1 &&
        window.scrollY + window.innerHeight >= pageHeight - 2
      ) {
        active = sections.at(-1)?.date ?? null;
      }
      setActiveBrowseDay(active);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(updateDay);
    };
    const observer = new ResizeObserver(schedule);
    for (const element of [
      headerRef.current,
      sidebarRef.current,
      mainRef.current,
      dayTabsRef.current,
      ...daySections.current.values(),
    ]) {
      if (element) observer.observe(element);
    }
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("pageshow", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pageshow", schedule);
    };
  }, [tab, loading, browseSectionKey, browseOffset]);
  const calendarEvents = plan.events.filter((e) =>
    plan.favorites.some(
      (f) =>
        f.eventId === e.id &&
        !hidden.includes(f.userId) &&
        (plan.members.some((m) => m.id === f.userId) ||
          f.userId === plan.user?.id),
    ),
  );
  const conflicts = myEvents.filter((e) =>
    myEvents.some(
      (other) =>
        other.id !== e.id &&
        new Date(other.startsAt) < new Date(e.endsAt) &&
        new Date(other.endsAt) > new Date(e.startsAt),
    ),
  );
  const me = plan.members.find((m) => m.id === plan.user?.id);
  function downloadCalendar() {
    const escape = (s: string) =>
      s
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
    const stamp = (s: string) =>
      new Date(s).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const content = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//App Week Together//EN",
      "CALSCALE:GREGORIAN",
      ...myEvents.flatMap((e) => [
        "BEGIN:VEVENT",
        `UID:${e.id}@appweek-together`,
        `DTSTAMP:${stamp(new Date().toISOString())}`,
        `DTSTART:${stamp(e.startsAt)}`,
        `DTEND:${stamp(e.endsAt)}`,
        `SUMMARY:${escape(e.title)}`,
        `LOCATION:${escape(e.location)}`,
        `DESCRIPTION:${escape(e.description + "\n" + (e.links[0]?.url ?? e.sourceUrl ?? ""))}`,
        "END:VEVENT",
      ]),
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/calendar;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-app-week.ics";
    a.click();
    URL.revokeObjectURL(url);
    notify("Your saved events are ready to import into your calendar.");
  }
  return (
    <div className="app-shell">
      <header className="topbar" ref={headerRef}>
        <a className="brand" href="/" aria-label="App Week Together home">
          <span className="brand-mark">
            <CalendarDays size={21} />
          </span>
          <span>
            app week<span className="brand-sub">together</span>
          </span>
        </a>
        <div className="top-location">
          <span className="status-dot" /> New York City{" "}
          <span className="muted">/</span> October 19–22, 2026
        </div>
        <div className="top-actions">
          {plan.user ? (
            <>
              <button
                className="button subtle crew-button"
                onClick={() => setCrewOpen(true)}
              >
                <Users size={17} />
                <span>{plan.crew?.name ?? "Your friends"}</span>
                <ChevronDown size={14} />
              </button>
              <button
                className="profile-button"
                onClick={() => setSettingsOpen(true)}
                aria-label="Account settings"
              >
                <Avatar name={plan.user.name} color={me?.color ?? COLORS[0]} />
              </button>
            </>
          ) : (
            <button className="button dark" onClick={() => setAuthOpen(true)}>
              Start planning <ArrowRight size={16} />
            </button>
          )}
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar" ref={sidebarRef}>
          <div className="sidebar-heading">YOUR NEW YORK WEEK</div>
          <nav className="view-nav" aria-label="Planner views">
            <button
              className={tab === "browse" ? "active" : ""}
              onClick={() => setTab("browse")}
            >
              <Sparkles size={18} />
              Explore events<span>{plan.events.length || "23"}</span>
            </button>
            <button
              className={tab === "week" ? "active" : ""}
              onClick={() => setTab("week")}
            >
              <CalendarDays size={18} />
              Our calendar<span>{calendarEvents.length}</span>
            </button>
          </nav>
          <div className="sidebar-divider" />
          <div className="sidebar-heading">
            OCTOBER 2026 <span>ET</span>
          </div>
          <div className="mini-week">
            {DAYS.map((d, i) => (
              <button
                key={d}
                className={
                  (tab === "browse" ? activeBrowseDay : day) === d
                    ? "selected"
                    : ""
                }
                aria-current={
                  tab === "browse" && activeBrowseDay === d ? "date" : undefined
                }
                disabled={
                  tab === "browse" &&
                  !browseDays.some((group) => group.date === d)
                }
                onClick={() => {
                  if (tab === "browse") jumpToBrowseDay(d);
                  else setDay(day === d ? "all" : d);
                }}
              >
                <span>{["M", "T", "W", "T"][i]}</span>
                <strong>{19 + i}</strong>
                <i
                  className={
                    plan.events.some((e) => dayOf(e.startsAt) === d && mine(e))
                      ? "has-events"
                      : ""
                  }
                />
              </button>
            ))}
          </div>
          {tab === "week" && (
            <button
              className="text-button all-days"
              onClick={() => setDay("all")}
            >
              Show the whole week <ArrowRight size={13} />
            </button>
          )}
          <div className="sidebar-divider" />
          <div className="sidebar-heading">
            PLANNING TOGETHER
            <button
              aria-label="Manage friends"
              onClick={() => requireAccount(() => setCrewOpen(true))}
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="roster">
            {plan.members.length ? (
              plan.members.map((m) => (
                <button
                  className="roster-person"
                  key={m.id}
                  onClick={() =>
                    setHidden((h) =>
                      h.includes(m.id)
                        ? h.filter((id) => id !== m.id)
                        : [...h, m.id],
                    )
                  }
                  aria-pressed={!hidden.includes(m.id)}
                >
                  <Avatar name={m.name} color={m.color} small />
                  <span>
                    {m.id === plan.user?.id
                      ? `${m.name.split(" ")[0]} (you)`
                      : m.name}
                  </span>
                  <span
                    className="person-check"
                    style={{
                      borderColor: m.color,
                      background: hidden.includes(m.id)
                        ? "transparent"
                        : m.color,
                    }}
                  >
                    {!hidden.includes(m.id) && <Check size={11} />}
                  </span>
                </button>
              ))
            ) : (
              <p className="sidebar-note">
                Good plans are better with friends.
              </p>
            )}
            <button
              className="invite-button"
              onClick={() => requireAccount(() => setCrewOpen(true))}
            >
              <Plus size={15} />
              Invite a friend
            </button>
          </div>
          <div className="sidebar-bottom">
            <span className={`status-dot ${synced ? "" : "offline"}`} />
            {plan.user
              ? synced
                ? "Saved & syncing"
                : "Connection interrupted"
              : "Made for making plans"}
            <a
              href="https://www.appweek.events/#schedule"
              target="_blank"
              rel="noreferrer"
            >
              Official App Week schedule <ExternalLink size={12} />
            </a>
          </div>
        </aside>
        <main ref={mainRef}>
          {invite && (
            <div className="invite-banner">
              <Users size={21} />
              <div>
                <strong>A friend invited you to plan together.</strong>
                <span>Join their week to see each other’s picks.</span>
              </div>
              <button
                className="button dark"
                disabled={joining}
                onClick={() => (plan.user ? join() : setAuthOpen(true))}
              >
                {joining ? "Joining…" : "Join the week"}
                <ArrowRight size={16} />
              </button>
              <button
                className="icon-button"
                aria-label="Dismiss invitation"
                onClick={() => {
                  setInvite("");
                  history.replaceState(null, "", location.pathname);
                }}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <h1 className="sr-only">New York App Week planner</h1>
          {loading ? (
            <div className="loading-state">
              <LoaderCircle className="spin" size={25} />
              <p>Getting the week ready…</p>
            </div>
          ) : loadError && plan.events.length === 0 ? (
            <div className="empty-state">
              <h2>Let’s try that again.</h2>
              <p>{loadError}</p>
              <button
                className="button dark"
                onClick={() => {
                  setLoading(true);
                  refresh();
                }}
              >
                Reload schedule
              </button>
            </div>
          ) : (
            <>
              {tab === "browse" ? (
                <>
                  <div className="browse-toolbar">
                    <div className="browse-search-actions">
                      <div className="search-field">
                        <Search size={17} />
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Search events, hosts, places…"
                          aria-label="Search events"
                          autoCorrect="off"
                        />
                        {query && (
                          <button
                            aria-label="Clear search"
                            onClick={() => setQuery("")}
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                      <button
                        className="button outlined"
                        onClick={() =>
                          requireAccount(() =>
                            plan.crew ? setEditEvent(null) : setCrewOpen(true),
                          )
                        }
                      >
                        <Plus size={17} />
                        Add event
                      </button>
                    </div>
                    <div className="filter-pills" aria-label="Filter events">
                      {[
                        ["all", "All events"],
                        ["mine", "My picks"],
                        ["crew", "Our picks"],
                        ["revenuecat", "RevenueCat"],
                        ["custom", "Custom"],
                      ].map(([key, label]) => (
                        <button
                          key={key}
                          className={filter === key ? "active" : ""}
                          onClick={() => setFilter(key)}
                        >
                          {key === "mine" && <Star size={13} />} {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div
                    className="day-tabs"
                    ref={dayTabsRef}
                    role="navigation"
                    aria-label="Jump to day"
                  >
                    {DAYS.map((d, i) => (
                      <button
                        className={activeBrowseDay === d ? "active" : ""}
                        aria-current={
                          activeBrowseDay === d ? "date" : undefined
                        }
                        disabled={!browseDays.some((group) => group.date === d)}
                        key={d}
                        onClick={() => jumpToBrowseDay(d)}
                      >
                        {["Mon", "Tue", "Wed", "Thu"][i]}{" "}
                        <strong>{19 + i}</strong>
                      </button>
                    ))}
                    <span>{visible.length} events</span>
                  </div>
                  {visible.length === 0 ? (
                    <div className="empty-state">
                      <Star size={28} />
                      <h2>
                        {filter === "mine"
                          ? "Your week is a blank canvas."
                          : "No events here yet."}
                      </h2>
                      <p>
                        {filter === "mine"
                          ? "Tap the star on any event to add it to your calendar."
                          : "Try another filter, or add an event of your own."}
                      </p>
                      <button
                        className="button outlined"
                        onClick={() => {
                          setFilter("all");
                          setQuery("");
                        }}
                      >
                        Explore all events
                      </button>
                    </div>
                  ) : (
                    browseDays.map(({ date: d, events }, i) => (
                      <section
                        className="day-section"
                        key={d}
                        id={`browse-${d}`}
                        ref={(element) => {
                          if (element) daySections.current.set(d, element);
                          else daySections.current.delete(d);
                        }}
                      >
                        <div className="day-section-heading">
                          <h2>{dateOf(d + "T12:00:00-04:00")}</h2>
                          <span>{events.length} events</span>
                          <div />
                        </div>
                        <div className="event-list">
                          {events.map((e) => (
                            <article
                              className={`event-card ${mine(e) ? "is-saved" : ""}`}
                              key={e.id}
                            >
                              <button
                                className="event-image-button"
                                onClick={() => setEventOpen(e)}
                                aria-label={`View ${e.title}`}
                              >
                                {e.imageUrl ? (
                                  <img
                                    src={e.imageUrl}
                                    alt=""
                                    loading={i === 0 ? "eager" : "lazy"}
                                    onError={(ev) => {
                                      ev.currentTarget.style.display = "none";
                                    }}
                                  />
                                ) : (
                                  <span className="custom-art">
                                    <CalendarDays size={30} />
                                    <span>YOUR PLANS</span>
                                  </span>
                                )}
                              </button>
                              <div className="event-card-content">
                                <div className="event-kicker">
                                  <span>{e.category}</span>
                                  {isRevenueCat(e) && (
                                    <span className="rc-tag">RevenueCat</span>
                                  )}
                                  {!e.isListed && (
                                    <span className="removed-tag">
                                      No longer listed
                                    </span>
                                  )}
                                  {e.creatorId && (
                                    <span className="custom-tag">Custom</span>
                                  )}
                                </div>
                                <button
                                  className="event-title"
                                  onClick={() => setEventOpen(e)}
                                >
                                  <h3>{e.title}</h3>
                                </button>
                                <div className="event-meta">
                                  <span>
                                    <Clock3 size={14} />
                                    {eventLabel(e)}
                                  </span>
                                  <span>
                                    <MapPin size={14} />
                                    {e.location}
                                  </span>
                                </div>
                                <p className="event-description">
                                  {e.description}
                                </p>
                                <div className="event-card-bottom">
                                  <span className="event-host">
                                    By {e.host}
                                  </span>
                                  {attendees(e).length > 0 && (
                                    <div className="saved-by">
                                      {attendees(e).map((m) => (
                                        <Avatar
                                          key={m.id}
                                          name={m.name}
                                          color={m.color}
                                          small
                                        />
                                      ))}
                                      <span>
                                        {attendees(e).length > 1
                                          ? "Saved together"
                                          : "On the calendar"}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <button
                                className={`save-button ${mine(e) ? "saved" : ""}`}
                                disabled={pending.includes(e.id)}
                                onClick={() => favorite(e)}
                                aria-label={`${mine(e) ? "Unsave" : "Save"} ${e.title}`}
                                aria-pressed={mine(e)}
                              >
                                <Star
                                  size={20}
                                  fill={mine(e) ? "currentColor" : "none"}
                                />
                              </button>
                            </article>
                          ))}
                        </div>
                      </section>
                    ))
                  )}
                  <p className="source-note">
                    Event information from{" "}
                    <a
                      href="https://www.appweek.events/#schedule"
                      target="_blank"
                      rel="noreferrer"
                    >
                      New York App Week <ExternalLink size={11} />
                    </a>
                    . Saving is for planning. RSVP with the host to reserve your
                    place. Updated{" "}
                    {new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "numeric",
                      timeZone: "America/New_York",
                    }).format(
                      new Date(
                        Math.max(
                          ...plan.events
                            .filter((e) => !e.creatorId)
                            .map((e) => +new Date(e.updatedAt)),
                        ),
                      ),
                    )}
                    . Refreshes daily.
                  </p>
                </>
              ) : (
                <>
                  <div className="calendar-toolbar">
                    <div className="calendar-heading">
                      <h2>October 19–22</h2>
                      <p className="calendar-meta">
                        <span>2026 · New York time</span>
                        <span>{calendarEvents.length} saved events</span>
                      </p>
                    </div>
                    <button
                      className="button outlined"
                      aria-label="Add event"
                      onClick={() =>
                        requireAccount(() =>
                          plan.crew ? setEditEvent(null) : setCrewOpen(true),
                        )
                      }
                    >
                      <Plus size={17} />
                      <span>Add event</span>
                    </button>
                  </div>
                  <div className="calendar-actions">
                    <div
                      className="segmented"
                      role="group"
                      aria-label="Calendar view"
                    >
                      <button
                        aria-label="Week grid"
                        aria-pressed={calendarMode === "grid"}
                        className={calendarMode === "grid" ? "active" : ""}
                        onClick={() => setCalendarMode("grid")}
                      >
                        <span>Calendar</span>
                      </button>
                      <button
                        aria-label="Agenda list"
                        aria-pressed={calendarMode === "agenda"}
                        className={calendarMode === "agenda" ? "active" : ""}
                        onClick={() => setCalendarMode("agenda")}
                      >
                        <span>List</span>
                      </button>
                    </div>
                    <button
                      className="button outlined"
                      aria-label="Export my picks"
                      onClick={downloadCalendar}
                      disabled={!myEvents.length}
                    >
                      <ArrowDownToLine size={16} />
                      <span>Export</span>
                    </button>
                  </div>
                  <div className="calendar-legend">
                    {plan.members.map((m) => (
                      <button
                        key={m.id}
                        onClick={() =>
                          setHidden((h) =>
                            h.includes(m.id)
                              ? h.filter((id) => id !== m.id)
                              : [...h, m.id],
                          )
                        }
                        className={hidden.includes(m.id) ? "dimmed" : ""}
                      >
                        <i style={{ background: m.color }} />
                        {m.id === plan.user?.id
                          ? `${m.name.split(" ")[0]} (you)`
                          : m.name.split(" ")[0]}
                      </button>
                    ))}
                  </div>
                  {conflicts.length > 0 && (
                    <div className="conflict-note">
                      <Clock3 size={15} />
                      {conflicts.length} of your picks overlap. Open an event to
                      compare times.
                    </div>
                  )}
                  {!calendarEvents.length ? (
                    <div className="empty-state calendar-empty">
                      <CalendarDays size={32} />
                      <h2>A little planning. A lot to look forward to.</h2>
                      <p>
                        Save events to start your calendar. Invite a friend to
                        see their picks here, too.
                      </p>
                      <button
                        className="button dark"
                        onClick={() => {
                          setTab("browse");
                          setFilter("all");
                        }}
                      >
                        Find your first event <ArrowRight size={16} />
                      </button>
                    </div>
                  ) : calendarMode === "grid" ? (
                    <WeekGrid
                      events={calendarEvents}
                      plan={plan}
                      hidden={hidden}
                      onOpen={setEventOpen}
                      day={day}
                      setDay={setDay}
                    />
                  ) : (
                    <div className="agenda">
                      {DAYS.map((d) => (
                        <section key={d}>
                          <h3>{dateOf(d + "T12:00:00-04:00")}</h3>
                          {calendarEvents
                            .filter((e) => dayOf(e.startsAt) === d)
                            .map((e) => (
                              <button
                                className="agenda-event"
                                key={e.id}
                                onClick={() => setEventOpen(e)}
                              >
                                <span>
                                  {timeOf(e.startsAt)}
                                  <small>{timeOf(e.endsAt)}</small>
                                </span>
                                <div>
                                  <strong>{e.title}</strong>
                                  <p>{e.location}</p>
                                  <div className="agenda-names">
                                    {attendees(e)
                                      .filter((m) => !hidden.includes(m.id))
                                      .map((m) => (
                                        <span
                                          style={{ color: m.color }}
                                          key={m.id}
                                        >
                                          <i style={{ background: m.color }} />
                                          {m.name.split(" ")[0]}
                                        </span>
                                      ))}
                                  </div>
                                </div>
                                <ArrowRight size={16} />
                              </button>
                            ))}
                          {!calendarEvents.some(
                            (e) => dayOf(e.startsAt) === d,
                          ) && (
                            <p className="free-day">
                              Nothing planned. Keep a little room for
                              serendipity.
                            </p>
                          )}
                        </section>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
          <footer>
            <span>Built for a week worth remembering.</span>
            <span>
              New York, NY <span className="tiny-sun">✳</span>
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button aria-label="Dismiss message" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {authOpen && (
        <AuthDialog onClose={() => setAuthOpen(false)} onSuccess={afterAuth} />
      )}
      {crewOpen && plan.user && (
        <CrewDialog
          plan={plan}
          mutate={mutate}
          onClose={() => setCrewOpen(false)}
          notify={notify}
          onSwitch={async (id) => {
            activeCrew.current = id;
            setHidden([]);
            await refresh();
          }}
        />
      )}
      {settingsOpen && plan.user && (
        <SettingsDialog
          plan={plan}
          mutate={mutate}
          onClose={() => setSettingsOpen(false)}
          notify={notify}
          onLogout={async () => {
            await authClient.signOut();
            activeCrew.current = null;
            setSettingsOpen(false);
            setPlan(empty);
            await refresh();
            setHidden([]);
          }}
        />
      )}
      {editEvent !== undefined && plan.crew && (
        <EventForm
          event={editEvent}
          crewId={plan.crew.id}
          onClose={() => setEditEvent(undefined)}
          onSaved={async () => {
            setEditEvent(undefined);
            await refresh();
            notify(
              editEvent
                ? "Event updated."
                : "Added to your week. Your friends can save it too.",
            );
          }}
        />
      )}
      {eventOpen && (
        <EventDetail
          event={plan.events.find((e) => e.id === eventOpen.id) ?? eventOpen}
          plan={plan}
          isSaved={mine(eventOpen)}
          onFavorite={() => favorite(eventOpen)}
          onClose={() => setEventOpen(null)}
          onEdit={() => {
            setEditEvent(eventOpen);
            setEventOpen(null);
          }}
          onDelete={async () => {
            try {
              await request(
                `/api/events?id=${eventOpen.id}`,
                undefined,
                "DELETE",
              );
              setEventOpen(null);
              await refresh();
              notify("Event deleted.");
            } catch (e) {
              notify((e as Error).message);
            }
          }}
        />
      )}
    </div>
  );
}
function WeekGrid({
  events,
  plan,
  hidden,
  onOpen,
  day,
  setDay,
}: {
  events: Event[];
  plan: Plan;
  hidden: string[];
  onOpen: (e: Event) => void;
  day: string;
  setDay: (d: string) => void;
}) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const mobileDay = day === "all" ? dayOf(events[0].startsAt) : day;
  function segments(date: string) {
    const start = +new Date(`${date}T00:00:00-04:00`),
      end = start + 86400000;
    return events
      .filter((e) => +new Date(e.startsAt) < end && +new Date(e.endsAt) > start)
      .map((e) => ({
        ...e,
        startsAt: new Date(
          Math.max(start, +new Date(e.startsAt)),
        ).toISOString(),
        endsAt: new Date(Math.min(end, +new Date(e.endsAt))).toISOString(),
      }));
  }
  const rangeEvents = mobile ? segments(mobileDay) : DAYS.flatMap(segments);
  const first = rangeEvents.length
    ? Math.max(
        0,
        Math.floor(
          Math.min(...rangeEvents.map((e) => minutesOf(e.startsAt))) / 60,
        ) - 1,
      )
    : 8;
  const last = Math.max(
    23,
    Math.ceil(
      Math.max(
        ...events.map((e) =>
          dayOf(e.endsAt) !== dayOf(e.startsAt) ? 1440 : minutesOf(e.endsAt),
        ),
      ) / 60,
    ),
  );
  const height = (last - first) * 72;
  function placements(items: Event[]) {
    const sorted = [...items].sort(
      (a, b) =>
        +new Date(a.startsAt) - +new Date(b.startsAt) ||
        +new Date(b.endsAt) - +new Date(a.endsAt),
    );
    const result: { event: Event; col: number; columns: number }[] = [];
    let group: typeof result = [];
    let end = 0;
    function flush() {
      const count = Math.max(...group.map((p) => p.col)) + 1;
      group.forEach((p) => {
        p.columns = count;
        result.push(p);
      });
      group = [];
    }
    for (const event of sorted) {
      const start = +new Date(event.startsAt);
      if (group.length && start >= end) flush();
      const used = group
        .filter((p) => +new Date(p.event.endsAt) > start)
        .map((p) => p.col);
      let col = 0;
      while (used.includes(col)) col++;
      group.push({ event, col, columns: 1 });
      end = Math.max(group.length === 1 ? 0 : end, +new Date(event.endsAt));
    }
    if (group.length) flush();
    return result;
  }
  return (
    <>
      <div className="mobile-calendar-days">
        {DAYS.map((d, i) => (
          <button
            key={d}
            className={mobileDay === d ? "active" : ""}
            onClick={() => setDay(d)}
          >
            {["Mon", "Tue", "Wed", "Thu"][i]} {19 + i}
          </button>
        ))}
      </div>
      <div className="week-grid">
        <div className="grid-head">
          <span>ET</span>
          {DAYS.map((d, i) => (
            <div
              className={`grid-day-label ${mobileDay === d ? "mobile-selected" : ""}`}
              key={d}
            >
              <span>{["MON", "TUE", "WED", "THU"][i]}</span>
              <strong>{19 + i}</strong>
            </div>
          ))}
        </div>
        <div className="grid-body" style={{ height }}>
          <div className="time-gutter">
            {Array.from({ length: last - first }, (_, i) => (
              <span style={{ top: i * 72 }} key={i}>
                {(first + i) % 12 || 12}
                <small>{first + i >= 12 ? "PM" : "AM"}</small>
              </span>
            ))}
          </div>
          {DAYS.map((d) => (
            <div
              key={d}
              className={`grid-day ${mobileDay === d ? "mobile-selected" : ""}`}
              style={{ height }}
            >
              {Array.from({ length: last - first }, (_, i) => (
                <div className="hour-line" style={{ top: i * 72 }} key={i} />
              ))}
              {placements(segments(d)).map(({ event: e, col, columns }) => {
                const people = plan.members.filter(
                  (m) =>
                    !hidden.includes(m.id) &&
                    plan.favorites.some(
                      (f) => f.userId === m.id && f.eventId === e.id,
                    ),
                );
                const color = people[0]?.color ?? COLORS[0];
                const duration =
                  (+new Date(e.endsAt) - +new Date(e.startsAt)) / 60000;
                return (
                  <button
                    key={e.id}
                    className="calendar-event"
                    style={{
                      top: (minutesOf(e.startsAt) - first * 60) * 1.2,
                      height:
                        Math.min(duration, 1440 - minutesOf(e.startsAt)) * 1.2 -
                        4,
                      left: `calc(${(col / columns) * 100}% + 3px)`,
                      width: `calc(${100 / columns}% - 6px)`,
                      background: `${color}12`,
                      borderLeftColor: color,
                      color,
                    }}
                    onClick={() => onOpen(e)}
                  >
                    <div className="calendar-event-header">
                      <span className="calendar-event-time">
                        {timeOf(e.startsAt)}
                      </span>
                      <span
                        className="calendar-people"
                        role="group"
                        aria-label={`Saved by ${people.map((m) => m.name).join(", ")}`}
                        title={people.map((m) => m.name).join(", ")}
                      >
                        {people.slice(0, 2).map((m) => (
                          <span
                            key={m.id}
                            style={{ background: m.color }}
                            title={m.name}
                            aria-hidden="true"
                          >
                            {m.name.trim().charAt(0).toUpperCase()}
                          </span>
                        ))}
                        {people.length > 2 && (
                          <span
                            className="calendar-people-more"
                            aria-hidden="true"
                          >
                            +{people.length - 2}
                          </span>
                        )}
                      </span>
                    </div>
                    <strong>{e.title}</strong>
                    <span className="calendar-event-place">{e.location}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
function AuthDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<"signup" | "login" | "recover">("signup"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget),
      email = String(f.get("email")).trim().toLowerCase(),
      password = String(f.get("password"));
    try {
      if (mode === "recover") {
        await request(
          "/api/recovery",
          { email, password, code: String(f.get("code")).trim() },
          "PUT",
        );
        setMode("login");
        setError("Password reset. Sign in with your new password.");
        return;
      }
      const result =
        mode === "signup"
          ? await authClient.signUp.email({
              name: String(f.get("name")).trim(),
              email,
              password,
            })
          : await authClient.signIn.email({ email, password });
      if (result.error)
        throw new Error(result.error.message ?? "Could not sign in.");
      onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        mode === "signup"
          ? "Make the week yours."
          : mode === "login"
            ? "Welcome back."
            : "Recover your account."
      }
      onClose={onClose}
    >
      <p className="dialog-intro">
        {mode === "signup"
          ? "A quick account. A shared week. No approval or email verification needed."
          : mode === "login"
            ? "Sign in to pick up where you left off."
            : "Use the recovery code you saved in account settings."}
      </p>
      {mode !== "recover" && (
        <div className="auth-tabs">
          <button
            className={mode === "signup" ? "active" : ""}
            onClick={() => {
              setMode("signup");
              setError("");
            }}
          >
            Create account
          </button>
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            Sign in
          </button>
        </div>
      )}
      <form onSubmit={submit}>
        {mode === "signup" && (
          <label>
            Your name
            <input
              name="name"
              placeholder="Kyle"
              autoComplete="name"
              required
              minLength={1}
              maxLength={60}
            />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            name="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </label>
        {mode === "recover" && (
          <label>
            Recovery code
            <input
              name="code"
              required
              minLength={48}
              maxLength={48}
              autoComplete="off"
            />
          </label>
        )}
        <label>
          {mode === "recover" ? "New password" : "Password"}
          <input
            type="password"
            name="password"
            placeholder="At least 10 characters"
            required
            minLength={10}
            maxLength={128}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button dark full" disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <>
              {mode === "signup"
                ? "Create account & start planning"
                : mode === "login"
                  ? "Sign in"
                  : "Reset password"}
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>
      {mode === "signup" && (
        <p className="form-note">
          Use a password manager. You can create a recovery code in account
          settings. We don’t send password-reset emails.
        </p>
      )}
      {mode === "login" && (
        <button
          className="text-button centered"
          onClick={() => {
            setMode("recover");
            setError("");
          }}
        >
          Forgot password? Use a recovery code
        </button>
      )}
      {mode === "recover" && (
        <button
          className="text-button centered"
          onClick={() => setMode("login")}
        >
          Back to sign in
        </button>
      )}
    </Modal>
  );
}
function CrewDialog({
  plan,
  mutate,
  onClose,
  notify,
  onSwitch,
}: {
  plan: Plan;
  mutate: (b: unknown) => Promise<unknown>;
  onClose: () => void;
  notify: (s: string) => void;
  onSwitch: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false),
    [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const link = plan.crew
    ? `${location.origin}/?invite=${plan.crew.inviteCode}`
    : "";
  async function act(body: unknown) {
    setBusy(true);
    setError("");
    try {
      await mutate(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Better with your people." onClose={onClose}>
      <p className="dialog-intro">
        Share a private week. Everyone keeps their own picks, and you see the
        plan together.
      </p>
      {plan.crews.length > 1 && (
        <label>
          Your groups
          <select
            value={plan.crew?.id}
            onChange={(e) => onSwitch(e.target.value)}
          >
            {plan.crews.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {plan.crew && (
        <>
          <div className="crew-name">
            <h3>{plan.crew.name}</h3>
            <span>
              {plan.members.length}{" "}
              {plan.members.length === 1 ? "person" : "people"}
            </span>
          </div>
          <div className="invite-link">
            <input aria-label="Private invite link" readOnly value={link} />
            <button
              className="button dark"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                  notify("Invite link copied. Send it to a friend.");
                } catch {
                  notify("Select and copy the invitation link.");
                }
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}Copy
            </button>
          </div>
          <p className="form-note">
            Anyone with this link can join and see this group’s saved and custom
            events. Share it directly with your friends.
          </p>
          <div className="crew-members">
            {plan.members.map((m) => (
              <div key={m.id}>
                <Avatar name={m.name} color={m.color} />
                <span>
                  <strong>
                    {m.name}
                    {m.id === plan.user?.id ? " (you)" : ""}
                  </strong>
                  <small>
                    {m.id === plan.crew?.ownerId ? "Group owner" : "Friend"}
                  </small>
                </span>
                {m.id !== plan.crew?.ownerId &&
                  (plan.crew?.ownerId === plan.user?.id ||
                    m.id === plan.user?.id) && (
                    <button
                      className="text-button danger"
                      disabled={busy}
                      onClick={() => {
                        if (confirmRemove === m.id) {
                          act({
                            action: "remove",
                            crewId: plan.crew!.id,
                            userId: m.id,
                          });
                          setConfirmRemove(null);
                        } else setConfirmRemove(m.id);
                      }}
                    >
                      {confirmRemove === m.id
                        ? "Confirm?"
                        : m.id === plan.user?.id
                          ? "Leave"
                          : "Remove"}
                    </button>
                  )}
              </div>
            ))}
          </div>
          {plan.crew.ownerId === plan.user?.id && (
            <div className="crew-admin">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = new FormData(e.currentTarget).get("name");
                  act({ action: "rename", crewId: plan.crew!.id, name });
                }}
              >
                <label>
                  Group name
                  <div className="inline-field">
                    <input
                      name="name"
                      required
                      maxLength={60}
                      defaultValue={plan.crew.name}
                      key={plan.crew.id}
                    />
                    <button className="button outlined" disabled={busy}>
                      Save
                    </button>
                  </div>
                </label>
              </form>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  act({ action: "rotate", crewId: plan.crew!.id });
                  setCopied(false);
                }}
              >
                Replace invite link
              </button>
              <p className="form-note">
                Replacing the link disables the old invitation. Existing members
                stay.
              </p>
            </div>
          )}
        </>
      )}
      <details className="new-group" open={!plan.crew}>
        <summary>
          {plan.crew ? "Create another group" : "Create your week"}
        </summary>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const result = await request("/api/plan", {
                action: "create",
                name: String(new FormData(e.currentTarget).get("name")),
              });
              await onSwitch(result.crewId);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Group name
            <input
              name="name"
              placeholder="Our NYC week"
              maxLength={60}
              required
            />
          </label>
          <button className="button dark full" disabled={busy}>
            Create group <Plus size={16} />
          </button>
        </form>
      </details>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
function SettingsDialog({
  plan,
  mutate,
  onClose,
  notify,
  onLogout,
}: {
  plan: Plan;
  mutate: (b: unknown) => Promise<unknown>;
  onClose: () => void;
  notify: (s: string) => void;
  onLogout: () => void;
}) {
  const [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Your account." onClose={onClose}>
      <div className="account-id">
        <strong>{plan.user!.name}</strong>
        <span>{plan.user!.email}</span>
      </div>
      {plan.crew && (
        <>
          <label>Your calendar color</label>
          <div className="color-picker">
            {COLORS.map((color, i) => (
              <button
                key={color}
                aria-label={`Use ${["blue", "orange", "green", "purple", "pink", "ochre"][i]} calendar color`}
                style={{ background: color }}
                onClick={async () => {
                  try {
                    await mutate({
                      action: "color",
                      crewId: plan.crew!.id,
                      color,
                    });
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                {plan.members.find((m) => m.id === plan.user?.id)?.color ===
                  color && <Check size={20} />}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="setting-section">
        <h3>Keep a way back in.</h3>
        <p>
          No email service is needed for this app. Save a recovery code in your
          password manager in case you forget your password.
        </p>
        <button
          className="button outlined"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await request("/api/recovery", {});
              setCode(result.code);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {code ? "Replace recovery code" : "Create recovery code"}
        </button>
        {code && (
          <div className="recovery-code">
            <code>{code}</code>
            <button
              className="text-button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(code);
                  notify("Recovery code copied. Store it somewhere safe.");
                } catch {
                  notify("Select the code to copy it.");
                }
              }}
            >
              <Copy size={14} />
              Copy code
            </button>
            <p>Shown only now. Replacing it invalidates your previous code.</p>
          </div>
        )}
      </div>
      <details className="setting-section">
        <summary>Change password</summary>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const form = e.currentTarget,
              f = new FormData(form);
            const result = await authClient.changePassword({
              currentPassword: String(f.get("current")),
              newPassword: String(f.get("next")),
              revokeOtherSessions: true,
            });
            setBusy(false);
            if (result.error)
              setError(result.error.message ?? "Could not change password.");
            else {
              form.reset();
              notify("Password updated.");
            }
          }}
        >
          <label>
            Current password
            <input
              name="current"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          <label>
            New password
            <input
              name="next"
              type="password"
              minLength={10}
              maxLength={128}
              required
              autoComplete="new-password"
            />
          </label>
          <button className="button outlined" disabled={busy}>
            Change password
          </button>
        </form>
      </details>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button subtle logout" onClick={onLogout}>
        <LogOut size={16} />
        Sign out
      </button>
    </Modal>
  );
}
function EventDetail({
  event: e,
  plan,
  isSaved,
  onFavorite,
  onClose,
  onEdit,
  onDelete,
}: {
  event: Event;
  plan: Plan;
  isSaved: boolean;
  onFavorite: () => void;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const attendees = plan.members.filter((m) =>
    plan.favorites.some((f) => f.eventId === e.id && f.userId === m.id),
  );
  const clashes = plan.events.filter(
    (other) =>
      other.id !== e.id &&
      plan.favorites.some(
        (f) => f.eventId === other.id && f.userId === plan.user?.id,
      ) &&
      new Date(other.startsAt) < new Date(e.endsAt) &&
      new Date(other.endsAt) > new Date(e.startsAt),
  );
  return (
    <Modal title="Event details" onClose={onClose} wide>
      {e.imageUrl && (
        <img
          className="detail-art"
          src={e.imageUrl}
          alt={`${e.title} artwork`}
        />
      )}
      <div className="event-kicker">
        <span>{e.category}</span>
        {isRevenueCat(e) && <span className="rc-tag">RevenueCat</span>}
      </div>
      <h2 className="detail-title">{e.title}</h2>
      <p className="detail-host">Hosted by {e.host}</p>
      <div className="detail-facts">
        <div>
          <CalendarDays size={19} />
          <span>
            <strong>{dateOf(e.startsAt)}</strong>
            <small>{eventLabel(e)} · New York time</small>
          </span>
        </div>
        <div>
          <MapPin size={19} />
          <span>
            <strong>{e.location}</strong>
            {!/(TBA|to be decided|after|virtual)/i.test(e.location) && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location + ", New York City")}`}
                target="_blank"
                rel="noreferrer"
              >
                Open in Maps <ExternalLink size={12} />
              </a>
            )}
          </span>
        </div>
      </div>
      {!e.isListed && (
        <p className="form-error">
          This event is no longer on the official schedule. Check with the host
          before making plans.
        </p>
      )}
      <p className="detail-description">
        {e.description || "No extra notes yet."}
      </p>
      {e.links.length > 0 && (
        <LinkedEventAbout
          key={`${e.id}:${JSON.stringify(e.links)}`}
          eventId={e.id}
          links={e.links}
        />
      )}
      {attendees.length > 0 && (
        <div className="detail-attendees">
          <span>On the calendar</span>
          {attendees.map((m) => (
            <span key={m.id}>
              <Avatar name={m.name} color={m.color} small />
              {m.name.split(" ")[0]}
            </span>
          ))}
        </div>
      )}
      {clashes.length > 0 && (
        <div className="detail-conflicts">
          <Clock3 size={16} />
          <div>
            <strong>Overlaps with your picks</strong>
            {clashes.map((other) => (
              <p key={other.id}>
                {other.title} · {eventLabel(other)}
              </p>
            ))}
          </div>
        </div>
      )}
      <div className="detail-actions">
        <button
          className={`button ${isSaved ? "saved-action" : "dark"}`}
          onClick={onFavorite}
        >
          <Star size={18} fill={isSaved ? "currentColor" : "none"} />
          {isSaved ? "Saved to my week" : "Save to my week"}
        </button>
        {e.links.map((link, i) => (
          <a
            key={i}
            className="button outlined"
            href={link.url}
            target="_blank"
            rel="noreferrer"
          >
            {link.label}
            <ExternalLink size={15} />
          </a>
        ))}
      </div>
      {!e.creatorId && (
        <p className="form-note">
          Saving does not register you. Follow the host’s link for tickets,
          approval, and the latest details.
          {!e.links.length
            ? " This event has no public registration link. Check the description for access details."
            : ""}
        </p>
      )}
      {e.sourceUrl && (
        <a
          className="text-button source-link"
          href={e.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          View official schedule <ExternalLink size={13} />
        </a>
      )}
      {e.creatorId &&
        (e.creatorId === plan.user?.id ||
          plan.crew?.ownerId === plan.user?.id) && (
          <div className="detail-admin">
            {e.creatorId === plan.user?.id && (
              <button className="text-button" onClick={onEdit}>
                <Settings2 size={15} />
                Edit event
              </button>
            )}
            <button
              className="text-button danger"
              onClick={() =>
                confirmDelete ? onDelete() : setConfirmDelete(true)
              }
            >
              <Trash2 size={15} />
              {confirmDelete ? "Confirm delete" : "Delete event"}
            </button>
          </div>
        )}
    </Modal>
  );
}
