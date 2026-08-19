import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

/** Shared setup for the outline icons: they inherit colour and line weight. */
function Outline({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <path d="m3 7.5 8.4 5.2a1.2 1.2 0 0 0 1.2 0L21 7.5" />
    </Outline>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <rect x="3.5" y="10.5" width="17" height="10" rx="2.5" />
      <path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" />
    </Outline>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <circle cx="12" cy="8" r="3.75" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </Outline>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Outline>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M10.6 5.7A9.9 9.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17.6 17.6 0 0 1-2.4 3.3" />
      <path d="M6.7 6.9A17.3 17.3 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 3.8-.8" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.3" />
      <path d="m3 3 18 18" />
    </Outline>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="m14.5 5-7 7 7 7" />
    </Outline>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Outline strokeWidth={3} {...props}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </Outline>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5h.01" />
    </Outline>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M15 4.5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3" />
      <path d="M10 8.5 6.5 12l3.5 3.5M6.5 12H15" />
    </Outline>
  );
}

/* ---- Feature-list icons for the marketing panel ---- */

export function CubeIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5Z" />
      <path d="M4 8l8 4.5L20 8M12 12.5V20.5" />
    </Outline>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M20.5 3.5 3.5 10.2l6.6 2.7 2.7 6.6 7.7-16Z" />
      <path d="m10.1 12.9 4.6-4.6" />
    </Outline>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <circle cx="9.5" cy="8" r="3.25" />
      <path d="M3.5 20a6 6 0 0 1 12 0" />
      <path d="M16.5 5.2a3.25 3.25 0 0 1 0 5.6M17.5 14.6A6 6 0 0 1 20.5 20" />
    </Outline>
  );
}

export function LayoutIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.75" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.75" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.75" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.75" />
    </Outline>
  );
}

export function TrendingUpIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M3.5 16.5 9 11l3.5 3.5L20.5 6.5" />
      <path d="M15 6.5h5.5V12" />
    </Outline>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2.5 2.5 0 0 1 2 1 2.5 2.5 0 0 1 2-1h4.5A1.5 1.5 0 0 1 20 5.5v11a1.5 1.5 0 0 1-1.5 1.5H14a2.5 2.5 0 0 0-2 1 2.5 2.5 0 0 0-2-1H5.5A1.5 1.5 0 0 1 4 16.5v-11Z" />
      <path d="M12 5v14" />
    </Outline>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M20.5 11.5a7.5 7.5 0 0 1-10.9 6.7L4.5 19.5l1.3-4.6A7.5 7.5 0 1 1 20.5 11.5Z" />
    </Outline>
  );
}

/** The mortarboard used in the EduPilot mark. Filled, so it reads at 16px. */
export function GraduationCapIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M11.55 3.1a1 1 0 0 1 .9 0l9 4.5a1 1 0 0 1 0 1.8l-9 4.5a1 1 0 0 1-.9 0l-9-4.5a1 1 0 0 1 0-1.8l9-4.5Z" />
      <path
        d="M5.5 11.35v3.4c0 .74.4 1.42 1.05 1.77 1.4.76 3.32 1.23 5.45 1.23s4.05-.47 5.45-1.23a2.02 2.02 0 0 0 1.05-1.77v-3.4l-2 1v2.15c-1.2.6-2.77.95-4.5.95s-3.3-.35-4.5-.95V12.35l-2-1Z"
        opacity="0.75"
      />
      <path d="M19.5 13.5a.75.75 0 0 1 .75.75v3.25a.75.75 0 0 1-1.5 0V14.25a.75.75 0 0 1 .75-.75Z" opacity="0.75" />
    </svg>
  );
}

/* ---- Third-party brand marks, in their own colours ---- */

export function GoogleIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.53 5.53 0 0 1-2.4 3.63v3.01h3.88c2.27-2.09 3.58-5.17 3.58-8.83Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.9l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.73-4.96H1.28v3.09A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.28a12 12 0 0 0 0 10.74l3.99-3.09Z" />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.61 4.58 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.63l3.99 3.09C6.22 6.87 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

export function MicrosoftIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path fill="#F25022" d="M2.5 2.5h9v9h-9z" />
      <path fill="#7FBA00" d="M12.5 2.5h9v9h-9z" />
      <path fill="#00A4EF" d="M2.5 12.5h9v9h-9z" />
      <path fill="#FFB900" d="M12.5 12.5h9v9h-9z" />
    </svg>
  );
}

export function AppleIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M17.05 12.54c.03 2.9 2.55 3.86 2.58 3.88-.02.06-.4 1.38-1.34 2.73-.8 1.17-1.64 2.33-2.96 2.35-1.3.03-1.72-.77-3.2-.77-1.49 0-1.95.75-3.18.8-1.27.04-2.24-1.25-3.05-2.41-1.76-2.55-3.1-7.2-1.3-10.35a4.86 4.86 0 0 1 4.09-2.49c1.25-.02 2.43.84 3.2.84.76 0 2.2-1.04 3.7-.89.63.03 2.4.23 3.53 1.9-.09.06-2.11 1.24-2.09 3.7M14.9 3.6c.68-.83 1.14-1.98.99-3.13-1.01.04-2.24.68-2.95 1.5-.64.73-1.2 1.9-1.05 3.02 1.13.09 2.28-.57 3.01-1.39" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <circle cx="10.75" cy="10.75" r="6.25" />
      <path d="m15.5 15.5 4 4" />
    </Outline>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M18 15.5V10a6 6 0 1 0-12 0v5.5l-1.4 2.1a.6.6 0 0 0 .5.9h13.8a.6.6 0 0 0 .5-.9L18 15.5Z" />
      <path d="M9.75 21.25a2.5 2.5 0 0 0 4.5 0" />
    </Outline>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="m6 9.5 6 5.5 6-5.5" />
    </Outline>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M3.5 7h17M3.5 12h17M3.5 17h17" />
    </Outline>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Outline>
  );
}

export function FileTextIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M13.5 2.75H7A2.25 2.25 0 0 0 4.75 5v14A2.25 2.25 0 0 0 7 21.25h10A2.25 2.25 0 0 0 19.25 19V8.5l-5.75-5.75Z" />
      <path d="M13.25 3v5.5h5.75M8.5 13h7M8.5 16.75h4.5" />
    </Outline>
  );
}

export function LightbulbIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M12 2.75a6.25 6.25 0 0 0-3.75 11.25v2h7.5v-2A6.25 6.25 0 0 0 12 2.75Z" />
      <path d="M9.75 19.25h4.5M10.5 21.75h3" />
    </Outline>
  );
}
