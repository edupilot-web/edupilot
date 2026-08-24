import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { activeTransport, isEmailConfigured } from "@/lib/email/emailService";
import { BackgroundJob, ErrorLog } from "@/models/SystemModels";
import { College } from "@/models/College";
import { User } from "@/models/User";

/**
 * Measures platform health at the moment it is called.
 *
 * Lives here rather than in the page component for a reason beyond tidiness:
 * timing a request means reading the clock, and reading the clock during render
 * makes a component impure — the same render would produce a different result.
 * The measurement is a side effect, so it happens in a function the component
 * awaits, and the component renders the answer.
 */
export type HealthReport = {
  database: {
    ok: boolean;
    error: string | null;
    connectMs: number;
    pingMs: number;
    name: string | null;
    host: string | null;
    collections: number | null;
    dataSize: number | null;
    indexSize: number | null;
  };
  email: { ready: boolean; transport: string };
  volume: { colleges: number; users: number };
  operations: { failedJobs: number; errorGroups24h: number };
  totalMs: number;
  runtime: string;
  environment: string;
};

export async function measureHealth(): Promise<HealthReport> {
  const startedAt = Date.now();

  await connectDB();
  const connectMs = Date.now() - startedAt;

  let ok = true;
  let error: string | null = null;
  const pingStart = Date.now();
  try {
    await mongoose.connection.db?.admin().ping();
  } catch (err) {
    ok = false;
    error = err instanceof Error ? err.message : "Ping failed";
  }
  const pingMs = Date.now() - pingStart;

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [colleges, users, failedJobs, errorGroups24h, stats] = await Promise.all([
    // Estimated, not counted: an exact count of a large collection is a scan,
    // and the health page should never be the slow one.
    College.estimatedDocumentCount(),
    User.estimatedDocumentCount(),
    BackgroundJob.countDocuments({ status: "failed" }),
    ErrorLog.countDocuments({ lastSeenAt: { $gte: dayAgo } }),
    mongoose.connection.db?.stats().catch(() => null) ?? Promise.resolve(null),
  ]);

  let transport = "unknown";
  try {
    transport = activeTransport().name;
  } catch {
    transport = "misconfigured";
  }

  return {
    database: {
      ok,
      error,
      connectMs,
      pingMs,
      name: mongoose.connection.name ?? null,
      host: mongoose.connection.host ?? null,
      collections: stats?.collections ?? null,
      dataSize: stats?.dataSize ?? null,
      indexSize: stats?.indexSize ?? null,
    },
    email: { ready: isEmailConfigured(), transport },
    volume: { colleges, users },
    operations: { failedJobs, errorGroups24h },
    totalMs: Date.now() - startedAt,
    runtime: process.version,
    environment: process.env.NODE_ENV ?? "development",
  };
}
