/**
 * The support-request vocabulary.
 *
 * One file read by the model, the service, the API routes, the student screens
 * and the admin queue — so a category added here appears everywhere at once
 * rather than in five of the six places that care.
 *
 * ## What this desk is, and is not
 *
 * It handles **EduPilot**, and only EduPilot: an account somebody cannot get
 * into, a top-up that did not arrive, a subject list that is wrong, an AI
 * answer that was not good enough.
 *
 * It is deliberately **not** a campus help desk. There is no registrar here to
 * issue a bonafide certificate, no warden to fix a tap and no fee office to
 * chase a receipt — those requests would arrive, sit in a queue nobody could
 * act on, and teach students that raising one achieves nothing. A category the
 * platform cannot resolve is worse than no category at all.
 *
 * The category and type are a fixed list rather than free text, because that is
 * what makes a queue sortable and a target meaningful: "nine students cannot
 * sign in" is an incident, "nine assorted problems" is not.
 */

// ── Categories ────────────────────────────────────────────────────────────

export const REQUEST_CATEGORIES = [
  "account",
  "payments",
  "curriculum",
  "ai_tutor",
  "coursework",
  "technical",
  "feedback",
  "other",
] as const;
export type RequestCategory = (typeof REQUEST_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<RequestCategory, string> = {
  account: "Account & sign-in",
  payments: "Wallet & payments",
  curriculum: "Curriculum & subjects",
  ai_tutor: "AI Tutor",
  coursework: "Assignments & notes",
  technical: "Something is broken",
  feedback: "Feedback & ideas",
  other: "Something else",
};

export const CATEGORY_BLURBS: Record<RequestCategory, string> = {
  account: "Signing in, your email, your profile details.",
  payments: "Money you added, a refund, a referral reward.",
  curriculum: "Wrong subjects, missing topics, your college or branch.",
  ai_tutor: "Answers that were wrong or unhelpful, daily limits.",
  coursework: "Assignments and notes from your teachers.",
  technical: "A page that will not load, an error, something slow.",
  feedback: "A suggestion, or something you wish EduPilot did.",
  other: "Anything that does not fit above.",
};

/**
 * The specific things students report, grouped by category.
 *
 * Written as the student would describe the problem, not as the team would
 * classify it. "I cannot sign in" is what somebody types into a search box;
 * "authentication failure" is what the resulting ticket gets called.
 */
export const REQUEST_TYPES: Record<RequestCategory, { key: string; label: string }[]> = {
  account: [
    { key: "cannot_sign_in", label: "I cannot sign in" },
    { key: "verification_email", label: "My verification email never arrived" },
    { key: "wrong_details", label: "My name or email is wrong" },
    { key: "wrong_profile", label: "My college, branch or semester is wrong" },
    { key: "close_account", label: "I want my account and data deleted" },
    { key: "other", label: "Another account problem" },
  ],
  payments: [
    { key: "topup_missing", label: "I paid but my balance did not change" },
    { key: "topup_failed", label: "My payment failed or was declined" },
    { key: "refund", label: "I want a refund" },
    { key: "wrong_amount", label: "I was charged the wrong amount" },
    { key: "referral_reward", label: "A referral reward is missing" },
    { key: "other", label: "Another payment question" },
  ],
  curriculum: [
    { key: "wrong_subjects", label: "My subjects are wrong" },
    { key: "missing_topics", label: "Topics or units are missing" },
    { key: "college_missing", label: "My college is not listed" },
    { key: "wrong_regulation", label: "My regulation or semester is wrong" },
    { key: "content_error", label: "Something in the content is incorrect" },
    { key: "other", label: "Another curriculum problem" },
  ],
  ai_tutor: [
    { key: "wrong_answer", label: "An answer was wrong or misleading" },
    { key: "not_working", label: "The tutor is not answering" },
    { key: "daily_limit", label: "I have run out of questions for today" },
    { key: "other", label: "Another AI Tutor problem" },
  ],
  coursework: [
    { key: "missing_assignment", label: "An assignment is missing from my list" },
    { key: "submission_failed", label: "My submission would not go through" },
    { key: "wrong_marks", label: "My marks or feedback look wrong" },
    { key: "missing_notes", label: "Notes I was sent are not showing" },
    { key: "other", label: "Another coursework problem" },
  ],
  technical: [
    { key: "page_error", label: "A page shows an error" },
    { key: "wont_load", label: "Something will not load" },
    { key: "slow", label: "The app is very slow" },
    { key: "mobile", label: "Something is broken on my phone" },
    { key: "other", label: "Another technical problem" },
  ],
  feedback: [
    { key: "feature", label: "I would like EduPilot to do something new" },
    { key: "improvement", label: "Something could work better" },
    { key: "content", label: "A suggestion about the study material" },
    { key: "other", label: "Something else" },
  ],
  other: [{ key: "other", label: "Describe it below" }],
};

export function isCategory(value: unknown): value is RequestCategory {
  return typeof value === "string" && (REQUEST_CATEGORIES as readonly string[]).includes(value);
}

export function typeLabel(category: RequestCategory, type: string): string {
  return REQUEST_TYPES[category]?.find((entry) => entry.key === type)?.label ?? "Other";
}

export function isValidType(category: RequestCategory, type: string): boolean {
  return REQUEST_TYPES[category]?.some((entry) => entry.key === type) ?? false;
}

// ── Status ────────────────────────────────────────────────────────────────

export const REQUEST_STATUSES = [
  /** Raised, nobody has looked yet. */
  "submitted",
  /** Somebody on the team has picked it up. */
  "in_review",
  /** Being worked on. */
  "in_progress",
  /** We need something from the student before it can go on. */
  "awaiting_student",
  /** Done, with an outcome. */
  "resolved",
  /** Cannot or will not be done, with a reason. */
  "rejected",
  /** The student changed their mind. */
  "cancelled",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_LABELS: Record<RequestStatus, string> = {
  submitted: "Submitted",
  in_review: "Being looked at",
  in_progress: "In progress",
  awaiting_student: "Waiting on you",
  resolved: "Resolved",
  rejected: "Declined",
  cancelled: "Cancelled",
};

/**
 * Wording aimed at the student, not the team.
 *
 * "In review" means nothing to somebody locked out of their account;
 * "someone has picked this up" is the same fact and answers the question they
 * actually have.
 */
export const STATUS_BLURBS: Record<RequestStatus, string> = {
  submitted: "Raised and waiting to be picked up.",
  in_review: "Someone has picked this up and is looking into it.",
  in_progress: "Being worked on now.",
  awaiting_student: "We need something from you before this can go further.",
  resolved: "Done.",
  rejected: "This could not be done — the reason is below.",
  cancelled: "You cancelled this.",
};

/** Nothing moves out of these. */
export const TERMINAL_STATUSES: readonly RequestStatus[] = ["resolved", "rejected", "cancelled"];

export function isTerminal(status: RequestStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * What an **administrator** may do next.
 *
 * A table rather than scattered `if`s, so "can this move there" has one answer
 * and the buttons a screen offers are generated from the same source the server
 * checks. `cancelled` is absent from every target: only the student cancels.
 */
export const ADMIN_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  submitted: ["in_review", "in_progress", "awaiting_student", "resolved", "rejected"],
  in_review: ["in_progress", "awaiting_student", "resolved", "rejected"],
  in_progress: ["awaiting_student", "resolved", "rejected"],
  awaiting_student: ["in_progress", "resolved", "rejected"],
  resolved: [],
  rejected: [],
  cancelled: [],
};

export function canAdminTransition(from: RequestStatus, to: RequestStatus): boolean {
  return ADMIN_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * A student may only withdraw, and only before the team has finished.
 *
 * Deliberately allowed while `awaiting_student`: that state exists because we
 * asked for something, and "actually, never mind" is a reasonable answer.
 */
export function canStudentCancel(status: RequestStatus): boolean {
  return !isTerminal(status);
}

// ── Priority and timing ───────────────────────────────────────────────────

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

/**
 * Working days we aim to take, by category.
 *
 * A **target**, not a promise, and the screens say so. Its real job is ordering
 * the queue: an overdue request is one somebody should look at before a fresh
 * one, and without a per-category expectation every queue is just "oldest
 * first", which buries a student locked out of their account behind a stack of
 * feature suggestions.
 *
 * The numbers encode how much being stuck costs the student. Nobody can use
 * EduPilot at all while they cannot sign in, and money that has left their
 * account and not arrived is the other thing worth dropping everything for.
 * Feedback gets ten days because nobody is blocked by it — but it is not
 * unbounded, because a suggestion nobody ever answers is a suggestion nobody
 * sends twice.
 *
 * Priority is set by the team, never by the student. A form where everyone can
 * mark their own request urgent is a form where every request is urgent.
 */
export const TARGET_DAYS: Record<RequestCategory, number> = {
  account: 1,
  payments: 2,
  technical: 2,
  ai_tutor: 3,
  coursework: 3,
  curriculum: 5,
  other: 5,
  feedback: 10,
};

export function targetDateFor(category: RequestCategory, from: Date = new Date()): Date {
  const due = new Date(from);
  let remaining = TARGET_DAYS[category] ?? 5;

  // Working days: a request raised on Friday for a one-day target is due
  // Monday, not Saturday, because nobody is working on Saturday.
  while (remaining > 0) {
    due.setDate(due.getDate() + 1);
    const day = due.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }

  return due;
}

// ── Limits ────────────────────────────────────────────────────────────────

export const REQUEST_LIMITS = {
  subjectMax: 140,
  descriptionMax: 4000,
  commentMax: 2000,
  attachmentsMax: 5,
  /** Open requests one student may hold at once, across every category. */
  openPerStudent: 10,
  /** New requests per student per day. */
  perDay: 8,
} as const;

/**
 * A human reference, for the reply and the follow-up.
 *
 * `SR-2026-00042`. Students quote this back in an email or read it out on a
 * call, which rules out an ObjectId — twenty-four hex characters cannot be read
 * aloud reliably, and the first mistake sends the team to the wrong row.
 */
export function formatTicket(year: number, sequence: number): string {
  return `SR-${year}-${String(sequence).padStart(5, "0")}`;
}
