"use client";

import Image from "next/image";
import Link from "next/link";
import { useId } from "react";

/**
 * The supplied logo artwork: the emblem on its blue tile, resized from the
 * 1254px original in public/. Set to `null` to fall back to the inline SVG
 * mark below, which needs no asset at all.
 */
const LOGO_IMAGE_SRC: string | null = "/edupilot-mark.png";

/**
 * The EduPilot emblem — the supplied artwork when LOGO_IMAGE_SRC is set,
 * otherwise an inline SVG of the same subject (mortarboard over an open book
 * with the paper plane climbing out) that needs no asset.
 *
 * The SVG's gradient ids are per-instance (useId). With a fixed id, a second
 * mark on the page reuses the first one's <defs> — and when that first mark
 * sits in a `display: none` subtree (the desktop panel, on a phone) Chrome
 * paints nothing for it, leaving only the flat-filled tassel and swoosh.
 */
export function BrandMark({ className = "" }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const capId = `ep-cap-${uid}`;
  const bookId = `ep-book-${uid}`;
  const planeId = `ep-plane-${uid}`;

  if (LOGO_IMAGE_SRC) {
    return (
      <Image
        src={LOGO_IMAGE_SRC}
        alt=""
        width={256}
        height={256}
        priority
        className={className}
      />
    );
  }

  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={capId} x1="6" y1="7" x2="42" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#152a63" />
          <stop offset="0.55" stopColor="#1e40af" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id={bookId} x1="7" y1="32" x2="41" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1e3a8a" />
          <stop offset="0.5" stopColor="#2563eb" />
          <stop offset="1" stopColor="#6d3ff5" />
        </linearGradient>
        <linearGradient id={planeId} x1="30" y1="30" x2="45" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f97316" />
          <stop offset="1" stopColor="#fbbf24" />
        </linearGradient>
      </defs>

      {/* Open book */}
      <path d="M6.5 31.5c6-2.6 12-2.4 17.5 1.4v11c-5.5-3.8-11.5-4-17.5-1.4v-11Z" fill={`url(#${bookId})`} />
      <path d="M41.5 31.5c-6-2.6-12-2.4-17.5 1.4v11c5.5-3.8 11.5-4 17.5-1.4v-11Z" fill={`url(#${bookId})`} opacity="0.85" />
      <path d="M24 32.9v11" stroke="#ffffff" strokeWidth="1.3" strokeLinecap="round" opacity="0.9" />

      {/* Mortarboard body */}
      <path
        d="M14.5 17.8v5.4c0 2.3 4.3 4.1 9.5 4.1s9.5-1.8 9.5-4.1v-5.4L24 22.2l-9.5-4.4Z"
        fill={`url(#${capId})`}
      />
      {/* Mortarboard top */}
      <path d="M23.3 6.6a1.6 1.6 0 0 1 1.4 0l18 8a1 1 0 0 1 0 1.8l-18 8a1.6 1.6 0 0 1-1.4 0l-18-8a1 1 0 0 1 0-1.8l18-8Z" fill={`url(#${capId})`} />

      {/* Gold tassel */}
      <path d="M10.4 13.4v10.4" stroke="#fbbf24" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="10.4" cy="25.4" r="2.1" fill="#fbbf24" />
      <path d="M8.8 27.2h3.2l-.7 4.4a.9.9 0 0 1-1.8 0l-.7-4.4Z" fill="#f59e0b" />

      {/* Paper plane and its climb */}
      <path d="M24.5 41c7.5-2.2 13.2-7.4 17-15.6" stroke="#f97316" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.75" />
      <path d="M44.6 17.4 30.8 25l5.4 1.8 1.4 5.6 7-15Z" fill={`url(#${planeId})`} />
      <path d="m36.2 26.8 8.4-9.4-7 15-1.4-5.6Z" fill="#ea7c0c" opacity="0.55" />
    </svg>
  );
}

/**
 * Mark plus the two-tone wordmark, linking home. `tagline` adds the
 * "Learn · Grow · Achieve" line used on the wide marketing panel.
 */
export function BrandLogo({
  className = "",
  tagline = false,
  size = "sm",
}: {
  className?: string;
  tagline?: boolean;
  /** "lg" is the marketing-header treatment; "sm" the in-app one. */
  size?: "sm" | "lg";
}) {
  const mark = size === "lg" ? "h-11 w-11" : "h-9 w-9";
  const word = size === "lg" ? "text-[26px]" : "text-[19px]";

  return (
    <Link
      href="/"
      aria-label="EduPilot home"
      className={`inline-flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${className}`}
    >
      <BrandMark className={`${mark} shrink-0`} />
      <span className="flex flex-col leading-none">
        <span className={`${word} font-bold tracking-tight text-[#152a63] dark:text-white`}>
          Edu<span className="text-blue-600 dark:text-blue-400">Pilot</span>
        </span>
        {tagline && (
          <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">
            Learn <span className="text-amber-500">·</span> Grow{" "}
            <span className="text-amber-500">·</span> Achieve
          </span>
        )}
      </span>
    </Link>
  );
}
