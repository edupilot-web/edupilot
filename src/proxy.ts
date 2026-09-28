import { NextResponse, type NextRequest } from "next/server";
import { PROTECTED_PATHS, TEACHER_PROTECTED_PATHS } from "@/lib/app-routes";
import { SESSION_COOKIE } from "@/lib/session-cookie";

/**
 * Optimistic routing only: it checks whether a session cookie is *present*, not
 * whether it is valid, because verification belongs where the data is read.
 * Every signed-in screen sits under `src/app/(app)/layout.tsx`, which calls
 * getSession() and is the authority.
 *
 * Note this deliberately does not bounce signed-in users away from /login and
 * /signup. Those pages verify the session themselves and redirect, and doing it
 * here on cookie presence alone would loop forever on an expired token:
 * /login -> /dashboard -> (invalid) -> /login.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const matches = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

  const isStudentRoute = PROTECTED_PATHS.some(matches);
  const isTeacherRoute = TEACHER_PROTECTED_PATHS.some(matches);

  if (!isStudentRoute && !isTeacherRoute) return NextResponse.next();

  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  const url = request.nextUrl.clone();
  /**
   * Teachers are bounced to *their* sign-in page.
   *
   * Sending them to `/login` would work — it is the same cookie — but it would
   * land them on a screen that talks about coursework and offers a student
   * sign-up, and the `?next=` would then carry them somewhere the student gate
   * refuses. The role check still happens in the teacher layout; this is only
   * about which door an anonymous request is shown.
   */
  url.pathname = isTeacherRoute ? "/teacher/login" : "/login";
  url.search = "";
  url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

/**
 * Kept in step with PROTECTED_PATHS by hand: `matcher` must be statically
 * analysable at build time, so it cannot be computed from the imported list.
 */
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/onboarding/:path*",
    "/ai-tutor/:path*",
    "/score-booster/:path*",
    "/mock-interviews/:path*",
    "/curriculum/:path*",
    "/assignments/:path*",
    "/notes/:path*",
    "/notifications/:path*",
    "/teacher/dashboard/:path*",
    "/teacher/assignments/:path*",
    "/teacher/notes/:path*",
    "/teacher/students/:path*",
    "/teacher/profile/:path*",
    "/timetable/:path*",
    "/notice-board/:path*",
    "/events/:path*",
    "/placements/:path*",
    "/wallet/:path*",
    "/refer/:path*",
    "/service-requests/:path*",
    "/profile/:path*",
    "/settings/:path*",
  ],
};
