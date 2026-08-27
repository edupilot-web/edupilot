import type { ComponentType, SVGProps } from "react";
import {
  BellIcon,
  ChatIcon,
  DashboardIcon,
  FileTextIcon,
  SettingsIcon,
  UsersIcon,
} from "@/components/icons";

type IconProps = SVGProps<SVGSVGElement>;

/**
 * Icons the admin app needs that the student app never did.
 *
 * Same `Outline` construction as `src/components/icons.tsx` — 24-unit box,
 * 1.75 stroke, `currentColor` — so the two sets sit together without one
 * looking heavier than the other. Kept separate rather than appended to that
 * file so the student bundle does not carry admin-only glyphs.
 */
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

export function BuildingIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M3 21h18" />
      <path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
      <path d="M15 21V10a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v11" />
      <path d="M8 7h4M8 11h4M8 15h4" />
    </Outline>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M12 3 5 6v5.5c0 4.2 2.9 8.1 7 9.5 4.1-1.4 7-5.3 7-9.5V6l-7-3Z" />
    </Outline>
  );
}

export function ShieldCheckIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M12 3 5 6v5.5c0 4.2 2.9 8.1 7 9.5 4.1-1.4 7-5.3 7-9.5V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </Outline>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M3 3v16.5A1.5 1.5 0 0 0 4.5 21H21" />
      <path d="M7 15.5 11 11l3 2.5 4.5-6" />
    </Outline>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M21 15v3.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5V15" />
      <path d="M12 3v13M7.5 7.5 12 3l4.5 4.5" />
    </Outline>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M21 15v3.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5V15" />
      <path d="M12 16V3M7.5 11.5 12 16l4.5-4.5" />
    </Outline>
  );
}

export function DatabaseIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <ellipse cx="12" cy="5.5" rx="8" ry="3" />
      <path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </Outline>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M3 5h18l-7 8v5.5l-4 2V13L3 5Z" />
    </Outline>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" />
    </Outline>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="m14 6 4 4" />
    </Outline>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
      <path d="M10 11.5v5.5M14 11.5v5.5" />
    </Outline>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M20 11a8 8 0 0 0-13.7-5.3L3 9" />
      <path d="M3 4v5h5" />
      <path d="M4 13a8 8 0 0 0 13.7 5.3L21 15" />
      <path d="M21 20v-5h-5" />
    </Outline>
  );
}

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </Outline>
  );
}

export function TrendUpIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M3 17 9 11l4 4 8-8" />
      <path d="M15 7h6v6" />
    </Outline>
  );
}

export function TrendDownIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M3 7 9 13l4-4 8 8" />
      <path d="M15 17h6v-6" />
    </Outline>
  );
}

export function MapPinIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M12 21c4-4.5 7-7.9 7-11a7 7 0 1 0-14 0c0 3.1 3 6.5 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </Outline>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M10 13a4 4 0 0 0 5.7.4l3-3A4 4 0 0 0 13 4.7l-1.7 1.7" />
      <path d="M14 11a4 4 0 0 0-5.7-.4l-3 3A4 4 0 0 0 11 19.3l1.7-1.7" />
    </Outline>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <circle cx="8" cy="14" r="4" />
      <path d="m11 11 8-8 2 2-2 2 2 2-2.5 2.5L16 9.5 13.5 12" />
    </Outline>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="4" cy="6" r="1" fill="currentColor" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <circle cx="4" cy="18" r="1" fill="currentColor" />
    </Outline>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M6.5 6.5 9 9M15 15l2.5 2.5M17.5 6.5 15 9M9 15l-2.5 2.5" />
    </Outline>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Outline {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="8" r="0.9" fill="currentColor" />
    </Outline>
  );
}

/** Section glyphs, keyed by the `icon` string in `lib/admin/nav.ts`. */
export const ADMIN_SECTION_ICONS: Record<string, ComponentType<IconProps>> = {
  dashboard: DashboardIcon,
  building: BuildingIcon,
  users: UsersIcon,
  file: FileTextIcon,
  chat: ChatIcon,
  bell: BellIcon,
  chart: ChartIcon,
  shield: ShieldIcon,
  settings: SettingsIcon,
  spark: SparkIcon,
};
