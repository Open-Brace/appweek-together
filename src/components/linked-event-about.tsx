"use client";
import { useEffect, useState } from "react";
import { ExternalLink, LoaderCircle } from "lucide-react";
import type { LinkedAboutResult } from "@/lib/linked-about-types";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; result: LinkedAboutResult };

export function LinkedEventAbout({
  eventId,
  links,
}: {
  eventId: string;
  links: { url: string }[];
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetch(`/api/events/${encodeURIComponent(eventId)}/about`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load event details.");
        const result: LinkedAboutResult = await response.json();
        if (!controller.signal.aborted) setState({ status: "loaded", result });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, [eventId, attempt]);
  if (state.status === "loaded" && state.result.status === "none") return null;
  return (
    <section className="linked-about" aria-label="About the event">
      <h3>About the event</h3>
      {state.status === "loading" && (
        <p className="linked-about-status" role="status">
          <LoaderCircle className="spin" size={16} /> Loading details from the
          event site...
        </p>
      )}
      {state.status === "error" && (
        <div className="linked-about-status" role="status">
          <p>We couldn't load the event site's description.</p>
          <button
            className="button subtle"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Try again
          </button>
          {links.map((link) => (
            <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
              Read on the event site <ExternalLink size={13} />
            </a>
          ))}
        </div>
      )}
      {state.status === "loaded" &&
        state.result.sources.map((source) => (
          <div className="linked-about-source" key={source.url}>
            <a
              className="linked-about-attribution"
              href={source.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              From {source.sourceName} <ExternalLink size={13} />
            </a>
            {source.text ? (
              <>
                <div className="linked-about-text">
                  {source.text.split(/\n\n+/).map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>
                {source.status === "stale" && (
                  <p className="linked-about-status">
                    Showing the last available description. Check the source for
                    updates.
                  </p>
                )}
              </>
            ) : (
              <p className="linked-about-status">
                The description isn't available here yet.{" "}
                <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                  Read it on {source.sourceName} <ExternalLink size={13} />
                </a>
              </p>
            )}
          </div>
        ))}
    </section>
  );
}
