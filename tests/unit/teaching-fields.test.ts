import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_STUDENT_STATUSES,
  advanceAssignmentStudentStatus,
  canTeacherPublish,
  canTransitionAssignment,
  canTransitionNote,
  canTransitionTeacher,
  isSubmittedStatus,
  noteTypeFor,
  nextTeacherStatuses,
  PUBLISHING_CAPABILITIES,
  requiresActiveTeacher,
  submissionRequires,
  TEACHER_CAPABILITIES,
  TEACHER_STATUSES,
} from "../../src/lib/teaching/fields";

/**
 * The teaching vocabulary's invariants.
 *
 * Most of these guard the same failure: this file is read by the models, the
 * services, the routes and six screens, and a value changed in one place
 * without the others is how a state machine silently gains a path nobody
 * intended.
 */

describe("teacher lifecycle", () => {
  it("starts pending and can only become active or rejected", () => {
    assert.deepEqual(nextTeacherStatuses("pending").sort(), ["active", "rejected"]);
  });

  /**
   * The rule §5 states in one sentence, as arithmetic. Approving an account
   * whose address was never confirmed must not let it publish — the address is
   * the only thing linking the account to the person the college approved.
   */
  it("requires approval AND a confirmed email to publish", () => {
    assert.ok(canTeacherPublish({ status: "active", emailVerified: true }));
    assert.ok(!canTeacherPublish({ status: "active", emailVerified: false }));
    assert.ok(!canTeacherPublish({ status: "pending", emailVerified: true }));
    assert.ok(!canTeacherPublish({ status: "suspended", emailVerified: true }));
  });

  it("refuses a transition nobody can describe", () => {
    assert.ok(!canTransitionTeacher("pending", "suspended"));
    assert.ok(!canTransitionTeacher("rejected", "active"));
  });

  it("lets a rejected account be reconsidered, through pending", () => {
    assert.ok(canTransitionTeacher("rejected", "pending"));
    assert.ok(canTransitionTeacher("pending", "active"));
  });

  it("declares every status exactly once", () => {
    assert.equal(new Set(TEACHER_STATUSES).size, TEACHER_STATUSES.length);
  });
});

describe("teacher capabilities", () => {
  /**
   * The gate that matters: everything that can put content in front of a
   * student, or change something they can already see, needs an active
   * account. A capability added to the list without being marked is a way for
   * a pending teacher to reach students.
   */
  it("gates every publishing capability on an active account", () => {
    for (const capability of PUBLISHING_CAPABILITIES) {
      assert.ok(requiresActiveTeacher(capability), `${capability} is not gated`);
    }
  });

  it("leaves the read-only capabilities open to a suspended teacher", () => {
    // A suspended teacher keeps access to their own work and to what was
    // submitted against it; losing that would be a punishment the product does
    // not intend.
    assert.ok(!requiresActiveTeacher("VIEW_SUBMISSIONS"));
    assert.ok(!requiresActiveTeacher("VIEW_ASSIGNED_ACADEMIC_CONTEXT"));
    assert.ok(!requiresActiveTeacher("VIEW_STUDENT_ENGAGEMENT"));
  });

  it("lists only capabilities that exist", () => {
    for (const capability of PUBLISHING_CAPABILITIES) {
      assert.ok(
        (TEACHER_CAPABILITIES as readonly string[]).includes(capability),
        `${capability} is not a declared capability`
      );
    }
  });

  /**
   * §55's prohibitions, asserted rather than assumed. If somebody ever adds
   * one of these to the list, this fails instead of quietly granting it.
   */
  it("grants nothing §55 forbids", () => {
    for (const forbidden of [
      "CREATE_COLLEGE",
      "MODIFY_GLOBAL_CURRICULUM",
      "DELETE_STUDENTS",
      "VIEW_OTHER_COLLEGES",
      "CHANGE_STUDENT_ACADEMIC_PROFILE",
      "MODIFY_SYSTEM_ROLES",
    ]) {
      assert.ok(
        !(TEACHER_CAPABILITIES as readonly string[]).includes(forbidden),
        `${forbidden} must never be a teacher capability`
      );
    }
  });
});

describe("assignment states", () => {
  /**
   * The one transition that must not exist. Students hold a published
   * assignment and some have submitted against it; a draft they can still see
   * is a state the UI cannot describe honestly.
   */
  it("never lets a published assignment go back to draft", () => {
    assert.ok(!canTransitionAssignment("published", "draft"));
    assert.ok(!canTransitionAssignment("closed", "draft"));
  });

  it("lets a closed assignment be re-opened", () => {
    assert.ok(canTransitionAssignment("closed", "published"));
  });

  it("makes archived terminal", () => {
    for (const status of ASSIGNMENT_STATUSES) {
      assert.ok(!canTransitionAssignment("archived", status), `archived → ${status} is reachable`);
    }
  });
});

describe("per-student status", () => {
  /**
   * A student re-opening a graded assignment must not drop it back to
   * `viewed` — the teacher's submitted count would lose one every time
   * somebody re-read their marks.
   */
  it("never moves backwards", () => {
    assert.equal(advanceAssignmentStudentStatus("graded", "viewed"), "graded");
    assert.equal(advanceAssignmentStudentStatus("submitted", "assigned"), "submitted");
    assert.equal(advanceAssignmentStudentStatus("late", "viewed"), "late");
  });

  it("moves forwards", () => {
    assert.equal(advanceAssignmentStudentStatus("assigned", "viewed"), "viewed");
    assert.equal(advanceAssignmentStudentStatus("viewed", "submitted"), "submitted");
    assert.equal(advanceAssignmentStudentStatus("submitted", "graded"), "graded");
  });

  it("lets a late submission replace a plain one at the same rank", () => {
    // Both mean "handed in"; which of the two it is depends on the clock, not
    // on the order the two statuses happen to be applied.
    assert.equal(advanceAssignmentStudentStatus("submitted", "late"), "late");
  });

  it("counts late and graded as submitted", () => {
    assert.ok(isSubmittedStatus("submitted"));
    assert.ok(isSubmittedStatus("late"));
    assert.ok(isSubmittedStatus("graded"));
    assert.ok(!isSubmittedStatus("viewed"));
    assert.ok(!isSubmittedStatus("in_progress"));
  });

  it("declares every status exactly once", () => {
    assert.equal(
      new Set(ASSIGNMENT_STUDENT_STATUSES).size,
      ASSIGNMENT_STUDENT_STATUSES.length
    );
  });
});

describe("submission requirements", () => {
  it("asks for what the type implies", () => {
    assert.deepEqual(submissionRequires("text"), { text: true, file: false, link: false });
    assert.deepEqual(submissionRequires("file"), { text: false, file: true, link: false });
    assert.deepEqual(submissionRequires("link"), { text: false, file: false, link: true });
  });

  it("requires nothing specific for a mixed submission", () => {
    // `mixed` means any one of the three, which a per-field boolean cannot
    // express — the caller checks the disjunction.
    assert.deepEqual(submissionRequires("mixed"), { text: false, file: false, link: false });
  });
});

describe("note types", () => {
  it("derives the type from what the note holds", () => {
    assert.equal(noteTypeFor({ content: "Some notes" }), "text");
    assert.equal(noteTypeFor({ attachments: [{ mimeType: "application/pdf" }] }), "pdf");
    assert.equal(noteTypeFor({ attachments: [{ mimeType: "image/png" }] }), "image");
    assert.equal(noteTypeFor({ externalLinks: ["https://example.com"] }), "link");
  });

  it("calls a note with several kinds mixed", () => {
    assert.equal(
      noteTypeFor({ content: "notes", attachments: [{ mimeType: "application/pdf" }] }),
      "mixed"
    );
  });

  it("never returns nothing for an empty note", () => {
    assert.equal(noteTypeFor({}), "text");
  });

  it("recognises slides as a presentation", () => {
    assert.equal(
      noteTypeFor({
        attachments: [
          {
            mimeType:
              "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          },
        ],
      }),
      "presentation"
    );
  });
});

describe("note states", () => {
  it("returns an archived note to published, not to draft", () => {
    assert.ok(canTransitionNote("archived", "published"));
    assert.ok(!canTransitionNote("archived", "draft"));
  });

  it("never lets a published note go back to draft", () => {
    assert.ok(!canTransitionNote("published", "draft"));
  });
});
