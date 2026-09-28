# EduPilot — Technical Document!!!!

Living record of what this project is, how it is built, and what is deliberately not built yet.
**Keep this file updated in the same change that alters behaviour** — new route, new model field,
new invariant, new dependency.

- Status: student auth + onboarding complete; admin application complete for institution, student and
  administration management; curriculum → topics → prepared content → AI tutor complete end to end;
  teachers, assignments, notes and notifications complete end to end
- Last updated: 2026-09-28
- Owner: @RajeshKolluri
- **Per-route documentation lives in [routes/](routes/)** — one file per URL, covering the page or
  handler, its server and client halves, every status it returns, and what about it is not real.
  This file keeps only what spans routes: architecture, cross-cutting design, the data model, and
  the gap list.

---

## 1. What we are building

EduPilot is a learning platform: instructors publish courses made of ordered lessons, students
enroll and track completion. The current milestone delivers the **entire backend as a JSON API**,
the **auth screens and signed-in shell** on top of it (§6), and a page documenting the endpoints. The
dashboard is built but its cards render placeholder content — the features they describe have no data
models yet. Courses, lessons and enrollments remain reachable only over HTTP.

Scope delivered so far:

| Capability | State |
| --- | --- |
| Email + password accounts, three roles | done |
| Email verification: 6-digit OTP screen + one-click link, hashed single-use, TTL, resend, change address | done |
| Cookie session (sign in / out / who am I) | done |
| Course CRUD, ownership enforcement | done |
| Public catalogue: full-text search, filters, pagination | done |
| Lesson CRUD, ordering, free-preview gating | done |
| Enrollment (idempotent) and per-lesson progress | done |
| Seed script with demo data | done |
| Sign-in / sign-up screens | done |
| Onboarding: education + academic steps, gated on `profileCompleted` | done |
| College directory with search-as-you-type and free-text fallback | done |
| Student curriculum: derived year/semester, subject list, unit-wise syllabus and mapped textbook reading | done |
| Textbook catalogue, topics, and subject-to-unit chapter mapping | done — seeded, no admin UI to edit it yet |
| Transactional email behind a transport interface (Brevo, console) | done — API send confirmed live; inbox delivery untested |
| Server-side rate limiting (verification sends) | done |
| Continue with Google (OAuth 2.0 / OIDC) | implemented, untested against Google |
| Signed-in shell: navigation rail, top bar, dashboard | done (dashboard cards show placeholder content) |
| Social sign-in: Microsoft, Apple | buttons only, no OAuth backend |
| Password reset, terms and privacy pages | placeholders |
| Tasks, wallet, streaks, timetable, notices, placements — data models | not started |
| Catalogue / course / lesson UI, payments, uploads, tests | not started |

**Admin application** — `/admin`, separate sessions and permissions (§11):

| Capability | State |
| --- | --- |
| Institution master data: colleges, universities, affiliations, autonomy, campuses, departments, programs | done |
| Geography: states, districts, cities as records rather than enums | done |
| Bulk import from CSV/XLSX: mapping, validation, duplicate detection, preview, commit, per-row history | done |
| Verification queue across colleges, universities and students | done |
| Data-quality checks and near-duplicate detection | done |
| Student administration with permission-gated contact details | done |
| RBAC: 9 seeded roles, 47 permissions, per-account overrides | done |
| Audit log with before/after diffs, and admin sign-in history | done |
| Analytics: growth, funnel, institution composition, geographic drill-down | done |
| Feature flags and platform settings | done |
| Content, community and notification management | navigation only — each says so on screen |
| Export generation (the job model and history exist; no file writer) | partial |

## 2. Architecture

Single Next.js 16 deployable — no separate API process. Route handlers under
[src/app/api/](../src/app/api/) *are* the backend; they talk to MongoDB through Mongoose.

```
auth screens (/login, /signup)          browser / curl
      │  <form action={serverAction}>          │  fetch with credentials
      ▼                                        │  (edupilot_session cookie)
Server Action  src/lib/auth-actions.ts         │
      │  zod form schema                       │
      ├──────────────► src/lib/accounts.ts ◄───┤   shared account logic
      │                                        ▼
      │                          Next.js route handler   src/app/api/**/route.ts
      │                          │  1. requireAuth / requireRole   → src/lib/api.ts
      │                          │  2. connectDB()                 → src/lib/db.ts   (cached)
      │                          │  3. zodSchema.parse(body)       → src/lib/validation.ts
      │                          │  4. Mongoose model op           → src/models/*.ts
      │                          │  5. ok(data) | handleError(err) → src/lib/api.ts
      ▼                          ▼
              MongoDB (mongoose 9)
```

Four layers, each with one job:

| Layer | Files | Responsibility |
| --- | --- | --- |
| UI | `src/app/(auth)/**`, [src/components/](../src/components/) | screens, form state, client-side affordances |
| Transport | `src/app/api/**/route.ts`, [src/lib/auth-actions.ts](../src/lib/auth-actions.ts) | HTTP / action shape, authorization decisions, orchestration |
| Cross-cutting | [src/lib/](../src/lib/) | connection, session, response envelope, error mapping, schemas |
| Domain | [src/models/](../src/models/) | schema, indexes, serialization rules |
| Domain services | [src/lib/accounts.ts](../src/lib/accounts.ts), [student-profile.ts](../src/lib/student-profile.ts), [email-verification.ts](../src/lib/email-verification.ts) | account creation, credential checks, profile writes, token lifecycle — shared by both transports |
| Delivery | [src/lib/email/](../src/lib/email/) | one `sendVerificationEmail()` call site; the provider behind it is swappable |
| Tooling | [scripts/](../scripts/) | seed data, college directory, index creation, the profile migration |

Sign-up and sign-in exist on two transports — the JSON API and the Server Actions behind the forms.
Both go through `src/lib/accounts.ts`, so there is exactly one implementation of "create an account"
and "check a password"; the transports only differ in how they report the outcome.

Where a user is allowed to go next is decided in exactly one function,
[`destinationFor`](../src/lib/auth-routing.ts) — see §6.5. Every gate calls it rather than
re-deriving the rule, which is what keeps the redirects from disagreeing.

Business logic lives in the route handler, not in the model. Models stay declarative (fields,
indexes, `toJSON`) so there are no hidden hooks to reason about.

### Stack and why

| Concern | Choice | Reason |
| --- | --- | --- |
| Framework | Next.js 16 / React 19 | one process for API + eventual UI; no CORS, no second deploy |
| DB | MongoDB + Mongoose 9 | document shape fits course→lesson nesting; schema validation at the app layer |
| Auth | JWT in httpOnly cookie (`jose`) | stateless verify, no session store; `jose` is Web-Crypto based |
| Passwords | `bcryptjs`, cost 12 | pure JS, no native build step in CI/serverless |
| Validation | Zod 4 | one schema per operation, parses *and* narrows the TS type |
| Styling | Tailwind CSS 4 | utility classes in the components; no UI kit |

Next.js 16 specifics this code depends on: dynamic route `params` is a **Promise** (`await params`),
`cookies()` is **async** (`await cookies()`), and layouts type props via the generated
`LayoutProps<"/">`. Consult `node_modules/next/dist/docs/` before changing framework-facing code —
this Next version differs from older conventions.

## 3. Cross-cutting design

### 3.1 Database connection — [src/lib/db.ts](../src/lib/db.ts)

`connectDB()` memoizes both the connection *and* the in-flight promise on `globalThis._mongoose`.
Two reasons: the dev server hot-reloads modules and would otherwise leak a connection per reload,
and concurrent first requests must not each dial the server. `MONGODB_URI` is read at call time,
not import time, so `next build` and scripts that load `.env` late do not blow up. `bufferCommands:
false` makes a lost connection fail fast instead of queueing silently. A failed connect clears the
cached promise so the next request retries.

### 3.2 Sessions — [src/lib/auth.ts](../src/lib/auth.ts)

- Cookie `edupilot_session`, `httpOnly`, `sameSite=lax`, `path=/`, `secure` in production.
- HS256 JWT signed with `JWT_SECRET`. Claims: `sub` (user id), `email`, `role`, `iat`, `exp`.
- `startSession(payload, { remember })` signs the token and writes the cookie in one step. Lifetime
  depends on `remember`, which is what the sign-in form's "Remember me" box controls:

  | `remember` | Token TTL | Cookie | Reached from |
  | --- | --- | --- | --- |
  | `true` | 30 days | `Max-Age=2592000`, survives a restart | box ticked; every sign-up |
  | `false` | 7 days | session cookie, dropped on browser close | box unticked |
  | omitted | 7 days | `Max-Age=604800` | `POST /api/auth/login` without the field, so existing API clients are unaffected |
- `getSession()` returns `null` for a missing, malformed, or expired token — verification failures
  are swallowed rather than surfaced, so a stale cookie reads as signed-out.
- Role is carried **in the token**. Cheap to check, but a role change does not take effect until the
  token expires or the user signs in again. Accepted for now (see §8).

### 3.3 Response envelope and errors — [src/lib/api.ts](../src/lib/api.ts)

Every response is wrapped, so clients need one parser:

```json
{ "data": { "...": "..." } }
{ "error": { "message": "...", "details": [] } }
```

Handlers never build error responses by hand for expected failures — they `throw new HttpError(status,
msg)` or let Zod/Mongoose throw, and a single `catch { return handleError(err) }` maps everything:

| Thrown | Status | Body |
| --- | --- | --- |
| `HttpError` | its own | its message |
| `ZodError` | 422 | `issues[]` |
| `mongoose.Error.ValidationError` | 422 | field errors |
| Mongo duplicate key (`code 11000`) | 409 | generic "already exists" |
| anything else | 500 | `"Internal server error"`, real error logged server-side only |

`assertObjectId()` rejects malformed ids with 400 before they reach Mongo, so a bad id is a client
error rather than a cast exception.

### 3.4 Validation — [src/lib/validation.ts](../src/lib/validation.ts)

`passwordSchema` is the single password policy — at least 8 characters, at most 200, and at least one
digit — shared by `registerSchema` and the sign-up form, so the API cannot accept a password the UI
would reject. `loginFormSchema` and `signupFormSchema` are the form-facing variants: same rules, but
every message is written to be rendered next to its field rather than returned as an API error.

One schema per operation; update schemas are `.partial()` of the create schema, so PATCH is genuinely
partial and cannot introduce a field the create path does not accept. Emails are lower-cased in the
schema so the unique index behaves case-insensitively. `slugify()` strips non-alphanumerics, collapses
spaces to `-`, and caps at 80 characters.

### 3.5 Email delivery — [src/lib/email/](../src/lib/email/)

Nothing above `emailService.ts` knows which provider sends the mail. Callers ask for a *kind* of
email:

```ts
await sendVerificationEmail({ email, name, code, verificationUrl })
```

Behind that sit three pieces: `types.ts` declares the `EmailTransport` contract, `brevo.ts`
implements it against [Brevo](https://developers.brevo.com)'s transactional email API
(`POST https://api.brevo.com/v3/smtp/email`, the key in an `api-key` header), and
`templates/` renders subject, HTML and plain text. Replacing Brevo with Resend, SES, Mailgun or
Postmark means adding one file that satisfies `EmailTransport` and naming it in `EMAIL_TRANSPORT` —
no authentication code changes.

`console.ts` is the third transport and the reason a fresh clone works: with no Brevo API key it
prints the message's **whole plain-text body** — verification code and link both — to the server log
instead of sending. It prints the text alternative rather than scraping the HTML so that it keeps
working for kinds of mail that have no link in them. It refuses to run in production, where silently
swallowing verification mail would strand every new account.

Selection order: `EMAIL_TRANSPORT` if set, else Brevo when it has a key, else console.

**A send failure never fails the operation that triggered it.** `sendVerificationEmail` resolves
with `{ ok: false }` and the caller carries on — see §6.4a for why that is the correct behaviour
rather than a shortcut.

Links inside email are built with [`absoluteUrl()`](../src/lib/app-url.ts) from
`NEXT_PUBLIC_APP_URL`, never from the incoming request: the recipient opens the link hours later on
another machine, where a `localhost` origin captured at send time is a dead link.

### 3.6 Rate limiting — [src/lib/rate-limit.ts](../src/lib/rate-limit.ts)

Fixed windows in a `rateLimits` collection: one upserted document per key holds the counter and its
own `expiresAt`, which doubles as a TTL so spent windows clean themselves up. Not an in-process Map —
the app runs as several instances, and a per-process counter resets on every cold start and is
side-stepped by hitting a different instance.

`consumeRateLimits([...])` applies several rules to one action and counts *every* rule, so tripping
the short one still registers against the hourly one. Resending a verification email is guarded by
three:

| Key | Limit | Stops |
| --- | --- | --- |
| `verify-email:cooldown:user:<id>` | 1 / minute | double-clicks and impatience |
| `verify-email:hourly:user:<id>` | 5 / hour | one account mailing itself all day |
| `verify-email:hourly:address:<email>` | 6 / hour | "change email" being used to bomb a stranger's inbox |

Storage failures **fall open**. A database that cannot serve the counter cannot serve the sign-up
either, so failing closed would turn one outage into a second, more confusing one.

The disabled button on the client is a courtesy, not a control — the action assumes nobody is using
the button at all.


### 3.7 Academic position — [src/lib/curriculum/position.ts](../src/lib/curriculum/position.ts)

**Which year a student is in is derived, not stored.** `StudentProfile.currentYear` is a number the
student typed once during onboarding and it is wrong from the next July onward. Both profiles in the
database proved it: one said "1st year" against a 2023 admission, the other "2nd year" against 2024.

`resolveAcademicPosition()` is the single answer, so the curriculum screen, the dashboard and cohort
analytics cannot disagree within a semester. Precedence, strongest first:

| Source | When it wins | Why it is ranked there |
| --- | --- | --- |
| `currentSemester` override | the student corrected their position | a transfer, a repeated year or a detained semester makes every formula wrong, and the student knows |
| admission year | there is an `admissionYear` | self-maintaining: it stays right as terms roll over |
| `currentYear` | nothing better exists | stale by construction, and returns a year with **no semester** rather than guessing which half |

```
academicYearStart = month >= July ? thisYear : thisYear - 1
studyYear   = (academicYearStart - admissionYear) + 1 + (lateralEntry ? 1 : 0)
currentSem  = (studyYear - 1) * 2 + (month >= July ? 1 : 2)   -> clamped to totalSemesters
```

The July boundary is deliberate: being wrong for the last fortnight of June costs less than a January
boundary being a whole year wrong from July. Lateral entry adds a year because those students entered
*into* the second year. The clamp matters — without it a stale 2015 admission resolves to semester 23
and the subject query returns nothing with no indication why.

`storedYearConflicts` reports the disagreement rather than hiding it, and `source` is returned so a
screen can present a derived position as correctable instead of as settled fact.

### 3.8 The textbook layer — [src/models/Textbook.ts](../src/models/Textbook.ts)

`CurriculumSubject.referenceBooks[]` is a **bibliography**: a title, an author and an ISBN, verbatim
from the syllabus document, with no structure to read from. Three collections add the structure, and
they sit *beside* the curriculum rather than inside it:

```
CurriculumSubject -- units[] ------------------> the spine: exam scope, AI content address
       |
       +-- SubjectTextbook -- unitMappings[] --+
                |                             | which chapters cover which unit
                v                             |
             Textbook -- chapters[] <---------+
                |
                +-- TextbookTopic   the reading material a student clicks
```

**The syllabus unit is the spine, not the book chapter.** [AiCourseContent](../src/models/AiCourseContent.ts)
already addresses generated content by `(subjectId, unitNumber, topicNumber)` — positional syllabus
addressing. Making chapters the primary structure would orphan every existing content row. It is also
the right way round pedagogically: the exam follows the syllabus, the reading follows the book.

| Collection | Shape | Why |
| --- | --- | --- |
| `textbooks` | book + **embedded** `chapters[]` | one row per book for the whole platform: Grewal is prescribed for dozens of subjects, and a row per (subject, book) gives forty spellings of one title. Chapters are embedded because they are pure structure, always read as a set, and will not grow fields — the same test `Curriculum.ts` applies to units |
| `textbooktopics` | own collection | a topic is the leaf a student clicks and *will* grow: AI content, notes, videos, question banks, per-student progress. 200-300 per book, queried and aggregated independently, so embedding would load every field of every topic to render a contents list |
| `subjecttextbooks` | mapping + `unitMappings[]` | see below |

**The mapping is a table because units and chapters are many-to-many and out of order.** Unit 1 may
span chapters 1-2; chapter 3 may serve units 2 *and* 4; a book written for another university covers
the same ground in a different sequence. A `subjectId -> textbookId` pointer can only say "here is the
book" — it cannot answer what a student is actually asking, which is "what do I read for Unit 3". The
seeded ME401 Unit 3 maps to Arora chapters 4 **and** 12, which no foreign key could express.

`unitMappings[].topicIds` is resolved at seed time rather than derived per request, so the read path
does not redo the chapter-to-topic join on every page view.

Two identities for a book, both indexed: `isbn13` under a **partial** unique index — Indian university
editions frequently ship without one, and a plain unique index refuses the second null — and
`(title, edition)` as the fallback, because the 43rd and 44th editions have different chapter
numbering and a mapping built against one is wrong for the other.

**`referenceBooks[]` gains an optional `textbookId`** rather than being replaced. The 274 bibliography
entries that already exist keep their syllabus-stated title and ISBN, a book nobody has catalogued
still renders exactly as before, and there is no migration to run.

### 3.9 Per-semester subjects — [src/models/StudentSemester.ts](../src/models/StudentSemester.ts)

`StudentProfile.subjectIds` is a flat array with no semester on it, so recording the fourth semester
means overwriting the third — destroying the only record of what the student took. `StudentSemesterSubjects`
is one row per `(studentProfileId, semester)`, carrying its own `regulationId` because a student moved
onto a new regulation mid-course still took last semester's subjects under the old one.

The profile field is **kept** as the current-semester cache: every existing write stays valid,
onboarding does not change, and the read path prefers the collection when a row exists.

Electives are not written on the student's behalf. `source` distinguishes `prescribed` (the
regulation's core list, filled in silently) from `student-selected` and `admin-assigned`, and a null
`confirmedAt` means the list was derived and never reviewed — an outstanding question, not a decision.

## 4. Data model

```
User ──1:1──> StudentProfile ──N:1──> College
  ├───1:0..1─> EmailVerificationToken        (at most one live at a time)
  ├───1:N────> Course ──1:N──> Lesson
  └───1:N────> Enrollment ──N:1──> Course
                    └── completedLessons[] ──> Lesson
```

| Model | Fields | Indexes |
| --- | --- | --- |
| **User** | `name`, `email`, `passwordHash`, `authProvider` ∈ {email,google}, `role` ∈ {student,instructor,admin}, `avatarUrl`, `googleId`, `emailVerified`, `phone`, `city`, timestamps | **unique `email`**; unique partial `googleId` |
| **StudentProfile** | `userId`→User, `collegeId`→College \| null, `collegeName`, `degree` ∈ DEGREES, `specialization`, `studyStatus` ∈ {studying,graduated}, `currentYear` 1–5 \| null, `graduationYear`, `profileCompleted`, timestamps | **unique `userId`** |
| **EmailVerificationToken** | `userId`→User, `tokenHash`, `expiresAt`, `createdAt` | `userId`; unique `tokenHash`; **TTL on `expiresAt`** |
| **College** | `name`, `normalizedName`, `city`, `state`, `source` ∈ {seed,user}, timestamps | unique `normalizedName`; compound `{normalizedName:1, name:1}` |
| **RateLimit** | `key`, `count`, `expiresAt`, `createdAt` | unique `key`; **TTL on `expiresAt`** |
| **State** | `name`, `code`, `kind`, `active`, `displayOrder` | unique `code`; `{displayOrder, name}` |
| **District** | `name`, `stateId`→State, `stateCode`, `active` | **unique `{stateId, name}`** |
| **City** | `name`, `districtId`→District, `stateId`→State, `pincode` | **unique `{districtId, name}`** |
| **University** | `name`, `normalizedName`, `shortName`, `code`, `type`, `managementType`, location refs + names, `accreditations[]`, `verificationStatus`, `collegeCount`, timestamps | unique `normalizedName`; unique partial `code`; `{stateId, type}` |
| **College** *(extended)* | the student-facing fields **plus** `officialName`, `code`, `institutionType`, `managementType`, `autonomyStatus`, `universityId`/`Name`/`Code`, `currentAffiliationId`, `stateId`/`districtId`/`cityId` + names, `address`, `pincode`, `location`, `accreditations[]`, `verificationStatus`, `studentCount`, `source`, `sourceImportId`, `internalNotes` | unique `normalizedName`; unique partial `code`; `{stateId, districtId, name}`; `{verificationStatus, updatedAt}`; `{universityId, name}`; weighted text index |
| **Affiliation** | `collegeId`→College, `universityId`→University, `type`, `status`, `startDate`, `endDate`, `referenceNumber`, `documentUrl`, `verificationStatus` | `{collegeId, startDate}`; `{universityId, status}` |
| **AutonomyRecord** | `collegeId`→College, `status`, `event`, `validFrom`, `validUntil`, `approvalAuthority`, `approvalReference`, `documentUrl` | `{collegeId, validFrom, createdAt}` |
| **Campus / Department / Program** | per-college academic structure; Department carries a `canonicalKey`, Program carries `degree` + `specialization` matching the student profile | unique `{collegeId, name}` on each; `canonicalKey`; `{degree, specialization}` |
| **AcademicYear** | `label`, `startDate`, `endDate`, `isCurrent`, `status` | unique `label`; `isCurrent` |
| **AdminUser** | `name`, `email`, `passwordHash`, `roleId`→Role, `extraPermissions[]`, `deniedPermissions[]`, `team`, `status`, `inviteTokenHash`, 2FA, lockout fields | unique `email`; `{status, name}` |
| **AdminLoginEvent** | `adminId`, `email`, `outcome`, `ip`, `userAgent` | `adminId`; `outcome`; **TTL 180 days on `createdAt`** |
| **Role** | `name`, `slug`, `description`, `permissions[]`, `system`, `adminCount` | unique `slug` |
| **AuditLog** | actor fields, `action`, `entityType`, `entityId`, `entityLabel`, `before`, `after`, `metadata`, `batchId`, `severity`, `ip` | `{createdAt:-1}`; `{entityType, entityId, createdAt}`; `{actorId, createdAt}` |
| **ImportJob / ImportRow** | job state machine + one row per parsed line, with its errors, warnings, duplicate match and result | `{stage, createdAt}`; **unique `{jobId, rowNumber}`**; `{jobId, status, rowNumber}` |
| **ExportJob / BackgroundJob / ErrorLog / FeatureFlag / Setting / SavedView** | operations (§11.7) | see `src/models/SystemModels.ts`; TTL 90 days on `ErrorLog.lastSeenAt` |
| **Course** | `title`, `slug`, `description`, `instructor`→User, `level` ∈ {beginner,intermediate,advanced}, `tags[]`, `price`, `coverImageUrl`, `published`, `lessonCount`, timestamps | unique `slug`; `instructor`; `published`; text index on `title`+`description`+`tags` |
| **Lesson** | `course`→Course, `title`, `content`, `videoUrl`, `durationMinutes`, `order`, `isFreePreview`, timestamps | compound `{course:1, order:1}` |
| **Enrollment** | `student`→User, `course`→Course, `completedLessons[]`→Lesson, `progress` 0–100, `completedAt`, timestamps | **unique compound `{student:1, course:1}`** |

Serialization: `passwordHash` is `select: false` (must be opted into with `.select("+passwordHash")`)
**and** deleted in `User.toJSON()` alongside `__v` — two independent guards so a hash cannot leak
through a route that forgets one.

`passwordHash` is required only when `googleId` is absent, so a Google account can exist without one.
`authenticate()` treats a missing hash as a failed sign-in rather than comparing against `undefined`.

**Neither verification credential is stored in the clear**, so a database dump is useless for
confirming anyone's address. The two are hashed differently, and the difference is the point:

- The **link token** gets a bare SHA-256. No salt and no work factor is correct rather than lazy —
  the input is already 32 bytes of `randomBytes`, so there is no low-entropy secret for a slow hash
  to protect.
- The **6-digit code** gets an **HMAC-SHA256 under a server secret** (`EMAIL_OTP_SECRET`, falling
  back to `JWT_SECRET`, domain-separated by an `email-otp:v1:` label). A plain hash would not
  protect it at all: a million pre-images is a sub-second sweep, so the dump has to be missing a
  key, not merely missing a plaintext.

Both TTL indexes are **housekeeping, not enforcement**. `mongod` sweeps on its own schedule, so
`verifyEmailToken()` compares `expiresAt` itself rather than assuming an expired row is already gone.

`StudentProfile` is its own collection rather than a sub-document because it is written by a
different flow, read by the personalisation code, and will grow fields (CGPA, backlogs, semester)
that have nothing to do with signing in. The unique `userId` is what guarantees one profile per
person — including the Google-links-to-existing-account case, which resolves to one `User` row and
therefore one profile.

`College.normalizedName` (lower-cased, punctuation stripped) is what makes the directory
self-healing: "St. Xavier's" and "St Xaviers" collapse to one row, so two students typing the same
institution differently cannot create two entries.

The `googleId` index is **partial** (`{ googleId: { $type: "string" } }`) rather than sparse: a sparse
unique index still treats an explicit `null` as a value, so the second password-only account would
collide.

Models are registered with the `mongoose.models.X || mongoose.model(...)` guard, required because hot
reload re-executes the module and Mongoose throws on duplicate model registration. Each model calls
[resetModelInDev](../src/models/model-cache.ts) first, which drops the cached model **in development
only**. Without it a schema edit leaves the previously compiled model in place, and Mongoose then
strips the unknown paths from every insert and update — the write succeeds and silently saves
nothing. That failure mode cost real debugging time; the reset is cheaper than rediscovering it.

### Invariants the code maintains

1. **One student profile per user** — the unique `userId` index; every write is an upsert on it, so
   a resumed or repeated onboarding step updates the row rather than adding one.
2. **`profileCompleted` is derived, never asserted.** Both step writers recompute it from the merged
   document with [`isProfileComplete()`](../src/models/StudentProfile.ts), so the flag cannot drift
   from the fields it summarises. A graduate needs no `currentYear`; a student does.
3. **Exactly one active affiliation per college** — enforced by the writers, not by an index:
   `setAffiliation` closes the outgoing period before opening the new one. No partial unique
   index can express it, because a *pending* row that has not started yet is legitimately
   `active`-shaped too. The Data Quality screen counts violations, so a write that went around
   the helpers is visible rather than silent.
4. **A college's affiliation and autonomy are histories, not fields.** `College.universityId` and
   `College.autonomyStatus` are denormalised copies of the current `Affiliation` and
   `AutonomyRecord`, written only by the code that writes those. Moving a college opens a period
   and closes the last one; it never overwrites, because the student who graduated under the
   previous university still did.
5. **The audit log is append-only.** Nothing in the application updates or deletes a row in
   `auditLogs`, and no admin screen offers to.
5a. **A textbook exists once platform-wide** — `textbooks` is keyed on ISBN-13 (partial unique) or on
   `(title, edition)`, never scoped to a college or subject. What varies per subject is the book's
   role and the units it covers, which live on `subjecttextbooks`.
5b. **A book cannot have two topic 1.3s** — `textbooktopics` is unique on
   `(textbookId, chapterNumber, topicNumber)`, which is what makes the seeder converge on a re-run
   instead of inserting duplicates.
5c. **One mapping row per (subject, book)**, and a mapping never points at a unit the subject does not
   have: the seeder drops those, because a mapping to unit 5 of a four-unit syllabus renders an empty
   section and silently is the worst way for that to happen.
6. **At most one live verification per user** — `issueVerification()` deletes the outstanding rows
   before inserting, so a resend invalidates the previous code *and* the previous link. Both live
   on one row, sharing an expiry and an attempt counter.
7. **Verification credentials are single-use** — the row is deleted before `emailVerified` is set,
   so a crash between the two leaves a dead code rather than a reusable one. Either credential
   consumes the row, so using the link also spends the code.
8. **One enrollment per (student, course)** — enforced by the unique index; POST also returns the
   existing row instead of erroring, making enroll idempotent.
9. **Unique slug** — generated from the title, then `-2`, `-3`… until free; the unique index is the
   real guarantee and a lost race surfaces as 409.
10. **`Course.lessonCount` tracks lesson rows** — `$inc` on lesson create and delete.
11. **No orphans** — deleting a course cascades to its lessons and enrollments; a deleted lesson is
   `$pull`ed from every enrollment's `completedLessons`.
12. **`progress` = round(completed ÷ total lessons × 100)**, recomputed on every progress write;
   `completedAt` is set exactly when progress hits 100 and cleared otherwise.
13. **A topic belongs to exactly one curriculum row** — `topics` is unique on `(subjectId, sequence)`
   and on `(subjectId, slug)`. Because `CurriculumSubject` already *is* one subject of one branch
   under one regulation at one college, two colleges teaching the same subject get separate topic
   lists with no query anywhere having to re-check ownership.
14. **Topics are materialised from the syllabus, never invented.** `npm run seed:topics` reads
   `CurriculumSubject.units[].topics` and upserts on the natural key, so a re-run keeps existing
   ids — which is what preserves progress and AI history across a syllabus edit.
15. **A topic that leaves the syllabus is archived, not deleted.** Progress rows and interactions
   point at it, and a delete would orphan them (§58).
16. **One content document per (topic, language)**, and students see `status: "published"` only.
   Nothing in the generator can write another status, and `PATCH` refuses `"published"` outright —
   the publish endpoint is the single path to live content and needs its own permission.
17. **`Topic.hasPublishedContent` is written by the publish transition alone.** It drives
   "Explanation ready" on the subject page; setting it at generation time would advertise text
   nobody had read.
18. **Progress is derived from flags, never asserted by a client.** `percentageFor()` sums five
   weighted signals to exactly 100, and one function writes both the flags and the percentage, so
   they cannot drift. Completion is sticky: a re-weighting must not take a finished topic back.
19a. **A teacher is confined to one college, and that college is never a parameter.**
   `TeacherProfile.collegeId` is the authority; no request body in the teaching
   module carries a college, a programme, a branch or a regulation, so there is
   nothing to validate a caller's claim against (§10).
19b. **Being a teacher grants nothing.** Every write is gated on an *active*
   `TeacherAcademicAssignment` for the subject. A teacher assigned Data
   Structures cannot act on DBMS in the same branch and semester (§11, §94).
19c. **A revoked subject assignment is never deleted.** Work published under it
   stays published — students are working against it — and the record of who was
   authorised at the time is what makes that defensible (§78).
19d. **A teacher never selects students.** The audience is derived from the
   subject by `resolveAudience()`, and "which year they are in" comes from the
   admission year rather than the stored `currentYear`, so a student who moves up
   stops matching without anybody updating a row (§19, §102).
19e. **Recipients are materialised at publish time and never re-resolved.**
   `AssignmentStudent` and `NoteRecipient` are the authorisation *and* the
   history: a student with no row cannot reach the item, and one who changes
   branch keeps what they were given (§78, §101).
19f. **A per-student assignment status never moves backwards.** Re-opening a
   graded assignment cannot drop it to `viewed` and take a submission off a
   teacher's count.
19g. **Submissions are append-only.** A resubmission supersedes the previous
   attempt rather than overwriting it, so a disputed grade can still be answered.
19h. **One notification per recipient, type and entity.** A unique index, so a
   retried fan-out writes nothing the second time — and it is an insert, never an
   upsert, so a retry cannot mark a read notification unread (§63).
19i. **Uploaded bytes never live in MongoDB, and are never publicly served.**
   `StoredFile` holds metadata and a storage key; every read goes through
   `/api/files/:id`, which re-checks the session against the item the file is
   attached to (§22, §67).
19. **AI history is scoped by the query, not by a check.** Every read in `tutor/history.ts` filters
   on `userId`, and the context builder verifies a supplied `conversationId` against both the user
   and the topic — an id belonging to someone else returns nothing rather than being fetched and
   then rejected.

## 5. API surface

Per-endpoint reference lives in [routes/api/](routes/api/); a quick table is in
[README.md](../README.md) and a rendered list at `/api-reference`. This section records the
**authorization model**, which is the part that is easy to get wrong.

| Route | Method | Who may call it | Rule enforced by |
| --- | --- | --- | --- |
| `/api/auth/register`, `/api/auth/login` | POST | public | — |
| `/verify-email?token=` | GET (page) | public | the token *is* the credential: hashed, compared, expiry-checked, then deleted |
| `/api/auth/logout` | POST | anyone | — |
| `/api/auth/google/start` | GET | public | mints state+nonce into an httpOnly cookie |
| `/api/auth/google/callback` | GET | public | state must match the cookie; id_token verified against Google's JWKS |
| `/api/auth/me` | GET | authenticated | `requireAuth` |
| `/api/colleges/search` | GET | authenticated | `requireAuth` — it runs a regex query per keystroke, so it is not left open |
| `/api/courses` | GET | public | filter pinned to `published: true` |
| `/api/courses` | POST | instructor, admin | `requireRole` |
| `/api/courses/:idOrSlug` | GET | public | — |
| `/api/courses/:id` | PATCH, DELETE | course owner, admin | `instructor === session.sub` or `role === admin` |
| `/api/courses/:id/lessons` | GET | public — **and returns full lesson bodies, see §8 item 8** | — |
| `/api/courses/:id/lessons` | POST | course owner, admin | owner check on parent course |
| `/api/lessons/:id` | GET | public if `isFreePreview`, else owner / enrolled / admin | explicit branch in handler |
| `/api/lessons/:id` | PATCH, DELETE | course owner, admin | owner check via parent course |
| `/api/enrollments` | GET | authenticated (own rows only) | query scoped to `student: session.sub` |
| `/api/enrollments` | POST | authenticated | course must exist and be `published` |
| `/api/enrollments/:id/progress` | PATCH | the enrolled student only | `enrollment.student === session.sub` |
| `/api/curriculum/topics/:id` | GET | authenticated, own curriculum only | the profile's coordinate is part of the `findOne`; a foreign id 404s exactly like a missing one |
| `/api/curriculum/subjects/:id/topics` | GET | authenticated, own curriculum only | same construction, via `authorizeSubject` |
| `/api/curriculum/search` | GET | authenticated | the subject list searched is resolved from the profile; no parameter widens it |
| `/api/ai/question` | POST | authenticated | `buildTutorContext` re-resolves the chain from the database; body carries ids only, never a provider or model |
| `/api/ai/topic/deep-dive` | POST | authenticated | as above |
| `/api/ai/question/:id` | GET, PATCH | the student who asked | query filtered on `userId` |
| `/api/ai/question/:id/retry` | POST | the student who asked | the question and topic come from the stored row, never the body |
| `/api/ai/conversations`, `/:id` | GET, DELETE | the student who owns the thread | query filtered on `userId`; DELETE archives, never deletes |
| `/api/ai/history/topic/:topicId` | GET | authenticated (own rows only) | filtered on `userId`, so a foreign topic id returns an empty list |
| `/api/learning/progress` | GET, PUT | authenticated, own topics only | `authorizeTopic` on every write; the client sends signals, never a percentage |
| `/api/learning/events` | POST | authenticated, own topics only | `authorizeTopic`, plus a closed event-type list |
| `/api/learning/bookmarks` | GET, POST, DELETE | authenticated (own rows only) | query scoped to `session.sub`; POST upserts so a double tap is idempotent |
| `/api/admin/topic-content/generate` | POST | `topic_content.generate` | `withGenerationLimit` — per-admin rate limit, batch capped at 10 |
| `/api/admin/topic-content/:id` | GET, PATCH | `topic_content.view`, plus `.edit` / `.review` per field | refuses `status: "published"` outright |
| `/api/teacher/signup` | POST | public | role set server-side; college must be an id from the directory; rate limited per address and per college |
| `/api/teacher/login` | POST | public | same `authenticate()` as students; a non-teacher gets the credential error, never "wrong door" |
| `/api/teacher/profile` | GET, PUT | teacher | college and status are not editable fields |
| `/api/teacher/academic-context`, `/subjects` | GET | teacher | resolved from `TeacherAcademicAssignment`; an unauthorised subject is never fetched, not filtered out |
| `/api/teacher/assignments` | GET, POST | teacher + `requireSubject` | body carries `subjectId` only; every other academic field comes from the authorised subject |
| `/api/teacher/assignments/:id` | GET, PUT | the owning teacher | filtered on `teacherUserId` **and** `collegeId`; `subjectId` is unrepresentable on update |
| `/api/teacher/assignments/:id/publish` | POST | the owning teacher, re-authorised on the subject | rate limited; a revoked assignment blocks it (§78) |
| `/api/teacher/assignments/:id/submissions` | GET | the owning teacher | roster starts from `AssignmentStudent`, so it cannot reach a student who is not on it (§45) |
| `/api/teacher/assignments/:id/submissions/:studentId` | GET, POST | the owning teacher | another teacher at the same college gets 404 (§94) |
| `/api/teacher/notes/**` | GET, POST, PUT | teacher + `requireSubject` | same gates as assignments |
| `/api/student/assignments`, `/:id` | GET | the student it was published to | the student's own `AssignmentStudent` row *is* the authorisation; foreign and missing ids both 404 |
| `/api/student/assignments/:id/submit` | POST | the student it was published to | window checked with the same function the UI renders from; rate limited |
| `/api/student/notes`, `/:id` | GET | the student it was published to | archived returns 410, not 404 — they were sent it (§78) |
| `/api/notifications/**` | GET, PATCH, POST | the recipient | scoped inside the query; no parameter widens it |
| `/api/notification-preferences` | GET, PUT | the owner | unknown categories and channels are dropped; `account` cannot be muted |
| `/api/files/upload` | POST | teacher (teaching material) or student (submission) | college taken from the uploader's profile; MIME, extension and size all checked |
| `/api/files/:fileId` | GET | per purpose — see §6.13 | college gate first, then the item the file is attached to; 404 for "not yours", never 403 |
| `/api/admin/teachers` | GET | `teacher.view` | scoped to the admin's own college when they have one |
| `/api/admin/teachers/:id/status` | POST | `teacher.approve` | transition table decides; a rejection or suspension needs a reason |
| `/api/admin/teachers/:id/subjects` | GET, POST, DELETE | `teacher.assign` | the subject must be in the **teacher's** college; DELETE revokes, never deletes |
| `/api/admin/topic-content/:id/publish` | POST, DELETE | `topic_content.publish` | approved-only, refuses `provider: "mock"`, requires an explicit review confirmation; DELETE requires a reason |

Two patterns are used deliberately:

- **Role gate** (`requireRole`) for "may this kind of user do this at all".
- **Ownership gate** (compare `session.sub` to the resource's owner, with an `admin` escape hatch)
  for "may this user touch *this* row". Ownership for lessons is always resolved through the parent
  course — a lesson has no owner of its own.

Each route's full contract — request schema, step-by-step behaviour, every status, the writes it
performs, its UI consumers and its own gaps — is in [routes/api/](routes/api/). The index in
[routes/README.md](routes/README.md) maps every method and path to its file.

## 6. Web UI — auth screens and the signed-in shell

Two public screens, `/login` and `/signup`, and the signed-in app behind them: a navigation rail, a
top bar, and the dashboard they land on. Both halves come from supplied designs.

This section records the decisions that span screens. Each screen's own composition, states, copy
and gaps live in [routes/pages/](routes/pages/).

### 6.1 Signed-in shell — `src/app/(app)/`

Everything under the `(app)` route group renders inside [layout.tsx](../src/app/(app)/layout.tsx),
which calls `getCurrentUser()` and redirects to `/login` when there is no valid session. That layout
is the authority; `proxy.ts` (§6.5) only does the cheap cookie check in front of it.

| Piece | File | Role |
| --- | --- | --- |
| Shell | [app-shell.tsx](../src/components/app/app-shell.tsx) | holds the drawer state and the one shared notice slot |
| Rail | [app-sidebar.tsx](../src/components/app/app-sidebar.tsx) | grouped navigation, active item, Upgrade card; fixed from `lg`, an off-canvas drawer below |
| Top bar | [app-topbar.tsx](../src/components/app/app-topbar.tsx) | search, notification bell, account menu (where Sign out lives) |
| Routes | [app-routes.ts](../src/lib/app-routes.ts), [nav.ts](../src/components/app/nav.ts) | one list of signed-in paths: the sidebar, the placeholder pages and the proxy all read it |
| Cards | [dashboard-cards.tsx](../src/components/app/dashboard-cards.tsx) | the six dashboard cards |
| Card data | [dashboard-data.ts](../src/lib/dashboard-data.ts) | one loader for the whole screen, from the database — see §6.6 |

`getCurrentUser()` ([current-user.ts](../src/lib/current-user.ts)) is wrapped in React's `cache`, so
the layout and the page inside it share one query per request rather than each issuing their own.

Seven of the sixteen sidebar destinations are built: `/dashboard`, `/curriculum`, `/assignments`,
`/notes`, `/notifications`, `/profile` and `/settings`. The other nine render
[ComingSoon](../src/components/app/coming-soon.tsx), which names the section, says what it will do and
states plainly that it is not built — so no sidebar entry is a dead link and none of them pretends to
work. Each is a real route file, ready to be replaced by the actual screen. They are listed with
their copy in [routes/pages/app-placeholders.md](routes/pages/app-placeholders.md); the dashboard
itself is [routes/pages/dashboard.md](routes/pages/dashboard.md).

### 6.2 Auth screens

Both screens share one shell ([auth-shell.tsx](../src/components/auth/auth-shell.tsx)), one field
set ([fields.tsx](../src/components/auth/fields.tsx)), one social-button component and the actions in
[auth-actions.ts](../src/lib/auth-actions.ts); only the copy, the illustration and the field list
differ. Artwork is inline SVG throughout — no image request beyond the logo tile in `public/`.

Per-screen detail: [routes/pages/login.md](routes/pages/login.md),
[routes/pages/signup.md](routes/pages/signup.md).

### 6.3 Sign-in and sign-up submit path

```
<form action={loginAction}>
      │  FormData
      ▼
loginFormSchema.safeParse        → field errors back to the form, no DB call
      │
      ▼
authenticate() / createAccount() → src/lib/accounts.ts
      │
      ▼
startSession(...)                → sets edupilot_session
      │
      ├─ sign-up only: sendVerification(...)   → link mailed, failure tolerated
      │
      ▼
destinationFor(user, next)       → /verify-email | /onboarding/education | next
```

Sign-up no longer lands on the dashboard or on onboarding. It lands on `/verify-email`, because an
unconfirmed address is the first thing that has to be resolved (§6.4a). Sign-in asks the same
`destinationFor`, so an account abandoned at any point resumes exactly where it stopped.

Both forms work without client JS, hold their fields in state so a failed attempt does not clear
them, and never reveal which half of a credential pair was wrong. The reasoning for each is in
[routes/pages/login.md](routes/pages/login.md#four-decisions-worth-knowing) and
[routes/pages/signup.md](routes/pages/signup.md#submit-path).

### 6.4 Onboarding — `src/app/(onboarding)/`

Sign-up creates the **account**; onboarding collects the **student**. The two are kept apart on
purpose — a sign-up form asking for a college is a form people abandon.

```
SIGN UP ──┬── email + password ──► /verify-email  (6-digit code, §6.4a)
          │                              │ link followed
          └── Continue with Google ──────┤ (already verified — no link)
                                         ▼
                     /onboarding/education    Step 1 of 2
                       college (searchable), degree, specialization
                                         ▼
                     /onboarding/academic     Step 2 of 2
                       currently studying / graduated
                       current year (studying only), graduation year
                                         ▼
                          profileCompleted = true
                                         ▼
                     /onboarding/complete     "You're all set 🎉"
                                         ▼
                                    /dashboard
```

`profileCompleted` on the student profile is the single source of truth, and it is **derived**
(§4, invariant 2) rather than set by whichever step ran last.

**College is a searchable autocomplete over the `colleges` collection, and free text is always
accepted.** Typing "andhra" offers Andhra University and Andhra Loyola College; a college that is
not there is saved as typed *and added to the directory* as `source: "user"`, so the next student
searching for it finds it. This is the one field where forcing a choice would be actively harmful —
a student who cannot find their college would have to name a different one, and the data would look
correct while being wrong. `resolveCollege()` re-reads any submitted `collegeId` and accepts it only
when it still carries the displayed name, so a tampered form cannot pin an arbitrary label to a real
institution.

Specialization works the same way with a local suggestion list: branch names differ far too much
between universities to enumerate.

**Step 2 branches on status rather than adding "Graduated" to the year list.** A graduate has no
current year, and their graduation year is a fact rather than an estimate — so the year selector
offers future years while studying and past ones after graduating, instead of every year from 1950
to 2034. Switching to "Graduated" clears `currentYear` server-side too, so the stale value cannot
survive a hand-edited form.

Optional profile content — photo, bio, skills, interests, LinkedIn, GitHub, résumé — is deliberately
**not** in onboarding. Two steps is the whole flow; everything else belongs on the profile screen.

A `?next=` is threaded through both steps and consumed at the end, so a deep link survives
onboarding rather than being dropped at the door.

Onboarding lives outside the app shell — no sidebar, since the user is not in the app yet — and its
own header offers Sign out.

### 6.4a Email verification — `/verify-email`

One route with two jobs, which is what makes a redirect loop impossible: there is no second page
that could disagree about whether the address is confirmed.

- **Without a token** it is the OTP screen sign-up lands on: six boxes, and the code from the email.
- **With `?token=`** it is the endpoint the emailed one-click link points at.

Both credentials are issued together by `issueVerification()` and stored on **one row**, so they
share an expiry, an attempt counter, and a single resend. The code is what the screen asks for; the
link is there because someone reading the mail in the browser they signed up from should not have to
retype anything.

The lifecycle ([email-verification.ts](../src/lib/email-verification.ts)):

1. A **6-digit code** from `crypto.randomInt` — rejection-sampled by Node, so no modulo bias to
   hand a guesser an edge — and a **32-byte token** from `crypto.randomBytes` for the link.
2. Any outstanding row for that user is deleted, then the code's HMAC and the token's SHA-256 are
   stored with an `expiresAt` (`EMAIL_VERIFICATION_TTL_MINUTES`, default 60) and `attempts: 0`.
3. Typing the code: rate-limit the submission, load the row **by `userId`**, check the expiry,
   compare the HMAC in constant time, delete the row, set `emailVerified`.
4. Following the link: shape-check the value, hash it, look up the row by hash, compare in constant
   time, check the expiry, confirm the user exists, delete the row, set `emailVerified`.

**The code is looked up by user, never by value.** Two students can hold the same six digits at the
same moment without either being able to use the other's, and there is no query here a stranger
could aim at somebody else's account — which is also why the code path needs no enumeration
defence of its own.

Guessing is bounded twice over, because six digits is only a million possibilities:

| Control | Value | Why it is not the other one's job |
| --- | --- | --- |
| `MAX_CODE_ATTEMPTS` on the row | 5 wrong codes, then the row is **destroyed** | The hard stop. Counted in the document because the rate limiter deliberately fails open, and this control must not. |
| `CODE_ATTEMPTS_PER_HOUR` rate limit | 20 submissions per account per hour | Stops the per-code counter being refreshed indefinitely by resending. |
| Resend caps (below) | 5 codes per user per hour | Bounds how many fresh five-attempt windows exist at all. |

Five tries per code against five codes an hour is 25 guesses out of 1,000,000 — a 0.0025% chance in
an hour of trying. A malformed or short code still costs an attempt: letting it through for free
would give a guesser unlimited probes at the surrounding logic.

Four outcomes for the **link**, four different screens:

| Outcome | Shown | Way out |
| --- | --- | --- |
| valid | redirect straight into onboarding, or "Email verified 🎉" if the link was opened in another browser | continue |
| already verified | the same success screen — following a link twice is not an error | continue |
| expired | "Your verification link has expired" | send a new one |
| invalid / used / unknown | "This verification link is invalid or has already been used" | sign in, then resend |

Used, expired-and-swept, and never-valid all report **invalid** in the same words. Distinguishing
them would tell whoever is holding the link something about the account behind it.

What the **code** can come back as, all of it phrased for someone who mistyped, because that is who
almost every one of them is: `incorrect` (with the tries remaining), `too-many-attempts` (the code
was just destroyed), `expired`, `no-code`, `rate-limited`, `already-verified`. Each refusal empties
the boxes; a success redirects through the same `destinationFor` as every other gate.

The OTP screen ([otp-input.tsx](../src/components/auth/otp-input.tsx),
[verify-email-panel.tsx](../src/components/auth/verify-email-panel.tsx)) submits **one hidden field**
holding the joined digits — the six boxes are presentation, and the server never reassembles
anything. Pasting into any box spreads across all of them, backspace walks backwards, `inputMode`
brings up the numeric keypad, and `autoComplete="one-time-code"` lets a phone offer the code from
its notification. Filling the last box submits on its own — dispatching a
`FormData` built from the callback's digits rather than calling `requestSubmit()`, which would read
the hidden field before React had committed the keystroke that completed it and post the previous
value. Guarded on the pending flag so a paste cannot fire twice. A refused code clears the field by **changing the component's `key`** rather than
through an effect, so there is no reset plumbing inside the component and no setState-in-effect.

The screen also offers **Send a new code**, **Change email** and **Back to login**. Change
is available only while the address is unverified — there is nothing of value behind an address
nobody has confirmed, which is exactly what stops it being an account-takeover primitive. It drops
any outstanding token, since that one was minted for the old address.

**Delivery failure is a supported state, not an error path.** If the account is created and the mail
does not go out, the user exists with `emailVerified: false` — a legitimate resting state — and the
answer is "Send a new code", not a second sign-up. This is the reason `sendVerificationEmail` resolves
`{ ok: false }` instead of throwing, and the reason sign-up does not roll back the account.

Google accounts skip all of this: the provider has established the identity, so the account is
created with `emailVerified: true` and goes straight to onboarding. The exception is a Google
account whose own `email_verified` claim came back **false** — the one address we should not take
Google's word for — which is sent a link like any other.

#### Continue with Google

Real OAuth 2.0 / OpenID Connect, not a stub:

1. `/api/auth/google/start` mints a `state` and a `nonce`, stores both (plus `next`) in a short-lived
   httpOnly cookie, and redirects to Google's authorize endpoint.
2. `/api/auth/google/callback` requires the returned `state` to equal the cookie's, exchanges the
   code for tokens, then **verifies the `id_token`** against Google's published JWKS with `jose`,
   checking signature, issuer, audience and the nonce. Claims are only trusted after that.
3. `findOrCreateGoogleUser()` matches on `googleId`, then on email **only when Google says the
   address is verified** — otherwise anyone able to create a Google address for `someone@example.com`
   could claim that EduPilot account.
4. Where they land is `destinationFor`'s decision, same as every other path: onboarding for a new
   or unfinished account (with the Google name and picture already on the row), their destination if
   they are finished.

**Linking, not duplicating.** Someone who signed up with a password at `user@gmail.com` and later
presses Continue with Google is matched to that same row and the `googleId` is attached — one
`User`, therefore one `StudentProfile`, and no collision on the unique email index. Their
`authProvider` stays `email`, because the password still works and calling it a Google account
would hide that. If the address was still unconfirmed, Google's verification settles it and the
outstanding token is dropped.

Credentials come from `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. With them unset the button
redirects back to `/login?error=google-unavailable` and the page explains it is not configured, which
is why the flow degrades rather than 500s on a deployment without Google set up.

### 6.5 Route protection — [proxy.ts](../src/proxy.ts) and [auth-routing.ts](../src/lib/auth-routing.ts)

Three layers, each doing strictly less than the one below it:

| Layer | Checks | Trusts |
| --- | --- | --- |
| `proxy.ts` | is a session cookie *present* | nothing — optimistic routing only |
| `(app)` / `(onboarding)` layouts | verified JWT, then `appGateRedirect(user)` | the layout is the authority |
| Server Actions | `getCurrentUser()` again, at the top of every write | nothing the layout did |

The third layer is not redundant. A Server Action is a public endpoint reachable with nothing but a
session cookie; the layout that rendered the form is not in the request path when the action runs.

**The ordering rule lives in one function.** [`destinationFor`](../src/lib/auth-routing.ts):

```
unverified address      → /verify-email
incomplete profile      → /onboarding/education
otherwise               → safeDestination(next) ?? /dashboard
```

Sign-in, sign-up, the Google callback, `/verify-email`, and the `(app)` layout all call it. That is
the whole loop-prevention argument: two gates each holding their own copy of "verified? onboarded?"
is exactly how a ping-pong starts, and there is only one copy.

The `(onboarding)` layout deliberately checks **only** session and verification. Whether the profile
is finished means opposite things on a step page ("you are done, go to the dashboard") and on
`/onboarding/complete` ("you are done, that is why you are here"), so each page decides for itself —
had the layout decided, the completion screen would bounce itself.

`proxy.ts` never verifies the JWT, only that a cookie exists. The `(app)` layout does, and is the
authority.

The path list lives in [app-routes.ts](../src/lib/app-routes.ts) so the proxy and the sidebar cannot
disagree. `config.matcher` still repeats it literally: Next requires the matcher to be statically
analysable at build time, so it cannot be computed from the import. Adding a screen means adding it in
both places.

It deliberately does **not** bounce cookie-holders off `/login` and `/signup`: with an expired token
that loops forever (`/login` → `/dashboard` → invalid → `/login`). Those two pages verify the session
themselves and redirect only when it is genuinely valid.

`?next=` runs through `safeDestination()` ([redirects.ts](../src/lib/redirects.ts)), which accepts
only single-slash relative paths, so `?next=https://evil.example` and `?next=//evil.example` fall back
to `/dashboard` instead of becoming an open redirect.


#### A teacher at the student door

`RoutingUser` carries an optional `role`, and both `destinationFor` and
`appGateRedirect` send a teacher to `/teacher/dashboard` before they ever ask about student
onboarding.

The student login **accepts a teacher** — the account, the credential check and the session cookie
are all the same, and only the role differs. Without the role check that account was sent to
`/onboarding/academic` and asked for its admission year and branch. A teacher could complete it, and
the result was a `StudentProfile` attached to a teacher's account.

Routing rather than refusing is deliberate, and it is why the two doors are **not** symmetric. The
teacher login turns a student away with the credential message, so it cannot be used to discover which
addresses exist. Doing the same here would tell a teacher that their correct password was wrong.

`role` is optional so every caller written before teacher accounts stays correct: absent means student,
which is what those paths were built against.

### 6.6 What the UI does not do

The screens are complete; much of what they display is not yet real. Everything below is deliberate,
and every case says so on screen rather than faking it.

**The dashboard is real, and the cards that could not be are gone.**
[dashboard-data.ts](../src/lib/dashboard-data.ts) used to be a list of constants — a wallet balance,
a timetable, a notice board, a placement, a task list — and the screen built on it was the one place
in the product that contradicted the student's own profile: it announced a semester-5 fee deadline to a
semester-3 student and listed subjects they were not taking. Invented data is worse than an empty card,
because the reader cannot tell which half of the screen to believe.

The rule now is that **a card exists only if a model backs it**:

| Card | Source |
| --- | --- |
| This semester | `getCurriculumOverview()` — the student's real position, subjects and regulation |
| Due soon | `AssignmentStudent` rows, narrowed to a fortnight, with pending and overdue counts |
| Your studying | `LearningEvent` and `StudentTopicProgress` |
| Notes from your teachers | `NoteRecipient` rows |

Wallet, timetable, placements, events and the rest had no model and no API. They are now a **Coming
soon** strip that links to the same pages that say they are not built, so the dashboard promises
nothing the next tap does not honour.

Two things are worth knowing about the study card:

- The **streak is derived on read**, not stored. A stored counter needs a midnight job in the right
  timezone to break it, and is wrong for everyone in the window between the day ending and the job
  running. Counting distinct active days backwards is one indexed query over a collection already
  TTL'd to a year.
- A day counts if **anything** happened in it. Weighting "topic completed" above "topic opened" would
  make the number unexplainable to the person it is shown to.

The semester card says when the position was **derived** from the admission batch rather than confirmed,
and links to `/profile`. A derived semester is a guess, and the student is the only one who can
correct it.

**Controls with no backend say so.** Search, the notification bell and Upgrade to Pro all route
through the shell's notice slot and state that they are not connected. The **Microsoft and Apple**
buttons do the same — only Google has a real OAuth implementation (§6.4).

**Google sign-in is unverified end to end.** The authorize URL, state/nonce round trip, token
exchange, JWKS verification and account linking are all implemented, but nobody has run them against
Google with real credentials yet. Expect first-run friction over the registered redirect URI.

**Placeholder pages.** The nine unbuilt sidebar destinations (§6.1), plus `/forgot-password`,
`/terms` and `/privacy`. A password reset needs a token store and an email sender; sign-up asks people
to agree to terms nobody has written yet.

**Other gaps.** No rate limiting on either auth form (§8, item 9). The dashboard greeting is computed
from **server** time, so it would read wrongly for anyone in another timezone — fine for one campus,
not for a distributed user base.

### 6.8 Census tiles on the Colleges list

The Colleges list opens with six tiles — a total plus one per verification status — rendered by
`StatTile` in [ui.tsx](../src/components/admin/ui.tsx) and fed by `getCollegeVerificationTotals` in
[data/colleges.ts](../src/lib/admin/data/colleges.ts).

`StatTile` is separate from `StatCard` on purpose. `StatCard` answers "how is this moving" and carries
a delta against a previous period; a census answers "how much of the whole is this" and has no time
axis, so it is a tile and not a chart.

**Counts are directory-wide, never filtered.** Same convention as the filter-chip counts, and it is
what makes the row usable as a filter: counts that tracked the current filter would read 0 on every
tile except the one just clicked. The filtered figure is in the table footer. Archived rows are
excluded, matching `listColleges` — a tile total that disagreed with the table under it would be
worse than no tile at all.

**Every status gets a tile, zero included.** A status that vanished when empty would stop the tiles
summing to the total; "Rejected 0" is a statement worth making. This is also why the tiles do not
follow the mockup they came from, which showed four statuses and omitted `not-verified` — with real
data that hides 66 colleges and the six figures stop reconciling.

**Colour sits on the glyph only.** The count and label wear ordinary slate ink. Tinting the number
too would leave a reader who cannot separate rose from emerald with nothing to go on, and colour there
is only a second copy of what the label already says. Tones come from `BADGE_TONES` via the same
mapping `VerificationBadge` uses, so a status is not violet in the table and orange above it — the
mockup's amber "Needs Review" was dropped for that reason.

**Tile order is a colour constraint, not a taste one.** `VERIFICATION_STATUSES` order puts emerald
next to rose, a pair deuteranopic readers separate by ΔE 5.8 — under the floor. Reading down from
settled to rejected keeps them apart (worst adjacent pair becomes ΔE 6.4, inside the band that a
visible label legalises) and every tile is labelled, so colour is never the sole cue.

### 6.7 Admin chrome and theming

The admin shell is [admin-shell.tsx](../src/components/admin/admin-shell.tsx) — a fixed navigation
rail, a sticky 52px header holding the command palette and the account menu, and a content column
that carries its own left padding so the rail can stay `fixed`. The rail itself is
[admin-sidebar.tsx](../src/components/admin/admin-sidebar.tsx); it collapses to a 60px icon strip,
and the collapsed flag lives in `AdminShell` because the content column has to shift with it.

**Two levels, one open at a time.** The rail lists the nine sections and nothing else until one is
opened; opening a section closes the previous one. Forty-odd destinations laid out flat was a wall
nobody read, and an operator is only ever working inside one section. A closed section renders no
children at all — they are absent from the DOM, not hidden with CSS.

A section heading is a **disclosure, not a link**: there is no landing page behind "Institution
Management", so making it navigate would mean inventing a destination. Everything stays reachable in
one keystroke through the command palette regardless of what the rail has open.

Which section is open is **derived, not synchronised**. The default is whichever section holds the
current page — landing on a page with its section shut would hide the entry for the screen being
looked at. A click overrides that, but the override records the path it was made on, so any navigation
retires it and the new page's section opens by itself. That is deliberately not a `useEffect` copying
the route into state: `react-hooks/set-state-in-effect` is an error in this repo, and the derived form
has one source of truth. `activeSectionKey` resolves the owning section by longest path match,
mirroring `navItemForPath`, so `/admin/colleges/123` opens Institution Management rather than the
Dashboard section whose `/admin` href prefixes every admin path.

In the 60px collapsed strip there is nowhere to put children, so a section icon click widens the rail
*and* opens that section. A shut section holding the current page shows a blue dot in place of the
open chevron, so "where am I" survives closing it.

**One light-first surface.** The rail is `bg-white`, the page behind it `#f7f8fa`, separated by a
`border-slate-200` hairline — the rail continues the content surface rather than opposing it. It was
previously a hardcoded `bg-[#0b1220]` with no light or `dark:` variant, which is worth not repeating:
a permanently dark rail cannot participate in a theme, and it forced every label on it to a colour
that failed on any other background.

**Dark mode is the OS setting, not a preference.** There is no theme toggle and no `data-theme`
attribute anywhere; Tailwind's default `dark:` variant resolves through
`@media (prefers-color-scheme: dark)`, so the OS is the only input. Anything added to the admin chrome
therefore needs an explicit `dark:` pair — a bare light colour silently stays light on a dark page.

**Dark values keep the rail above the page.** Content goes `slate-950` (`#020617`) and the rail
`slate-900` (`#0f172a`), so the rail reads as the nearer surface. The old rail was *lighter* than the
dark-mode content it sat against, which inverted that hierarchy.

**Contrast floor.** Every text colour in the chrome clears WCAG AA (4.5:1). The values are picked for
the surface they sit on, which is why they come in pairs: nav labels `slate-600` on white (7.6:1) and
`slate-400` on `slate-900` (7.0:1); section headings `slate-500` on white (4.8:1); the active item
`blue-700` on a `blue-50` pill (6.2:1) with a 2.5px `blue-600` bar at the rail's edge. `slate-400` is
**not** a text colour on white — it measures 2.6:1 — though it is fine for a decorative dot.

### 6.9 AI Course Content — `src/lib/admin/ai/`

An admin module that generates curriculum-aligned learning content for one subject, reviews it,
versions it and publishes it. Phases 1 and 2 of the module spec: the academic cascade, structured
generation, jobs, versioning, the review workflow and a real Gemini provider. Phases 3–5 (Ollama, RAG,
the student-facing side) are not built; the seams for them are.

**Two levels of the academic hierarchy did not exist.** The platform had College → Department → Program
and a global `AcademicYear`, but no regulation, no subject and no year/semester coordinate —
`regulation` and `syllabus` appeared nowhere in the codebase. [Curriculum.ts](../src/models/Curriculum.ts)
adds `Regulation` and `CurriculumSubject` as an *extension*: every document points at the college,
department and programme rows the academic module already owns, and nothing is re-declared.

**"Course" is a degree, not a row.** `Program` already carries `degree` ("B.Tech") plus `departmentId`
(the branch), so the specification's `Course → Branch` is a view over existing data rather than a new
level to store. Step 2 of the cascade returns distinct degrees; step 3 returns the departments that have
a programme of that degree, *and resolves `programId`* so no later call has to re-derive it. This is why
all 642 existing programmes were reused with no migration.

**A subject is keyed on (college, regulation, branch, code) — the branch included.** A first-year
subject like MA101 is genuinely shared across CSE, IT and ECE, and each branch's curriculum lists it, so
the correct shape is one row per branch. A key without `branchId` lets three branches upsert onto one
document; two of them then lose the subject entirely while every write reports success.
`academicYearId` is deliberately *not* on the subject: R23 semester 3 is the same subject list every
year. The academic year belongs to the *content* generated for a cohort, not to the curriculum.

**The cascade is seven server queries, not a static map**
([data/curriculum.ts](../src/lib/admin/data/curriculum.ts)). Each step filters by everything chosen
before it, and an incomplete coordinate returns *nothing* rather than something wider — dropping
`branchId` from a subject query would answer with another branch's subjects, which is the exact leak the
specification forbids.

#### What the browser is not trusted with

The generate request carries **ids only**. Any name or syllabus in the body is ignored:
[context.ts](../src/lib/admin/ai/context.ts) re-resolves the whole chain from the database and verifies
it *link by link* — programme belongs to the college, branch is that programme's department, regulation
covers that degree, academic year falls inside the regulation's window, subject belongs to all of the
above at that semester. The failure names which link broke, so the UI can point at the right dropdown.
The job stores the **resolved** context, never the caller's payload.

The prompt lives on the server for the same reason ([prompt.ts](../src/lib/admin/ai/prompt.ts)). A
prompt the browser can see is one it can rewrite, and those rules are what stand between "generate this
syllabus" and "generate anything". `PROMPT_VERSION` is stamped on every version and job — without it, a
change to the wording makes every historical generation unexplainable.

#### Structured output, not HTML

[schema.ts](../src/lib/admin/ai/schema.ts) holds one zod schema per content type and derives the JSON
Schema from it, so the two cannot drift. The zod object is the authority: a provider's constrained-decode
mode reduces malformed responses but cannot eliminate them, and a truncated response still parses.
Fields are `.nullable()` rather than optional throughout — a value the model could not source must
arrive as an explicit null with an entry in `unavailable`, because a silently absent key is
indistinguishable from one the prompt forgot to ask for.

`syllabusUnitsCovered` is how grounding becomes *checkable* rather than merely requested: the model
declares which supplied units it wrote about, and [validator.ts](../src/lib/admin/ai/validator.ts)
rejects a response naming a unit the syllabus does not contain.

#### The validation pipeline

Schema → academic context → content → consistency → draft. Errors fail the job; warnings are stored and
shown. The distinction matters: a hallucination check that quietly passed borderline content would be
worse than no check, because it would give a reviewer false confidence.

Citation shapes (page numbers, ISBNs, DOIs, standards numbers) are compared against the subject's own
reference list rather than flagged on sight, so the check does not cry wolf on the books the curriculum
prescribes. Endorsement phrases ("university-approved") are warnings, not errors — an exam-preparation
document may legitimately mention the university syllabus.

**Nothing in the pipeline can publish.** `requireAdminReview` in AI Settings does not gate that; there
is simply no code path from generation to `status: "published"`. `academicallyApproved` defaults to
false and is set in exactly one place: an administrator answering a prompt at approval time.

#### Asynchronous by construction

`requestGeneration` validates, checks for duplicates and creates a job; `runJob` does the slow work,
invoked through `after()` from `next/server` so the response is already flushed. The browser gets a job
reference in milliseconds and polls. `runJob` claims its job with a conditional update, so a
request-triggered run and a retry cannot both call the model and bill twice for one document. The route
sets `maxDuration = 300`, because `after` inherits the route's budget — without it a long generation is
killed halfway and the job sticks in `processing`.

`runJob` **re-resolves the context** rather than trusting the stored one: between queueing and running, a
subject may have been remapped or a regulation archived.

#### Duplicate prevention and versioning

The content collection has a unique index on the full coordinate plus content type, so "content already
exists" is a database guarantee rather than a race between two administrators. The check runs *before*
generating, so the operator is offered Open / New version / Generate missing / Replace draft instead of
being told after a model has been paid for.

Every generation, edit and restore writes a version. **Restoring writes a new version holding the old
payload** — it does not rewind a pointer, because that would erase the fact that the newer version ever
existed. Restoring onto approved content sends it back to review: the approval was of a specific
document. Published versions are immutable, and stay flagged after an unpublish, because they were live
and that is a historical fact.

#### Provider abstraction

[provider.ts](../src/lib/admin/ai/provider.ts) is the seam. `generator.ts` never imports a vendor SDK
and never reads a key; it asks for structured JSON and gets a `ProviderResult`. Credentials are read
from `process.env` inside each provider at call time — never cached in a module variable (a long-lived
server would keep serving a rotated key) and never from the config document, which the settings screen
returns to the browser.

`ProviderError` is a closed set because each code needs a distinct user-facing message and a different
retry policy: a rate limit is worth retrying, a bad key never is. Gemini's `MAX_TOKENS` finish reason is
treated as a **failure**, not a success — a truncated academic document is the most dangerous kind of
success, since the JSON still parses and the units array is merely short.

The **mock provider is the default**, and it is not a stub: it reads the syllabus back out of the prompt
it was handed and builds schema-valid content from the real unit titles, so the whole pipeline can be
exercised without a key. Everything it writes says it is placeholder text, and the publish endpoint
refuses `provider: "mock"` outright.

##### Vertex AI is the primary provider; Gemini by API key is the fallback

Two providers call the **same Gemini models over the same wire format** and differ only in URL and
credential, so the body building, response reading and error mapping live once in
[gemini-core.ts](../src/lib/admin/ai/providers/gemini-core.ts). The alternative was a second
three-hundred-line provider that agreed with the first on every subtle point — `MAX_TOKENS` being a
failure, a blocked prompt being non-retryable, a 404 meaning "wrong model name" — until somebody
changed one of them.

**Why Vertex first.** Not the output, which is identical. Access is an IAM role that can be scoped,
audited and rotated centrally rather than a key somebody pasted into an environment; prompts are
covered by the Google Cloud terms and are not used to train the models; quota belongs to the project
rather than to one key; and a region can be pinned. For a platform whose prompts carry a named
student's syllabus and their questions, the second of those is the one that decides it.

**Why Gemini second, rather than OpenAI.** Two reasons, and the cost one is the weaker:

- It is the same model over the same wire format, so a fallback answer obeys the same response schema
  and reads the same to a student. Falling from Gemini onto GPT would change how every answer is
  written at the exact moment something is already wrong.
- It fails **independently in the way that matters**: an expired service account, a missing
  `aiplatform.user` role or a project quota takes Vertex down without touching an API key. A
  Google-wide outage defeats both, which is what `AI_FALLBACK_PROVIDERS=gemini,deepseek` is for.

Flash is the everyday model and Pro only the advanced tier. The tutor answers thousands of ordinary
questions and a handful of hard ones, and Flash costs roughly a tenth as much per answer; `tierForDepth()`
already routes the genuinely hard requests upward.

**Credentials, in the order tried.** `GOOGLE_VERTEX_ACCESS_TOKEN` (a `gcloud` token — a laptop, never a
deployment), then a service account key as JSON or base64 in `GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON`, then
the **metadata server** when running on Google Cloud with a service account attached. The third is best
where it is available, because no key exists to leak, rotate or commit.

[vertex-auth.ts](../src/lib/admin/ai/providers/vertex-auth.ts) mints the OAuth token itself — an RS256
JWT and a form post, about sixty lines — rather than pulling in `google-auth-library`, whose
transport, retry policy and filesystem credential search would all have to be reconciled with the job
runner's. Tokens are cached per credential until two minutes before expiry: one lasts an hour and
minting one costs a round trip plus an RSA signature, so doing it per request would add both to every
answer. `canAuthenticate()` deliberately makes **no** network call, because it runs while building the
fallback chain on every request.

Base64 is accepted for the service account because a key is multi-line PEM inside JSON and most
deployment platforms mangle newlines in environment variables. A key that cannot be used to sign is
reported as `not-configured` naming the newline problem, not as `unauthorized` — the latter sends an
operator to check a credential that is correct and merely unreadable.

#### Permissions

Six on `ai_course_content` (view, generate, edit, review, publish, delete) and two on `ai_settings`
(view, manage). Publishing is separate by design: the PATCH endpoint refuses `status: "published"`
outright, so there is exactly one path to live content and it needs its own grant. Content Admin gets
generate, edit and review but **not** publish.

#### Commands and configuration

| | |
| --- | --- |
| `npm run seed:curriculum` | Regulations and subjects for six engineering colleges — idempotent |
| `npm run sync:role-permissions` | Grants existing roles the AI permissions their presets gained — **required after adding any permission module** |
| `GOOGLE_VERTEX_PROJECT_ID` | The primary provider. With a credential below, this is all Vertex needs |
| `GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON` | Raw JSON or base64. Omit entirely when running on Google Cloud |
| `GEMINI_API_KEY` | The fallback, and the admin generator. Read from the environment, never stored in the database, never returned by the API |

The seeder is non-destructive: it upserts on natural keys and never touches colleges, departments,
programmes or academic years. It seeds R23 and R20 for CSE, IT and ECE so the coordinate demonstrably
matters — R23 CSE semester 3 has Data Structures, R20 has Data Structures through C++, and ECE has
neither.

Setting the key alone does nothing. A provider must also be **enabled** in AI Settings, because enabling
one has a cost, and doing it automatically because a key happened to be present would start spending
money without anyone choosing to.

`ensureProviderConfigs()` **backfills** a row per implemented provider rather than seeding only an empty
collection. The seed-once version left every existing deployment unable to see a provider added after
its first run: `vertex` shipped, the code supported it, and the settings screen — which renders from
these documents — had no row to show, so the only way to enable it was a manual database edit. The
backfill only ever *inserts*; an existing row keeps its `enabled`, `isDefault` and tuning, so it can
never switch a provider on or change which one is default.

#### Adding a permission module to an already-seeded database

Roles are *data*. `ROLE_PRESETS` is written to the `roles` collection once, and is editable afterwards
— so adding a permission module to the presets has **no effect** on a database that was already seeded.
Super Admin keeps working because it holds the `*` wildcard; every other role silently lacks the new
module, and the sidebar section simply does not appear for them.

`npm run sync:role-permissions` closes that gap. It is additive and **only fills in a module the role
has no permissions for at all**: if a role already holds any permission in a module, it is left
completely alone, because an operator may have deliberately removed one and a sync that "restored" it
from the preset would quietly undo a security decision. A module with nothing in it cannot be a curated
state — it is a module that did not exist when the role was written. `--dry-run` prints the plan;
`--module a,b` scopes it. Custom roles are never touched, and nothing is ever removed.

Permissions are resolved per request rather than stored in the session cookie, so signed-in
administrators pick up a change on their next page load without re-authenticating.

#### Not built

The AI assistant panel (Improve / Simplify / Translate and the rest) is stubbed with an explanation
rather than shown as disabled buttons that do nothing. Source-material upload and text extraction,
embeddings and retrieval, and the student-facing consumption path are later phases; `AiContentSource`
and the `embed()` slot on the provider interface exist so they can be added without reshaping the
database.

### 6.11 Student curriculum — `/curriculum`

Two screens over the data model in 3.7-3.9. Both resolve the academic coordinate from the
**profile**, server-side, and neither accepts one from the browser.

**`/curriculum`** — [page.tsx](../src/app/(app)/curriculum/page.tsx),
[curriculum-overview.tsx](../src/components/app/curriculum-overview.tsx). Header states the resolved
position; body is the semester's subject cards with credits, unit and topic counts, the primary book
and an estimated reading time.

`getCurriculumOverview()` returns a **discriminated `CurriculumState`**, not a list plus a boolean.
Each case gets its own words and its own way out, because these are different problems and answering
all of them with "no data" is what makes an incomplete product look like a broken one:

| State | What the student sees |
| --- | --- |
| `ready` | the subject grid |
| `no-profile` | finish onboarding |
| `graduated` | no current semester |
| `no-regulation` | the college has no syllabus configured — nothing for them to do |
| `no-subjects-for-branch` | the regulation exists, their branch is not filled in |
| `no-semester` | we know the year but not which half; add an admission year |
| `empty-semester` | other semesters exist, this one is not filled in |

The last two are distinguished by a `countDocuments` on the coordinate without the semester —
"we have no curriculum for you" and "this semester is empty" need different answers.

A position with `source: "derived-from-admission"` is presented as **correctable**, with a link to the
profile, and says so more loudly when `storedYearConflicts`. A derived semester shown as settled fact
is how a student ends up revising the wrong syllabus without ever being given the chance to notice.

**`/curriculum/[subjectId]`** — [subject-detail.tsx](../src/components/app/subject-detail.tsx). The
**syllabus unit is the heading and the book sits inside it**, matching 3.8: the exam follows the
syllabus, the reading follows the book. Each unit shows its syllabus topics, then "Read in <book>"
with the mapped chapters and their topics (label, difficulty, minutes) — and, where a unit has no
mapping, says so rather than rendering an empty section.

Subjects the syllabus names but the catalogue does not hold appear under **Further reading**, with no
chapters to open, and are excluded from the Textbooks list so no book is listed twice.

**Ownership is part of the query, not a check after it.** `getSubjectView()` puts the profile's
college, programme, branch and regulation into the `findOne`, so a subject belonging to another
college is simply not found. A foreign id, a well-formed id that does not exist, and a malformed id
all return **404** — verified against the running server, along with a 307 to `/login` with no
session. Identical answers, so a probed URL cannot be used to learn what another college runs.

### 6.10 Student academic onboarding — `src/lib/onboarding/`

The academic identity a student builds at signup: state → institution → course → branch →
regulation → batch → year/semester → subjects → graduation. It reads the **same curriculum data the
admin module configures** (§6.9) rather than a parallel copy, so a subject an administrator adds
appears in onboarding immediately.

**Almost all of the hierarchy already existed.** `State`, `University` (44 rows, including every
JNTU, OU, KU, TU, MGU, PU, SU, AU, SVU, ANU and YVU), and `College` — which already carried
`institutionType`, `autonomyStatus`, `universityId` and `stateId`. `Program.degree` is the course and
`Department` is the branch, exactly as in the AI module. Only three things were genuinely missing: the
academic coordinate on `StudentProfile`, `CollegeRequest`, and a student-facing resolver.

**The old free-text fields are kept, not replaced.** `collegeName`, `degree` and `specialization` are
required on the schema and are read by the existing dashboard, so every write fills them from the
resolved context. Profiles written before this module stay valid; profiles written after satisfy both
readers.

#### Steps with no data are skipped

Six of 480 colleges have a curriculum configured. Requiring a regulation and subjects would leave
students at the other 474 unable to finish onboarding at all, so `hasCurriculum` drives the shape of
the flow: those students go state → institution → course → branch → batch → year → review, and
`isAcademicallyComplete` does not ask for what their college cannot supply. The profile fills itself in
later when an administrator adds the curriculum — nothing needs re-running.

`nextStepFor` **derives** the resume step from what the profile holds rather than incrementing a
counter. A number would point at the wrong step the moment the flow skipped one, and it is also what
makes a closed browser resume correctly.

#### Nothing the browser says is trusted

`resolveStudentContext` verifies every relationship before anything is written (§30): the college is in
the chosen state, the programme belongs to that college, the branch is that programme's department, the
regulation belongs to that configuration, and **each subject belongs to the whole tuple** — college,
programme, branch, regulation *and* semester. The subject check is one query carrying all six
constraints rather than a fetch-then-compare, because a subject from another regulation would otherwise
pass an existence check and be stored.

Two things are deliberately *read* rather than accepted:

- **Affiliation.** The university comes from the college, never from the request. A student could
  otherwise claim a JNTUH affiliation for an unaffiliated college. A supplied id is compared against
  the college's own and rejected if it disagrees.
- **The current year.** Derived from the semester, so the two cannot disagree.

An id that is *absent* is fine — the flow may not have reached that step. An id that is present but
does not belong is a rejection, because it can only come from a stale form or a tampered request.

#### Autosave and completion

`PATCH /api/profile/academic` autosaves; `POST` submits. They share one handler, so **an autosave is
validated exactly as strictly as a submit** — a laxer autosave path would be the way around every check
above. Neither accepts a `profileCompleted` flag: completion is computed from the resolved context
(§34), and the response echoes back the *server's* resolved names so the review screen shows the truth
if the client's cached labels ever disagree.

The client debounces at 900ms and stores `onboardingStep` on the profile, which is what a resumed
session reads.

#### A partial write is a merge, not a replace

The write is built from the *resolved context*: `saveAcademicSelection` sets every field of the
coordinate from what it resolved, which is what keeps the denormalised names in step with the ids. That
makes an absent field indistinguishable from a cleared one unless something upstream keeps them apart,
and for a while nothing did — `readSelection` mapped a missing key to `null`, so a single
`PATCH {"currentSemester": 5}` resolved to a profile with no college, no branch, no regulation and no
batch, wrote all of it, and dropped the student back into onboarding with their institution gone.

Two changes close that:

- **[route.ts](../src/app/api/profile/academic/route.ts) only reads keys the body actually contains.**
  An absent key stays absent; an explicit `null` still clears. The distinction has to exist in the
  parse, because after that the two are the same value.
- **[save.ts](../src/lib/onboarding/save.ts) merges over what is stored.** `storedSelection()` reads
  the profile back as an `AcademicSelection` and `mergeSelection()` lays the request over it, so an
  unmentioned field keeps its value.

The merge **cascades**, because the coordinate is a chain and moving a link invalidates everything
below it:

| Changed | Cleared, unless the same request supplies it |
| --- | --- |
| `stateId` | college, university, programme, branch, regulation, subjects |
| `collegeId` | university, programme, branch, regulation, subjects |
| `programId` | branch, regulation, subjects |
| `branchId` | regulation, subjects |
| `regulationId` | subjects |
| `currentSemester` | subjects |

Without it a partial update produces a coordinate that cannot resolve — a new college with the old
branch still attached — and `resolveStudentContext` rejects the whole save citing a field the caller
never sent. `admissionYear` deliberately clears nothing: the year and semester are re-derived from it on
every resolve, and an explicit semester override is a correction a batch edit should not silently throw
away.

The browser flow always sends the whole selection, so it never triggered any of this. That is precisely
why it was worth fixing rather than left to every future caller being equally generous.
`mergeSelection` is exported and covered directly in
[tests/unit/academic-merge.test.ts](../tests/unit/academic-merge.test.ts).

#### Per-semester subjects are recorded, not just cached

`saveAcademicSelection` writes a `StudentSemesterSubjects` row alongside the profile.

`StudentProfile.subjectIds` is one flat array with no semester on it, so recording the fourth semester
overwrites the third — and with it the only record of what the student actually took.
[StudentSemester.ts](../src/models/StudentSemester.ts) exists to keep that history, and until now
**nothing in the application wrote it**: a seed script was its only author. The consequence was visible
rather than theoretical — `subjectsConfirmed` is read from `confirmedAt`, so it was false for every
real student, and `/curriculum` told someone who had just chosen their semester and subjects that it
had guessed them.

`confirmedAt` is set on a **submit** only, never on an autosave: an autosave is the flow passing
through a step, not the student agreeing to what is on it. Once set it is never cleared, because a
confirmation is a thing that happened.

The profile field stays as the current-semester cache, so every existing read keeps working and this is
an addition rather than a migration.

#### Three screens, one answer

`/profile`, `/curriculum` and the dashboard all describe the same student, and each had been reading a
different source:

| Question | Read from |
| --- | --- |
| Which year and semester? | `getCurriculumOverview().position` — derived from the admission batch unless the student said otherwise |
| Which subjects? | `getCurriculumOverview()`, which prefers the student's own list and falls back to the regulation's |
| Was that a guess? | `position.source === "derived-from-admission"` |
| Did they pick their own subjects? | `subjectsConfirmed` |

The last two are **different questions**, and conflating them is how the profile came to say "worked
out from your admission batch" to a student who had typed their own semester. Reading the stored
`currentYear` directly is how it came to say "Year: Not set" beside a dashboard announcing "Semester 5
of 8" — both describing the same person.

`/profile` still resolves the stored coordinate separately, because that is the one question it alone
answers: *is what is stored still valid*. When it is not — an archived regulation, subjects left
without a semester — the page says which part no longer holds instead of rendering a blank.

#### Correcting a finished profile

`/profile` ([profile-screen.tsx](../src/components/app/profile-screen.tsx)) shows the account and the
resolved academic coordinate, and links to `/onboarding/academic?edit=1`.

It renders **through the resolver**, not from the profile document's denormalised `collegeName` and
`branchName`. Those exist for the legacy dashboard and go stale as soon as a college is renamed, and the
one reader who must never be shown a cached label over a different id is the student checking whether
their details are right. When the stored coordinate no longer resolves — an archived regulation, a
merged branch — the page says which part no longer holds instead of erroring or rendering blank: the
profile still exists and the student can still act on it.

**Editing reuses the onboarding flow.** A separate edit screen would be a second implementation of the
cascade — pick a college and the branch, regulation, semester and subject lists all reload against it
— and the copy students used less often would be the one that drifted. `?edit=1` changes three things
and nothing else:

- it is what gets a completed profile past the `profileCompleted` guard, which was otherwise absolute.
  A student whose derived semester or branch was wrong had nowhere to go: `/curriculum` told them to
  check their profile and no screen could change it.
- the flow opens on the **review** step, the only one showing everything with a way into each of them,
  and "done" returns to `/profile` rather than `/onboarding/complete`.
- **autosave is off.** Autosave exists so an abandoned onboarding can resume; applied to an edit it
  would mean a half-changed profile is already live — pick a new college, close the tab, and the
  branch, regulation and subjects are gone with nothing chosen to replace them. An edit is atomic:
  nothing is written until Save, and leaving keeps the profile the student had.

The flag only decides where a student may land. It grants nothing — every save still goes through the
same resolution and the same completeness bar.

One related defect went with it: the flow auto-selects a college's only course, and that fired on mount
over a course the student already had, clearing the branch, regulation, semester and subjects beneath
it. Harmless while the flow was only ever entered step by step; not harmless once it can open on the
review screen. It now only fills an empty choice.

Subjects are **not** part of `isAcademicallyComplete`, so moving semester clears the old semester's
subjects without making the profile incomplete. That is deliberate: the student stays in the app and is
invited to pick the new ones rather than being forced back through onboarding.

#### Batch, lateral entry and graduation

`admissionYear` is stored separately from the current year, because a 2023-batch third-year and a
2025-batch first-year are both studying now and only the batch says which regulation applies to them.
`admissionType: "lateral-entry"` subtracts a year from the derived graduation — those students enter in
year 2, so a four-year course takes them three. The student's own graduation year always overrides the
formula; a transfer or a repeated year makes the arithmetic wrong.

A **superseded** regulation is selectable. An R20 student is still an R20 student after R23 arrives, and
hiding the older code would lock out exactly the senior students who need the platform most. Only
`archived` is refused.

#### College requests

`CollegeRequest` (§36) is deduplicated three ways: a partial unique index on `(userId, normalizedName)`
scoped to `pending` — partial, so a student may legitimately re-ask after a rejection; a check against
existing colleges under a different spelling, which returns the real row instead of filing a request an
administrator would close as a duplicate; and a `requestCount` roll-up so the queue can be worked in
order of how many students are blocked. `normalizeCollegeRequestName` strips punctuation and the words
almost every Indian institution name contains, so "Aditya College of Engineering & Technology" and
"Aditya College of Engineering and Technology" collide. Deliberately aggressive: a false collision costs
one sentence in the queue, a missed one costs a duplicate row in the list everyone picks from.

A request never becomes a `College` on its own — the directory is reference data other students select
from, and a self-service path into it would fill it with duplicates within a week.

#### Why one route, not eleven

`/onboarding/academic` hosts the whole flow. Which steps exist is not known until the student has picked
a college, so a route per step would have to encode a half-built profile in the URL to decide where to
send them next. The state list is server-rendered, since it is the one thing every student sees and it
never changes between requests.

#### Not built

Personal information (§8) still lives in the existing signup and Google flow; the flow starts at state,
and `/profile` shows the name, email, phone and city read-only — there is no screen that edits them.
Backlog and completed-subject tracking (§45) is designed for — `subjectIds` is the current semester only
— but not implemented. The admin screens for managing regulations and subjects are the AI module's
(§6.9); there is no student-facing CSV import (§39).

### 6.12 Topics, prepared content and the AI tutor — `src/lib/learning/`, `src/lib/tutor/`

The student-facing half of the AI module: the syllabus becomes clickable topics, each topic has a
written explanation that costs nothing to read, and a tutor answers questions about it grounded on
that student's own curriculum.

**The architectural rule the whole module is built around.** Never
`student → LLM → "tell me the syllabus"`. Instead: an administrator defines the curriculum, the
student's profile resolves to it, the topic page renders from the database, and the model is only
reached when the student explicitly asks for more. Everything below follows from that.

#### Topics are materialised from the syllabus, not invented

`CurriculumSubject.units[].topics` was already an array of titles — the right shape to *display* a
syllabus and the wrong shape for everything else. A title cannot be progressed against, bookmarked,
asked a question about, or given content; all of those need a stable id that survives the title
being reworded.

[Topic.ts](../src/models/Topic.ts) adds `Topic`, `Subtopic` and `TopicContent` as an extension. The
strings stay exactly where they are and stay authoritative; `npm run seed:topics` reads them and
writes one addressable row per title, carrying `unitNumber` back to the unit it came from. On the
seeded data that is **9,010 topics across 537 subjects**, and re-running converges: topics upsert on
`(subjectId, slug)` so ids survive, and titles that have left the syllabus are **archived, never
deleted** — a student's progress and questions point at those rows.

Topics hang off `CurriculumSubject`, which is already one subject of one branch under one regulation
at one college. Two colleges that teach Data Structures differently get different topic lists for
free, R20 keeps its own when R23 arrives, and no query has to re-check which college a topic belongs
to. Reuse happens at the *content* level instead, where it is safe: `canonicalKey` is derived from
the title alone, so one authored explanation reaches "Recursion and its cost" wherever it appears
without the two curriculum rows ever being merged.

#### The economics: what costs a model call and what does not

| Action | Provider call |
| --- | --- |
| Open a topic, read the explanation, the example, the key points | **no** |
| Reveal a self-check answer | **no** |
| View a previous answer | **no** |
| Re-open a topic you asked about last week | **no** |
| Ask a question whose answer is cached | **no** |
| Ask a new question / press a quick action | yes |
| "Go deeper" | yes |
| "Ask again" / "Regenerate" | yes, deliberately |

The first five rows are the product. `TopicContent` holds the basic explanation, the practical
section, the terminology, the key points, the common mistakes and the self-check *with its answers*
— a check that called a model to mark itself is a check most students would never finish waiting
for. The topic page renders complete before the tutor panel has done anything.

`TopicContent` is separate from `Topic` because the two have different lifecycles: the structure can
be published while the prose is still in review, and a typo fix must not send a topic back through
approval. It is keyed on `(topicId, language)`, so §82's Telugu content is an extra row rather than
a schema change.

#### Students see `published` and nothing else

The lifecycle is `ai-draft → editor-review → approved → published → archived`, its own list rather
than the admin module's `AI_CONTENT_STATUSES` — that one models a *job* and carries `generating` and
`failed`, which are states of a job and not of a piece of prose.

There is no code path from generation to `published`. `writeDraft` in
[topic-content-generator.ts](../src/lib/admin/ai/topic-content-generator.ts) sets `ai-draft` as a
literal with no parameter for it; `PATCH /api/admin/topic-content/:id` refuses `status: "published"`
outright; and the publish endpoint requires `topic_content.publish`, refuses anything not
`approved`, refuses `provider: "mock"`, and requires an explicit `academicallyReviewed: true` —
a publish button that needs no assertion is one people press without reading.

`Topic.hasPublishedContent` — the flag behind "Explanation ready" on the subject page — is set in
exactly one place, the publish transition. Setting it at generation time would advertise text nobody
had read.

#### The tutor pipeline

`ask()` in [service.ts](../src/lib/tutor/service.ts) runs §67 in order:

```
authorise the topic → build context → normalise the question → check the cache
→ check the quota → check the budget → choose a tier → route → validate → store → account
```

The order is load-bearing. Authorisation precedes context, so an unauthorised topic never causes a
read of another college's syllabus. **The cache precedes the quota**, so a student at their daily
limit still gets every answer the platform already has — those call no provider, and the daily count
already excludes them. The consequence is deliberate: over quota, a popular question is answered
instantly and an original one is refused. The limit caps spending, it does not ration reading.

#### Nothing the browser says about curriculum is trusted

`POST /api/ai/question` carries ids and text. It cannot name a provider, a model, a temperature or a
token budget. [context.ts](../src/lib/tutor/context.ts) re-resolves the whole academic chain from the
database and makes the student's coordinate part of the `findOne`, so a topic from another college is
**not found** — the same answer as one that does not exist, verified against the running server along
with the 307 for no session.

The conversation id is verified against both the user *and* the topic. Without both checks a valid
id belonging to someone else would pull their questions into this student's prompt — §71's exact
prohibition, arriving through the back door.

The prompt lives on the server ([prompt.ts](../src/lib/tutor/prompt.ts)) for the same reason the
admin module's does: a prompt the browser can see is one it can rewrite, and its twenty-one rules
are what stand between "explain this topic from my syllabus" and "say whatever the caller asked".
`PROMPT_VERSION` is stamped on every interaction **and is part of the cache key**, so editing the
wording invalidates the cache instead of serving answers produced under rules that no longer apply.

#### Context is deliberately small

Not the student's history — the last four turns of *this* thread, and answers appear as their stored
`summary` rather than in full. Not the subject's syllabus — the one unit the topic sits in. Past
eight turns a thread is compressed into `conversation.summary`, generated on the cheap tier *after*
the answer is returned so the cost never lands inside a request a student is waiting on.

The prepared explanation travels as a trimmed grounding paragraph, cut at a sentence boundary. Its
job is to stop the tutor contradicting what the student just read; sending it whole would roughly
double the input tokens of every request to restate material already on screen.

#### The cache is the largest cost control, and has the sharpest edge

The key is `sha256(topicId + normalised question + depth + language + promptVersion)`. Cross-student
on purpose and safe to be: a topic explanation is the same explanation whoever asked for it, and the
value holds nothing personal.

The line is drawn at **conversation history**. A first question about a topic depends only on the
topic; a question with turns behind it depends on what *this* student asked before, so the pipeline
skips the cache entirely for those. That is the one place §47's "never cache personalised student
data globally" is enforced, and `cache.ts` says so because it cannot enforce it alone.

Normalisation lowercases, strips punctuation and removes a deliberately short filler list. It does
**not** stem, reorder or synonymise — that is how "what is a stack" and "what is a queue" become one
entry, and a wrong answer served instantly is worse than a right one that cost a request.
`tests/unit/tutor-cache.test.ts` holds the contract as two lists: pairs that must collide and pairs
that must not.

#### Provider routing

[router.ts](../src/lib/tutor/router.ts) reuses the existing `AIProvider` seam rather than adding a
second one. `OpenAICompatibleProvider` is one class for DeepSeek, Groq, OpenAI and any self-hosted
`/v1/chat/completions` endpoint — they differ in a base URL, a key variable and a default model, all
held as data in `OPENAI_COMPATIBLE_SERVICES`. Three near-identical classes would be three places to
fix the next parsing quirk, and the third would be missed.

Two tiers, from the environment: Basic/Practical/Intermediate on the everyday model,
Advanced/Expert on the better one. The fallback chain is a comma-separated list an operator orders;
unknown names are dropped rather than failing, so a typo degrades instead of taking the tutor down.
A non-retryable failure moves straight to the next provider; a retryable one gets a single backoff
within the same provider first.

**The mock is always last in the chain and is never skipped.** A deployment whose only key has
expired serves clearly-labelled placeholder text and shows the fall-through in the usage dashboard,
rather than serving errors until somebody notices. The tutor's mock is its own class: the admin
module's reads a course-content prompt and would return valid JSON of the wrong schema.

#### Streaming

`stream: true` returns newline-delimited JSON, one event per line — `delta`, then `done` carrying
the *stored* interaction. NDJSON rather than SSE because the client is `fetch` in a React component,
not an `EventSource`.

The transport streams **raw model text**, not parsed fields; the panel shows it accumulating and
swaps to the structured render on `done`. Incrementally parsing JSON server-side would need a
streaming parser to be correct and would get the client nothing it cannot do itself.

Failure has two shapes and they are handled differently. Before the first byte, nothing has been
sent, so the whole request falls back to `ask()` and runs the full chain. After the first byte the
client is already rendering, a second provider's stream cannot be spliced on, so the error is sent
as an event and the client offers Retry. The answer is stored either way — the generator is consumed
inside `start`, so a closed tab costs the same as a completed one instead of losing an answer the
platform has already paid for.

#### Progress is not a page visit

§24 says so and it is not pedantry: a percentage that rises because a URL was opened measures
curiosity. `TOPIC_OPENED` is recorded and moves nothing. Five weighted signals sum to exactly 100 —
basic 35, practical 25, advanced 20, self-check 10, question asked 10 — so the percentage *is* the
sum of what was done rather than a second calculation that can disagree with the flags it summarises.
Reading alone reaches 60, below the 80 completion threshold.

The client posts *which signal happened*, never a number. Time is accumulated in server-clamped
increments, because an unclamped counter fed by a browser is a field anyone can write 10⁹ into and
"average learning time" would be built on it. Every write re-authorises the topic — one extra query
per event, and not negotiable: without it a row can be filed against a topic the student cannot see.

Progress rows are keyed on `userId`, not on `studentProfileId`. §57 requires a profile change to
preserve learning history, and hanging progress off the profile is precisely how it would be
orphaned. The topic title is snapshotted onto the row for the same reason (§58).

#### Cost tracking

Every number is **micro-USD as an integer** — floating-point dollars accumulated over a hundred
thousand rows drift, and `$inc` on a float drifts differently again. `AiUsageDaily` is a roll-up per
day per provider per model, not an aggregation over `AiInteraction`, because the budget check runs
before every request: a `$group` over a growing collection is fine for a month and then is not.
Month-to-date is a scan of at most thirty-one small documents.

Failed and cached interactions are both stored. A store of only the successes makes the failure rate
unmeasurable and "why was I charged" unanswerable.

At 80% of `AI_MONTHLY_BUDGET_USD` the advanced tier silently drops to the cheap one; at 100% new
questions are refused while stored and cached answers keep working. Degrading before the ceiling is
the point — hitting 100% mid-month would turn the tutor off for everyone.

#### Screens

**`/curriculum/[subjectId]`** gains a Topics section above the syllabus. Two sections rather than
one, because they answer different questions: the syllabus is what the exam covers, quoted from the
regulation; the topic list is the study path, with progress against each row. Making the official
syllabus clickable would imply every line of it has a page.

**`/curriculum/[subjectId]/topics/[topicId]`** is the learning page — topic rail, content, tutor on
desktop; content, tutor, previous questions stacked on a phone, which is the base case (§78). It is
server-rendered from the database with no model call. The syllabus is quoted in its own visually
distinct block, and a provenance line says whether a person or a model wrote the explanation (§36) —
the two distinctions §54 exists to protect.

A topic reached through the wrong subject's URL **redirects** to the canonical one rather than 404ing:
the topic is legitimately the student's, only the path is stale, which is what a bookmark taken
before a curriculum edit looks like.

**`/ai-tutor`** is deliberately not a chat window. There is no message box on it at all — a tutor
with no topic in front of it has nothing to be grounded on, and a free-floating chat would be the one
path that bypasses grounding entirely. It shows open threads, the day's remaining questions and a way
into a subject. Stating the quota up front matters: a student who discovers they are out *after*
composing a question has been given a worse experience than one who could see it coming.

Markdown is rendered as React nodes — paragraphs, headings, lists, `**bold**` and `` `code` `` — never
through `dangerouslySetInnerHTML`. The content is model output; rendering it as HTML would make a
provider's response a script-injection surface.

**Admin → AI & Learning → Topic Content** lists what is waiting for a reviewer first, then subjects
with their coverage. The per-subject workbench shows exactly one forward step per row: a row offering
Approve and Publish at once is a row where somebody publishes without reading. Generation is capped
at ten topics per request and runs sequentially — ten concurrent calls is the fastest way to hit a
rate limit, and the failure would arrive as nine successes and one confusing error.

#### Measured, not asserted

Verified against the running dev server with a real student account on Atlas:

| Check | Result |
| --- | --- |
| Topic page, owner | 200 |
| Topic page, no session | 307 → `/login` |
| Topic id from another college / nonexistent / malformed | 404, all three identical |
| Learning event with an unknown type | 400 |
| Learning event against a foreign topic | 404 |
| Same question, reworded | `cacheHit: true`, 0 tokens, 0 ms |
| View a stored answer | no provider call |
| Ask again | new row, `regeneratedFrom` set, cache bypassed |
| 11th uncached question in a day | 429 with `retryAfterSeconds` |
| 11th question, but cached | served, free |
| Deep dive from Basic | answered at Practical — one rung, not a jump |

Warm topic-page latency was ~1.2 s in `next dev` against a remote Atlas cluster, dominated by
round-trip time and dev-mode compilation. §76's <500 ms target is a production figure and has not
been measured on production hardware.

#### Not built

No Redis (§47) — the answer cache is a TTL'd collection, which is one round trip and needs no second
service; the cache key is designed so a Redis layer can sit in front of it unchanged. No semantic
similarity on cached questions (§17's later phase): normalisation is lexical, and the wrong
similarity threshold serves confidently wrong answers. Practice mode (§44), flashcards and
multilingual content are schema-ready — `TopicContent.language` is on the natural key — and not
implemented. Subtopics are modelled, addressable and used by the tutor, but nothing writes them yet:
the seeder materialises topics only, because a syllabus line is a topic and inventing a level below
it would be the platform asserting curriculum structure nobody supplied.

### 6.13 Teachers, assignments, notes and notifications — `src/lib/teaching/`, `src/lib/notifications/`

A new role and four modules on top of the curriculum: teachers set work and
share material for the subjects a college assigns them, students receive both
automatically, and one notification service tells everybody about it.

**The rule the whole module exists to enforce** (§102): a teacher never picks
students. They pick a *subject*, and the subject — which is already one branch
of one regulation at one college — implies the audience. No request body in the
module carries a `programId`, a `branchId` or a `collegeId`; there is nothing to
tamper with because there is nothing to send.

#### A teacher is a `User`, not a second account system

`role: "teacher"` plus a `TeacherProfile`, exactly as a student is `role:
"student"` plus a `StudentProfile`. §99 forbids duplicating authentication and
the reason is sharper than tidiness: two auth systems means two places to get
password hashing, email verification, rate limiting and session expiry right,
and the second one is always the one that is wrong. `/api/teacher/login` is a
different endpoint with the *same* `authenticate()` and `startSession()` behind
it.

Adding `teacher` to `ROLES` exposed an existing hole: `registerSchema` accepted
any role, so `POST /api/auth/register` would mint an `admin` — a documented gap
(§8) that would have become "anyone can publish to a college's students".
`SELF_SERVICE_ROLES` now holds exactly `student`, and the teacher endpoint sets
the role server-side.

**The role on the token is never enough.** `getCurrentTeacher()` re-reads the
database on every request, so a deactivation takes effect on the next page load
rather than whenever a thirty-day cookie happens to expire.

#### Approving an account grants nothing

Two gates, and they answer different questions:

| Gate | Question | Where |
| --- | --- | --- |
| `requireTeacher(capability)` | is this a teacher, and may they act at all? | account status + email |
| `requireSubject(teacher, id)` | may they act on **this** subject? | `TeacherAcademicAssignment` |

The second is §94's second test made structural: a teacher assigned Data
Structures cannot touch DBMS, though both are in their college, their branch and
their semester. Being a teacher grants the ability to hold subject assignments,
and nothing else.

§4's `PENDING → APPROVED → ACTIVE` is stored as two states rather than three.
Approved and active would be separated by no action — nothing moves an account
between them, so every approved teacher would sit somewhere they could never
leave. What that third state actually wants is the gate, and the gate is
`canTeacherPublish()`: **approved and email-verified**, derived rather than
stored so it cannot drift from the two facts it summarises.

`TEACHER_AUTO_APPROVE` exists (§4) and is **off by default**. Approving every
self-declared teacher would let anyone with an email address publish to a
college's students — the one failure in this module with no undo.

#### The audience resolver, and why §19 was already solved

`resolveAudience()` answers "who is in this place in the curriculum, right now".
The hard part is §19: "notify all students who are in that year currently"
cannot be answered from `StudentProfile.currentYear`, which is a number a
student typed during onboarding and is wrong from the next July onwards.

The curriculum module's `resolveAcademicPosition()` already derives the position
from the **admission year**, which stays right as terms roll over. So the
resolver narrows in Mongo on everything that is a stored fact — college,
programme, branch, regulation, all indexed — and settles the semester in memory
over the candidates. That shape is forced: the derivation is per-student
arithmetic, not a database predicate, and filtering on `currentSemester` would
have been faster and would have targeted last year's students.

It returns *why* students were excluded as well as who was included. "Your
assignment reached 184 students" and "184, and 6 more we could not place" are
different facts, and the second is the one that explains a student asking why
they never got it.

#### Publishing: what runs in the request, and what does not

```
authorise teacher → authorise subject → validate → resolve audience →
snapshot the target → one row per student → [response] → notify
```

The `AssignmentStudent` rows are written **inside** the request, deliberately
against §17's "use a background job": the student's own list reads from those
rows, so replying "published" before they exist would be a lie with a race
attached, and the count the teacher was shown must be the count published to.
What is deferred is the notification fan-out, which nothing depends on for
correctness — a student who never sees the prompt still finds the work in their
list.

`after()` from `next/server` is the queue, the same mechanism the AI module
uses and the one that fits a deployment with no worker process. A `BackgroundJob`
row is written alongside, because `after()` records nothing an operator can see.

Publishing to **nobody succeeds**, and says so (§78). Refusing would be worse:
the assignment is valid, the teacher meant it, and the usual cause is a cohort
that has moved on — which they can only diagnose if the publish tells them.

#### Materialised recipients are what make the history true

`AssignmentStudent` and `NoteRecipient` look like overhead for a set that could
be recomputed. They are what settle four requirements at once:

- **authorisation** — a student with no row has no way in (§94);
- **§19** — the rows record who the work was set for *at the time*;
- **§101's "historical assignments remain accessible"** — moving up a year does
  not take them away, which a live audience resolution would;
- **performance** — the student's list is one indexed query, and "who has *not*
  submitted" is answerable at all.

Verified: a student whose admission year is moved forward keeps every assignment
they were given and stops matching new work for their old semester.

#### Notifications are one service, not two

§35 forbids building assignment and note notifications separately, and the
schema is where that is enforced rather than merely intended: `Notification` has
no `assignmentId` and no `noteId`, only `entityType` + `entityId`. An
announcement or an attendance notification (§95) is a new enum value, not a new
table and not a new service.

Three properties the callers depend on:

- **Bulk.** One `bulkWrite` per 500 recipients, never a loop (§62).
- **Idempotent.** The unique index on
  `(recipientId, type, entityType, entityId)` means a retried fan-out writes
  nothing the second time (§63) — a database guarantee rather than a check the
  fan-out has to remember, which matters because the fan-out is the code most
  likely to be retried. It is an `insertOne`, not an upsert, so a retry cannot
  resurrect a notification the student has already read.
- **Never fails the caller.** A missing prompt is a smaller loss than a
  rolled-back publish.

Creation and delivery are separate (§37). The row *is* the in-app notification;
email and push are registered providers, and none is registered today —
`IMPLEMENTED_CHANNELS` lists only `in_app`, so the preferences screen shows the
others as unavailable rather than offering a switch that silently does nothing.

The `account` category — approvals and rejections — cannot be switched off. It
is the only way a recipient learns what happened to their account.

#### Reminders

Two windows before the deadline and one after, and one rule that matters more
than either: **a student who has already submitted is never reminded** (§80).
`remindersSent` on the student's own row makes the sweep re-runnable; without
it the deduplication index would silently drop the second reminder, which would
be *correct* and indistinguishable from a bug.

There is no scheduler in the application, and that is an honest gap rather than
a hidden one. A web app with no worker process cannot hold one reliably —
`setInterval` in a serverless function either never fires or fires once per
instance. `npm run reminders` is the entry point for a cron job.

#### Files

No object storage exists on the platform, so `src/lib/storage/` is an interface
with a working local-disk driver and a slot for S3. §22 forbids bytes in
MongoDB; a module that assumed a bucket would have been unbuildable.

The local root is **not** inside `public/` — anything there is served with no
authorisation at all, which would hand every submission to anyone who could
guess a filename.

§67 asks for signed URLs. `/api/files/:id` is stronger and the difference
matters for a student's submission: a signed URL is a bearer token, forwardable
and valid to whoever holds it until it expires, while a session check runs
against the person actually asking, every time. Authorisation is per purpose —
a teacher who owns the item or a student it reached; for a submission, the
student who wrote it or the teacher who set the work, and *not* another teacher
at the same college.

Uploading is separate from attaching, because a teacher drags a file onto a form
that does not exist yet. `claimAttachments()` closes that gap and does the thing
the download gate depends on: it verifies the caller uploaded the file, so one
teacher cannot attach another's file id and publish it to their own cohort. The
stored metadata is returned rather than the caller's, so a request cannot
relabel a 40MB executable as a 2KB PDF.

Validation is MIME **and** extension **and** size (§86): the allowlist is the
real control, and the extension denylist catches the case it cannot — a crafted
request declaring `application/pdf` for `payload.exe`. `application/octet-stream`
is refused rather than shrugged at, because it is what an unidentified file
arrives as.

#### Screens

**Students** get `/assignments`, `/assignments/[id]`, `/notes`, `/notes/[id]`
and `/notifications`, plus a bell that now counts real rows. Status is carried
by a word and a shape, never colour alone — this is the screen where the
difference is "you have handed this in" and "you have not". Each tab's empty
state says what *its* emptiness means; "no assignments yet" under the Overdue
tab would be alarming in the wrong direction.

The topic page gains **Related learning material** (§52), read from the
student's own recipient rows — so it shows what *they* received rather than
everything any teacher ever attached to that topic. That is §51's payoff: the
explanation, the work set on it, the material shared for it and the AI tutor on
one screen.

**Teachers** get their own shell at `/teacher/*` — plainer than the student one,
because this is a tool somebody uses for twenty minutes to set work and mark it.
The cascade runs in the browser over a tree the server already narrowed to what
they may touch: five dependent requests to walk a few dozen rows would be five
round trips on the screen a teacher opens before everything they do.

A banner states the one thing that will otherwise be discovered one refused
button at a time — pending approval, unverified email, or no subjects assigned
(§89).

**Admins** get `/admin/teachers`, defaulting to the pending queue. Approving
makes an account usable; assigning a subject is what lets it reach students, and
the panel for that opens over the list because it is what an administrator does
immediately after approving.

`AdminUser` gained a nullable `collegeId` for §56. It is enforced by the teacher
routes only; null means no restriction, which is what every existing
administrator has, so nothing that predates it changed.

#### Measured, not asserted

An end-to-end run against a scratch database:

| Step | Result |
| --- | --- |
| Audience resolved for semester 3 | 3 students, 0 skipped |
| Assignment published | 3 eligible, 3 notified |
| Fan-out retried | 0 sent — deduplication holds |
| Student list, submit, teacher grade | grade visible to the student |
| Note published | 3 recipients, 3 notified |
| Reminder sweep at the 2-hour window | 2 notified — the submitter skipped |
| Roll-ups | assigned 3, submitted 1, graded 1 |

The §94 security cases are in `tests/integration/teaching-authorization.test.ts`
and run against a real database: cross-college teacher, unassigned subject,
cross-college student, one student's submission from another's account, and one
teacher's submissions from another teacher at the same college.

#### Not built

Scheduled assignments (`SCHEDULED` is in the state machine; nothing fires them —
the same missing scheduler as the reminders). Email and push notifications
(providers registered, none implemented). File *uploads from the UI* — the API
and the storage layer work and are tested, but no form has a file input yet, and
the forms say so rather than offering one that loses the file. Rubrics and
AI-assisted grading (§44 defers both). The S3 driver. `NoteRecipient` rows are
written at publish time only, so a student who joins a cohort afterwards does
not retroactively receive earlier notes.

## 7. Environment, commands, local setup

Required env (see [.env.example](../.env.example)); the app throws a named error if either is missing:

| Var | Purpose |
| --- | --- |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` locally, `mongodb+srv://…` for Atlas |
| `MONGODB_DB` | database name, defaults to `edupilot` |
| `JWT_SECRET` | HS256 signing key — long random string, rotate per environment |
| `NEXT_PUBLIC_APP_URL` | public origin used to build links inside email; no trailing slash |
| `GOOGLE_CLIENT_ID` | optional; OAuth client for "Continue with Google" |
| `GOOGLE_CLIENT_SECRET` | optional; leave both unset to run without Google |
| `EMAIL_TRANSPORT` | `brevo` or `console`; unset auto-selects (Brevo if configured, else console) |
| `BREVO_API_KEY` | a Brevo API v3 key (`xkeysib-…`), sent as `api-key` |
| `BREVO_TIMEOUT_MS` | optional; abort a Brevo request after this long, default 10000 |
| `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME` | From header; must be a sender Brevo has verified (`EMAIL_FROM`/`EMAIL_FROM_NAME` still work as fallbacks) |
| `EMAIL_OTP_SECRET` | optional; HMAC key for the 6-digit code. Falls back to `JWT_SECRET` |
| `EMAIL_VERIFICATION_TTL_MINUTES` | optional; code and link lifetime, default 60, capped at 1440 |
| `MONGODB_AUTO_INDEX` | optional override; defaults on outside production, off in it |
| `GOOGLE_VERTEX_PROJECT_ID` | optional; the primary AI provider. Needs a credential below |
| `GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON` | optional; raw JSON or base64. Unnecessary on Google Cloud |
| `GOOGLE_VERTEX_LOCATION` | optional; `global` by default, which avoids per-region model availability |
| `GEMINI_API_KEY` | optional; the AI fallback, and the admin generator. Never stored in the database |
| `AI_DEFAULT_PROVIDER`, `AI_DEFAULT_MODEL` | the tutor's everyday model — Basic, Practical, Intermediate |
| `AI_ADVANCED_PROVIDER`, `AI_ADVANCED_MODEL` | used only for Advanced and Expert, and dropped past 80% of the budget |
| `AI_FALLBACK_PROVIDERS` | comma-separated chain, `provider` or `provider:model`; unknown names are ignored |
| `DEEPSEEK_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY` | credentials for the OpenAI-compatible providers |
| `OPENAI_COMPATIBLE_BASE_URL`, `OPENAI_COMPATIBLE_API_KEY` | a self-hosted or proxied endpoint; the URL has no default on purpose |
| `FREE_DAILY_AI_QUESTIONS`, `PREMIUM_DAILY_AI_QUESTIONS` | per-student daily caps, default 10 and 50. Cached and failed requests do not count |
| `AI_MONTHLY_BUDGET_USD` | estimated spend ceiling; 0 or unset disables the check |
| `AI_CACHE_ENABLED` | set to `false` to disable cross-student answer caching. On by default |
| `TEACHER_AUTO_APPROVE` | `true` approves teacher signups on the spot. **Off by default** — approving every self-declared teacher would let anyone publish to a college's students |
| `STORAGE_DRIVER` | `local` is the only implemented driver and the default. Anything else fails loudly on the first upload rather than falling back |
| `STORAGE_LOCAL_ROOT` | where the local driver writes, default `.uploads`. Deliberately not under `public/`, which is served with no authorisation |

```bash
cp .env.example .env.local
npm run seed:colleges   # 132 institutions — idempotent, safe to re-run
npm run seed            # wipes and reseeds users, courses, lessons, enrollments
npm run dev
```

`npm run seed` is **destructive** — it clears users, student profiles, verification tokens, courses,
lessons and enrollments. It leaves `colleges` alone, which is shared reference data rather than demo
content. Never point it at a shared database. Seed logins: `ada@edupilot.dev` (instructor),
`sam@edupilot.dev` (student), password `password123`; both are seeded verified with completed
profiles, so they land on the dashboard.

| Script | When |
| --- | --- |
| `npm run seed:colleges` | once per environment, and after editing the curated list |
| `npm run seed:admin` | to rebuild the whole admin demo dataset — **destructive**, see below |
| `npm run seed:curriculum` | regulations and subjects for the AI module (§6.9) — idempotent |
| `npm run seed:topics` | materialises topics from the syllabus and publishes the authored content (§6.12) — idempotent, `--dry-run` and `--subject CODE` supported |
| `npm run sync:role-permissions` | **required after adding a permission module** — grants existing roles the new module's permissions |
| `npm run test` | unit tests: cache normalisation, progress arithmetic, the answer schema, topic identity. No database needed |
| `npm run test:integration` | the authorization tests, each suite against its own `<db>_test_<suite>` database it creates and drops |
| `npm run reminders` | assignment deadline reminders (§6.13). **Run on a schedule** — there is no scheduler in the app; every 15–60 minutes is right, and the sweep is idempotent |
| `npm run create-admin` | to add one administrator, or reset its password, on any database |
| `npm run ensure-indexes` | **production, after every schema change** — `autoIndex` is off there |
| `npm run migrate:profiles` | once, on a database predating the `studentProfiles` collection |

#### Administrator accounts

Administrators live in `adminUsers`, not in `users` — see the model comment for why. There are two
ways to get one.

`npm run seed:admin` rebuilds the admin demo dataset: geography, institutions, academic structure,
nine administrators across the nine role presets, jobs, flags, settings and an audit trail. It is
**destructive for the collections it owns** and clears them on every run, so never point it at a
database with real data. It leaves `courses`, `lessons` and `enrollments` alone. Seeded logins are
`rajesh@edupilot.dev` (Super Admin) through `vikram@edupilot.dev`, password `Admin@12345`; the last
two are deliberately left `invited` and `deactivated`, so they cannot sign in.

`npm run create-admin` is the non-destructive alternative — it writes exactly two documents, the
role it needs and the administrator, and is safe against a populated database. With no flags it
creates `admin@edupilot.dev` / `Admin@2026` as Super Admin:

```bash
npm run create-admin
npm run create-admin -- --email ops@edupilot.dev --name "Ops Lead" --role platform-admin
npm run create-admin -- --email ops@edupilot.dev --password 'N3w:Password'
```

Flags: `--email`, `--name`, `--password`, `--role` (a role slug), `--team`, `--title`. Re-running it
for an address that already exists resets that account's password, sets it `active` and clears any
lockout, which is also the supported way to unlock an admin locked out by failed sign-ins. An
existing role is reused untouched — it is never rewritten, because an operator may have edited its
permissions deliberately — and a `--role` naming neither an existing role nor one of the nine presets
is an error rather than a silently permission-less account.

`npm run migrate:profiles` moves the old embedded `users.education` into `studentProfiles` and
backfills `authProvider`. It is idempotent and non-destructive; re-run it with `-- --drop-legacy`
once you have checked the result to remove the old fields. It reads through the raw driver, because
the User model no longer declares those paths and Mongoose would strip them from the result.

`npm run seed:textbooks` seeds the book catalogue, its topics and the subject mappings onto
whatever `seed:curriculum` produced. Non-destructive and idempotent: it upserts its own three
collections by their natural keys and never writes to colleges, programmes, regulations or subjects. A
subject with no mapping is left alone — it still has its own syllabus units, which is the correct
fallback and better than a book that covers nothing.

`npm run seed:textbooks -- --fix-profiles` additionally attaches a regulation, resolves the semester
and writes `studentsemestersubjects` for every completed profile. Opt-in behind the flag because it
writes to live student rows, and it deliberately does **not** invent an `admissionYear` — that is the
one field the derivation depends on, and guessing it would make every position downstream confidently
wrong. Profiles without one are reported and skipped.

Other scripts: `npm run build`, `npm start`, `npm run typecheck` (`tsc --noEmit`), `npm run lint`.

### Testing the email flow locally

With `EMAIL_TRANSPORT=console` (the default without a Brevo key) the whole email — the 6-digit code
and the link — is printed to the dev server log — `.next/dev/logs/next-development.log`, or the terminal running
`npm run dev`. Sign up, copy the `Link:` line, open it.

### Pointing it at Brevo

1. In the Brevo dashboard, **SMTP & API → API keys → Generate a new key**. That value is
   `BREVO_API_KEY`; it starts with `xkeysib-`.
2. Register the sending address under **Senders, Domains & Dedicated IPs**. A single sender needs a
   click on the confirmation mail Brevo sends it; a whole domain needs Brevo's DKIM and Brevo-code
   records published. Brevo rejects a `sender` it has not verified, so this is not optional.
3. Set `BREVO_FROM_EMAIL` to that verified address, `BREVO_FROM_NAME` to the display name, and
   `EMAIL_TRANSPORT=brevo` (or leave it unset — Brevo is picked automatically once the key is
   present).

Page routes: `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/terms`, `/privacy` are
public; `/onboarding/*`, `/dashboard` and the thirteen other paths in
[app-routes.ts](../src/lib/app-routes.ts) need a session. `/verify-email` is public because the link
is opened wherever the mail was read, which is often not the browser that signed up.

The Google redirect URI to register in the Google Cloud console is
`http://localhost:3000/api/auth/google/callback` (and the same path on any deployed origin — it is
derived from the incoming request, so no extra env var is needed).

Atlas note: the cluster's **Network Access** list must contain the IP the app dials from. A source
address that is not on it completes the TCP connection and then fails the TLS handshake, which
surfaces as `MongooseServerSelectionError … tlsv1 alert internal error` after the 30s server-selection
timeout — not as an auth error.

## 8. Known gaps and accepted risks

Recorded so they are decisions, not surprises. Roughly in priority order.

**Correctness**

1. `GET /api/courses/:idOrSlug` does **not** check `published`, so anyone holding an id or slug can
   read an unpublished draft along with its lesson titles. The list endpoint filters correctly; the
   detail endpoint should too.
2. Deleting a lesson pulls it from `completedLessons` but does **not** recompute
   `Enrollment.progress`, so progress can be stale (or sit below 100 while `completedAt` stays set)
   until the next progress write.
3. Non-numeric `?page=` / `?limit=` produce `NaN` through `Math.max`/`Math.min` and reach `.skip()`,
   which fails as a 500 rather than a 400.
4. `lessonCount` is maintained by `$inc` outside a transaction — a crash between the lesson write and
   the counter update leaves it drifted. No reconciliation job exists.
5. `order` is not unique and there is no reorder endpoint; an explicit `order` can duplicate an
   existing one, and ties fall back to `createdAt`.
6. Register and slug generation are check-then-act, so they race under concurrency. The unique indexes
   keep the data correct; the loser just sees a 409.

**Security**

7. **`POST /api/auth/register` accepts a client-supplied `role`**, so anyone can create an `admin`
   account and inherit the escape hatch every ownership check honours. The sign-up form never sends
   the field, so the fix is to drop `role` from `registerSchema` and set it only from a seed or an
   admin-only path. See [routes/api/auth-register.md](routes/api/auth-register.md#gaps).
8. **`GET /api/courses/:id/lessons` returns every lesson in full, publicly.** It applies no `select`
   and no auth, so `content` and `videoUrl` for non-preview lessons — on unpublished courses too —
   are readable by anyone with a course id. That defeats the enrolment gate on
   `GET /api/lessons/:id`. See
   [routes/api/courses-id-lessons.md](routes/api/courses-id-lessons.md#gap--this-bypasses-the-lesson-paywall).
9. Rate limiting exists ([rate-limit.ts](../src/lib/rate-limit.ts)) but is only applied to
   verification sends. **`/api/auth/login` is still brute-forceable** — the limiter is generic, so
   closing this is a matter of adding two keys to the login path, not new infrastructure.
10. Logout only clears the cookie. The JWT stays valid until `exp`, so a stolen token cannot be
   revoked, and a role or password change does not invalidate live sessions. Fixing this means a
   token version / denylist or server-side sessions.
11. No CSRF token. `sameSite=lax` blocks cross-site POSTs from forms and fetch, which covers the
   common case, but it is the only defence.
12. No password reset and no audit log. `/forgot-password` is a placeholder that says so. Email
    verification is now implemented (§6.4a); password reset should reuse the same hashed-token
    machinery rather than growing a second copy of it.
13. **The verification link is consumed on `GET`.** A mail scanner that prefetches links will spend
    the token before the student clicks, who then sees "invalid" and has to resend. The alternative —
    a landing page with a Confirm button — costs every user a click to protect against some. Less
    painful than it was: the same email carries a code, so a burnt link is now an inconvenience
    rather than a dead end. Worth revisiting if it shows up in support traffic.
14. Brevo's send path **has** been exercised against a live account: a real API key, a `POST` that
    came back accepted, and `emailVerificationSent: true` out of `/api/auth/register`. What is still
    unconfirmed is delivery to a real inbox — the test address was a `.invalid` domain, so Brevo
    accepted the message and would then have bounced it. Deliverability from a `gmail.com` sender
    (§the Brevo setup notes) is the open question, not the integration.
15. The rate limiter uses fixed windows, so a burst straddling a boundary can reach 2x the limit.
    Acceptable for "do not flood a mailbox"; not acceptable if it is ever reused to meter an API.
    The OTP's hard stop does not depend on it: `MAX_CODE_ATTEMPTS` lives on the row for exactly that
    reason.
15a. **The OTP path has been exercised against the database** — happy path, a pasted `"123 456"`,
    the wrong-code countdown, attempt exhaustion, expiry, resend supersession, link and code sharing
    one row, and a check that the stored hash is not a plain SHA-256 of the digits. The screen has
    been fetched with a real session and asserted to render six labelled boxes, and the email
    template renders a leading-zero code (`048317`) intact. What has **not** been done is a human
    clicking through it in a browser: the auto-submit, paste-spreading and backspace behaviours are
    reasoned about and type-checked, not observed.

**Product / engineering**

16. **No tests and no CI.** Nothing prevents a regression in the authorization rules above.
17. UI covers sign-in, sign-up, verification, onboarding, the dashboard and the curriculum (§6, §6.11). Twelve sidebar destinations are placeholders,
    the dashboard cards show static content (§6.5), and there is still no way to reach the
    instructor-only endpoints from a browser.
18. `price` is stored and ignored; enrollment is free regardless. No payment integration.
19. No file or video upload — `videoUrl` and `coverImageUrl` are bare URL strings.
20. Deep pagination uses `skip`/`limit`, which degrades on large offsets; `?q=` depends on the text
    index and, as written, cannot combine with relevance sorting.
21. No structured logging or metrics; `console.error` is the whole story. AI usage is the exception —
    `AiUsageDaily` is a real per-day, per-model cost roll-up.
22. **Streamed answers estimate their token counts.** Most providers send usage only in a final
    frame and some send none, so the streaming path derives input and output tokens from character
    counts (÷4). The non-streaming path uses the provider's real numbers. Costs are already labelled
    estimates, but a deployment reconciling against an invoice should know which figures are which.
23. **The model price table is hand-maintained** ([usage.ts](../src/lib/tutor/usage.ts)). An
    unlisted model falls back to a mid-range price rather than to zero — zero would make an unlisted
    model look free, which is exactly the one that would be left running for a month.
24. **No versioning on `TopicContent`.** `contentVersion` increments and the previous text is
    overwritten. The admin course-content module keeps immutable version rows; this one does not
    yet, so an editor cannot diff a regeneration against what it replaced.
25. **The daily quota window is server-local midnight**, not the student's timezone, and there is no
    tier resolution — every student is on the free tier because no subscription model exists yet.
26. **`ensure-indexes` still omits the curriculum, textbook and AI course-content models** — a gap
    that predates this module. The learning and tutor models are registered; those three are not,
    so their indexes are only built where `autoIndex` is on.
27a. **Nothing schedules the reminders.** `npm run reminders` is written and
    tested; a cron job, a platform scheduler or a task has to call it. Until
    something does, no deadline reminder is ever sent. A web app with no worker
    process cannot hold a scheduler reliably, so this is external by design —
    but it is a gap until a deployment closes it.
27b. **`SCHEDULED` assignments never publish themselves**, for the same reason.
    The state exists in the machine and nothing fires it.
27c. **Email and push notifications are seams, not features.** Providers can be
    registered; none is. The preferences screen shows both as unavailable rather
    than offering a switch that silently does nothing.
27d. **No file input exists in any form.** The upload API, the storage driver,
    the validation and the permission-checked download all work and are tested;
    the assignment and note forms say so rather than rendering a picker that
    loses the file. Wiring it up is UI work, not architecture.
27e. **Only the local storage driver is implemented.** It is wrong for anything
    horizontally scaled or serverless, where the disk is neither shared nor
    durable. `STORAGE_DRIVER=s3` fails loudly rather than falling back.
27f. **`AdminUser.collegeId` is enforced only by the teacher routes.** Null means
    no restriction, which is what every existing administrator has — so the
    screens that predate it are unchanged and a college admin can still see
    other institutions everywhere else.
27g. **A student who joins a cohort late does not receive earlier notes.**
    `NoteRecipient` rows are written at publish time. For assignments this is
    correct (they were not set that work); for notes it is arguably wrong, and
    a back-fill on profile change would fix it.
27h. **Teacher search filters the fetched page, not the query.** The name lives
    on `User` and the page on `TeacherProfile`/`AssignmentStudent`, so a
    server-side search across both needs a `$lookup`. Fine for a cohort;
    misleading past a few hundred rows, where a match on page two is not found.
27. **Subtopics are modelled and unused.** Nothing writes them, so the tutor's "focus on" selector
    is empty everywhere today.

## 9. Next steps

1. Tests around the authorization matrix in §5 and the invariants in §4 — highest value, since both
   are enforced by hand-written checks scattered across handlers.
2. Close §8 items 7 and 8 — the self-service `admin` role and the public lesson-body list. Both are
   access-control holes, both are one-line fixes, and both are reachable from the endpoint list on
   `/api-reference`.
3. Fix §8 items 1–3: published gate on course detail, progress recompute on lesson delete, numeric
   query-param guards.
4. Login rate limiting — the limiter is built (§3.6); apply it to `/api/auth/login`.
5. Password reset, reusing the token machinery from §6.4a.
6. The profile screen: photo, bio, skills, interests, LinkedIn, GitHub, résumé — the fields
   deliberately kept out of onboarding, plus phone and city.
7. Product UI: catalogue → course detail → lesson player with progress; then wire the dashboard's
   Curriculum card to `GET /api/enrollments`, which already returns per-course progress.
8. Instructor surface: draft/publish flow, lesson reordering endpoint.
9. Payments, if `price` is to mean anything.
10. Generate and review prepared content at scale — 63 of 9,010 topics have a published explanation,
    and the other 8,947 open on "Ask the tutor". The workbench and the batch endpoint exist; what is
    missing is a queue that works through a subject without an operator pressing the button four
    times, and reviewer capacity.
11. Close §8 item 24 — immutable versions for `TopicContent`, mirroring `AiCourseContentVersion`, so
    a regeneration can be diffed against what it replaced before being approved.
12. Close §8 item 26 — add the curriculum, textbook and AI content models to `ensure-indexes`.
13. Measure the topic page against §76's 500 ms target on production hardware with a co-located
    database. The current 1.2 s is `next dev` against a remote Atlas cluster and says little.
14. Write subtopics, or drop the level. It is carried through the whole stack — schema, context
    builder, prompt, UI selector — on the strength of §30, and an unused level is a cost paid on
    every read.
15. Close §8 items 27a and 27b — a scheduler. Everything downstream of it is
    built and tested; what is missing is something that calls it on a clock.
16. Wire file inputs into the assignment, note and submission forms (§8 item
    27d), then the S3 driver (27e) before any deployment that is not a single
    server.
17. An email notification provider, starting with the digest rather than the
    per-event message — a platform that mails a student every time a teacher
    publishes is one they mute in a week.
18. Teacher-side analytics beyond the dashboard's five numbers (§48): completion
    rate over time, average marks per assignment, and where students stall.
19. Semantic similarity on the answer cache (§17's later phase), behind a confidence floor.
    Lexical normalisation already collides the common rephrasings; the gain is in the tail, and the
    risk of a wrong threshold is a confidently wrong answer served instantly.

## 10. Document conventions

- One section per concern; keep §5's authorization table and §4's invariant list exhaustive — they are
  the parts reviewers rely on.
- **Route-specific detail belongs in [routes/](routes/), not here.** A new endpoint or screen means a
  new file there plus a row in [routes/README.md](routes/README.md); this file only changes when the
  new route alters architecture, the data model, an invariant or the gap list.
- When a gap in §8 is closed, delete the entry and describe the behaviour in the relevant section
  rather than leaving it struck through.
- Update *Last updated* on every edit.
