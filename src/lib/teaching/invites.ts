import { createHash, randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { College } from "@/models/College";
import { TeacherInvite } from "@/models/TeacherInvite";
import { absoluteUrl } from "@/lib/app-url";
import {
  DEFAULT_TEACHER_SIGNUP_MODE,
  INVITE_TTL_DAYS,
  emailMatchesDomains,
  normaliseDomain,
  teacherAutoApproveEnabled,
  type TeacherSignupMode,
} from "@/lib/teaching/fields";

/**
 * Who may become a teacher, and how a college says so.
 *
 * One question runs through this file: *may this address claim a teacher
 * account at this college?* Everything else — issuing invitations, listing
 * them, revoking them — exists so that a college can answer it in advance.
 *
 * The answer used to be "anyone, at any college", which is fine with one
 * institution and untenable with three hundred: it lets anybody bury any
 * college's approval queue, and it leaves the administrator approving with
 * nothing to check an identity against.
 */

const TOKEN_BYTES = 32;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteUrlFor(token: string): string {
  return absoluteUrl(`/signup?role=teacher&invite=${encodeURIComponent(token)}`);
}

// ── The policy ────────────────────────────────────────────────────────────

export type CollegePolicy = {
  collegeId: string;
  collegeName: string;
  mode: TeacherSignupMode;
  allowedDomains: string[];
  autoApprove: boolean;
};

export async function policyFor(collegeId: string): Promise<CollegePolicy | null> {
  await connectDB();
  if (!Types.ObjectId.isValid(collegeId)) return null;

  const college = await College.findById(collegeId)
    .select("name status teacherSignup")
    .lean();

  if (!college) return null;

  return {
    collegeId: String(college._id),
    collegeName: college.name,
    /**
     * Absent means invite-only.
     *
     * The default is the safe direction: a college that has configured nothing
     * should not be claimable by anyone who can find it in a dropdown.
     */
    mode: (college.teacherSignup?.mode as TeacherSignupMode) ?? DEFAULT_TEACHER_SIGNUP_MODE,
    allowedDomains: (college.teacherSignup?.allowedDomains ?? []).map(normaliseDomain),
    /**
     * The platform-wide env flag still works, as a floor rather than a
     * replacement: a deployment that turned it on is trusting every college, and
     * a college can additionally turn it on for itself.
     */
    autoApprove: college.teacherSignup?.autoApprove === true || teacherAutoApproveEnabled(),
  };
}

export type Eligibility =
  | { ok: true; policy: CollegePolicy; via: "invite" | "domain" | "open"; inviteId?: string }
  | { ok: false; code: EligibilityFailure; message: string };

export type EligibilityFailure =
  | "unknown-college"
  | "invite-required"
  | "invite-invalid"
  | "invite-expired"
  | "invite-used"
  | "invite-wrong-email"
  | "invite-wrong-college"
  | "domain-mismatch";

/**
 * May this address claim a teacher account at this college?
 *
 * The single gate. Both the signup route and the form's pre-check call it, so
 * what the screen offers and what the server accepts cannot drift apart.
 *
 * An invitation is checked **first and regardless of mode**: a college that has
 * since switched to `domain` should not invalidate the invitations it has
 * already sent, and somebody holding one has a stronger claim than any policy
 * default.
 */
export async function checkEligibility(input: {
  collegeId: string;
  email: string;
  inviteToken?: string | null;
}): Promise<Eligibility> {
  const policy = await policyFor(input.collegeId);
  if (!policy) {
    return { ok: false, code: "unknown-college", message: "Choose your college from the list." };
  }

  const email = input.email.trim().toLowerCase();

  if (input.inviteToken?.trim()) {
    const invite = await TeacherInvite.findOne({
      tokenHash: hashToken(input.inviteToken.trim()),
    }).lean();

    if (!invite) {
      return {
        ok: false,
        code: "invite-invalid",
        message: "That invitation link is not valid. Ask your college to send a new one.",
      };
    }
    if (invite.revokedAt) {
      return {
        ok: false,
        code: "invite-invalid",
        message: "That invitation has been withdrawn. Ask your college to send a new one.",
      };
    }
    if (invite.acceptedAt) {
      return {
        ok: false,
        code: "invite-used",
        message: "That invitation has already been used. Sign in instead.",
      };
    }
    if (invite.expiresAt.getTime() <= Date.now()) {
      return {
        ok: false,
        code: "invite-expired",
        message: "That invitation has expired. Ask your college to send a new one.",
      };
    }
    if (String(invite.collegeId) !== policy.collegeId) {
      return {
        ok: false,
        code: "invite-wrong-college",
        message: "That invitation is for a different college.",
      };
    }
    /**
     * The invitation is to an **address**, not to a person.
     *
     * That is the whole control. The link can be forwarded to anybody; only the
     * mailbox it names can spend it, so possession of the link is not
     * possession of the account.
     */
    if (invite.email !== email) {
      return {
        ok: false,
        code: "invite-wrong-email",
        message: `That invitation was sent to a different address. Sign up with ${maskEmail(invite.email)}.`,
      };
    }

    return { ok: true, policy, via: "invite", inviteId: String(invite._id) };
  }

  if (policy.mode === "open") {
    return { ok: true, policy, via: "open" };
  }

  if (policy.mode === "domain") {
    if (!policy.allowedDomains.length) {
      /**
       * Configured for domains and given none. Refused rather than waved
       * through: an empty allowlist is a misconfiguration, and reading it as
       * "allow everything" turns a mistake into an open door.
       */
      return {
        ok: false,
        code: "invite-required",
        message: "This college is not accepting teacher sign-ups yet. Ask them for an invitation.",
      };
    }

    if (!emailMatchesDomains(email, policy.allowedDomains)) {
      return {
        ok: false,
        code: "domain-mismatch",
        message: `Use your ${policy.collegeName} email address (${policy.allowedDomains
          .map((domain) => `@${domain}`)
          .join(" or ")}), or ask for an invitation.`,
      };
    }

    return { ok: true, policy, via: "domain" };
  }

  return {
    ok: false,
    code: "invite-required",
    message: `${policy.collegeName} invites its teachers. Ask them to send you an invitation link.`,
  };
}

/**
 * `r****h@vrsec.ac.in` — enough for the right person to recognise their own
 * address, not enough to hand somebody else's to a stranger holding the link.
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "that address";
  const head = local.slice(0, 1);
  const tail = local.length > 2 ? local.slice(-1) : "";
  return `${head}${"*".repeat(Math.max(local.length - 2, 1))}${tail}@${domain}`;
}

/** Spend an invitation. Conditional, so two signups racing on one cannot both win. */
export async function consumeInvite(inviteId: string, userId: string): Promise<boolean> {
  await connectDB();

  const claimed = await TeacherInvite.findOneAndUpdate(
    { _id: inviteId, acceptedAt: null, revokedAt: null },
    { $set: { acceptedAt: new Date(), acceptedByUserId: new Types.ObjectId(userId) } }
  );

  return claimed !== null;
}

// ── Configuring ───────────────────────────────────────────────

export type SetPolicyResult =
  | { ok: true; policy: CollegePolicy }
  | { ok: false; code: string; message: string };

/**
 * Change who may become a teacher at a college.
 *
 * The policy lived only in the database until now, so changing it meant an
 * administrator asking an engineer to run an update — which in practice meant
 * every college stayed on the default forever, including the ones the default
 * is wrong for.
 *
 * Three things are refused here rather than in the form, because the form is
 * not the only caller and a policy that silently means something other than it
 * says is worse than an error:
 *
 *   - `domain` with no usable domain, which `checkEligibility` reads as
 *     "refuse everyone". An administrator choosing it means the opposite, and
 *     would discover the mistake only when a teacher could not sign up.
 *   - a domain that normalises to nothing, or to something with no dot in it.
 *     `localhost` or a typo like `vrsec` matches no real address, and an
 *     allowlist that matches nothing is the same silent refusal.
 *   - a public mailbox provider. `gmail.com` on the allowlist is not a weaker
 *     policy than `open`, it is a worse one: it reads as "our staff" and means
 *     "anybody at all", and nobody reviewing the setting later would see it.
 */
export async function setPolicy(input: {
  collegeId: string;
  mode: TeacherSignupMode;
  allowedDomains?: string[];
  autoApprove?: boolean;
}): Promise<SetPolicyResult> {
  await connectDB();
  if (!Types.ObjectId.isValid(input.collegeId)) {
    return { ok: false, code: "unknown-college", message: "That college does not exist." };
  }

  const domains: string[] = [];
  for (const raw of input.allowedDomains ?? []) {
    const domain = normaliseDomain(raw);
    if (!domain) continue;

    if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) {
      return {
        ok: false,
        code: "bad-domain",
        message: `"${raw.trim()}" is not a domain. Use the part after the @, like vrsec.ac.in.`,
      };
    }

    if (PUBLIC_MAILBOX_DOMAINS.has(domain)) {
      return {
        ok: false,
        code: "public-domain",
        message: `${domain} is a public email provider — allowing it would let anyone register. Use "Anyone" if that is what you mean.`,
      };
    }

    if (!domains.includes(domain)) domains.push(domain);
  }

  if (input.mode === "domain" && domains.length === 0) {
    return {
      ok: false,
      code: "no-domains",
      message: "Add at least one email domain, or choose a different setting.",
    };
  }

  const updated = await College.findByIdAndUpdate(
    input.collegeId,
    {
      $set: {
        "teacherSignup.mode": input.mode,
        /**
         * Kept rather than cleared when the mode moves away from `domain`.
         *
         * An administrator switching to invite-only for a term and back should
         * not have to retype the list, and the domains are inert while the mode
         * is anything else — `checkEligibility` never reads them.
         */
        ...(input.mode === "domain" ? { "teacherSignup.allowedDomains": domains } : {}),
        "teacherSignup.autoApprove": input.autoApprove === true,
      },
    },
    { returnDocument: "after" }
  )
    .select("_id")
    .lean();

  if (!updated) {
    return { ok: false, code: "unknown-college", message: "That college does not exist." };
  }

  // Re-read through `policyFor` so the caller sees what the gate will actually
  // do, including the platform-wide auto-approve floor.
  const policy = await policyFor(input.collegeId);
  if (!policy) {
    return { ok: false, code: "unknown-college", message: "That college does not exist." };
  }

  return { ok: true, policy };
}

/**
 * Providers whose addresses anybody can get in a minute.
 *
 * Not exhaustive, and it does not need to be: this catches the mistake an
 * administrator actually makes — putting the address they use themselves on
 * the list — rather than trying to classify every domain on the internet.
 */
const PUBLIC_MAILBOX_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "rediffmail.com",
  "zoho.com",
  "mail.com",
  "yandex.com",
  "gmx.com",
]);

// ── Issuing ───────────────────────────────────────────────────────────────

export type IssueResult =
  | {
      ok: true;
      id: string;
      token: string;
      url: string;
      email: string;
      /** Denormalised onto the invitation, and what the email has to name. */
      collegeName: string;
      /** So a caller can say how long the link lasts without importing the constant. */
      expiresInDays: number;
      designation: string | null;
    }
  | { ok: false; code: string; message: string };

export async function issueInvite(input: {
  collegeId: string;
  email: string;
  designation?: string | null;
  admin: { id: string; name: string };
}): Promise<IssueResult> {
  await connectDB();

  const policy = await policyFor(input.collegeId);
  if (!policy) return { ok: false, code: "unknown-college", message: "That college does not exist." };

  const email = input.email.trim().toLowerCase();

  /**
   * An existing teacher is not re-invited.
   *
   * Sending one would produce a link that fails at sign-up with "an account with
   * that email already exists", which reads as the invitation being broken
   * rather than as it being unnecessary.
   */
  const { User } = await import("@/models/User");
  const existing = await User.findOne({ email }).select("role").lean();
  if (existing) {
    return {
      ok: false,
      code: "already-registered",
      message:
        existing.role === "teacher"
          ? "That address already has a teacher account."
          : "That address already has an account. Ask them to contact support to change its role.",
    };
  }

  const token = randomBytes(TOKEN_BYTES).toString("hex");

  try {
    const invite = await TeacherInvite.create({
      collegeId: new Types.ObjectId(input.collegeId),
      collegeName: policy.collegeName,
      email,
      tokenHash: hashToken(token),
      designation: input.designation?.trim() || null,
      invitedByAdminId: new Types.ObjectId(input.admin.id),
      invitedByName: input.admin.name,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
    });

    return {
      ok: true,
      id: String(invite._id),
      token,
      url: inviteUrlFor(token),
      email,
      collegeName: policy.collegeName,
      expiresInDays: INVITE_TTL_DAYS,
      designation: invite.designation ?? null,
    };
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { code?: number }).code === 11000) {
      return {
        ok: false,
        code: "already-invited",
        message: "That address already has an invitation outstanding. Revoke it first to send a new one.",
      };
    }
    throw err;
  }
}

export async function revokeInvite(inviteId: string, collegeId: string | null): Promise<boolean> {
  await connectDB();
  if (!Types.ObjectId.isValid(inviteId)) return false;

  const scope: Record<string, unknown> = { _id: inviteId, acceptedAt: null };
  // A college admin may only revoke their own college's invitations.
  if (collegeId) scope.collegeId = new Types.ObjectId(collegeId);

  const result = await TeacherInvite.updateOne(scope, { $set: { revokedAt: new Date() } });
  return result.modifiedCount > 0;
}

export type InviteRow = {
  id: string;
  email: string;
  collegeName: string | null;
  designation: string | null;
  invitedByName: string | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  createdAt: string;
};

export async function listInvites(options: {
  collegeId?: string | null;
  limit?: number;
}): Promise<InviteRow[]> {
  await connectDB();

  const scope: Record<string, unknown> = {};
  if (options.collegeId) scope.collegeId = new Types.ObjectId(options.collegeId);

  const rows = await TeacherInvite.find(scope)
    .sort({ createdAt: -1 })
    .limit(Math.min(options.limit ?? 50, 200))
    .lean();

  return rows.map((row) => ({
    id: String(row._id),
    email: row.email,
    collegeName: row.collegeName ?? null,
    designation: row.designation ?? null,
    invitedByName: row.invitedByName ?? null,
    status: row.acceptedAt
      ? "accepted"
      : row.revokedAt
        ? "revoked"
        : row.expiresAt.getTime() <= Date.now()
          ? "expired"
          : "pending",
    expiresAt: row.expiresAt.toISOString(),
    createdAt: (row.createdAt as Date).toISOString(),
  }));
}
