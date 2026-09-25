import { createHash, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { account, recovery, session, rateLimit, user } from "@/lib/schema";
import { failure, sameOrigin, viewer } from "@/lib/http";
function digest(s: string) {
  return createHash("sha256").update(s).digest("hex");
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const current = await viewer(request);
    const code = randomBytes(24).toString("hex");
    await db
      .insert(recovery)
      .values({ userId: current.id, codeHash: digest(code) })
      .onConflictDoUpdate({
        target: recovery.userId,
        set: { codeHash: digest(code) },
      });
    return Response.json(
      { code },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(request: Request) {
  try {
    sameOrigin(request);
    const key =
      "recover-" +
      digest(
        (
          request.headers.get("x-vercel-forwarded-for") ??
          request.headers.get("x-forwarded-for") ??
          "local"
        ).split(",")[0] +
          "-" +
          Math.floor(Date.now() / 600000),
      );
    const [limit] = await db
      .insert(rateLimit)
      .values({ id: key, key, count: 1, lastRequest: Date.now() })
      .onConflictDoUpdate({
        target: rateLimit.key,
        set: { count: sql`${rateLimit.count}+1`, lastRequest: Date.now() },
      })
      .returning();
    if (limit.count > 5)
      return Response.json(
        { error: "Too many attempts. Try again in 10 minutes." },
        { status: 429 },
      );
    const data = z
      .object({
        email: z.email(),
        code: z.string().length(48),
        password: z.string().min(10).max(128),
      })
      .safeParse(await request.json());
    if (!data.success)
      return Response.json(
        { error: "Check your email, recovery code, and new password." },
        { status: 400 },
      );
    const password = await hashPassword(data.data.password);
    const result = await db.execute(sql`
      WITH consumed AS (
        DELETE FROM ${recovery}
        WHERE ${recovery.userId} IN (SELECT ${user.id} FROM ${user} WHERE ${user.email} = ${data.data.email.toLowerCase()})
          AND ${recovery.codeHash} = ${digest(data.data.code.trim())}
        RETURNING ${recovery.userId}
      ), changed AS (
        UPDATE ${account} SET password = ${password}, updated_at = now()
        WHERE user_id IN (SELECT user_id FROM consumed) AND provider_id = 'credential'
        RETURNING user_id
      ), revoked AS (
        DELETE FROM ${session} WHERE user_id IN (SELECT user_id FROM changed)
      ) SELECT user_id FROM changed
    `);
    if (!result.rows.length)
      return Response.json(
        { error: "The email or recovery code is incorrect." },
        { status: 400 },
      );
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
