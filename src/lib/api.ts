import { NextResponse } from "next/server";
import { ZodError } from "zod";
import mongoose from "mongoose";
import { getSession, type SessionPayload } from "@/lib/auth";
import type { Role } from "@/models/User";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: { message, details } }, { status });
}

/** Thrown by requireAuth/requireRole; converted to a response by handleError. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireAuth(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Authentication required");
  return session;
}

export async function requireRole(...roles: Role[]): Promise<SessionPayload> {
  const session = await requireAuth();
  if (!roles.includes(session.role)) {
    throw new HttpError(403, "You do not have permission to perform this action");
  }
  return session;
}

export function assertObjectId(id: string, label = "id"): string {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new HttpError(400, `Invalid ${label}`);
  }
  return id;
}

export function handleError(err: unknown) {
  if (err instanceof HttpError) {
    return fail(err.message, err.status);
  }
  if (err instanceof ZodError) {
    return fail("Validation failed", 422, err.issues);
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return fail("Validation failed", 422, err.errors);
  }
  // Duplicate key from a unique index.
  if (typeof err === "object" && err !== null && (err as { code?: number }).code === 11000) {
    return fail("A record with those details already exists", 409);
  }
  console.error("[api] unhandled error:", err);
  return fail("Internal server error", 500);
}
