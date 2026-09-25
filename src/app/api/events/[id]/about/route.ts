import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { failure } from "@/lib/http";
import { getLinkedAbout } from "@/lib/linked-about";
import { events, members } from "@/lib/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };
const notFound = () =>
  Response.json({ error: "Event not found." }, { status: 404, headers });

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const [event] = await db
      .select({ crewId: events.crewId, links: events.links })
      .from(events)
      .where(eq(events.id, id));
    if (!event) return notFound();
    if (event.crewId) {
      const current = await auth.api.getSession({ headers: request.headers });
      if (!current) return notFound();
      const [membership] = await db
        .select({ userId: members.userId })
        .from(members)
        .where(
          and(
            eq(members.crewId, event.crewId),
            eq(members.userId, current.user.id),
          ),
        );
      if (!membership) return notFound();
    }
    return Response.json(await getLinkedAbout(event.links), { headers });
  } catch (error) {
    const response = failure(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
