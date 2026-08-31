# EduPilot — Technical Document!!!!

Living record of what this project is, how it is built, and what is deliberately not built yet.
**Keep this file updated in the same change that alters behaviour** — new route, new model field,
new invariant, new dependency.

- Status: student auth + onboarding complete; admin application complete for institution, student and administration management
- Last updated: 2026-08-24
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
| Card data | [dashboard-data.ts](../src/lib/dashboard-data.ts) | **static placeholder content** — see §6.6 |

`getCurrentUser()` ([current-user.ts](../src/lib/current-user.ts)) is wrapped in React's `cache`, so
the layout and the page inside it share one query per request rather than each issuing their own.

Of the fourteen sidebar destinations only `/dashboard` is built. The other thirteen render
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

### 6.6 What the UI does not do

The screens are complete; much of what they display is not yet real. Everything below is deliberate,
and every case says so on screen rather than faking it.

**Dashboard card content is static.** [dashboard-data.ts](../src/lib/dashboard-data.ts) supplies the
tasks, wallet balance and entries, streak, timetable, notices and placement. There are no models for
any of them — the database has Users, Courses, Lessons and Enrollments and nothing else. The only live
value on the dashboard is the signed-in user's name, from the session. Each card reads its own export,
so wiring one to a real query is a one-place change. Two consequences worth knowing:

- The task list is **read-only**. A tick that could not be persisted would be a lie, so the checkboxes
  are display-only until a tasks API exists.
- The progress percentage is derived from the task list rather than stored, so the bar cannot disagree
  with the items above it.

**Controls with no backend say so.** Search, the notification bell and Upgrade to Pro all route
through the shell's notice slot and state that they are not connected. The **Microsoft and Apple**
buttons do the same — only Google has a real OAuth implementation (§6.4).

**Google sign-in is unverified end to end.** The authorize URL, state/nonce round trip, token
exchange, JWKS verification and account linking are all implemented, but nobody has run them against
Google with real credentials yet. Expect first-run friction over the registered redirect URI.

**Placeholder pages.** The thirteen unbuilt sidebar destinations (§6.1), plus `/forgot-password`,
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
| `GEMINI_API_KEY` | Read from the environment. Never stored in the database, never returned by the API |

The seeder is non-destructive: it upserts on natural keys and never touches colleges, departments,
programmes or academic years. It seeds R23 and R20 for CSE, IT and ECE so the coordinate demonstrably
matters — R23 CSE semester 3 has Data Structures, R20 has Data Structures through C++, and ECE has
neither.

Setting the key alone does nothing. A provider must also be **enabled** in AI Settings, because enabling
one has a cost, and doing it automatically because a key happened to be present would start spending
money without anyone choosing to.

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

Personal information (§8) still lives in the existing signup and Google flow; the flow starts at state.
Backlog and completed-subject tracking (§45) is designed for — `subjectIds` is the current semester only
— but not implemented. The admin screens for managing regulations and subjects are the AI module's
(§6.9); there is no student-facing CSV import (§39).

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
21. No structured logging, metrics, or health endpoint; `console.error` is the whole story.

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

## 10. Document conventions

- One section per concern; keep §5's authorization table and §4's invariant list exhaustive — they are
  the parts reviewers rely on.
- **Route-specific detail belongs in [routes/](routes/), not here.** A new endpoint or screen means a
  new file there plus a row in [routes/README.md](routes/README.md); this file only changes when the
  new route alters architecture, the data model, an invariant or the gap list.
- When a gap in §8 is closed, delete the entry and describe the behaviour in the relevant section
  rather than leaving it struck through.
- Update *Last updated* on every edit.
