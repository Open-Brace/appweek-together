import { syncSource } from "@/lib/source";
import { refreshPublicAbout } from "@/lib/linked-about";
export const maxDuration = 120;
export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return new Response("Unauthorized", { status: 401 });
  const source = await syncSource();
  try {
    return Response.json({
      ...source,
      linkedAbout: await refreshPublicAbout(),
    });
  } catch (error) {
    console.error("Linked event descriptions could not refresh.", error);
    return Response.json({
      ...source,
      linkedAbout: { error: "Description refresh failed." },
    });
  }
}
