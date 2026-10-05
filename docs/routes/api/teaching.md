# `/api/teacher/*`, `/api/student/*`, `/api/files/*` — teaching

| | |
| --- | --- |
| Files | [teacher/](../../../src/app/api/teacher/), [student/](../../../src/app/api/student/), [files/](../../../src/app/api/files/) |
| Services | [teaching/](../../../src/lib/teaching/) — `teacher.ts`, `audience.ts`, `assignments.ts`, `notes.ts`, `submissions.ts` |
| Models | [Teacher.ts](../../../src/models/Teacher.ts), [Assignment.ts](../../../src/models/Assignment.ts), [Note.ts](../../../src/models/Note.ts), [StoredFile.ts](../../../src/models/StoredFile.ts) |
| Design | [TECHNICAL.md §6.13](../../TECHNICAL.md) |

Two rules run through every endpoint here.

**No request body carries an academic id other than `subjectId`.** The college,
programme, branch, regulation, year and semester on every stored row come from
the *authorised subject*, so there is nothing a caller could send that would
file work under another college. That is the enforcement of §10 and §77 at the
type level rather than in a check — the fields are unrepresentable, not merely
refused.

**A teacher never selects students.** Choosing a subject *is* choosing the
audience, and `resolveAudience()` works out who that is at publish time.

---

## Teacher account

### `POST /api/teacher/signup`

```json
{
  "name": "Prof. Rao",
  "email": "rao@college.edu",
  "password": "…",
  "confirmPassword": "…",
  "collegeId": "65f…",
  "departmentId": null,
  "employeeId": "EMP-114",
  "designation": "Assistant Professor"
}
```

`collegeId` is required and is an **id from the directory**, never free text
(§3): a typed name would put two spellings of one institution into the system
and leave the audience resolver unable to match either against a student.

**The college decides who may sign up at all.** `checkEligibility` runs before
the account is created: invite-only by default, optionally anyone on the
college's own email domain, optionally anyone. A refusal is a **403** carrying a
code (`invite-required`, `domain-mismatch`, `invite-wrong-email`…) and leaves
nothing behind.

This used to be missing entirely — anybody could pick any college and land in
its queue. See [TECHNICAL.md §6.13a](../../TECHNICAL.md).

The role is set server-side. `registerSchema` accepts only `student`, so there
is no self-service path to this role — and what signing up grants is nothing:
the profile lands in `pending`, and what a teacher can reach is
`TeacherAcademicAssignment`, which only an administrator writes.

Rate limited per address *and per college*: a script creating three hundred
pending teachers against one institution would bury its approval queue.

| Status | When |
| --- | --- |
| 201 | account and profile created; a verification email is on its way |
| 409 | that address already has an account — the same wording the student sign-up uses, so neither becomes a way to discover which addresses exist |
| 422 | a field is wrong, or the college is not one a teacher may attach to |
| 429 | too many sign-ups for that address or that college |

### `POST /api/teacher/login`

The same `authenticate()` and `startSession()` as the student login. A student
signing in here is refused with **the credential message**, not "wrong door" — a
distinct message would confirm the address exists and is a student's.

Every status signs in, including `pending` and `suspended`: signing in is how a
pending teacher discovers they are pending, and neither can publish anything
regardless.

### `GET`, `PUT /api/teacher/profile`

The college is not an editable field. It is the scope every other query is
confined to, and changing it would be choosing whose students you can publish to
(§10). `status` is not editable either.

---

## Academic context

### `GET /api/teacher/academic-context`, `GET /api/teacher/subjects`

Every subject this teacher may act on, as a tree and as a flat list. One request
rather than the admin module's five dependent ones: a teacher has between one
and a dozen assignments, so the whole tree is a few dozen rows and five round
trips to walk it would be five round trips on the screen they open before
everything they do.

§12's "only subjects that teacher is authorized to teach should appear" holds by
construction — the query is over `TeacherAcademicAssignment`, so an unauthorised
subject is never fetched rather than filtered out.

---

## Assignments

### `POST /api/teacher/assignments` — create a draft

Creating never publishes. §16's `DRAFT → PUBLISHED` split is load-bearing:
publishing resolves an audience, writes a row per student and fans out
notifications, and doing that on a form submit would mean a mistyped deadline
has already reached two hundred people.

The response carries the resolved target and the eligible-student count, so §15's
preview cannot disagree with the publish.

### `POST /api/teacher/assignments/:id/publish`

The pipeline §60 sets out. What runs **inside** the request — authorise,
validate, resolve the audience, snapshot the target, write one
`AssignmentStudent` row per recipient — is all correctness: the student's list
reads from those rows, so replying "published" before they exist would be a lie
with a race attached.

What runs **after** it, through `after()`, is the notification fan-out (§17,
§62). Nothing depends on it: a student who never sees the prompt still finds the
assignment in their list.

The subject is re-authorised here, not just at draft time — a teacher removed
from it since saving keeps the draft and loses the ability to send it (§78).

```json
{
  "data": {
    "id": "…",
    "status": "published",
    "eligibleStudents": 184,
    "audienceNotes": { "graduated": 0, "unverified": 2, "positionUnknown": 6, "…": 0 },
    "warning": null
  }
}
```

`audienceNotes` is returned rather than swallowed: "184 students" and "184, and
6 more we could not place" are different facts, and the second is what explains
a student asking why they never got it.

**Publishing to nobody succeeds**, with `warning` set (§78). Refusing would be
worse — the assignment is valid, the teacher meant it, and the usual cause is a
cohort that has moved on.

| Status | When |
| --- | --- |
| 200 | published |
| 401 / 403 | not a teacher / not assigned to that subject, or not approved |
| 404 | not their assignment |
| 409 | it is in a state that cannot be published |
| 422 | it fails the stricter publish-time validation — no due date, a date in the past, no instructions |
| 429 | too many publishes this hour |

### `PUT /api/teacher/assignments/:id`

`subjectId` is **absent from the schema**. Re-pointing published work at a
different subject would leave every `AssignmentStudent` row for an audience that
no longer matches, and the students holding them with no explanation.

Reached from `/teacher/assignments/:id/edit`, which reuses the create form. A
**draft** carries the Edit link on its detail page; a **published** assignment
redirects to its submissions, so the link is there instead. **Closed** work has
neither — the window is over, marks may be out, and changing the instructions
underneath a grade makes the grade unexplainable.

A material change to a published assignment — the deadline, the instructions,
the attachments — notifies its students (§79). A corrected typo does not: the
line is what a student would have to *act* on.

### `GET`, `POST /api/teacher/assignments/:id/submissions[/:studentId]`

The roster and the grading endpoint. Both are filtered on `teacherUserId` **and**
`collegeId`, so another teacher at the same college gets a 404 rather than a row
(§94).

The projection is what §45 allows — name, email, status, marks — and the query
starts from `AssignmentStudent`, so the student list *is* the audience: there is
no parameter that reaches a student who is not on this assignment.

Grading notifies on the **first** grade only. A teacher correcting 7 to 8 should
not send a second "your assignment has been graded", and the deduplication index
would refuse it anyway — so sending it would be a silent no-op that looked like
it worked.

---

## Notes

`/api/teacher/notes` mirrors the assignment endpoints with the same gates, and
`PUT` is reached from `/teacher/notes/:id/edit`. Notes carry a list of external
links and the form edits one; the rest ride along untouched, because sending
only the first would mean correcting a typo in the title silently deleted them.
Editing a published note does **not** notify: nothing about a note is owed back
or time-bound, so a correction is not something a student has to act on, and a
platform that pinged them for every typo is one whose notifications get muted.

`POST /api/teacher/notes/:id/archive` takes it out of every student's list
without deleting it. The `NoteRecipient` rows stay, so a bookmark still resolves
and the student is told it was taken down rather than getting a 404 (§78).

---

## Student side

### `GET /api/student/assignments`, `/:id`

Read from the student's own `AssignmentStudent` rows. That is the authorisation
as much as the query:

- a student with no row has no way in;
- a student who changed branch keeps the work they were given (§78);
- a student who moved up a year keeps last semester's and stops receiving new
  work for it (§19).

A foreign id, a missing id and a malformed id all return **404** — identical, so
a probed URL cannot be used to learn what another cohort has been set (§94).

### `POST /api/student/assignments/:id/submit`

The window is decided by `submissionWindow()`, the same function the detail read
renders the button from — a button enabled while the endpoint refuses is the
worst of the possible disagreements.

The previous attempt is superseded, not overwritten (§24): a disputed grade is
unanswerable if the text the teacher marked no longer exists. Resubmitting
clears the previous grade, because the marks belonged to work that is no longer
at the top of the pile.

### `GET /api/student/notes/:id`

An archived note returns **410**, not 404. The student *did* receive it and may
hold a bookmark; telling them it never existed reads as a bug, while "the
teacher took these down" is the truth and explains what happened.

---

## Files

### `POST /api/files/upload`

Multipart, one or more files, one `purpose`. Uploading is separate from
attaching, because a teacher drags a file onto a form that does not exist yet —
which is why `StoredFile` is a collection and why rows with no `attachedToId`
are a normal state rather than corruption.

The college comes from the uploader's own profile and is written onto the row.
Validation is MIME **and** extension **and** size (§86): the allowlist is the
real control, and the denylist catches what it cannot — a crafted request
declaring `application/pdf` for `payload.exe`. `application/octet-stream` is
refused rather than shrugged at.

A bad file among five is reported per file rather than failing the request.

| Status | When |
| --- | --- |
| 201 | at least one file stored; `rejected` lists the rest |
| 403 | the wrong role for that purpose, or a teacher who may not publish |
| 413 | the request as a whole is too large |
| 422 | every file was rejected |
| 429 | too many uploads this hour |
| 503 | no storage driver is configured on this deployment |

### `GET /api/files/:fileId`

The only way bytes leave the platform. Nothing is served from `public/`, no URL
carries a token, and every request re-checks that *this* user may read *this*
file.

§67 asks for signed URLs; this is stronger, and the difference matters for a
submission. A signed URL is a bearer token — forwardable, and valid to whoever
holds it until it expires — while a session check runs against the person
actually asking, every time.

Authorisation is per purpose:

| Purpose | Who may read |
| --- | --- |
| `assignment_attachment` | the teacher who owns it, or a student it reached |
| `note_attachment` | the teacher who owns it, or a student it reached |
| `submission_attachment` | the student who wrote it, or **that** assignment's teacher |

A 404 for "not yours", never a 403: a file id is reachable by anyone on the
platform, including a student at another college, and distinguishing the two
would let them enumerate what other institutions hold. `Content-Disposition` is
always `attachment` and the name is sanitised again on the way out — it ends up
in a header, where a newline is an injection rather than a cosmetic problem.
