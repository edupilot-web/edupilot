import type { Feature } from "@/components/auth/auth-shell";
import { BookIcon, CheckSquareIcon, ClipboardIcon, RobotIcon, UsersIcon } from "@/components/icons";

/**
 * What the panel beside an auth form says, per audience.
 *
 * Shared rather than declared on each page so the four auth screens — student
 * sign-up, teacher sign-up, sign-in and the teacher sign-in — cannot drift into
 * describing four different products. They were generic marketing before ("find
 * opportunities", "network with peers and mentors") for a product with neither
 * a jobs board nor a social graph; each line now names something that is
 * actually behind the form.
 */

export const STUDENT_FEATURES: Feature[] = [
  {
    icon: <BookIcon />,
    title: "Your own syllabus",
    description: "Subjects and topics for your regulation and semester",
    tone: "blue",
  },
  {
    icon: <RobotIcon />,
    title: "An AI tutor",
    description: "Answers grounded in the topic you are studying",
    tone: "indigo",
  },
  {
    icon: <ClipboardIcon />,
    title: "Assignments and notes",
    description: "Everything your teachers set, in one list",
    tone: "emerald",
  },
];

export const TEACHER_FEATURES: Feature[] = [
  {
    icon: <UsersIcon />,
    title: "Publish to a cohort",
    description: "Choose a subject; we work out who receives it",
    tone: "indigo",
  },
  {
    icon: <ClipboardIcon />,
    title: "Assignments and notes",
    description: "Set work, collect it, mark it and give feedback",
    tone: "blue",
  },
  {
    icon: <CheckSquareIcon />,
    title: "Approved by your college",
    description: "Your institution decides who can publish to its students",
    tone: "emerald",
  },
];

/** Sign-in, where the visitor already knows what the product is. */
export const SIGN_IN_FEATURES: Feature[] = [
  {
    icon: <BookIcon />,
    title: "Your semester",
    description: "Subjects, topics and the syllabus behind them",
    tone: "indigo",
  },
  {
    icon: <ClipboardIcon />,
    title: "What is due",
    description: "Assignments, submissions and marks",
    tone: "blue",
  },
  {
    icon: <RobotIcon />,
    title: "Your AI tutor",
    description: "Pick up where you left off",
    tone: "emerald",
  },
];
