/**
 * The hero scene from the design: a mortarboard on a stack of books beside a
 * laptop and a plant, ringed by floating feature badges on dotted paths.
 *
 * Drawn as SVG rather than shipped as the source 3D render so it stays sharp at
 * every breakpoint and adds no image weight. Swap in the rendered artwork if the
 * marketing asset becomes available — replace this component's <svg> with an
 * <Image>, keeping the same wrapper classes.
 */

type BadgeProps = {
  x: number;
  y: number;
  fill: string;
  shadow: string;
  children: React.ReactNode;
};

/** One floating rounded-square badge with a soft drop shadow. */
function Badge({ x, y, fill, shadow, children }: BadgeProps) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="3" y="7" width="58" height="58" rx="18" fill={shadow} opacity="0.35" />
      <rect width="58" height="58" rx="18" fill={fill} />
      <g transform="translate(14 14)" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {children}
      </g>
    </g>
  );
}

/** One book in the stack: front face, lit top face, and page block. */
function Book({
  y,
  width,
  spine,
  cover,
  top,
}: {
  y: number;
  width: number;
  spine: string;
  cover: string;
  top: string;
}) {
  const x = (300 - width) / 2;
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* Top face, skewed for the isometric read */}
      <path d={`M14 0h${width - 14}l-14 12H0Z`} fill={top} />
      {/* Front cover */}
      <rect y="12" width={width - 14} height="22" rx="4" fill={cover} />
      {/* Page block along the bottom edge */}
      <rect y="27" width={width - 14} height="7" rx="3.5" fill="#f8fafc" opacity="0.9" />
      {/* Spine shadow */}
      <rect y="12" width="7" height="22" rx="3.5" fill={spine} />
    </g>
  );
}

export function HeroIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 560 470"
      role="img"
      aria-label="A graduation cap resting on a stack of books beside a laptop, a plant, and floating icons for community, documents and ideas."
      className={className}
    >
      <defs>
        <linearGradient id="hi-laptop-screen" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#1e293b" />
          <stop offset="1" stopColor="#334155" />
        </linearGradient>
        <linearGradient id="hi-pot" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#ffffff" />
          <stop offset="1" stopColor="#e2e8f0" />
        </linearGradient>
        <linearGradient id="hi-cap" x1="0" y1="0" x2="0.6" y2="1">
          <stop stopColor="#334155" />
          <stop offset="1" stopColor="#0f172a" />
        </linearGradient>
      </defs>

      {/* Dotted grid, lower left */}
      <g fill="#bfd3f7">
        {Array.from({ length: 5 }, (_, row) =>
          Array.from({ length: 6 }, (_, col) => (
            <circle key={`${row}-${col}`} cx={18 + col * 19} cy={352 + row * 19} r="2.6" />
          ))
        )}
      </g>

      {/* Dotted connectors between the badges and the centrepiece */}
      <g
        fill="none"
        stroke="#a9c6f5"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray="0.5 9"
      >
        <path d="M150 96c46-30 104-24 140 6" />
        <path d="M404 62c40 10 62 34 70 62" />
        <path d="M494 160c-6 44-34 74-74 90" />
      </g>

      {/* Floating badges */}
      <Badge x={118} y={52} fill="#8b7cf6" shadow="#6d5bd0">
        <circle cx="10" cy="9" r="4" />
        <path d="M2.5 24c0-4.4 3.4-7.5 7.5-7.5s7.5 3.1 7.5 7.5" />
        <path d="M21 12.5a3.4 3.4 0 0 0 0-6.8M22.5 24c0-3-1-5.4-2.7-6.8" />
      </Badge>

      <Badge x={372} y={18} fill="#3b82f6" shadow="#2563eb">
        <path d="M5 2.5h12l6 6V27H5Z" />
        <path d="M16.5 2.8V9H23M9 15h9M9 20h6" />
      </Badge>

      <Badge x={462} y={104} fill="#fbbf24" shadow="#e39c07">
        <path d="M15 3.5A9 9 0 0 0 9.5 20v3h11v-3A9 9 0 0 0 15 3.5Z" transform="translate(-1 0)" />
        <path d="M10.5 26h7M11.5 29h5" />
      </Badge>

      {/* Contact shadow under the centrepiece */}
      <ellipse cx="288" cy="392" rx="150" ry="20" fill="#c7d7f5" opacity="0.5" />

      {/* Plant */}
      <g transform="translate(96 268)">
        <path
          d="M34 40c-3-14 2-27 12-34-4 13-6 24-6 34Z"
          fill="#4ade80"
        />
        <path d="M32 42c-9-11-11-25-6-35 4 12 8 22 12 30Z" fill="#22c55e" />
        <path d="M40 44c8-9 20-13 30-11-9 5-17 10-23 16Z" fill="#16a34a" />
        <path d="M36 46c-1-12 0-24 2-33" stroke="#15803d" strokeWidth="2" fill="none" strokeLinecap="round" />
        {/* Pot */}
        <path d="M18 48h44l-5 34a8 8 0 0 1-8 7H31a8 8 0 0 1-8-7Z" fill="url(#hi-pot)" />
        <rect x="14" y="42" width="52" height="10" rx="5" fill="#ffffff" />
        <path d="M23 55h36l-1 8H24Z" fill="#e8eefb" opacity="0.7" />
      </g>

      {/* Book stack — widest at the bottom */}
      <g transform="translate(0 232)">
        <Book y={96} width={214} spine="#1d4ed8" cover="#2563eb" top="#3b82f6" />
        <Book y={66} width={228} spine="#d97706" cover="#fbbf24" top="#fcd34d" />
        <Book y={36} width={206} spine="#94a3b8" cover="#c7d2fe" top="#dde3fd" />
        <Book y={6} width={220} spine="#1e3a8a" cover="#2f5fe0" top="#4b7bf5" />
      </g>

      {/* Mortarboard on top of the stack */}
      <g transform="translate(196 176)">
        {/* Crown */}
        <path d="M28 34h68v22c0 7-15 12-34 12S28 63 28 56Z" fill="url(#hi-cap)" />
        {/* Board */}
        <path d="M61 6a4 4 0 0 1 3 0l58 22a2.2 2.2 0 0 1 0 4l-58 22a4 4 0 0 1-3 0L3 32a2.2 2.2 0 0 1 0-4Z" fill="#1e293b" />
        <path d="M62.5 20 24 32l38.5 12L101 32Z" fill="#0f172a" opacity="0.45" />
        {/* Tassel */}
        <path d="M118 31v26" stroke="#fbbf24" strokeWidth="3.4" strokeLinecap="round" fill="none" />
        <circle cx="118" cy="60" r="4.6" fill="#fbbf24" />
        <path d="M114.4 63.5h7.2l-1.6 12a2 2 0 0 1-4 0Z" fill="#f59e0b" />
      </g>

      {/* Laptop */}
      <g transform="translate(378 236)">
        {/* Lid */}
        <rect x="14" y="0" width="132" height="92" rx="9" fill="#cbd5e1" />
        <rect x="21" y="7" width="118" height="78" rx="5" fill="url(#hi-laptop-screen)" />
        {/* Graduation-cap glyph on screen */}
        <g transform="translate(58 30)" fill="none" stroke="#7ea6f7" strokeWidth="2.6" strokeLinejoin="round">
          <path d="M22 2 2 10l20 8 20-8Z" />
          <path d="M9 13.5V22c0 3 5.8 5.5 13 5.5S35 25 35 22v-8.5" />
        </g>
        {/* Base */}
        <path d="M0 92h160l8 12a5 5 0 0 1-4.4 7.5H-3.6A5 5 0 0 1-8 104Z" fill="#e2e8f0" />
        <rect x="62" y="96" width="36" height="5" rx="2.5" fill="#cbd5e1" />
      </g>
    </svg>
  );
}
