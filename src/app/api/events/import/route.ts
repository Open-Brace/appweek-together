import { z } from "zod";
import { failure, sameOrigin, viewer } from "@/lib/http";
import { importLuma } from "@/lib/luma";
import { lumaUrl } from "@/lib/event-draft";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await viewer(request);
    const parsed = z
      .object({
        url: z
          .string()
          .max(2048)
          .refine((value) => lumaUrl(value) !== null),
      })
      .safeParse(await request.json());
    if (!parsed.success)
      return Response.json(
        { error: "Paste a valid HTTPS Luma event link." },
        { status: 400 },
      );
    try {
      return Response.json(await importLuma(parsed.data.url), {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      const message =
        error instanceof Error && error.name !== "TimeoutError"
          ? error.message
          : "Luma took too long to respond. Try again or enter the details yourself.";
      return Response.json({ error: message }, { status: 422 });
    }
  } catch (error) {
    return failure(error);
  }
}
