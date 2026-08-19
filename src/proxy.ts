import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

const PROTECTED_PREFIXES = ["/dashboard"];

/**
 * Optimistic routing only: it checks whether a session cookie is *present*, not
 * whether it is valid, because verification belongs where the data is read.
 * Every protected page still calls getSession() itself — see dashboard/page.tsx.
 *
 * Note this deliberately does not bounce signed-in users away from /login and
 * /signup. Those pages verify the session themselves and redirect, and doing it
 * here on cookie presence alone would loop forever on an expired token:
 * /login -> /dashboard -> (invalid) -> /login.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (!isProtected) return NextResponse.next();

  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*"],
};
