"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { dayOf, minutesOf, type Event } from "@/lib/types";
import { lumaUrl, MAX_COVER_BYTES, type EventDraft } from "@/lib/event-draft";
import { Modal } from "./modal";

type ImportState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "error"; message: string };
type CoverState =
  | { kind: "idle" }
  | { kind: "processing" }
  | { kind: "error"; message: string };
const importedFields = [
  "title",
  "description",
  "location",
  "start",
  "end",
  "imageUrl",
] as const;

function local(date: string) {
  const minutes = minutesOf(date);
  return `${dayOf(date)}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

async function photoData(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml")
    throw new Error("Choose a photo such as JPEG, PNG, or WebP.");
  if (file.size > 20_000_000)
    throw new Error("Choose a photo smaller than 20 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error(
        "This photo format could not be opened. Try JPEG or PNG.",
      );
    }
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 60_000_000
    )
      throw new Error("This photo is too large. Choose a smaller version.");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error(
        "Your browser could not prepare the photo. Try another browser.",
      );
    for (const maxSize of [1200, 900, 600]) {
      const scale = Math.min(
        1,
        maxSize / Math.max(image.naturalWidth, image.naturalHeight),
      );
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.7, 0.55]) {
        const data = canvas.toDataURL("image/jpeg", quality);
        if (
          (data.length - "data:image/jpeg;base64,".length) * 0.75 <=
          MAX_COVER_BYTES
        )
          return data;
      }
    }
    throw new Error(
      "This photo could not be made small enough. Try a different one.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function EventForm({
  event,
  crewId,
  onClose,
  onSaved,
}: {
  event: Event | null;
  crewId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<EventDraft>(() => ({
    title: event?.title ?? "",
    description: event?.description ?? "",
    location: event?.location ?? "",
    url: event?.links[0]?.url ?? "",
    start: event ? local(event.startsAt) : "2026-10-19T18:00",
    end: event ? local(event.endsAt) : "2026-10-19T19:00",
    imageUrl: event?.imageUrl ?? "",
  }));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [importState, setImportState] = useState<ImportState>({ kind: "idle" });
  const [coverState, setCoverState] = useState<CoverState>({ kind: "idle" });
  const [importAttempt, setImportAttempt] = useState(0);
  const initialUrl = useRef(event?.links[0]?.url ?? "");
  const hasChangedUrl = useRef(false);
  const revisions = useRef<Record<keyof EventDraft, number>>({
    title: 0,
    description: 0,
    location: 0,
    start: 0,
    end: 0,
    url: 0,
    imageUrl: 0,
  });
  const importSnapshot = useRef({ ...revisions.current });
  const importId = useRef(0),
    coverId = useRef(0);
  const photoInput = useRef<HTMLInputElement>(null);
  const coverProcessing = useRef(false);
  const [coverFailed, setCoverFailed] = useState(false);

  function update(field: keyof EventDraft, value: string) {
    revisions.current[field]++;
    if (field === "url") {
      hasChangedUrl.current = true;
      importSnapshot.current = { ...revisions.current };
      importId.current++;
      setImportState(
        lumaUrl(value.trim()) ? { kind: "loading" } : { kind: "idle" },
      );
    }
    if (field === "imageUrl") setCoverFailed(false);
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function startImport() {
    if (!lumaUrl(draft.url.trim())) return;
    hasChangedUrl.current = true;
    importSnapshot.current = { ...revisions.current };
    importId.current++;
    setImportState({ kind: "loading" });
    setImportAttempt((attempt) => attempt + 1);
  }

  useEffect(() => {
    if (
      (!hasChangedUrl.current && draft.url === initialUrl.current) ||
      !lumaUrl(draft.url.trim())
    )
      return;
    const id = ++importId.current;
    const before = importSnapshot.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setImportState({ kind: "loading" });
      try {
        const response = await fetch("/api/events/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: draft.url.trim() }),
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error ??
              "Import failed. Enter the details yourself or try again.",
          );
        if (importId.current !== id) return;
        setDraft((current) => {
          const next = { ...current };
          for (const field of importedFields) {
            if (
              revisions.current[field] === before[field] &&
              typeof result[field] === "string" &&
              !(field === "imageUrl" && coverProcessing.current)
            )
              next[field] = result[field];
          }
          return next;
        });
        setCoverFailed(false);
        setImportState({ kind: "success" });
      } catch (failure) {
        if (controller.signal.aborted || importId.current !== id) return;
        setImportState({
          kind: "error",
          message:
            failure instanceof Error
              ? failure.message
              : "Import failed. Please try again.",
        });
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [draft.url, importAttempt]);

  useEffect(
    () => () => {
      importId.current++;
      coverId.current++;
    },
    [],
  );

  const waiting =
    busy || importState.kind === "loading" || coverState.kind === "processing";
  return (
    <Modal
      title={event ? "Edit event" : "Add event"}
      onClose={onClose}
    >
      <p className="dialog-intro">
        Paste a Luma link to fill in the details, or make a plan of your own.
      </p>
      <form
        className="event-form"
        onSubmit={async (submit) => {
          submit.preventDefault();
          if (waiting) return;
          setBusy(true);
          setError("");
          try {
            const response = await fetch("/api/events", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...draft,
                url: draft.url.trim(),
                id: event?.id,
                crewId,
                imageUrl:
                  draft.imageUrl === (event?.imageUrl ?? "")
                    ? undefined
                    : draft.imageUrl,
              }),
            });
            const result = await response.json();
            if (!response.ok)
              throw new Error(
                result.error ?? "Could not save. Please try again.",
              );
            onSaved();
          } catch (failure) {
            setError(
              failure instanceof Error
                ? failure.message
                : "Could not save. Please try again.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Link <span className="optional">optional</span>
          <input
            type="url"
            name="url"
            value={draft.url}
            onChange={(e) => update("url", e.target.value)}
            placeholder="Paste a Luma link or another event link"
            maxLength={2048}
            aria-describedby="event-import-status"
          />
        </label>
        <div
          id="event-import-status"
          className={`import-status ${importState.kind}`}
          role="status"
          aria-live="polite"
        >
          {importState.kind === "idle" &&
            (lumaUrl(draft.url.trim()) ? (
              <button
                type="button"
                className="text-button"
                onClick={startImport}
              >
                Import from Luma
              </button>
            ) : (
              "Luma links automatically fill in the event and cover photo."
            ))}
          {importState.kind === "loading" && (
            <>
              <LoaderCircle size={15} className="spin" /> Importing from Luma…
            </>
          )}
          {importState.kind === "success" && (
            <>
              <Check size={15} /> Imported from Luma. Review the details below.
            </>
          )}
          {importState.kind === "error" && (
            <>
              <span>{importState.message}</span>
              <button
                type="button"
                className="text-button"
                onClick={startImport}
              >
                Try import again
              </button>
            </>
          )}
        </div>
        <div className="cover-field">
          <span className="field-label">
            Cover photo <span className="optional">optional</span>
          </span>
          {draft.imageUrl && (
            <div className="cover-preview">
              <img
                src={draft.imageUrl}
                alt="Event cover preview"
                onError={() => setCoverFailed(true)}
              />
              <button
                type="button"
                className="cover-remove"
                aria-label="Remove cover photo"
                onClick={() => {
                  coverId.current++;
                  coverProcessing.current = false;
                  setCoverState({ kind: "idle" });
                  update("imageUrl", "");
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}
          {coverFailed && (
            <p className="form-note">
              The cover could not be displayed. You can choose another photo.
            </p>
          )}
          <input
            ref={photoInput}
            className="sr-only"
            type="file"
            accept="image/*"
            aria-label="Cover photo"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const id = ++coverId.current;
              revisions.current.imageUrl++;
              coverProcessing.current = true;
              setCoverState({ kind: "processing" });
              try {
                const data = await photoData(file);
                if (coverId.current !== id) return;
                update("imageUrl", data);
                setCoverState({ kind: "idle" });
              } catch (failure) {
                if (coverId.current === id)
                  setCoverState({
                    kind: "error",
                    message:
                      failure instanceof Error
                        ? failure.message
                        : "Could not prepare this photo.",
                  });
              } finally {
                if (coverId.current === id) coverProcessing.current = false;
              }
            }}
          />
          <button
            type="button"
            className="button outlined cover-choose"
            onClick={() => photoInput.current?.click()}
            disabled={coverState.kind === "processing"}
          >
            {coverState.kind === "processing" ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <ImagePlus size={16} />
            )}
            {coverState.kind === "processing"
              ? "Preparing photo…"
              : draft.imageUrl
                ? "Change photo"
                : "Choose photo"}
          </button>
          {coverState.kind === "error" && (
            <p className="form-error" role="alert">
              {coverState.message}
            </p>
          )}
        </div>
        <label>
          Event name
          <input
            name="title"
            value={draft.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="Dinner in the West Village"
            required
            maxLength={160}
          />
        </label>
        <div className="form-grid">
          <label>
            Starts, New York time
            <input
              type="datetime-local"
              name="start"
              value={draft.start}
              onChange={(e) => update("start", e.target.value)}
              min="2026-10-19T00:00"
              max="2026-10-22T23:59"
              required
            />
          </label>
          <label>
            Ends, New York time
            <input
              type="datetime-local"
              name="end"
              value={draft.end}
              onChange={(e) => update("end", e.target.value)}
              min="2026-10-19T00:00"
              max="2026-10-23T23:59"
              required
            />
          </label>
        </div>
        {draft.start &&
          (draft.start < "2026-10-19T00:00" ||
            draft.start > "2026-10-22T23:59") && (
            <p className="form-note">
              This event is outside App Week. Set a date from October 19–22 to
              add it to this week.
            </p>
          )}
        <label>
          Location
          <input
            name="location"
            value={draft.location}
            onChange={(e) => update("location", e.target.value)}
            placeholder="A place or address"
            maxLength={300}
          />
        </label>
        <label>
          Notes
          <textarea
            name="description"
            value={draft.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="Anything your friends should know"
            rows={4}
            maxLength={5000}
          />
        </label>
        <p className="form-note">
          Visible to this group. Only you can edit it. New events are
          automatically saved to your calendar.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button dark full" disabled={waiting}>
          {busy ? (
            <>
              <LoaderCircle className="spin" size={17} /> Saving…
            </>
          ) : (
            <>
              {event ? "Save changes" : "Add to my week"}
              <Plus size={16} />
            </>
          )}
        </button>
      </form>
    </Modal>
  );
}
