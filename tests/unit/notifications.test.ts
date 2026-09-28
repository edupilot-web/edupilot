import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IMPLEMENTED_CHANNELS,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPES,
  OPTIONAL_CATEGORIES,
  TYPE_CATEGORY,
  defaultPreferences,
  isNotificationType,
  notificationCopy,
  notificationHref,
  shouldDeliver,
} from "../../src/lib/notifications/fields";
import {
  UPLOAD_POLICY,
  buildStorageKey,
  safeDownloadName,
  validateUpload,
} from "../../src/lib/storage/provider";

describe("notification vocabulary", () => {
  it("files every type under a category", () => {
    for (const type of NOTIFICATION_TYPES) {
      const category = TYPE_CATEGORY[type];
      assert.ok(category, `${type} has no category`);
      assert.ok(
        (NOTIFICATION_CATEGORIES as readonly string[]).includes(category),
        `${type} maps to unknown category ${category}`
      );
    }
  });

  it("rejects a type a client invented", () => {
    assert.ok(isNotificationType("ASSIGNMENT_PUBLISHED"));
    assert.ok(!isNotificationType("assignment_published"));
    assert.ok(!isNotificationType("SPAM"));
  });

  /**
   * The one category nobody may switch off. "Your account was rejected" is not
   * a notification somebody opts out of — it is the only way they learn what
   * happened.
   */
  it("never lets the account category be muted", () => {
    assert.ok(!OPTIONAL_CATEGORIES.includes("account"));

    assert.ok(
      shouldDeliver({
        type: "TEACHER_REJECTED",
        channel: "in_app",
        preferences: { account: { in_app: false, email: false, push: false } } as never,
      }),
      "a rejection was suppressed by a preference"
    );
  });

  it("honours a switched-off optional category", () => {
    assert.ok(
      !shouldDeliver({
        type: "ASSIGNMENT_PUBLISHED",
        channel: "in_app",
        preferences: { assignments: { in_app: false, email: false, push: false } },
      })
    );
  });

  /**
   * A category added after a user saved their settings must not arrive
   * silenced — an absent preference falls back to the default, not to false.
   */
  it("falls back to the default for a preference that was never saved", () => {
    assert.ok(shouldDeliver({ type: "NOTE_PUBLISHED", channel: "in_app", preferences: {} }));
    assert.ok(shouldDeliver({ type: "NOTE_PUBLISHED", channel: "in_app", preferences: null }));
  });

  it("refuses a channel that is not implemented, whatever the preference says", () => {
    assert.ok(!IMPLEMENTED_CHANNELS.includes("email"));
    assert.ok(
      !shouldDeliver({
        type: "ASSIGNMENT_PUBLISHED",
        channel: "email",
        preferences: { assignments: { in_app: true, email: true, push: true } },
      })
    );
  });

  it("defaults to in-app only", () => {
    const defaults = defaultPreferences();
    for (const category of NOTIFICATION_CATEGORIES) {
      assert.equal(defaults[category].in_app, true, `${category} in-app is off`);
      assert.equal(defaults[category].email, false, `${category} email is on by default`);
      assert.equal(defaults[category].push, false, `${category} push is on by default`);
    }
  });
});

describe("notification copy", () => {
  it("writes a title and a message for every type", () => {
    for (const type of NOTIFICATION_TYPES) {
      const copy = notificationCopy(type, {
        title: "Binary Search Trees",
        subjectName: "Data Structures",
        teacherName: "Prof. Rao",
        dueAt: new Date("2026-09-10T18:29:00Z"),
        marks: 8,
        maxMarks: 10,
      });

      assert.ok(copy.title.trim().length > 0, `${type} has no title`);
      assert.ok(copy.message.trim().length > 0, `${type} has no message`);
    }
  });

  it("survives having nothing to interpolate", () => {
    // A notification for an entity whose snapshot fields are all null must
    // still read as a sentence rather than as "New assignment: null".
    for (const type of NOTIFICATION_TYPES) {
      const copy = notificationCopy(type, {});
      assert.ok(!copy.title.includes("null"), `${type} leaked a null into its title`);
      assert.ok(!copy.title.includes("undefined"), `${type} leaked undefined`);
      assert.ok(!copy.message.includes("null"), `${type} leaked a null into its message`);
    }
  });

  it("states the marks when it has them", () => {
    const copy = notificationCopy("ASSIGNMENT_GRADED", {
      title: "DBMS 1",
      subjectName: "DBMS",
      marks: 8,
      maxMarks: 10,
    });
    assert.match(copy.message, /8 out of 10/);
  });

  it("still makes sense for a grade with no marks", () => {
    const copy = notificationCopy("ASSIGNMENT_GRADED", {
      title: "DBMS 1",
      subjectName: "DBMS",
      marks: null,
      maxMarks: 10,
    });
    assert.match(copy.message, /marked/i);
  });
});

describe("notification links", () => {
  it("points every entity at a real route", () => {
    assert.equal(notificationHref("assignment", "abc"), "/assignments/abc");
    assert.equal(notificationHref("note", "abc"), "/notes/abc");
    assert.equal(notificationHref("teacher", "abc"), "/teacher/dashboard");
  });

  it("sends a submission notification to the assignment, not to a submission route", () => {
    // There is no student-facing submission URL — the grade is shown on the
    // assignment, which is where a student expects to find it.
    assert.equal(notificationHref("submission", "abc"), "/assignments/abc");
  });
});

// ── Uploads (§86) ─────────────────────────────────────────────────────────

describe("upload validation", () => {
  const base = { purpose: "note_attachment" as const, mimeType: "application/pdf", size: 1024 };

  it("accepts an ordinary PDF", () => {
    assert.equal(validateUpload({ ...base, fileName: "notes.pdf" }), null);
  });

  it("refuses an empty file", () => {
    assert.equal(validateUpload({ ...base, fileName: "notes.pdf", size: 0 })?.code, "empty-file");
  });

  it("refuses a file over the purpose's cap", () => {
    const refusal = validateUpload({
      ...base,
      fileName: "huge.pdf",
      size: UPLOAD_POLICY.note_attachment.maxBytes + 1,
    });
    assert.equal(refusal?.code, "too-large");
  });

  /**
   * The case the MIME allowlist cannot catch on its own: a crafted request
   * declaring `application/pdf` for an executable.
   */
  it("refuses a dangerous extension even with an allowed MIME type", () => {
    for (const name of ["payload.exe", "script.bat", "run.sh", "page.html", "vector.svg"]) {
      const refusal = validateUpload({ ...base, fileName: name });
      assert.equal(refusal?.code, "blocked-extension", `${name} was not blocked`);
    }
  });

  it("refuses an unidentified MIME type rather than shrugging", () => {
    // `application/octet-stream` is what a browser sends when it cannot
    // identify a file, and is exactly the header an executable arrives under.
    const refusal = validateUpload({
      ...base,
      fileName: "thing.bin",
      mimeType: "application/octet-stream",
    });
    assert.equal(refusal?.code, "unsupported-type");
  });

  it("gives a submission a tighter cap than a note", () => {
    assert.ok(
      UPLOAD_POLICY.submission_attachment.maxBytes < UPLOAD_POLICY.note_attachment.maxBytes
    );
  });
});

describe("storage keys", () => {
  it("never puts the uploaded filename in the key", () => {
    const key = buildStorageKey({
      purpose: "note_attachment",
      collegeId: "65f000000000000000000001",
      fileName: "my lecture notes.pdf",
    });

    assert.ok(!key.includes("lecture"));
    assert.ok(key.endsWith(".pdf"));
    assert.ok(key.startsWith("note_attachment/65f000000000000000000001/"));
  });

  /**
   * The key is generated, so this guards a *future* caller — which is exactly
   * when a traversal check earns its keep, because whoever introduces the bug
   * will not be thinking about it.
   */
  it("cannot be talked into a path traversal", () => {
    const key = buildStorageKey({
      purpose: "note_attachment",
      collegeId: "65f000000000000000000001",
      fileName: "../../etc/passwd",
    });

    assert.ok(!key.includes(".."));
  });

  it("produces a different key every time", () => {
    const input = {
      purpose: "note_attachment" as const,
      collegeId: "65f000000000000000000001",
      fileName: "notes.pdf",
    };
    assert.notEqual(buildStorageKey(input), buildStorageKey(input));
  });
});

describe("download names", () => {
  /**
   * The name ends up in a `Content-Disposition` header, where a newline or a
   * quote is a header injection rather than a cosmetic problem.
   */
  it("strips what would break the header", () => {
    assert.ok(!safeDownloadName('bad"name.pdf').includes('"'));
    assert.ok(!safeDownloadName("bad\nname.pdf").includes("\n"));
    assert.ok(!safeDownloadName("bad\\name.pdf").includes("\\"));
  });

  it("keeps an ordinary name readable", () => {
    assert.equal(safeDownloadName("Unit 3 (revised).pdf"), "Unit 3 (revised).pdf");
  });

  it("never returns an empty name", () => {
    assert.ok(safeDownloadName("").length > 0);
    assert.ok(safeDownloadName("///").length > 0);
  });
});
