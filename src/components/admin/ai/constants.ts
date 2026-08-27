/**
 * Constants shared between server and client AI components.
 *
 * Its own file because `generator.ts` — where `MAX_JOB_ATTEMPTS` is authoritative
 * — imports mongoose and the provider layer. A client component importing that
 * module for one number would pull the whole server graph into the browser
 * bundle, so the value is mirrored here and the server keeps the original.
 *
 * The two are asserted equal by the guard in `generator.ts`, so they cannot
 * drift silently.
 */
export const MAX_JOB_ATTEMPTS_CLIENT = 3;
