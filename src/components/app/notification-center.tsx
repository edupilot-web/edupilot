"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BellIcon, ChevronRightIcon } from "@/components/icons";
import type { NotificationView } from "@/lib/notifications/service";

/**
 * The notification centre (§38, §87).
 *
 * Every row is a link to the thing it is about — a notification you cannot act
 * on is one that should not have been sent. Clicking marks it read *and*
 * navigates, because making the student do both is asking them to tidy up
 * after the platform.
 *
 * The list arrives server-rendered; this component exists for the read/unread
 * writes and for loading the next page.
 */
export function NotificationCenter({
  initial,
  initialCursor,
  unread,
}: {
  initial: NotificationView[];
  initialCursor: string | null;
  unread: number;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  async function markRead(id: string) {
    // Optimistic: the row is already dimming as the request goes out, and a
    // failure leaves it unread, which is the safe direction to be wrong in.
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, isRead: true } : item))
    );

    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      startTransition(() => router.refresh());
    } catch {
      // The next page load reconciles it.
    }
  }

  async function markAll() {
    setBusy(true);
    setItems((current) => current.map((item) => ({ ...item, isRead: true })));

    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  async function loadMore() {
    if (!cursor || busy) return;
    setBusy(true);

    try {
      const response = await fetch(
        `/api/notifications?cursor=${encodeURIComponent(cursor)}&limit=20`
      );
      const payload = (await response.json()) as {
        data?: { notifications?: NotificationView[]; nextCursor?: string | null };
      };

      setItems((current) => [...current, ...(payload.data?.notifications ?? [])]);
      setCursor(payload.data?.nextCursor ?? null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
            Notifications
          </h1>
          <p className="mt-1 text-[14px] text-slate-500 dark:text-slate-400">
            {unread > 0 ? `${unread} unread` : "You are up to date"}
          </p>
        </div>

        {unread > 0 && (
          <button
            type="button"
            onClick={markAll}
            disabled={busy || pending}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Mark all as read
          </button>
        )}
      </header>

      {items.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800">
            <BellIcon className="h-6 w-6" />
          </span>
          <p className="mt-3.5 text-[15px] font-semibold text-slate-800 dark:text-slate-100">
            Nothing yet
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">
            You will hear from us when a teacher sets work, shares notes, or marks something you
            handed in.
          </p>
        </div>
      ) : (
        <>
          <ul className="mt-5 space-y-1.5">
            {items.map((item) => (
              <li key={item.id}>
                <NotificationRow item={item} onRead={() => markRead(item.id)} />
              </li>
            ))}
          </ul>

          {cursor && (
            <button
              type="button"
              onClick={loadMore}
              disabled={busy}
              className="mx-auto mt-4 block rounded-lg border border-slate-200 px-4 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {busy ? "Loading..." : "Load older"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function NotificationRow({
  item,
  onRead,
}: {
  item: NotificationView;
  onRead: () => void;
}) {
  const body = (
    <>
      {/*
        Unread is an unread *dot plus a bolder title*, never colour alone.
      */}
      <span className="mt-1.5 flex h-2 w-2 shrink-0 items-center justify-center">
        {!item.isRead && <span className="h-2 w-2 rounded-full bg-blue-500" />}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`block text-[14px] leading-snug ${
            item.isRead
              ? "font-medium text-slate-600 dark:text-slate-300"
              : "font-semibold text-slate-900 dark:text-white"
          }`}
        >
          {item.title}
        </span>
        {item.message && (
          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
            {item.message}
          </span>
        )}
        <span className="mt-1 block text-[11.5px] text-slate-400 dark:text-slate-500">
          {formatRelative(item.createdAt)}
        </span>
      </span>

      {item.href && <ChevronRightIcon className="mt-2 h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />}
    </>
  );

  const className = `flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
    item.isRead
      ? "border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900"
      : "border-blue-200/70 bg-blue-50/40 dark:border-blue-500/20 dark:bg-blue-500/5"
  } hover:border-blue-300 dark:hover:border-blue-500/40`;

  /**
   * A link when there is somewhere to go, a button when there is not.
   *
   * Rendering a link with no `href` would be a control that looks clickable and
   * takes the keyboard focus for nothing — and the only notifications with no
   * destination are the ones whose entity has since been deleted.
   */
  if (!item.href) {
    return (
      <button type="button" onClick={onRead} className={className}>
        {body}
      </button>
    );
  }

  return (
    <Link href={item.href} onClick={onRead} className={className}>
      {body}
    </Link>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const minutes = Math.round((Date.now() - then) / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(iso));
}
