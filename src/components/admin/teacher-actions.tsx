"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BUTTON_STYLES } from "@/components/admin/ui";
import { nextTeacherStatuses, type TeacherStatus } from "@/lib/teaching/fields";

/**
 * Approve, reject, suspend — and assign subjects (§56, §57).
 *
 * Only the transitions the server allows are offered, read from the same table
 * the API validates against. Two copies of that list is how a screen ends up
 * showing a button that always returns 409.
 *
 * Assigning subjects opens a panel rather than a separate page: it is the
 * action an administrator performs *immediately after* approving, and a
 * navigation between the two would mean finding the teacher again.
 */
export function TeacherRowActions({
  teacherId,
  status,
  name,
  canApprove,
  canAssign,
}: {
  teacherId: string;
  status: TeacherStatus;
  name: string;
  canApprove: boolean;
  canAssign: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [, startTransition] = useTransition();

  const allowed = nextTeacherStatuses(status);

  async function move(to: TeacherStatus) {
    if (busy) return;

    /**
     * A reason is asked for here because the endpoint requires one — for a
     * rejection or a suspension it is the only thing the teacher will be told.
     */
    let reason: string | null = null;
    if (to === "rejected" || to === "suspended") {
      reason = window.prompt(
        `Why are you ${to === "rejected" ? "rejecting" : "suspending"} ${name}?\n\nThey will be told this.`
      );
      if (!reason || reason.trim().length < 3) return;
    } else if (to === "active" && status === "pending") {
      const confirmed = window.confirm(
        `Approve ${name}?\n\nThey will be able to publish assignments and notes to the subjects you assign them.`
      );
      if (!confirmed) return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/teachers/${teacherId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to, reason }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? "That did not work.");
        return;
      }

      startTransition(() => router.refresh());
    } catch {
      setError("The request could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-wrap items-center justify-end gap-1.5">
      {error && (
        <span role="alert" className="text-[12px] text-rose-600 dark:text-rose-400">
          {error}
        </span>
      )}

      {canApprove && allowed.includes("active") && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void move("active")}
          className={BUTTON_STYLES.primary}
        >
          {status === "pending" ? "Approve" : "Reinstate"}
        </button>
      )}

      {canApprove && allowed.includes("rejected") && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void move("rejected")}
          className={BUTTON_STYLES.danger}
        >
          Reject
        </button>
      )}

      {canApprove && allowed.includes("suspended") && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void move("suspended")}
          className={BUTTON_STYLES.ghost}
        >
          Suspend
        </button>
      )}

      {canAssign && status === "active" && (
        <button
          type="button"
          onClick={() => setPanelOpen((open) => !open)}
          className={BUTTON_STYLES.secondary}
        >
          Subjects
        </button>
      )}

      {panelOpen && <SubjectPanel teacherId={teacherId} onClose={() => setPanelOpen(false)} />}
    </span>
  );
}

type Assigned = {
  id: string;
  subjectName: string;
  subjectCode: string;
  year: number;
  semester: number;
  status: string;
};

type Available = {
  subjectId: string;
  name: string;
  code: string;
  year: number;
  semester: number;
  branchName: string | null;
};

/**
 * The subject panel (§57).
 *
 * A modal over the list rather than a route, because assigning is a short
 * back-and-forth — add two subjects, close — and a page transition between each
 * would be three navigations to do one job.
 */
function SubjectPanel({ teacherId, onClose }: { teacherId: string; onClose: () => void }) {
  const router = useRouter();
  const [assigned, setAssigned] = useState<Assigned[] | null>(null);
  const [available, setAvailable] = useState<Available[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(query = "") {
    try {
      const response = await fetch(
        `/api/admin/teachers/${teacherId}/subjects?q=${encodeURIComponent(query)}`
      );
      const payload = (await response.json()) as {
        data?: { assigned?: Assigned[]; available?: Available[] };
      };

      setAssigned(payload.data?.assigned ?? []);
      setAvailable(payload.data?.available ?? []);
    } catch {
      setError("Could not load subjects.");
    }
  }

  // Loaded on first render of the panel rather than with the page: most rows
  // are never expanded, and fetching every teacher's subject list to render a
  // table would be one request per row.
  if (assigned === null && !busy) {
    setBusy(true);
    void load().finally(() => setBusy(false));
  }

  async function assign(subjectId: string) {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/teachers/${teacherId}/subjects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? "That could not be assigned.");
        return;
      }

      await load(search);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(assignmentId: string) {
    const confirmed = window.confirm(
      "Remove this subject?\n\nAnything they already published stays published — students are working against it. They simply cannot set anything new for this subject."
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      await fetch(`/api/admin/teachers/${teacherId}/subjects?assignmentId=${assignmentId}`, {
        method: "DELETE",
      });
      await load(search);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white">
              Subjects this teacher may publish to
            </h2>
            <p className="mt-0.5 text-[12.5px] text-slate-400">
              Without at least one, they can do nothing.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] font-medium text-slate-500 hover:underline"
          >
            Close
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
            {error}
          </p>
        )}

        <h3 className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
          Assigned
        </h3>
        {assigned && assigned.filter((entry) => entry.status === "active").length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {assigned
              .filter((entry) => entry.status === "active")
              .map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[13px] dark:border-slate-700"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-slate-800 dark:text-slate-100">
                      {entry.subjectCode} — {entry.subjectName}
                    </span>
                    <span className="block text-[12px] text-slate-400">
                      Year {entry.year}, Semester {entry.semester}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void revoke(entry.id)}
                    className="shrink-0 text-[12.5px] font-medium text-rose-600 hover:underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                </li>
              ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-slate-500">None yet.</p>
        )}

        <h3 className="mt-5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
          Add a subject
        </h3>
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            void load(event.target.value);
          }}
          placeholder="Search the college curriculum"
          className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        />

        {available.length === 0 ? (
          <p className="mt-2 text-[13px] text-slate-500">
            {search ? "Nothing matches." : "No more subjects to assign."}
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {available.map((entry) => (
              <li
                key={entry.subjectId}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[13px] dark:border-slate-700"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-800 dark:text-slate-100">
                    {entry.code} — {entry.name}
                  </span>
                  <span className="block text-[12px] text-slate-400">
                    {entry.branchName} · Year {entry.year}, Semester {entry.semester}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void assign(entry.subjectId)}
                  className="shrink-0 text-[12.5px] font-semibold text-blue-600 hover:underline disabled:opacity-50"
                >
                  Assign
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
