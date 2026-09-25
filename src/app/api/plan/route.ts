import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { crews, events, favorites, members, user } from "@/lib/schema";
import { COLORS } from "@/lib/types";
import { failure, sameOrigin, viewer } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const current = await auth.api.getSession({ headers: request.headers });
    const myCrews = current
      ? await db
          .select({
            id: crews.id,
            name: crews.name,
            ownerId: crews.ownerId,
            inviteCode: crews.inviteCode,
          })
          .from(crews)
          .innerJoin(members, eq(members.crewId, crews.id))
          .where(eq(members.userId, current.user.id))
      : [];
    const requested = new URL(request.url).searchParams.get("crew");
    const crew = myCrews.find((c) => c.id === requested) ?? myCrews[0] ?? null;
    const roster = crew
      ? await db
          .select({ id: user.id, name: user.name, color: members.color })
          .from(members)
          .innerJoin(user, eq(user.id, members.userId))
          .where(eq(members.crewId, crew.id))
      : [];
    const catalog = await db
      .select()
      .from(events)
      .where(
        crew
          ? or(isNull(events.crewId), eq(events.crewId, crew.id))
          : isNull(events.crewId),
      )
      .orderBy(events.startsAt);
    const ids = roster.length
      ? roster.map((m) => m.id)
      : current
        ? [current.user.id]
        : [];
    const saved =
      ids.length && catalog.length
        ? await db
            .select({ userId: favorites.userId, eventId: favorites.eventId })
            .from(favorites)
            .where(
              and(
                inArray(favorites.userId, ids),
                inArray(
                  favorites.eventId,
                  catalog.map((e) => e.id),
                ),
              ),
            )
        : [];
    return Response.json(
      {
        user: current
          ? {
              id: current.user.id,
              name: current.user.name,
              email: current.user.email,
            }
          : null,
        events: catalog.map((event) => ({
          ...event,
          imageUrl: event.imageUrl?.startsWith("data:image/jpeg;base64,")
            ? `/api/events/${encodeURIComponent(event.id)}/cover?v=${event.updatedAt.getTime()}`
            : event.imageUrl,
        })),
        crews: myCrews,
        crew,
        members: roster,
        favorites: saved,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(1).max(60),
  }),
  z.object({
    action: z.literal("join"),
    code: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({
    action: z.literal("color"),
    crewId: z.string(),
    color: z.enum(COLORS as [string, ...string[]]),
  }),
  z.object({ action: z.literal("rotate"), crewId: z.string() }),
  z.object({
    action: z.literal("rename"),
    crewId: z.string(),
    name: z.string().trim().min(1).max(60),
  }),
  z.object({
    action: z.literal("remove"),
    crewId: z.string(),
    userId: z.string(),
  }),
  z.object({
    action: z.literal("favorite"),
    eventId: z.string().max(100),
    saved: z.boolean(),
  }),
]);
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const current = await viewer(request);
    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success)
      return Response.json(
        { error: "Please check the details and try again." },
        { status: 400 },
      );
    const data = parsed.data;
    if (data.action === "create") {
      const id = crypto.randomUUID();
      await db.batch([
        db.insert(crews).values({
          id,
          name: data.name,
          ownerId: current.id,
          inviteCode: randomBytes(32).toString("hex"),
        }),
        db
          .insert(members)
          .values({ crewId: id, userId: current.id, color: COLORS[0] }),
      ]);
      return Response.json({ crewId: id });
    }
    if (data.action === "join") {
      const [crew] = await db
        .select()
        .from(crews)
        .where(eq(crews.inviteCode, data.code));
      if (!crew)
        return Response.json(
          {
            error:
              "This invitation is no longer valid. Ask your friend for a new link.",
          },
          { status: 404 },
        );
      const roster = await db
        .select()
        .from(members)
        .where(eq(members.crewId, crew.id));
      const color =
        COLORS.find((c) => !roster.some((m) => m.color === c)) ??
        COLORS[roster.length % COLORS.length];
      await db
        .insert(members)
        .values({ crewId: crew.id, userId: current.id, color })
        .onConflictDoNothing();
      return Response.json({ crewId: crew.id });
    }
    if (data.action === "favorite") {
      const [event] = await db
        .select()
        .from(events)
        .where(eq(events.id, data.eventId));
      if (!event)
        return Response.json({ error: "Event not found." }, { status: 404 });
      if (event.crewId) {
        const [membership] = await db
          .select()
          .from(members)
          .where(
            and(
              eq(members.crewId, event.crewId),
              eq(members.userId, current.id),
            ),
          );
        if (!membership) throw new Error("FORBIDDEN");
      }
      if (data.saved)
        await db
          .insert(favorites)
          .values({ userId: current.id, eventId: data.eventId })
          .onConflictDoNothing();
      else
        await db
          .delete(favorites)
          .where(
            and(
              eq(favorites.userId, current.id),
              eq(favorites.eventId, data.eventId),
            ),
          );
      return Response.json({ ok: true });
    }
    const [membership] = await db
      .select({ ownerId: crews.ownerId })
      .from(members)
      .innerJoin(crews, eq(crews.id, members.crewId))
      .where(
        and(eq(members.crewId, data.crewId), eq(members.userId, current.id)),
      );
    if (!membership) throw new Error("FORBIDDEN");
    if (data.action === "color")
      await db
        .update(members)
        .set({ color: data.color })
        .where(
          and(eq(members.crewId, data.crewId), eq(members.userId, current.id)),
        );
    if (data.action === "rotate" || data.action === "rename") {
      if (membership.ownerId !== current.id) throw new Error("FORBIDDEN");
      await db
        .update(crews)
        .set(
          data.action === "rotate"
            ? { inviteCode: randomBytes(32).toString("hex") }
            : { name: data.name },
        )
        .where(eq(crews.id, data.crewId));
    }
    if (data.action === "remove") {
      if (data.userId !== current.id && membership.ownerId !== current.id)
        throw new Error("FORBIDDEN");
      if (data.userId === membership.ownerId)
        return Response.json(
          {
            error:
              "The owner stays in this group. You can create another group from the group menu.",
          },
          { status: 400 },
        );
      await db
        .delete(members)
        .where(
          and(eq(members.crewId, data.crewId), eq(members.userId, data.userId)),
        );
    }
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
