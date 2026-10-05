"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  FormMessage,
  INPUT_PLAIN,
  LABEL,
  PasswordField,
  TextField,
} from "@/components/auth/fields";
import { SubmitButton } from "@/components/auth/submit-button";
import { GraduationCapIcon, LockIcon, MailIcon, UserIcon } from "@/components/icons";

/**
 * Teacher sign-in and sign-up (§3, §6).
 *
 * A different screen from the student's, and the *same* authentication behind
 * it — `/api/teacher/login` compares the same bcrypt hash and mints the same
 * cookie. §6 asks for a separate UX, not a second auth system, and a second one
 * would be a second place to get password handling and session expiry right.
 *
 * The same reasoning applies to the chrome. These forms used to render their
 * own page shell and their own inputs, which is how they ended up light-only,
 * without a show-password toggle and a size apart from the student forms. They
 * are now plain forms: the page supplies `AuthShell`, and every field comes
 * from `components/auth/fields.tsx`.
 *
 * The college picker is the piece that matters (§3). It searches the approved
 * directory and submits an **id**: free text would put two spellings of one
 * institution into the system and leave the audience resolver unable to match
 * either against a student.
 */

export function TeacherLoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/teacher/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, remember: true }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { data?: { next?: string }; error?: { message?: string } }
        | null;

      if (!response.ok) {
        setError(payload?.error?.message ?? "Invalid email or password");
        return;
      }

      router.push(next || payload?.data?.next || "/teacher/dashboard");
      router.refresh();
    } catch {
      setError("The connection dropped. Check your network and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <FormMessage>{error}</FormMessage>}

        <TextField
          label="Email address"
          name="email"
          type="email"
          placeholder="Enter your email"
          autoComplete="email"
          icon={<MailIcon />}
          value={email}
          onChange={setEmail}
        />

        <PasswordField
          label="Password"
          name="password"
          placeholder="Enter your password"
          autoComplete="current-password"
          icon={<LockIcon />}
          value={password}
          onChange={setPassword}
        >
          <div className="mt-1.5 text-right">
            <Link
              href="/forgot-password"
              className="text-[12.5px] font-medium text-blue-600 transition hover:text-blue-700 hover:underline dark:text-blue-400"
            >
              Forgot password?
            </Link>
          </div>
        </PasswordField>

        <div className="pt-1">
          <SubmitButton pending={busy}>Sign in</SubmitButton>
        </div>
      </form>

      <p className="mt-6 text-center text-[13px] text-slate-500 dark:text-slate-400">
        New here?{" "}
        <Link
          href="/signup?role=teacher"
          className="font-semibold text-blue-600 transition hover:text-blue-700 hover:underline dark:text-blue-400"
        >
          Create a teacher account
        </Link>
      </p>
      <p className="mt-2 text-center text-[13px] text-slate-400 dark:text-slate-500">
        Are you a student?{" "}
        <Link href="/login" className="hover:underline">
          Sign in here
        </Link>
      </p>
    </>
  );
}

/**
 * Shaped like `CollegeSuggestion` from `lib/colleges.ts`, which is what the
 * search endpoint returns. It used to be read as `city` and `stateName`, fields
 * that endpoint has never sent — so the second line under each result was
 * always blank and two colleges of the same name were indistinguishable.
 */
type College = { id: string; name: string; location: string | null };

/**
 * An invitation, already verified on the server.
 *
 * When present the address and the college are **fixed**: the invitation was
 * issued to that mailbox at that institution, and letting either be edited
 * would turn a link somebody was given into a way to register as anybody,
 * anywhere. The server re-checks both on submit regardless.
 */
export type ResolvedInvite = {
  token: string;
  email: string;
  collegeId: string;
  collegeName: string;
  designation: string | null;
};

type CollegePolicy = {
  mode: string;
  allowedDomains: string[];
  blurb: string;
  selfServe: boolean;
};

export function TeacherSignupForm({ invite = null }: { invite?: ResolvedInvite | null }) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState(invite?.email ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [designation, setDesignation] = useState(invite?.designation ?? "");

  const [query, setQuery] = useState(invite?.collegeName ?? "");
  const [results, setResults] = useState<College[]>([]);
  const [college, setCollege] = useState<College | null>(
    invite ? { id: invite.collegeId, name: invite.collegeName, location: null } : null
  );
  const [searching, setSearching] = useState(false);

  /**
   * What the chosen college requires, fetched when one is picked.
   *
   * Only changes what the screen *says*. `checkEligibility` decides on submit,
   * so a stale or skipped policy cannot let anybody through — it would only
   * mean being refused after filling the form instead of before.
   */
  const [policy, setPolicy] = useState<CollegePolicy | null>(null);

  useEffect(() => {
    // An invitation outranks the policy: it works whatever mode the college is
    // in, so there is nothing to fetch.
    if (invite || !college) return;

    let live = true;
    fetch(`/api/teacher/signup/policy?collegeId=${encodeURIComponent(college.id)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (live && payload?.data) setPolicy(payload.data as CollegePolicy);
      })
      .catch(() => undefined);

    return () => {
      live = false;
    };
  }, [college, invite]);

  /**
   * Derived, not cleared in the effect.
   *
   * Clearing state from an effect body is a second render for something the
   * render already knows — and the lint rule that catches it is right: a stale
   * policy would otherwise flash against a newly chosen college.
   */
  const visiblePolicy = invite || !college ? null : policy;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Derived, so a shortened query hides the stale list without a write. */
  const visibleResults = college || query.trim().length < 2 ? [] : results;

  /**
   * Debounced, because this runs a regex query per keystroke on the server.
   * 250ms is below the threshold where typing feels laggy and well above the
   * rate at which a fast typist would fire one request per character.
   */
  /**
   * Nothing is cleared synchronously here.
   *
   * Clearing `results` in the effect body would be a `setState` during render's
   * commit — a cascading render for a list the UI already hides on a short
   * query. `visibleResults` below derives that instead, and the effect only
   * ever writes from inside the debounce callback.
   */
  useEffect(() => {
    if (college) return;
    if (query.trim().length < 2) return;

    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/colleges/search?q=${encodeURIComponent(query.trim())}`);
        const payload = (await response.json()) as {
          data?: { colleges?: { id: string; name: string; location?: string | null }[] };
        };

        setResults(
          (payload.data?.colleges ?? []).slice(0, 8).map((entry) => ({
            id: String(entry.id),
            name: entry.name,
            location: entry.location ?? null,
          }))
        );
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, college]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    if (!college) {
      setError("Choose your college from the list");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/teacher/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          confirmPassword,
          collegeId: college.id,
          employeeId: employeeId || null,
          designation: designation || null,
          inviteToken: invite?.token ?? null,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { data?: { next?: string }; error?: { message?: string } }
        | null;

      if (!response.ok) {
        setError(payload?.error?.message ?? "That could not be completed. Check the form.");
        return;
      }

      router.push(payload?.data?.next ?? "/verify-email");
      router.refresh();
    } catch {
      setError("The connection dropped. Check your network and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} noValidate className="space-y-4">
        <TextField
          label="Full name"
          name="name"
          placeholder="Enter your full name"
          autoComplete="name"
          icon={<UserIcon />}
          value={name}
          onChange={setName}
        />
        {/**
          * Fixed when an invitation was followed.
          *
          * The invitation was issued to **that mailbox**; letting the address be
          * edited would turn a link somebody was handed into a way to register
          * as anybody. The server refuses a mismatch regardless — this is so the
          * form does not invite the attempt.
          */}
        <TextField
          label="Email address"
          name="email"
          type="email"
          placeholder="Enter your email"
          autoComplete="email"
          icon={<MailIcon />}
          value={email}
          onChange={setEmail}
          readOnly={invite !== null}
          hint={invite ? "Set by your invitation." : undefined}
        />

        <div>
          <label htmlFor="college" className={LABEL}>
            College
          </label>

          {college ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-3.5 pr-3 dark:border-slate-700 dark:bg-slate-800/60">
              <GraduationCapIcon className="h-[18px] w-[18px] shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate text-[15px] text-slate-700 dark:text-slate-200">
                {college.name}
              </span>
              <button
                type="button"
                onClick={() => {
                  setCollege(null);
                  setQuery("");
                }}
                className="shrink-0 text-[12.5px] font-semibold text-blue-600 transition hover:text-blue-700 hover:underline dark:text-blue-400"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <GraduationCapIcon className="h-[18px] w-[18px]" />
                </span>
                <input
                  id="college"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Start typing your college name"
                  autoComplete="off"
                  className={`${INPUT_PLAIN} pl-10`}
                />
              </div>

              {searching && <p className="mt-1.5 text-[12px] text-slate-400 dark:text-slate-500">Searching…</p>}

              {visibleResults.length > 0 && (
                <ul className="mt-1.5 max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 shadow-sm dark:divide-slate-800 dark:border-slate-700">
                  {visibleResults.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCollege(entry);
                          setResults([]);
                        }}
                        className="block w-full px-3.5 py-2.5 text-left text-[13.5px] transition hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none dark:hover:bg-slate-800/60 dark:focus-visible:bg-slate-800/60"
                      >
                        <span className="block font-medium text-slate-800 dark:text-slate-100">
                          {entry.name}
                        </span>
                        {entry.location && (
                          <span className="mt-0.5 block text-[12px] text-slate-400 dark:text-slate-500">
                            {entry.location}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {query.trim().length >= 2 && !searching && visibleResults.length === 0 && (
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                  {/*
                    No free-text fallback (§3). A typed name would create a
                    second spelling of an institution and leave the audience
                    resolver unable to match it against any student.
                  */}
                  We could not find that college. Teacher accounts have to be attached to a college
                  already in EduPilot — ask your administrator to add it first.
                </p>
              )}
            </>
          )}

          {/**
            * What this college requires, said before the form is filled in.
            *
            * Somebody who is going to be refused should learn it here rather
            * than after typing six fields and choosing a password. The server
            * decides regardless — this only changes what the screen says.
            */}
          {visiblePolicy && !visiblePolicy.selfServe && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              This college invites its teachers. Ask them to send you an invitation link — signing up
              here will be refused without one.
            </p>
          )}

          {visiblePolicy?.mode === "domain" && visiblePolicy.allowedDomains.length > 0 && (
            <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              Use your college email address (
              {visiblePolicy.allowedDomains.map((domain) => `@${domain}`).join(" or ")}). Your account
              still needs approving before you can publish.
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Employee ID"
            name="employeeId"
            placeholder="Optional"
            value={employeeId}
            onChange={setEmployeeId}
          />
          <TextField
            label="Designation"
            name="designation"
            placeholder="Optional"
            value={designation}
            onChange={setDesignation}
          />
        </div>

        <PasswordField
          label="Password"
          name="password"
          placeholder="Create a password"
          autoComplete="new-password"
          icon={<LockIcon />}
          value={password}
          onChange={setPassword}
          hint="At least 8 characters with a number"
        />
        <PasswordField
          label="Confirm password"
          name="confirmPassword"
          placeholder="Re-enter your password"
          autoComplete="new-password"
          icon={<LockIcon />}
          value={confirmPassword}
          onChange={setConfirmPassword}
        />

        {error && <FormMessage>{error}</FormMessage>}

        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
          {/* Said before they sign up, not discovered afterwards (§4). */}
          Your college approves teacher accounts. You can sign in and look around straight away;
          publishing to students opens up once they approve you.
        </p>

        <div className="pt-1">
          <SubmitButton pending={busy}>Create account</SubmitButton>
        </div>
      </form>

      <p className="mt-6 text-center text-[13px] text-slate-500 dark:text-slate-400">
        Already have an account?{" "}
        <Link
          href="/teacher/login"
          className="font-semibold text-blue-600 transition hover:text-blue-700 hover:underline dark:text-blue-400"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
