import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { searchColleges } from "@/lib/colleges";
import { consumeRateLimit } from "@/lib/rate-limit";
import { fail, handleError, ok } from "@/lib/api";

/**
 * Autocomplete for the college field.
 *
 * This used to be behind `requireAuth`, for a good reason: it is called on
 * every keystroke and runs a regex query per request, so an open version is a
 * free way to keep the database busy. Onboarding was its only caller, and by
 * then everyone has an account.
 *
 * Teacher sign-up broke that assumption. A teacher has to name their college
 * *before* they have an account, and there is deliberately no free-text
 * fallback — a typed name would put a second spelling of an institution into
 * the system and leave the audience resolver unable to match it against any
 * student. So the picker is the only way through the form, and behind
 * `requireAuth` it returned 401 on every keystroke: the field simply never
 * found anything, for every teacher, on a page with no other route forward.
 *
 * Signed out is now allowed and rate limited instead. The directory is not
 * secret — it is the list of institutions on the platform, published on the
 * sign-up page by design — so what was being protected was the query cost, and
 * a limit protects that directly.
 */

/** Generous for a person typing a name, useless for hammering the regex. */
const ANONYMOUS_SEARCHES = { limit: 40, windowSeconds: 5 * 60 };

export async function GET(req: NextRequest) {
  try {
    if (!(await hasSession())) {
      const limit = await consumeRateLimit(`colleges:search:${callerKey(req)}`, ANONYMOUS_SEARCHES);
      if (!limit.allowed) {
        return fail("Too many searches. Wait a moment and try again.", 429);
      }
    }

    const query = req.nextUrl.searchParams.get("q") ?? "";
    const colleges = await searchColleges(query);

    return ok({ colleges });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Whether this caller has a session, without letting the question fail the
 * request.
 *
 * `getSession` reads `cookies()`, which throws outside a request scope rather
 * than returning nothing. Treating that as "no session" is the safe direction:
 * the caller is rate limited rather than let through unmetered, and a question
 * asked only to decide whether to meter should never be the reason a public
 * lookup returns 500.
 */
async function hasSession(): Promise<boolean> {
  try {
    return (await getSession()) !== null;
  } catch {
    return false;
  }
}

/**
 * Who to count this against.
 *
 * `x-forwarded-for` is client-controlled unless a proxy overwrites it, so a
 * determined caller can spread themselves across made-up addresses. That is
 * accepted: this guards the cost of a query on a public directory, not access
 * to anything, and the alternative — refusing everyone without a session —
 * is the failure being fixed.
 */
function callerKey(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
