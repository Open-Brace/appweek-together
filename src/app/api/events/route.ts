import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";
import { db } from "@/lib/db";
import { events, favorites, members, crews } from "@/lib/schema";
import { failure, sameOrigin, viewer } from "@/lib/http";
import { validCover } from "@/lib/event-cover";
const eventSchema = z.object({
  id: z.string().optional(),
  imageUrl: z
    .string()
    .refine(validCover, "Choose a valid cover photo.")
    .optional(),
  crewId: z.string(),
  title: z.string().trim().min(1).max(160),
  description: z.string().max(5000).default(""),
  location: z.string().trim().max(300).default(""),
  start: z.string().regex(/^2026-10-(19|20|21|22)T\d{2}:\d{2}$/),
  end: z.string().regex(/^2026-10-(19|20|21|22|23)T\d{2}:\d{2}$/),
  url: z
    .union([z.literal(""), z.url().refine((v) => /^https?:\/\//.test(v))])
    .default(""),
});
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const current = await viewer(request);
    const parsed = eventSchema.safeParse(await request.json());
    if (!parsed.success)
      return Response.json(
        {
          error:
            "Add a title, valid times during App Week, and a valid link or cover photo if included.",
        },
        { status: 400 },
      );
    const data = parsed.data;
    const [member] = await db
      .select()
      .from(members)
      .where(
        and(eq(members.crewId, data.crewId), eq(members.userId, current.id)),
      );
    if (!member) throw new Error("FORBIDDEN");
    const startsAt = fromZonedTime(data.start, "America/New_York"),
      endsAt = fromZonedTime(data.end, "America/New_York");
    if (
      !Number.isFinite(startsAt.getTime()) ||
      !Number.isFinite(endsAt.getTime()) ||
      endsAt <= startsAt ||
      endsAt.getTime() - startsAt.getTime() > 86400000
    )
      return Response.json(
        { error: "End time must be after the start, within 24 hours." },
        { status: 400 },
      );
    const fields = {
      ...(data.imageUrl !== undefined
        ? { imageUrl: data.imageUrl || null }
        : {}),
      title: data.title,
      description: data.description,
      location: data.location || "Location to be decided",
      startsAt,
      endsAt,
      links: data.url ? [{ label: "Event link", url: data.url }] : [],
      updatedAt: new Date(),
    };
    if (data.id) {
      const rows = await db
        .update(events)
        .set(fields)
        .where(
          and(
            eq(events.id, data.id),
            eq(events.creatorId, current.id),
            eq(events.crewId, data.crewId),
          ),
        )
        .returning({ id: events.id });
      if (!rows.length) throw new Error("FORBIDDEN");
      return Response.json({ id: data.id });
    }
    const id = crypto.randomUUID();
    await db.batch([
      db.insert(events).values({
        ...fields,
        id,
        crewId: data.crewId,
        creatorId: current.id,
        host: current.name,
        category: "Custom event",
      }),
      db.insert(favorites).values({ eventId: id, userId: current.id }),
    ]);
    return Response.json({ id });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    const current = await viewer(request);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return new Response(null, { status: 400 });
    const [event] = await db.select().from(events).where(eq(events.id, id));
    if (!event?.crewId) throw new Error("FORBIDDEN");
    const [membership] = await db
      .select()
      .from(members)
      .where(
        and(eq(members.crewId, event.crewId), eq(members.userId, current.id)),
      );
    if (!membership) throw new Error("FORBIDDEN");
    const [crew] = await db
      .select()
      .from(crews)
      .where(eq(crews.id, event.crewId));
    if (event.creatorId !== current.id && crew.ownerId !== current.id)
      throw new Error("FORBIDDEN");
    await db.delete(events).where(eq(events.id, id));
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
