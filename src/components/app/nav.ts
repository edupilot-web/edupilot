import type { ComponentType, SVGProps } from "react";
import {
  BoltIcon,
  BookIcon,
  ClipboardIcon,
  BriefcaseIcon,
  CalendarIcon,
  DashboardIcon,
  FileTextIcon,
  GiftIcon,
  MegaphoneIcon,
  RobotIcon,
  SettingsIcon,
  TicketIcon,
  UserIcon,
  VideoIcon,
  WalletIcon,
} from "@/components/icons";
import { APP_ROUTES } from "@/lib/app-routes";

export type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** One line describing the screen, shown on its placeholder page. */
  blurb: string;
};

export type NavGroup = {
  /** Rendered as the small-caps heading above the group. */
  heading: string;
  items: NavItem[];
};

/**
 * The signed-in navigation, grouped as in the design. `/dashboard` is the only
 * built screen; the rest render a placeholder that names what is coming, so no
 * sidebar entry is a dead link.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    heading: "Main",
    items: [
      {
        label: "Dashboard",
        href: APP_ROUTES.dashboard,
        icon: DashboardIcon,
        blurb: "Your day at a glance.",
      },
      {
        label: "AI Tutor",
        href: APP_ROUTES.aiTutor,
        icon: RobotIcon,
        blurb: "Ask questions about any topic in your curriculum and work through them step by step.",
      },
      {
        label: "Score Booster",
        href: APP_ROUTES.scoreBooster,
        icon: BoltIcon,
        blurb: "Targeted practice sets built from the topics you score lowest on.",
      },
      {
        label: "Mock Interviews",
        href: APP_ROUTES.mockInterviews,
        icon: VideoIcon,
        blurb: "Practise technical and HR rounds, then review the feedback on each answer.",
      },
    ],
  },
  {
    heading: "Academics",
    items: [
      {
        label: "Curriculum",
        href: APP_ROUTES.curriculum,
        icon: BookIcon,
        blurb: "Your courses, their lessons, and how far through each one you are.",
      },
      {
        label: "Assignments",
        href: APP_ROUTES.assignments,
        icon: ClipboardIcon,
        blurb: "Work your teachers have set, what is due, and what you have handed in.",
      },
      {
        label: "Notes",
        href: APP_ROUTES.notes,
        icon: FileTextIcon,
        blurb: "Lecture notes and study material shared for the subjects you are taking.",
      },
      {
        label: "Timetable",
        href: APP_ROUTES.timetable,
        icon: CalendarIcon,
        blurb: "The week's classes, rooms and staff, with today highlighted.",
      },
      {
        label: "Notice Board",
        href: APP_ROUTES.noticeBoard,
        icon: MegaphoneIcon,
        blurb: "Announcements from the department and the college, newest first.",
      },
    ],
  },
  {
    heading: "Campus",
    items: [
      {
        label: "Events",
        href: APP_ROUTES.events,
        icon: TicketIcon,
        blurb: "Workshops, fests and guest lectures you can register for.",
      },
      {
        label: "Placements",
        href: APP_ROUTES.placements,
        icon: BriefcaseIcon,
        blurb: "Open roles, eligibility, and the status of every application you have made.",
      },
      {
        label: "Campus Wallet",
        href: APP_ROUTES.wallet,
        icon: WalletIcon,
        blurb: "Balance, top-ups and a statement of campus spending.",
      },
      {
        label: "Refer & Earn",
        href: APP_ROUTES.refer,
        icon: GiftIcon,
        blurb: "Invite a friend to EduPilot and track the rewards you have earned.",
      },
    ],
  },
  {
    heading: "Support",
    items: [
      {
        label: "Service Requests",
        href: APP_ROUTES.serviceRequests,
        icon: FileTextIcon,
        blurb: "Raise a request for documents, hostel or IT support and follow its progress.",
      },
      {
        label: "My Profile",
        href: APP_ROUTES.profile,
        icon: UserIcon,
        blurb: "Your details, course, and the account you sign in with.",
      },
      {
        label: "Settings",
        href: APP_ROUTES.settings,
        icon: SettingsIcon,
        blurb: "Notification preferences, appearance and password.",
      },
    ],
  },
];

/** Flat lookup used by the placeholder pages to title themselves. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

export function navItem(href: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.href === href);
}
