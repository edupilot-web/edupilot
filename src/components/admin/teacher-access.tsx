"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BUTTON_STYLES } from "@/components/admin/ui";
import {
  TEACHER_SIGNUP_MODE_BLURBS,
  TEACHER_SIGNUP_MODE_LABELS,
  TEACHER_SIGNUP_MODES,
  type TeacherSignupMode,
} from "@/lib/teaching/fields";

/**
 * Who may become a teacher here, and who has been asked (§6.13a).
 *
 * The gate itself has existed since teacher sign-up landed; what did not exist
 * was any way to see or change it. A college changed mode by a database edit,
 * which in practice meant no college ever changed it — every institution sat on
 * the invite-only default, including the ones it is wrong for.
 *
 * Both panels are on one screen because they are one question asked twice. An
 * administrator who sets invite-only has, by that act, taken on sending the
 * invitations, and making them navigate somewhere else to do it is how a
 * college ends up invite-only with nobody invited.
 */

const INPUT =
  "w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-900 outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

export type PolicyView = {
  collegeId: string;
  collegeName: string;
  mode: TeacherSignupMode;
  allowedDomains: string[];
  autoApprove: boolean;
};

export function SignupPolicyForm({
  policy,
  canEdit,
  /** True when `TEACHER_AUTO_APPROVE` is on platform-wide, which this cannot undo. */
  autoApproveForcedByEnv,
}: {
  policy: PolicyView;
  canEdit: boolean;
  autoApproveForcedByEnv: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<TeacherSignupMode>(policy.mode);
  const [domains, setDomains] = useState(policy.allowedDomains.join(", "));
  const [autoApprove, setAutoApprove] = useState(policy.autoApprove);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    mode !== policy.mode ||
    autoApprove !== policy.autoApprove ||
    domains !== policy.allowedDomains.join(", ");

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);

    try {
      const response = await fetch("/api/admin/teachers/signup-policy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collegeId: policy.collegeId,
          mode,
          // Split on commas and whitespace: an administrator pasting a list
          // will use one or the other and should not have to find out which.
          allowedDomains: domains.split(/[\s,]+/).filter(Boolean),
          autoApprove,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;

      if (!response.ok) {
        setError(payload?.error?.message ?? "That could not be saved.");
        return;
      }

      setSaved(true);
      router.refresh();
    } catch {
      setError("The connection dropped. Check your network and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <fieldset disabled={!canEdit} className="space-y-2.5">
        <legend className="sr-only">Who may register as a teacher</legend>
        {TEACHER_SIGNUP_MODES.map((option) => (
          <label
            key={option}
            className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition ${
              mode === option
                ? "border-slate-900 bg-slate-50 dark:border-white dark:bg-slate-800/60"
                : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/40"
            }`}
          >
            <input
              type="radio"
              name="signup-mode"
              value={option}
              checked={mode === option}
              onChange={() => {
                setMode(option);
                setSaved(false);
              }}
              className="mt-0.5 h-4 w-4 shrink-0 accent-slate-900 dark:accent-white"
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-slate-800 dark:text-slate-100">
                {TEACHER_SIGNUP_MODE_LABELS[option]}
                {option === "invite_only" && (
                  <span className="ml-1.5 text-[11.5px] font-normal text-slate-400">
                    default
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                {TEACHER_SIGNUP_MODE_BLURBS[option]}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {mode === "domain" && (
        <div>
          <label
            htmlFor="allowed-domains"
            className="mb-1 block text-[12.5px] font-medium text-slate-700 dark:text-slate-300"
          >
            Email domains
          </label>
          <input
            id="allowed-domains"
            value={domains}
            disabled={!canEdit}
            onChange={(event) => {
              setDomains(event.target.value);
              setSaved(false);
            }}
            placeholder="vrsec.ac.in, cse.vrsec.ac.in"
            className={INPUT}
          />
          <p className="mt-1 text-[12px] leading-relaxed text-slate-400 dark:text-slate-500">
            {/* Said here because the behaviour is not guessable from the field. */}
            Just the part after the @. Sub-domains are included automatically, so{" "}
            <code className="font-mono">vrsec.ac.in</code> also accepts{" "}
            <code className="font-mono">cse.vrsec.ac.in</code>.
          </p>
        </div>
      )}

      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={autoApprove}
          disabled={!canEdit || autoApproveForcedByEnv}
          onChange={(event) => {
            setAutoApprove(event.target.checked);
            setSaved(false);
          }}
          className="mt-0.5 h-4 w-4 shrink-0 accent-slate-900 dark:accent-white"
        />
        <span className="min-w-0">
          <span className="block text-[13px] font-medium text-slate-800 dark:text-slate-100">
            Approve new teachers automatically
          </span>
          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
            {autoApproveForcedByEnv
              ? "Forced on for every college by TEACHER_AUTO_APPROVE. This box cannot turn it off."
              : "Off is the safe answer. An approved teacher can publish to your students as soon as a subject is assigned."}
          </span>
        </span>
      </label>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
        >
          {error}
        </p>
      )}

      {canEdit && (
        <div className="flex items-center gap-3">
          <button type="button" onClick={save} disabled={busy || !dirty} className={BUTTON_STYLES.primary}>
            {busy ? "Saving…" : "Save"}
          </button>
          {saved && !dirty && (
            <span className="text-[12.5px] text-emerald-600 dark:text-emerald-400">Saved.</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Invite an address.
 *
 * The link comes back in the response and is shown even when the email went,
 * because it is returned exactly once — the token is stored hashed, so a
 * bounced invitation is otherwise unrecoverable and the only remedy would be
 * revoking and re-issuing.
 */
export function InviteForm({ collegeId }: { collegeId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [designation, setDesignation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ email: string; url: string; emailed: boolean } | null>(
    null
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    setIssued(null);

    try {
      const response = await fetch("/api/admin/teachers/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collegeId,
          email,
          designation: designation.trim() || undefined,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { data?: { email: string; url: string; emailed: boolean }; error?: { message?: string } }
        | null;

      if (!response.ok || !payload?.data) {
        setError(payload?.error?.message ?? "That invitation could not be sent.");
        return;
      }

      setIssued(payload.data);
      setEmail("");
      setDesignation("");
      router.refresh();
    } catch {
      setError("The connection dropped. Check your network and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2.5">
        <div className="min-w-[220px] flex-1">
          <label
            htmlFor="invite-email"
            className="mb-1 block text-[12.5px] font-medium text-slate-700 dark:text-slate-300"
          >
            Email address
          </label>
          <input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="rao@vrsec.ac.in"
            className={INPUT}
          />
        </div>
        <div className="min-w-[180px] flex-1">
          <label
            htmlFor="invite-designation"
            className="mb-1 block text-[12.5px] font-medium text-slate-700 dark:text-slate-300"
          >
            Designation
          </label>
          <input
            id="invite-designation"
            value={designation}
            onChange={(event) => setDesignation(event.target.value)}
            placeholder="Optional — Assistant Professor"
            className={INPUT}
          />
        </div>
        <button type="submit" disabled={busy} className={BUTTON_STYLES.primary}>
          {busy ? "Sending…" : "Send invitation"}
        </button>
      </form>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
        >
          {error}
        </p>
      )}

      {issued && (
        <div
          className={`rounded-lg border px-3 py-2.5 text-[12.5px] leading-relaxed ${
            issued.emailed
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
              : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
          }`}
        >
          <p className="font-medium">
            {issued.emailed
              ? `Invitation sent to ${issued.email}.`
              : `Invitation created, but the email to ${issued.email} did not go.`}
          </p>
          <p className="mt-1">
            {issued.emailed
              ? "Keep this link in case it does not arrive — it is shown once and cannot be fetched again:"
              : "Send them this link by hand. It is shown once and cannot be fetched again:"}
          </p>
          <code className="mt-1.5 block break-all rounded bg-white/70 px-2 py-1.5 font-mono text-[11.5px] dark:bg-slate-900/60">
            {issued.url}
          </code>
        </div>
      )}
    </div>
  );
}

/** Withdraw an outstanding invitation. */
export function RevokeInviteButton({ inviteId, email }: { inviteId: string; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function revoke() {
    if (busy) return;
    if (!window.confirm(`Withdraw the invitation to ${email}?\n\nThe link stops working at once.`)) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/teachers/invites?id=${encodeURIComponent(inviteId)}`,
        { method: "DELETE" }
      );
      if (response.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={revoke} disabled={busy} className={BUTTON_STYLES.danger}>
      {busy ? "Withdrawing…" : "Withdraw"}
    </button>
  );
}
