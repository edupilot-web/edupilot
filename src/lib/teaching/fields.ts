/**
 * The teaching module's vocabulary: teacher lifecycle, assignment and note
 * states, submission types, and the permissions a teacher holds.
 *
 * Plain data with no imports, so the models, the API routes and the screens all
 * read one list — the same reason `learning/fields.ts` and
 * `admin/ai/fields.ts` exist. This file is what stops a status being added to a
 * schema enum, a dropdown and a transition table separately, which is how three
 * of them end up disagreeing on the fourth addition.
 */

// ── Teacher lifecycle (§4) ────────────────────────────────────────────────

/**
 * What a teacher account is.
 *
 * §4 lists PENDING → APPROVED → ACTIVE. Approved and active are **merged**
 * here, deliberately: they would otherwise be two states separated by no
 * action — nothing in the product moves an account from approved to active, so
 * every approved teacher would sit in a state they could never leave, and the
 * first bug report would be "I approved them and they still cannot publish".
 *
 * What §4 actually wants from that third state is the gate, and the gate is
 * `canTeacherPublish()` below: approved **and** email-verified. Derived, never
 * stored, so it cannot drift from the two facts it summarises.
 */
export const TEACHER_STATUSES = [
  "pending",
  "active",
  "suspended",
  "rejected",
  "deactivated",
] as const;

export type TeacherStatus = (typeof TEACHER_STATUSES)[number];

export const TEACHER_STATUS_LABELS: Record<TeacherStatus, string> = {
  pending: "Awaiting approval",
  active: "Active",
  suspended: "Suspended",
  rejected: "Rejected",
  deactivated: "Deactivated",
};

export const TEACHER_STATUS_BLURBS: Record<TeacherStatus, string> = {
  pending: "Signed up, waiting for the college to approve the account.",
  active: "Approved. May publish to the subjects they are assigned.",
  suspended: "Temporarily blocked. Existing content stays visible to students.",
  rejected: "The college declined the account.",
  deactivated: "Closed, by the teacher or by the college.",
};

/**
 * Which moves an administrator may make.
 *
 * A closed map rather than "anything to anything": reinstating a rejected
 * account is a real decision and re-approval is the honest way to express it,
 * while `pending → suspended` is a state nobody can describe.
 */
const TEACHER_TRANSITIONS: Record<TeacherStatus, TeacherStatus[]> = {
  pending: ["active", "rejected"],
  active: ["suspended", "deactivated"],
  suspended: ["active", "deactivated"],
  rejected: ["pending"],
  deactivated: ["active"],
};

export function canTransitionTeacher(from: TeacherStatus, to: TeacherStatus): boolean {
  return TEACHER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextTeacherStatuses(from: TeacherStatus): TeacherStatus[] {
  return TEACHER_TRANSITIONS[from] ?? [];
}

/**
 * The one gate that decides whether a teacher may put content in front of
 * students (§5: "Do not allow unverified accounts to publish content").
 *
 * Both conditions, always. An approved account whose address was never
 * confirmed is an account nobody has proved belongs to the person the college
 * approved — and the address is the only thing linking the two.
 */
export function canTeacherPublish(teacher: {
  status?: string | null;
  emailVerified?: boolean | null;
}): boolean {
  return teacher.status === "active" && teacher.emailVerified === true;
}

/**
 * Whether a fresh signup is approved on the spot.
 *
 * Configurable because §4 asks for it, and **off by default**: a platform that
 * approved every self-declared teacher would let anyone with an email address
 * publish to a college's students, which is the one failure in this module with
 * no undo. A deployment running a closed pilot can turn it on.
 */
export function teacherAutoApproveEnabled(): boolean {
  return process.env.TEACHER_AUTO_APPROVE?.trim() === "true";
}

// ── Assignments (§16) ─────────────────────────────────────────────────────

export const ASSIGNMENT_STATUSES = [
  "draft",
  "scheduled",
  "published",
  "closed",
  "archived",
] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  closed: "Closed",
  archived: "Archived",
};

const ASSIGNMENT_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  draft: ["scheduled", "published", "archived"],
  scheduled: ["published", "draft", "archived"],
  /**
   * Published never returns to draft. Students have it, some have submitted
   * against it, and a draft they can still see is a state the UI cannot
   * describe honestly. Withdrawing means closing or archiving.
   */
  published: ["closed", "archived"],
  closed: ["published", "archived"],
  archived: [],
};

export function canTransitionAssignment(from: AssignmentStatus, to: AssignmentStatus): boolean {
  return ASSIGNMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Statuses a student may see. A draft belongs to its teacher alone. */
export const STUDENT_VISIBLE_ASSIGNMENT_STATUSES: readonly AssignmentStatus[] = [
  "published",
  "closed",
];

export const SUBMISSION_TYPES = ["text", "file", "link", "code", "mixed"] as const;
export type SubmissionType = (typeof SUBMISSION_TYPES)[number];

export const SUBMISSION_TYPE_LABELS: Record<SubmissionType, string> = {
  text: "Typed answer",
  file: "File upload",
  link: "A link",
  code: "Code",
  mixed: "Any of the above",
};

/** What a submission of this type must contain to count as submitted. */
export function submissionRequires(type: SubmissionType): {
  text: boolean;
  file: boolean;
  link: boolean;
} {
  switch (type) {
    case "text":
    case "code":
      return { text: true, file: false, link: false };
    case "file":
      return { text: false, file: true, link: false };
    case "link":
      return { text: false, file: false, link: true };
    case "mixed":
      // Any one of the three. Checked by the caller, which is why all three
      // read false here rather than true.
      return { text: false, file: false, link: false };
  }
}

// ── Per-student assignment state (§23) ────────────────────────────────────

export const ASSIGNMENT_STUDENT_STATUSES = [
  "assigned",
  "viewed",
  "in_progress",
  "submitted",
  "late",
  "graded",
] as const;

export type AssignmentStudentStatus = (typeof ASSIGNMENT_STUDENT_STATUSES)[number];

export const ASSIGNMENT_STUDENT_STATUS_LABELS: Record<AssignmentStudentStatus, string> = {
  assigned: "Not started",
  viewed: "Viewed",
  in_progress: "In progress",
  submitted: "Submitted",
  late: "Submitted late",
  graded: "Graded",
};

/**
 * Rank, so a status never moves backwards.
 *
 * A student who opens a graded assignment must not drop from `graded` to
 * `viewed` — the view is real, the regression is not, and a teacher's
 * dashboard counting submissions would lose one every time somebody re-read
 * their marks.
 */
const ASSIGNMENT_STUDENT_RANK: Record<AssignmentStudentStatus, number> = {
  assigned: 0,
  viewed: 1,
  in_progress: 2,
  submitted: 3,
  late: 3,
  graded: 4,
};

export function advanceAssignmentStudentStatus(
  current: AssignmentStudentStatus,
  next: AssignmentStudentStatus
): AssignmentStudentStatus {
  return ASSIGNMENT_STUDENT_RANK[next] >= ASSIGNMENT_STUDENT_RANK[current] ? next : current;
}

/** Counts as handed in — `late` included, because a late submission is one. */
export function isSubmittedStatus(status: AssignmentStudentStatus): boolean {
  return status === "submitted" || status === "late" || status === "graded";
}

// ── Notes (§29, §31) ──────────────────────────────────────────────────────

export const NOTE_STATUSES = ["draft", "published", "archived"] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number];

export const NOTE_STATUS_LABELS: Record<NoteStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

const NOTE_TRANSITIONS: Record<NoteStatus, NoteStatus[]> = {
  draft: ["published", "archived"],
  published: ["archived"],
  /**
   * Archived goes back to published, not to draft. It was published once and
   * the text has not changed; sending it to draft would discard that fact and
   * make a student who bookmarked it wonder where it went for longer than
   * necessary.
   */
  archived: ["published"],
};

export function canTransitionNote(from: NoteStatus, to: NoteStatus): boolean {
  return NOTE_TRANSITIONS[from]?.includes(to) ?? false;
}

export const NOTE_TYPES = [
  "text",
  "pdf",
  "document",
  "presentation",
  "image",
  "link",
  "mixed",
] as const;

export type NoteType = (typeof NOTE_TYPES)[number];

export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  text: "Written notes",
  pdf: "PDF",
  document: "Document",
  presentation: "Slides",
  image: "Images",
  link: "Link",
  mixed: "Mixed",
};

/**
 * Derive the note's type from what it actually holds.
 *
 * Derived rather than asked for, because a teacher choosing "PDF" and then
 * attaching a PowerPoint is a mismatch nobody would notice, and the type is
 * only ever used to pick an icon and a filter. Computing it from the content
 * means the filter cannot lie.
 */
export function noteTypeFor(input: {
  content?: string | null;
  attachments?: { mimeType?: string | null }[];
  externalLinks?: unknown[];
}): NoteType {
  const kinds = new Set<NoteType>();

  if (input.content?.trim()) kinds.add("text");
  if (input.externalLinks?.length) kinds.add("link");

  for (const attachment of input.attachments ?? []) {
    const mime = attachment.mimeType ?? "";
    if (mime === "application/pdf") kinds.add("pdf");
    else if (mime.startsWith("image/")) kinds.add("image");
    else if (mime.includes("presentation") || mime.includes("powerpoint")) kinds.add("presentation");
    else kinds.add("document");
  }

  if (kinds.size === 0) return "text";
  if (kinds.size === 1) return [...kinds][0];
  return "mixed";
}

// ── Teacher permissions (§55) ─────────────────────────────────────────────

/**
 * What a teacher may do, as a closed list.
 *
 * Separate from the admin permission system on purpose. Admin permissions are
 * *data* — rows in `roles`, editable per deployment — because an operations
 * team's shape differs between customers. A teacher's capabilities are not
 * configurable: they are what the role means, and making them editable would
 * invite a deployment to grant a teacher `DELETE_STUDENTS`, which §55 forbids
 * outright.
 *
 * The real authorisation is narrower than this list and lives in
 * `TeacherAcademicAssignment`: holding `CREATE_ASSIGNMENT` says a teacher may
 * create assignments *for the subjects they are assigned*, never for any
 * subject in the college.
 */
export const TEACHER_CAPABILITIES = [
  "VIEW_ASSIGNED_ACADEMIC_CONTEXT",
  "CREATE_ASSIGNMENT",
  "EDIT_ASSIGNMENT",
  "PUBLISH_ASSIGNMENT",
  "CLOSE_ASSIGNMENT",
  "VIEW_SUBMISSIONS",
  "GRADE_ASSIGNMENT",
  "CREATE_NOTE",
  "EDIT_NOTE",
  "PUBLISH_NOTE",
  "ARCHIVE_NOTE",
  "VIEW_STUDENT_ENGAGEMENT",
] as const;

export type TeacherCapability = (typeof TEACHER_CAPABILITIES)[number];

/**
 * Capabilities that put something in front of a student, or change something
 * they can already see.
 *
 * These need `canTeacherPublish()` on top of the role; the read-only ones do
 * not, so a suspended teacher can still see what they published and what was
 * submitted against it rather than losing access to their own work.
 */
export const PUBLISHING_CAPABILITIES: readonly TeacherCapability[] = [
  "CREATE_ASSIGNMENT",
  "EDIT_ASSIGNMENT",
  "PUBLISH_ASSIGNMENT",
  "CLOSE_ASSIGNMENT",
  "GRADE_ASSIGNMENT",
  "CREATE_NOTE",
  "EDIT_NOTE",
  "PUBLISH_NOTE",
  "ARCHIVE_NOTE",
];

export function requiresActiveTeacher(capability: TeacherCapability): boolean {
  return PUBLISHING_CAPABILITIES.includes(capability);
}

// ── Academic assignment (§11) ─────────────────────────────────────────────

export const TEACHER_ASSIGNMENT_STATUSES = ["active", "revoked"] as const;
export type TeacherAssignmentStatus = (typeof TEACHER_ASSIGNMENT_STATUSES)[number];

// ── Limits ────────────────────────────────────────────────────────────────

/** Bounds every validator and every schema agrees on. */
export const TEACHING_LIMITS = {
  titleMax: 200,
  descriptionMax: 5000,
  instructionsMax: 20000,
  noteContentMax: 50000,
  feedbackMax: 4000,
  submissionTextMax: 50000,
  maxAttachmentsPerItem: 10,
  maxExternalLinks: 10,
  maxMarksMax: 1000,
  /**
   * How far ahead a due date may be set. Five years is absurd for an
   * assignment and is exactly the sort of typo ("2027" for "2026") that puts a
   * row at the top of every student's "due soon" list forever.
   */
  dueDateMaxYearsAhead: 5,
} as const;
