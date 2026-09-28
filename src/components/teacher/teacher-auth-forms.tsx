"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/brand";
import { PresentIcon } from "@/components/icons";

/**
 * Teacher sign-in and sign-up (§3, §6).
 *
 * A different screen from the student's, and the *same* authentication behind
 * it — `/api/teacher/login` compares the same bcrypt hash and mints the same
 * cookie. §6 asks for a separate UX, not a second auth system, and a second one
 * would be a second place to get password handling and session expiry right.
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
    <AuthShell title="Sign in" subtitle="EduPilot for teachers">
      <form onSubmit={submit} className="space-y-3.5">
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          required
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          required
        />

        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-blue-600 py-2.5 text-[14px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25"
        >
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <p className="mt-5 text-center text-[13.5px] text-slate-500">
        New here?{" "}
        <Link href="/teacher/signup" className="font-semibold text-blue-600 hover:underline">
          Create a teacher account
        </Link>
      </p>
      <p className="mt-2 text-center text-[13px] text-slate-400">
        Are you a student?{" "}
        <Link href="/login" className="hover:underline">
          Sign in here
        </Link>
      </p>
    </AuthShell>
  );
}

type College = { id: string; name: string; city: string | null; state: string | null };

export function TeacherSignupForm() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [designation, setDesignation] = useState("");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<College[]>([]);
  const [college, setCollege] = useState<College | null>(null);
  const [searching, setSearching] = useState(false);

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
          data?: { colleges?: { _id?: string; id?: string; name: string; city?: string | null; stateName?: string | null }[] };
        };

        setResults(
          (payload.data?.colleges ?? []).slice(0, 8).map((entry) => ({
            id: String(entry.id ?? entry._id),
            name: entry.name,
            city: entry.city ?? null,
            state: entry.stateName ?? null,
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
    <AuthShell title="Create a teacher account" subtitle="EduPilot for teachers">
      <form onSubmit={submit} className="space-y-3.5">
        <Field id="name" label="Full name" value={name} onChange={setName} required autoComplete="name" />
        <Field id="email" label="Email" type="email" value={email} onChange={setEmail} required autoComplete="email" />

        <div>
          <label htmlFor="college" className="block text-[12.5px] font-semibold text-slate-600">
            College
          </label>

          {college ? (
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate text-[14px] text-slate-800">
                {college.name}
              </span>
              <button
                type="button"
                onClick={() => {
                  setCollege(null);
                  setQuery("");
                }}
                className="shrink-0 text-[12.5px] font-semibold text-blue-600 hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                id="college"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Start typing your college name"
                autoComplete="off"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              />

              {searching && <p className="mt-1 text-[12px] text-slate-400">Searching...</p>}

              {visibleResults.length > 0 && (
                <ul className="mt-1 max-h-52 overflow-y-auto rounded-lg border border-slate-200">
                  {visibleResults.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCollege(entry);
                          setResults([]);
                        }}
                        className="block w-full px-3 py-2 text-left text-[13.5px] transition hover:bg-slate-50"
                      >
                        <span className="block font-medium text-slate-800">{entry.name}</span>
                        {(entry.city || entry.state) && (
                          <span className="block text-[12px] text-slate-400">
                            {[entry.city, entry.state].filter(Boolean).join(", ")}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {query.trim().length >= 2 && !searching && visibleResults.length === 0 && (
                <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">
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
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field id="employeeId" label="Employee ID (optional)" value={employeeId} onChange={setEmployeeId} />
          <Field id="designation" label="Designation (optional)" value={designation} onChange={setDesignation} />
        </div>

        <Field
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          required
          autoComplete="new-password"
          hint="At least 8 characters with a number"
        />
        <Field
          id="confirmPassword"
          label="Confirm password"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          required
          autoComplete="new-password"
        />

        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
            {error}
          </p>
        )}

        <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-slate-500">
          {/* Said before they sign up, not discovered afterwards (§4). */}
          Your college approves teacher accounts. You can sign in and look around straight away;
          publishing to students opens up once they approve you.
        </p>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-blue-600 py-2.5 text-[14px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25"
        >
          {busy ? "Creating..." : "Create account"}
        </button>
      </form>

      <p className="mt-5 text-center text-[13.5px] text-slate-500">
        Already have an account?{" "}
        <Link href="/teacher/login" className="font-semibold text-blue-600 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f9fc] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="inline-flex items-center gap-2.5">
            <BrandMark className="h-9 w-9" />
            <span className="text-[20px] font-bold tracking-tight text-slate-900">EduPilot</span>
          </span>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-900/5 px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
            <PresentIcon className="h-3.5 w-3.5" />
            {subtitle}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
          <h1 className="text-[20px] font-bold tracking-tight text-slate-900">{title}</h1>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  required,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[12.5px] font-semibold text-slate-600">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
      />
      {hint && <p className="mt-1 text-[12px] text-slate-400">{hint}</p>}
    </div>
  );
}
