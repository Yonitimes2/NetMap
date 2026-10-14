import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readToken } from "@/lib/auth/session";

/**
 * Sends anyone without a valid session cookie to /login (pages) or answers 401 (API).
 * This is only the first gate: every API route checks the user again against the user file.
 */

const OPEN = new Set(["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/me", "/api/auth/setup"]);

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (OPEN.has(pathname)) return NextResponse.next();
  if (await readToken(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return Response.json({ error: { code: "unauthorized", message: "צריך להתחבר מחדש" } }, { status: 401 });
  }
  const next = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  // Next sends same-host redirects as a relative Location, so behind Apache the browser stays on https://
  return NextResponse.redirect(new URL(`/login${next}`, req.url));
}

export const config = {
  matcher: [
    // everything except build assets, the PWA manifest and icons (fetched without cookies)
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|icon-192\\.png|icon-512\\.png|apple-icon\\.png|manifest\\.webmanifest|pdf\\.worker\\.min\\.mjs).*)",
  ],
};
