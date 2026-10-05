import { cache } from "react";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { sessionIsFresh } from "@/lib/password-reset";
import type { SessionPayload } from "@/lib/auth";

/**
 * Whether a signed session is still honoured by its account.
 *
 * Sessions are stateless JWTs with no server-side store, so there is nothing to
 * delete when somebody resets their password. `User.sessionsValidFrom` records
 * the moment instead, and anything signed before it is refused.
 *
 * Its own module rather than a function in `auth.ts`, and that is the point:
 * `auth.ts` is imported by `proxy.ts`, which runs before the database is
 * reachable. Putting a query behind `getSession()` would break the proxy on
 * every request. The split keeps the proxy a cheap cookie check and puts the
 * authoritative check in the gates that were going to read the database anyway.
 *
 * Wrapped in React's `cache`, so a request that calls `requireAuth()` three
 * times pays for one read.
 */
export const sessionIsCurrent = cache(async (session: SessionPayload): Promise<boolean> => {
  await connectDB();

  const user = await User.findById(session.sub).select("sessionsValidFrom").lean();

  // The cookie outlived the account. Treated as stale rather than fresh — the
  // caller's own "no such user" handling is what should answer, not this.
  if (!user) return false;

  return sessionIsFresh(session.issuedAt, user.sessionsValidFrom);
});
