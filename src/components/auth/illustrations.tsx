import type { ReactNode } from "react";

/**
 * Flat-shape illustrations for the marketing panel. Hand-authored SVG rather
 * than image files, so there is nothing to fetch and both scale cleanly.
 */

const SKIN = "#f7c9a3";
const SKIN_DARK = "#e8b08a";
const HAIR = "#27272a";

/** A white circle carrying a small icon, floating around the figures. */
function FloatingChip({ x, y, r, children }: { x: number; y: number; r: number; children: ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} fill="#ffffff" />
      <circle r={r} fill="none" stroke="#dbeafe" strokeWidth="1.5" />
      <g transform={`translate(${-r * 0.58} ${-r * 0.58}) scale(${(r * 1.16) / 24})`}>{children}</g>
    </g>
  );
}

/** Two students sharing a tablet — the sign-in panel. */
export function StudyingTogetherIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 264" className={className} role="img" aria-label="Two students studying together">
      <ellipse cx="160" cy="140" rx="132" ry="106" fill="#dbeafe" opacity="0.5" />
      <circle cx="40" cy="62" r="20" fill="#eff6ff" />
      <circle cx="288" cy="184" r="14" fill="#eff6ff" />
      <ellipse cx="160" cy="234" rx="104" ry="11" fill="#bfdbfe" opacity="0.6" />

      {/* Left student, blue hoodie */}
      <g>
        <rect x="96" y="188" width="17" height="48" rx="8.5" fill="#1e3a8a" />
        <rect x="119" y="188" width="17" height="48" rx="8.5" fill="#1d4ed8" />
        <rect x="90" y="230" width="27" height="9" rx="4.5" fill="#0f172a" />
        <rect x="116" y="230" width="27" height="9" rx="4.5" fill="#1e293b" />
        <path d="M92 132a24 24 0 0 1 24-24h4a24 24 0 0 1 24 24v52a6 6 0 0 1-6 6H98a6 6 0 0 1-6-6v-52Z" fill="#2563eb" />
        <path d="M104 110c4 8 6 20 6 30h-8c0-12-1-22-4-28l6-2Z" fill="#1d4ed8" />
        <rect x="106" y="102" width="25" height="12" rx="6" fill="#93c5fd" />
        <circle cx="118" cy="84" r="19" fill={SKIN} />
        <path d="M99 82a19 19 0 0 1 38 0c-2-13-8-18-19-18S101 70 99 82Z" fill={HAIR} />
        <path d="M140 146c10 4 18 10 24 18l-9 7c-6-7-12-11-19-14l4-11Z" fill="#3b82f6" />
        <circle cx="164" cy="172" r="7" fill={SKIN} />
      </g>

      {/* Right student, amber jacket */}
      <g>
        <rect x="182" y="188" width="17" height="48" rx="8.5" fill="#334155" />
        <rect x="205" y="188" width="17" height="48" rx="8.5" fill="#1e293b" />
        <rect x="176" y="230" width="27" height="9" rx="4.5" fill="#0f172a" />
        <rect x="202" y="230" width="27" height="9" rx="4.5" fill="#1e293b" />
        <path d="M178 134a24 24 0 0 1 24-24h4a24 24 0 0 1 24 24v50a6 6 0 0 1-6 6h-40a6 6 0 0 1-6-6v-50Z" fill="#f59e0b" />
        <path d="M201 110h6v74h-6z" fill="#fbbf24" />
        <circle cx="204" cy="86" r="19" fill={SKIN} />
        <path d="M185 88c-1-16 7-26 19-26s20 10 19 26c3-22-6-33-19-33s-22 11-19 33Z" fill={HAIR} />
        <path d="M185 84c-5 2-7 10-5 18 3 9 8 12 10 10 2-3-3-8-3-15 0-6 1-11-2-13Z" fill={HAIR} />
        <path d="M223 84c5 2 7 10 5 18-3 9-8 12-10 10-2-3 3-8 3-15 0-6-1-11 2-13Z" fill={HAIR} />
        <path d="M182 150c-8 6-13 13-15 22l11 4c2-7 6-12 11-16l-7-10Z" fill="#fbbf24" />
        <circle cx="176" cy="178" r="7" fill={SKIN_DARK} />
      </g>

      {/* The tablet they are both looking at */}
      <g transform="rotate(-8 172 176)">
        <rect x="146" y="156" width="52" height="38" rx="5" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
        <rect x="152" y="163" width="30" height="4" rx="2" fill="#bfdbfe" />
        <rect x="152" y="171" width="40" height="4" rx="2" fill="#e2e8f0" />
        <rect x="152" y="179" width="24" height="4" rx="2" fill="#e2e8f0" />
      </g>

      <FloatingChip x={52} y={128} r={19}>
        <path d="M4 18V9m5 9V5m5 13v-6m5 6V7" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" />
      </FloatingChip>
      <FloatingChip x={264} y={92} r={17}>
        <path d="M20 11a7.5 7.5 0 0 1-11 6.7L4 19l1.4-4.6A7.5 7.5 0 1 1 20 11Z" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="round" />
      </FloatingChip>
      <FloatingChip x={242} y={40} r={14}>
        <path
          d="M12 4 2 8.5l10 4.5 10-4.5L12 4ZM6.5 11v3.8c0 1.5 2.5 2.7 5.5 2.7s5.5-1.2 5.5-2.7V11"
          fill="none"
          stroke="#10b981"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </FloatingChip>
    </svg>
  );
}

/** One student at a laptop, ringed by subject chips — the sign-up panel. */
export function BuildingFutureIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 264" className={className} role="img" aria-label="A student working at a laptop">
      <ellipse cx="160" cy="142" rx="130" ry="104" fill="#dbeafe" opacity="0.5" />
      <circle cx="44" cy="196" r="16" fill="#eff6ff" />
      <ellipse cx="160" cy="236" rx="98" ry="11" fill="#bfdbfe" opacity="0.6" />

      {/* Seated figure */}
      <g>
        <path d="M116 214c0-9 8-15 22-15h26c12 0 20 7 20 15 0 5-4 8-11 8h-46c-7 0-11-3-11-8Z" fill="#1e3a8a" />
        <path d="M132 199c-6-3-9-8-8-13l14 3c-1 4-2 8-6 10Z" fill="#1d4ed8" />
        <path d="M133 140a26 26 0 0 1 26-26h2a26 26 0 0 1 26 26v42a6 6 0 0 1-6 6h-42a6 6 0 0 1-6-6v-42Z" fill="#2563eb" />
        <path d="M135 152c-8 8-12 18-13 28l12 2c1-8 4-15 9-20l-8-10Z" fill="#3b82f6" />
        <path d="M185 152c8 8 12 18 13 28l-12 2c-1-8-4-15-9-20l8-10Z" fill="#3b82f6" />
        <path d="M137 92c0-14 10-23 23-23s23 9 23 23v10c0 6-3 9-8 9h-30c-5 0-8-3-8-9V92Z" fill={HAIR} />
        <circle cx="160" cy="98" r="18" fill={SKIN} />
        <path d="M141 96c-2-15 6-24 19-24s21 9 19 24c2-19-5-28-19-28s-21 9-19 28Z" fill={HAIR} />
        <path d="M140 92c-6 4-8 22-4 36 2 7 8 9 9 6 2-5-4-14-3-24 1-7 3-15-2-18Z" fill={HAIR} />
        <path d="M180 92c6 4 8 22 4 36-2 7-8 9-9 6-2-5 4-14 3-24-1-7-3-15 2-18Z" fill={HAIR} />
      </g>

      {/* Laptop */}
      <g>
        <path d="M124 182h72l8 24h-88l8-24Z" fill="#e2e8f0" />
        <rect x="112" y="204" width="96" height="8" rx="4" fill="#cbd5e1" />
        <rect x="132" y="146" width="56" height="38" rx="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
        <rect x="139" y="153" width="30" height="4" rx="2" fill="#bfdbfe" />
        <rect x="139" y="161" width="42" height="4" rx="2" fill="#eef2f7" />
        <rect x="139" y="169" width="26" height="4" rx="2" fill="#eef2f7" />
      </g>

      <FloatingChip x={230} y={68} r={22}>
        <path d="M12 4 2 8.5l10 4.5 10-4.5L12 4ZM6 11.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round" />
      </FloatingChip>
      <FloatingChip x={70} y={110} r={19}>
        <path
          d="M12 6.6C10 5 7.4 4.2 4.5 4.4v13.2c2.9-.2 5.5.6 7.5 2.2 2-1.6 4.6-2.4 7.5-2.2V4.4C16.6 4.2 14 5 12 6.6Zm0 0v13.2"
          fill="none"
          stroke="#10b981"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </FloatingChip>
      <FloatingChip x={254} y={142} r={17}>
        <path d="M20 11a7.5 7.5 0 0 1-11 6.7L4 19l1.4-4.6A7.5 7.5 0 1 1 20 11Z" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="round" />
      </FloatingChip>
      <FloatingChip x={92} y={54} r={14}>
        <circle cx="12" cy="8" r="4" fill="none" stroke="#6366f1" strokeWidth="2" />
        <path d="M4 20a8 8 0 0 1 16 0" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" />
      </FloatingChip>
    </svg>
  );
}
