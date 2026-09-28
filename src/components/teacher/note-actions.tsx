"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { NoteStatus } from "@/lib/teaching/fields";

/**
 * Publish, archive and restore, inline on the notes list (§46).
 *
 * Inline rather than on a detail page, because these are one-click decisions
 * and a teacher reviewing a term's material should not have to open six pages
 * to tidy it. The transitions the server allows are the ones offered here — the
 * table in `teaching/fields.ts` is the authority and this mirrors it.
 */
export function NoteActions({ noteId, status }: { noteId: string; status: NoteStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function act(action: "publish" | "archive" | "restore") {
    if (busy) return;

    if (action === "archive") {
      const confirmed = window.confirm(
        "Take these notes down?\n\nThey will disappear from every student's list. Anything they saved stays saved, and you can publish them again later."
      );
      if (!confirmed) return;
    }

    setBusy(true);
    setError(null);

    try {
      const url =
        action === "publish"
          ? `/api/teacher/notes/${noteId}/publish`
          : `/api/teacher/notes/${noteId}/archive`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:
          action === "restore"
            ? JSON.stringify({ status: "published" })
            : action === "archive"
              ? JSON.stringify({ status: "archived" })
              : undefined,
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
      setError("The connection dropped.");
    } finally {
      setBusy(false);
    }
  }

  const button =
    "rounded-lg border border-slate-200 px-2.5 py-1 text-[12.5px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800";

  return (
    <div className="flex items-center gap-1.5">
      {error && (
        <span role="alert" className="text-[12px] text-rose-600 dark:text-rose-400">
          {error}
        </span>
      )}

      {status === "draft" && (
        <button type="button" disabled={busy} onClick={() => void act("publish")} className={button}>
          {busy ? "..." : "Publish"}
        </button>
      )}

      {status === "published" && (
        <button type="button" disabled={busy} onClick={() => void act("archive")} className={button}>
          {busy ? "..." : "Take down"}
        </button>
      )}

      {status === "archived" && (
        <button type="button" disabled={busy} onClick={() => void act("restore")} className={button}>
          {busy ? "..." : "Publish again"}
        </button>
      )}
    </div>
  );
}
