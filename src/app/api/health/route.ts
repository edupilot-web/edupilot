import mongoose from "mongoose";
import { connectDB } from "@/lib/db";

/**
 * Deployment diagnostics. Answers the two questions that look identical from the
 * UI: are the environment variables present, and can we actually reach MongoDB?
 *
 * Reports presence only — never a value — so no secret or connection string is
 * exposed. Safe to delete once a deployment is settled.
 */
export async function GET() {
  /**
   * A database name is not a secret, so echoing it helps. But this route is
   * public, and a misconfigured value can be anything at all — including a
   * connection string with the password in it, which is exactly what happened
   * once. So the value is only echoed when it *is* a plain database name.
   */
  const rawDbName = process.env.MONGODB_DB?.trim();
  const dbNameIsPlain = rawDbName ? /^[A-Za-z0-9_-]{1,63}$/.test(rawDbName) : false;

  const env = {
    MONGODB_URI: Boolean(process.env.MONGODB_URI?.trim()),
    MONGODB_DB: !rawDbName
      ? "(unset — defaults to edupilot)"
      : dbNameIsPlain
        ? rawDbName
        : "(invalid — expected a plain database name such as `edupilot`, not a connection string)",
    JWT_SECRET: Boolean(process.env.JWT_SECRET?.trim()),
    GOOGLE_CLIENT_ID: Boolean(process.env.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET: Boolean(process.env.GOOGLE_CLIENT_SECRET),
  };

  let database: { ok: boolean; host?: string; detail?: string };
  const startedAt = Date.now();
  try {
    await connectDB();
    await mongoose.connection.db!.admin().command({ ping: 1 });
    // The host is reported because connectDB caches its connection for the life
    // of the process: after an env change the cached connection still points at
    // the old server, so "ok" alone can be misleading. Hostname only — the
    // credentials are never part of this.
    database = { ok: true, host: mongoose.connection.host ?? "(unknown)" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    database = {
      ok: false,
      // Truncated: enough to tell a missing variable from a refused handshake.
      detail: message.slice(0, 200),
    };
  }

  const healthy = env.MONGODB_URI && env.JWT_SECRET && database.ok;
  return Response.json(
    { healthy, env, database, tookMs: Date.now() - startedAt },
    { status: healthy ? 200 : 503, headers: { "cache-control": "no-store" } }
  );
}
