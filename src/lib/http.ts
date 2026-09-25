import { auth } from "./auth";
export async function viewer(request: Request) {
  const s = await auth.api.getSession({ headers: request.headers });
  if (!s) throw new Error("UNAUTHORIZED");
  return s.user;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (
    origin !== new URL(request.url).origin &&
    origin !== process.env.BETTER_AUTH_URL
  )
    throw new Error("FORBIDDEN");
}
export function failure(error: unknown) {
  if (error instanceof Error && error.message === "UNAUTHORIZED")
    return Response.json(
      { error: "Please sign in to continue." },
      { status: 401 },
    );
  if (error instanceof Error && error.message === "FORBIDDEN")
    return Response.json(
      { error: "You do not have access to this." },
      { status: 403 },
    );
  console.error(error);
  return Response.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
