import { connectDB } from "@/lib/db";
import { RateLimit } from "@/models/RateLimit";

export type RateLimitRule = {
  /** How many attempts the window allows. */
  limit: number;
  /** Length of the window, in seconds. */
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  /** Attempts left in the current window, after this one was counted. */
  remaining: number;
  /** Whole seconds until the window resets. Only meaningful when blocked. */
  retryAfterSeconds: number;
};

/**
 * Counts one attempt against `key` and says whether it is allowed.
 *
 * Fixed windows, not a sliding log: a single upserted document per key holds
 * the counter and its own expiry, so the check is one round trip and the rows
 * disappear on their own via the TTL index. The imprecision at a window
 * boundary (up to 2x the limit across two adjacent windows) does not matter for
 * what this guards — it exists to stop a mailbox being flooded, not to meter
 * an API to the request.
 *
 * Storage failures fall open. A database that cannot serve the counter cannot
 * serve the sign-up either, so failing closed here would only turn one outage
 * into a confusing second one; the caller's own error handling covers it.
 */
export async function consumeRateLimit(
  key: string,
  rule: RateLimitRule
): Promise<RateLimitResult> {
  const now = new Date();
  const windowMs = rule.windowSeconds * 1000;

  try {
    await connectDB();

    // Reclaim a window that has already run out before counting into it: the
    // TTL sweep is periodic, so an expired row can still be sitting there.
    const reset = await RateLimit.findOneAndUpdate(
      { key, expiresAt: { $lte: now } },
      { $set: { count: 1, expiresAt: new Date(now.getTime() + windowMs) } },
      { returnDocument: "after" }
    ).lean();

    if (reset) {
      return { allowed: true, remaining: rule.limit - 1, retryAfterSeconds: 0 };
    }

    const doc = await RateLimit.findOneAndUpdate(
      { key },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date(now.getTime() + windowMs) },
      },
      { upsert: true, returnDocument: "after" }
    ).lean();

    const count = doc?.count ?? 1;
    const expiresAt = doc?.expiresAt ?? new Date(now.getTime() + windowMs);
    const retryAfterSeconds = Math.max(
      0,
      Math.ceil((expiresAt.getTime() - now.getTime()) / 1000)
    );

    return {
      allowed: count <= rule.limit,
      remaining: Math.max(0, rule.limit - count),
      retryAfterSeconds,
    };
  } catch (err) {
    console.error("[rate-limit] could not record an attempt, allowing it:", err);
    return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0 };
  }
}

/**
 * Applies several rules to the same action, e.g. a short cooldown plus an
 * hourly cap. Every rule is counted — checking them lazily would let a caller
 * who trips the first rule avoid ever registering against the others.
 */
export async function consumeRateLimits(
  entries: { key: string; rule: RateLimitRule }[]
): Promise<RateLimitResult> {
  const results = await Promise.all(
    entries.map((entry) => consumeRateLimit(entry.key, entry.rule))
  );

  const blocked = results.filter((result) => !result.allowed);
  if (blocked.length === 0) {
    return {
      allowed: true,
      remaining: Math.min(...results.map((result) => result.remaining)),
      retryAfterSeconds: 0,
    };
  }

  // Report the longest wait, so a caller told to come back is not turned away
  // again the moment the shorter window clears.
  return {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: Math.max(...blocked.map((result) => result.retryAfterSeconds)),
  };
}

/** "in 45 seconds" / "in 3 minutes" — for the message shown to the user. */
export function formatRetryAfter(seconds: number): string {
  if (seconds <= 60) return `in ${Math.max(1, seconds)} seconds`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `in ${hours} hour${hours === 1 ? "" : "s"}`;
}
