import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { events, members } from "@/lib/schema";
import { failure, viewer } from "@/lib/http";
import { coverBytes } from "@/lib/event-cover";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const current = await viewer(request);
    const { id } = await params;
    const [event] = await db
      .select({ imageUrl: events.imageUrl })
      .from(events)
      .innerJoin(
        members,
        and(eq(members.crewId, events.crewId), eq(members.userId, current.id)),
      )
      .where(eq(events.id, id));
    const bytes = event?.imageUrl ? coverBytes(event.imageUrl) : null;
    if (!bytes)
      return new Response(null, {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    const etag = `"${createHash("sha256").update(bytes).digest("hex")}"`;
    const headers = {
      "Cache-Control": "private, no-cache",
      ETag: etag,
      "Content-Type": "image/jpeg",
      "X-Content-Type-Options": "nosniff",
      Vary: "Cookie",
    };
    if (request.headers.get("if-none-match") === etag)
      return new Response(null, { status: 304, headers });
    return new Response(new Uint8Array(bytes), { headers });
  } catch (error) {
    return failure(error);
  }
}
