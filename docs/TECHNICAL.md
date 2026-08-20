# EduPilot — Technical Document!!!!

Living record of what this project is, how it is built, and what is deliberately not built yet.
**Keep this file updated in the same change that alters behaviour** — new route, new model field,
new invariant, new dependency.

- Status: backend complete, no product UI yet
- Last updated: 2026-08-20
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
| Cookie session (sign in / out / who am I) | done |
| Course CRUD, ownership enforcement | done |
| Public catalogue: full-text search, filters, pagination | done |
| Lesson CRUD, ordering, free-preview gating | done |
| Enrollment (idempotent) and per-lesson progress | done |
| Seed script with demo data | done |
| Sign-in / sign-up screens | done |
| Onboarding: profile + education steps, gated on completion | done |
| Continue with Google (OAuth 2.0 / OIDC) | implemented, untested against Google |
| Signed-in shell: navigation rail, top bar, dashboard | done (dashboard cards show placeholder content) |
| Social sign-in: Microsoft, Apple | buttons only, no OAuth backend |
| Password reset, terms and privacy pages | placeholders |
| Tasks, wallet, streaks, timetable, notices, placements — data models | not started |
| Catalogue / course / lesson UI, payments, uploads, tests | not started |

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
| Domain services | [src/lib/accounts.ts](../src/lib/accounts.ts) | account creation and credential checks, shared by both transports |
| Tooling | [scripts/seed.ts](../scripts/seed.ts) | reproducible local data |

Sign-up and sign-in exist on two transports — the JSON API and the Server Actions behind the forms.
Both go through `src/lib/accounts.ts`, so there is exactly one implementation of "create an account"
and "check a password"; the transports only differ in how they report the outcome.

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

## 4. Data model

```
User ──1:N──> Course ──1:N──> Lesson
  └───────1:N──> Enrollment ──N:1──> Course
                    └── completedLessons[] ──> Lesson
```

| Model | Fields | Indexes |
| --- | --- | --- |
| **User** | `name`, `email`, `passwordHash`, `role` ∈ {student,instructor,admin}, `avatarUrl`, `googleId`, `emailVerified`, `phone`, `city`, `education{college,program,currentYear}`, `onboardingCompletedAt`, timestamps | unique `email`; unique partial `googleId` |
| **Course** | `title`, `slug`, `description`, `instructor`→User, `level` ∈ {beginner,intermediate,advanced}, `tags[]`, `price`, `coverImageUrl`, `published`, `lessonCount`, timestamps | unique `slug`; `instructor`; `published`; text index on `title`+`description`+`tags` |
| **Lesson** | `course`→Course, `title`, `content`, `videoUrl`, `durationMinutes`, `order`, `isFreePreview`, timestamps | compound `{course:1, order:1}` |
| **Enrollment** | `student`→User, `course`→Course, `completedLessons[]`→Lesson, `progress` 0–100, `completedAt`, timestamps | **unique compound `{student:1, course:1}`** |

Serialization: `passwordHash` is `select: false` (must be opted into with `.select("+passwordHash")`)
**and** deleted in `User.toJSON()` alongside `__v` — two independent guards so a hash cannot leak
through a route that forgets one.

`passwordHash` is required only when `googleId` is absent, so a Google account can exist without one.
`authenticate()` treats a missing hash as a failed sign-in rather than comparing against `undefined`.

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

1. **One enrollment per (student, course)** — enforced by the unique index; POST also returns the
   existing row instead of erroring, making enroll idempotent.
2. **Unique slug** — generated from the title, then `-2`, `-3`… until free; the unique index is the
   real guarantee and a lost race surfaces as 409.
3. **`Course.lessonCount` tracks lesson rows** — `$inc` on lesson create and delete.
4. **No orphans** — deleting a course cascades to its lessons and enrollments; a deleted lesson is
   `$pull`ed from every enrollment's `completedLessons`.
5. **`progress` = round(completed ÷ total lessons × 100)**, recomputed on every progress write;
   `completedAt` is set exactly when progress hits 100 and cleared otherwise.

## 5. API surface

Per-endpoint reference lives in [routes/api/](routes/api/); a quick table is in
[README.md](../README.md) and a rendered list at `/api-reference`. This section records the
**authorization model**, which is the part that is easy to get wrong.

| Route | Method | Who may call it | Rule enforced by |
| --- | --- | --- | --- |
| `/api/auth/register`, `/api/auth/login` | POST | public | — |
| `/api/auth/logout` | POST | anyone | — |
| `/api/auth/google/start` | GET | public | mints state+nonce into an httpOnly cookie |
| `/api/auth/google/callback` | GET | public | state must match the cookie; id_token verified against Google's JWKS |
| `/api/auth/me` | GET | authenticated | `requireAuth` |
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
      ▼
redirect(safeDestination(next))  → /dashboard
```

Both forms work without client JS, hold their fields in state so a failed attempt does not clear
them, and never reveal which half of a credential pair was wrong. The reasoning for each is in
[routes/pages/login.md](routes/pages/login.md#four-decisions-worth-knowing) and
[routes/pages/signup.md](routes/pages/signup.md#submit-path).

### 6.4 Onboarding — `src/app/(onboarding)/`

The flow the product asked for:

```
SIGN UP ──┬── email + password ──┐
          └── Continue with Google ──┤
                                     ▼
                            ACCOUNT CREATED (session set)
                                     ▼
                        /onboarding/profile   name, phone, city
                                     ▼
                      /onboarding/education   college, program, current year
                                     ▼
                          onboardingCompletedAt = now
                                     ▼
                                  /dashboard
```

`onboardingCompletedAt` is the single source of truth, and it is set by the **education** step —
the last one — so there is no way to be half-onboarded with the flag already set.

Two gates keep the states from overlapping:

| Layout | Condition | Sends you to |
| --- | --- | --- |
| `(app)` | signed in, `onboardingCompletedAt` null | `/onboarding/profile` |
| `(onboarding)` | signed in, `onboardingCompletedAt` set | `/dashboard` |

Because the conditions are exact complements they cannot ping-pong. This also means an abandoned
sign-up resumes where it left off instead of reaching the app with no education details, and a
completed user cannot reopen a bookmarked step and overwrite their profile.

A `?next=` from sign-up is threaded through both steps and consumed when the education step
completes, so a deep link survives onboarding rather than being dropped at the door.

Onboarding lives outside the app shell — no sidebar, since the user is not in the app yet — and its
own header offers Sign out, which is the only way out of the flow.

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
4. New (or unfinished) accounts land in onboarding with the Google name and picture prefilled;
   finished ones go straight to their destination.

Credentials come from `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. With them unset the button
redirects back to `/login?error=google-unavailable` and the page explains it is not configured, which
is why the flow degrades rather than 500s on a deployment without Google set up.

### 6.5 Route protection — [src/proxy.ts](../src/proxy.ts)

`proxy.ts` (Next 16's renamed middleware) redirects any signed-in path to `/login?next=…` when the
session **cookie is absent**. That is an optimistic check only — it never verifies the JWT. The
`(app)` layout does, and is the authority.

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

## 7. Environment, commands, local setup

Required env (see [.env.example](../.env.example)); the app throws a named error if either is missing:

| Var | Purpose |
| --- | --- |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` locally, `mongodb+srv://…` for Atlas |
| `MONGODB_DB` | database name, defaults to `edupilot` |
| `JWT_SECRET` | HS256 signing key — long random string, rotate per environment |
| `GOOGLE_CLIENT_ID` | optional; OAuth client for "Continue with Google" |
| `GOOGLE_CLIENT_SECRET` | optional; leave both unset to run without Google |

```bash
cp .env.example .env.local
npm run seed      # wipes and reseeds: 1 instructor, 1 student, 1 course, 3 lessons, 1 enrollment
npm run dev
```

`npm run seed` is **destructive** — it runs `deleteMany({})` on all four collections. Never point it at
a shared database. Seed logins: `ada@edupilot.dev` (instructor), `sam@edupilot.dev` (student),
password `password123`.

Other scripts: `npm run build`, `npm start`, `npm run typecheck` (`tsc --noEmit`), `npm run lint`.

Page routes: `/login`, `/signup`, `/forgot-password`, `/terms`, `/privacy` are public; `/onboarding/*`,
`/dashboard` and the thirteen other paths in [app-routes.ts](../src/lib/app-routes.ts) need a session.
The seeded accounts are marked onboarded, so signing in as one goes straight to the dashboard; sign up
a new account to walk the onboarding flow.

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
9. No rate limiting or lockout anywhere — `/api/auth/login` is brute-forceable.
10. Logout only clears the cookie. The JWT stays valid until `exp`, so a stolen token cannot be
   revoked, and a role or password change does not invalidate live sessions. Fixing this means a
   token version / denylist or server-side sessions.
11. No CSRF token. `sameSite=lax` blocks cross-site POSTs from forms and fetch, which covers the
   common case, but it is the only defence.
12. No email verification, no password reset, no audit log. `/forgot-password` is a placeholder that
    says so (§6.5).

**Product / engineering**

13. **No tests and no CI.** Nothing prevents a regression in the authorization rules above.
14. UI covers sign-in, sign-up and the dashboard (§6). Thirteen sidebar destinations are placeholders,
    the dashboard cards show static content (§6.5), and there is still no way to reach the
    instructor-only endpoints from a browser.
15. `price` is stored and ignored; enrollment is free regardless. No payment integration.
16. No file or video upload — `videoUrl` and `coverImageUrl` are bare URL strings.
17. Deep pagination uses `skip`/`limit`, which degrades on large offsets; `?q=` depends on the text
    index and, as written, cannot combine with relevance sorting.
18. No structured logging, metrics, or health endpoint; `console.error` is the whole story.

## 9. Next steps

1. Tests around the authorization matrix in §5 and the invariants in §4 — highest value, since both
   are enforced by hand-written checks scattered across handlers.
2. Close §8 items 7 and 8 — the self-service `admin` role and the public lesson-body list. Both are
   access-control holes, both are one-line fixes, and both are reachable from the endpoint list on
   `/api-reference`.
3. Fix §8 items 1–3: published gate on course detail, progress recompute on lesson delete, numeric
   query-param guards.
4. Login rate limiting.
5. Product UI: catalogue → course detail → lesson player with progress; then wire the dashboard's
   Curriculum card to `GET /api/enrollments`, which already returns per-course progress.
6. Instructor surface: draft/publish flow, lesson reordering endpoint.
7. Payments, if `price` is to mean anything.

## 10. Document conventions

- One section per concern; keep §5's authorization table and §4's invariant list exhaustive — they are
  the parts reviewers rely on.
- **Route-specific detail belongs in [routes/](routes/), not here.** A new endpoint or screen means a
  new file there plus a row in [routes/README.md](routes/README.md); this file only changes when the
  new route alters architecture, the data model, an invariant or the gap list.
- When a gap in §8 is closed, delete the entry and describe the behaviour in the relevant section
  rather than leaving it struck through.
- Update *Last updated* on every edit.
