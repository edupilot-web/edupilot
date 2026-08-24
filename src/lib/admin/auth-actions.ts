"use server";

import bcrypt from "bcryptjs";
import type mongoose from "mongoose";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { consumeRateLimits } from "@/lib/rate-limit";
import { formatRetryAfter } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/admin/audit";
import { clearAdminSession, startAdminSession } from "@/lib/admin/session";
import { getCurrentAdmin } from "@/lib/admin/current-admin";
import { AdminLoginEvent, AdminUser } from "@/models/AdminUser";
import { Role } from "@/models/Role";

export type AdminLoginState = {
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your work email")
    .email("Enter a valid email address")
    .toLowerCase(),
  password: z.string().min(1, "Enter your password"),
});

/**
 * Failed sign-ins are limited per address *and* per caller.
 *
 * Per address alone lets one attacker spray a password across a thousand
 * accounts without ever tripping it; per caller alone lets a distributed
 * attempt through. Neither is sufficient, so both are counted.
 */
const LOGIN_PER_ACCOUNT = { limit: 8, windowSeconds: 15 * 60 };
const LOGIN_PER_IP = { limit: 25, windowSeconds: 15 * 60 };

/** Consecutive failures before the account is locked outright. */
const LOCKOUT_THRESHOLD = 8;
const LOCKOUT_MINUTES = 30;

/** Deliberately the same for every failure — see the comment at the call sites. */
const GENERIC_REJECTION = "Those credentials are not valid.";

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

export async function adminLoginAction(
  _prevState: AdminLoginState | undefined,
  formData: FormData
): Promise<AdminLoginState> {
  const parsed = loginSchema.safeParse({
    email: text(formData, "email"),
    password: text(formData, "password"),
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const { email, password } = parsed.data;
  const { ip, userAgent } = await callerOrigin();
  let destination = "/admin";

  try {
    await connectDB();

    const allowance = await consumeRateLimits([
      { key: `admin-login:account:${email}`, rule: LOGIN_PER_ACCOUNT },
      { key: `admin-login:ip:${ip ?? "unknown"}`, rule: LOGIN_PER_IP },
    ]);
    if (!allowance.allowed) {
      await logAttempt({ email, outcome: "locked", ip, userAgent });
      return {
        message: `Too many attempts. Try again ${formatRetryAfter(allowance.retryAfterSeconds)}.`,
      };
    }

    const admin = await AdminUser.findOne({ email }).select("+passwordHash");

    // No account, no password set (invited but never accepted), or the wrong
    // password — one message for all three. The admin sign-in page is the most
    // valuable enumeration target the platform has: "no such administrator"
    // would confirm which addresses hold admin access.
    if (!admin) {
      await logAttempt({ email, outcome: "unknown-account", ip, userAgent });
      // Compare against a throwaway hash anyway, so an unknown address does not
      // answer measurably faster than a known one.
      await bcrypt.compare(password, "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin");
      return { message: GENERIC_REJECTION };
    }

    if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
      await logAttempt({ email, adminId: admin._id, outcome: "locked", ip, userAgent });
      return { message: GENERIC_REJECTION };
    }

    if (admin.status !== "active" || !admin.passwordHash) {
      await logAttempt({ email, adminId: admin._id, outcome: "inactive", ip, userAgent });
      return { message: GENERIC_REJECTION };
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      const failures = (admin.failedLoginCount ?? 0) + 1;
      await AdminUser.updateOne(
        { _id: admin._id },
        {
          $set: {
            failedLoginCount: failures,
            ...(failures >= LOCKOUT_THRESHOLD
              ? { lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000) }
              : {}),
          },
        }
      );
      await logAttempt({ email, adminId: admin._id, outcome: "bad-password", ip, userAgent });
      return { message: GENERIC_REJECTION };
    }

    const role = await Role.findById(admin.roleId).select("slug").lean();

    await AdminUser.updateOne(
      { _id: admin._id },
      {
        $set: { lastLoginAt: new Date(), lastLoginIp: ip, failedLoginCount: 0, lockedUntil: null },
      }
    );

    await startAdminSession({
      sub: admin._id.toString(),
      email: admin.email,
      roleSlug: role?.slug ?? "unknown",
    });

    await logAttempt({ email, adminId: admin._id, outcome: "success", ip, userAgent });

    destination = safeAdminPath(text(formData, "next"));
  } catch (err) {
    console.error("[admin] sign-in failed:", err);
    return { message: "Something went wrong on our end. Please try again." };
  }

  redirect(destination);
}

export async function adminLogoutAction(): Promise<void> {
  const admin = await getCurrentAdmin();
  if (admin) {
    const { ip, userAgent } = await callerOrigin();
    await logAttempt({ email: admin.email, adminId: admin.id, outcome: "logout", ip, userAgent });
    await recordAudit({
      actor: admin,
      action: "admin.logout",
      entityType: "AdminUser",
      entityId: admin.id,
      entityLabel: admin.name,
    });
  }
  await clearAdminSession();
  redirect("/admin/login");
}

async function logAttempt(input: {
  email: string;
  adminId?: mongoose.Types.ObjectId | string | null;
  outcome: "success" | "bad-password" | "unknown-account" | "locked" | "inactive" | "logout";
  ip: string | null;
  userAgent: string | null;
}): Promise<void> {
  try {
    await AdminLoginEvent.create({
      email: input.email,
      adminId: input.adminId ?? null,
      outcome: input.outcome,
      ip: input.ip,
      userAgent: input.userAgent,
    });
  } catch (err) {
    // The security log is not worth failing a sign-in over, but a gap in it is
    // worth an operator noticing.
    console.error("[admin] could not write the login event:", err);
  }
}

async function callerOrigin(): Promise<{ ip: string | null; userAgent: string | null }> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  return {
    ip: forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || null,
    userAgent: headerList.get("user-agent")?.slice(0, 400) ?? null,
  };
}

/**
 * `?next=` is only ever followed inside the admin app.
 *
 * The student-side `safeDestination` allows any same-origin path, which would
 * let a crafted sign-in link drop an administrator onto a student screen with a
 * fresh admin session in the jar.
 */
function safeAdminPath(raw: string): string {
  if (!raw.startsWith("/admin")) return "/admin";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/admin";
  if (raw.startsWith("/admin/login")) return "/admin";
  return raw;
}
