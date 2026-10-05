# EduPilot

A learning platform built with **Next.js 16 (App Router)** and **MongoDB**. Next.js serves as
both the frontend and the backend — the API lives in route handlers under `src/app/api`,
so there is no separate server process. Sign-in and sign-up screens are built on top of it;
everything else is API-only for now.

Documentation, and keep it updated alongside any behaviour change:

- **[docs/routes/](docs/routes/) — one document per route.** Each covers the whole slice for that
  URL: the page or handler file, its server and client halves, the data it reads or writes, who may
  reach it, every status it returns, and what about it is not real yet.
- [docs/TECHNICAL.md](docs/TECHNICAL.md) — what spans routes: architecture, cross-cutting design,
  the data model and its invariants, environment, and the list of known gaps.

## Stack

| Concern    | Choice                                  |
| ---------- | --------------------------------------- |
| Framework  | Next.js 16, React 19, TypeScript        |
| Backend    | Next.js route handlers (`src/app/api`)  |
| Database   | MongoDB via Mongoose 9                  |
| Auth       | JWT in an httpOnly cookie (`jose`)      |
| Passwords  | bcrypt                                  |
| Validation | Zod                                     |
| Styling    | Tailwind CSS 4                          |
| Forms      | Server Actions + `useActionState`        |
| AI         | Provider-agnostic seam; Vertex AI (primary), Gemini, DeepSeek, Groq, OpenAI or a mock |
| Files      | Storage-driver seam; local disk today, S3-shaped slot |
| Payments   | Razorpay SDK: wallet top-ups, an append-only ledger, webhook settlement |

## Getting started

```bash
cp .env.example .env.local   # then fill in the values
npm run seed:colleges        # college directory for the onboarding autocomplete
npm run seed:curriculum      # regulations and subjects for six engineering colleges
npm run seed:topics          # topics from that syllabus, plus authored explanations
npm run seed                 # optional: demo instructor, student, course, lessons
npm run dev                  # http://localhost:3000
```

Tests:

```bash
npm run test                 # unit — no database needed
npm run test:integration     # authorization, each suite against its own scratch database
```

Scheduled work:

```bash
npm run reminders            # assignment deadline reminders — run every 15-60 minutes
npm run reconcile:wallets    # wallet balances against the ledger — run every 15-30 minutes
```

There is no scheduler inside the app. A web app with no worker process cannot hold one
reliably, so `npm run reminders` is meant for a cron job or a platform scheduler; until
something calls it, no deadline reminder is sent. The sweep is idempotent, so running it
more often costs a few queries and sends nothing extra.

The AI tutor runs with **no provider key**: it falls back to a mock that writes clearly-marked
placeholder text, so the whole student flow — topics, explanations, questions, streaming, caching,
quotas — works on a fresh clone. Configure a real provider through the `AI_*` variables in
[.env.example](.env.example) when you want real answers.

`.env.local`:

```
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=edupilot
JWT_SECRET=<long random string>

# Used to build links inside verification emails. No trailing slash.
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Optional — enables "Continue with Google"
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Email. Leave the Postal values blank for local work: the console transport
# then prints each message, and its verification link, to the dev server log.
EMAIL_TRANSPORT=console
POSTAL_API_URL=
POSTAL_API_KEY=
EMAIL_FROM=no-reply@example.com
EMAIL_FROM_NAME=EduPilot
```

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

For MongoDB Atlas, use the `mongodb+srv://...` connection string instead, and add the IP the app
dials from to the cluster's **Network Access** list — an address that is not on it fails the TLS
handshake after a 30-second timeout rather than returning an auth error.

Seed accounts — password `password123`:

- `ada@edupilot.dev` (instructor)
- `sam@edupilot.dev` (student)

## Pages

Per-page detail — composition, server/client split, states, gaps — in
[docs/routes/pages/](docs/routes/pages/).

| Route                 | Access        | What it is                                             |
| --------------------- | ------------- | ------------------------------------------------------ |
| `/`                   | public        | Marketing hero; most header links are not built yet    |
| `/login`              | public        | Sign in; "Remember me" extends the session to 30 days  |
| `/signup`             | public        | Create an account, then confirm the address            |
| `/verify-email`       | public        | Check-your-inbox screen, and the target of the emailed link |
| `/onboarding/education` | session     | Step 1 of 2 — college (searchable), degree, specialization |
| `/onboarding/academic` | session      | Step 2 of 2 — studying/graduated, current year, graduation year |
| `/onboarding/complete` | session      | "You're all set 🎉" with a summary of what was saved   |
| `/dashboard`          | session       | Greeting plus six cards, inside the app shell           |
| 13 more app routes    | session       | Sidebar destinations, each a "not built yet" placeholder |
| `/forgot-password`    | public        | Placeholder — no reset flow exists yet                 |
| `/terms`, `/privacy`  | public        | Placeholders the sign-up consent copy links to         |
| `/api-reference`      | public        | The endpoint list below, rendered                      |

New accounts go **sign up → verify email → education → academic → dashboard**. Google accounts skip
the verification step, because the provider has already established the address.

Where a signed-in user is allowed to go is decided by one function,
[`destinationFor`](src/lib/auth-routing.ts): unverified address → `/verify-email`, incomplete
profile → `/onboarding/education`, otherwise wherever they were headed. Sign-in, sign-up, the Google
callback and the app shell all call it, so an abandoned sign-up resumes exactly where it stopped, a
finished user cannot reopen the steps, and no two gates can disagree and loop.

Verification links carry a 256-bit token; only its SHA-256 hash is stored, it expires after an hour
(`EMAIL_VERIFICATION_TTL_MINUTES`), and it is deleted the moment it is used. Resends are rate limited
server-side. If the email fails to send, the account still exists — unverified is a valid state, and
"Resend email" is the way forward rather than signing up again.

"Continue with Google" is a real OAuth 2.0 / OpenID Connect flow (state + nonce, `id_token` verified
against Google's JWKS). Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to enable it and register
`http://localhost:3000/api/auth/google/callback` as an authorised redirect URI; with them unset the
button explains it is not configured. Microsoft and Apple remain unwired.

Signed-in pages live under `src/app/(app)/` and share a shell: a dark navigation rail (an off-canvas
drawer below `lg`), a top bar with search, notifications and the account menu, and the dashboard.

**The dashboard cards show placeholder content.** Tasks, wallet, streaks, timetable, notices and
placements all come from `src/lib/dashboard-data.ts`; there are no models behind them yet. The only
live value is the signed-in user. Search, notifications and Upgrade to Pro say they are not connected
rather than pretending to work.

Both forms work with JavaScript disabled: they post to a Server Action, which validates with Zod,
sets the session cookie and redirects. The Google / Microsoft / Apple buttons are drawn from the
design but not wired to any provider — clicking one says so.

Passwords must be at least 8 characters and contain a digit. `POST /api/auth/register` enforces the
same rule, so the API cannot accept a password the form would reject.

## Scripts

| Command             | Does                                     |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Dev server with hot reload               |
| `npm run build`     | Production build                         |
| `npm start`         | Serve the production build               |
| `npm run seed`      | Wipe and reseed the database with demo data |
| `npm run seed:colleges` | Upsert the curated college directory (idempotent) |
| `npm run ensure-indexes` | Create every declared index — run this in production, where `autoIndex` is off |
| `npm run migrate:profiles` | One-off: move embedded `education` into `studentProfiles` |
| `npm run typecheck` | `tsc --noEmit`                           |
| `npm run lint`      | ESLint                                   |

## Project layout

```
src/
  app/
    api/
      auth/{register,login,logout,me}/route.ts
      auth/google/{start,callback}/route.ts
      courses/route.ts
      courses/[id]/route.ts
      courses/[id]/lessons/route.ts
      lessons/[id]/route.ts
      enrollments/route.ts
      enrollments/[id]/progress/route.ts
    (auth)/
      login/page.tsx      sign-in screen
      signup/page.tsx     sign-up screen
      forgot-password, terms, privacy   placeholder pages
    (onboarding)/
      layout.tsx          session + email-verification gate, no sidebar
      onboarding/education, onboarding/academic, onboarding/complete
    (app)/
      layout.tsx          session + verification + profile gate, then the app shell
      dashboard/page.tsx  the dashboard
      ai-tutor, timetable, wallet, ...  13 placeholder screens
  components/
    auth/                 shell, forms, fields, social buttons, illustrations
    app/                  sidebar, top bar, dashboard cards, nav model
    brand.tsx icons.tsx notice-page.tsx
  lib/
    db.ts                 cached Mongoose connection (survives hot reload)
    auth.ts               JWT sign/verify + session cookie helpers
    accounts.ts           createAccount / authenticate, shared by the API and the forms
    auth-actions.ts       Server Actions behind the sign-in / sign-up forms
    api.ts                ok/fail responses, requireAuth/requireRole, error mapping
    validation.ts         Zod schemas + slugify
    redirects.ts          ?next= sanitiser
    app-routes.ts         the signed-in path list (shared with proxy.ts)
    current-user.ts       request-cached session user
    google-oauth.ts       authorize URL, token exchange, id_token verification
    auth-routing.ts       destinationFor() — the one place the redirect order is defined
    onboarding-actions.ts Server Actions for the two onboarding steps
    verification-actions.ts resend and change-email actions
    email-verification.ts token lifecycle: issue, verify, resend, rate limit
    email/                emailService.ts + postal.ts + console.ts + templates/
    student-profile.ts    reads and writes studentProfiles
    colleges.ts           the autocomplete query
    rate-limit.ts         fixed-window counters in Mongo
    user-fields.ts        roles, programs, study years (no mongoose import)
    dashboard-data.ts     placeholder card content
  models/
    User.ts Course.ts Lesson.ts Enrollment.ts
  proxy.ts                redirects /dashboard to /login without a session cookie
scripts/
  seed.ts
```

## API

Every response is wrapped: `{ "data": ... }` on success, `{ "error": { "message", "details" } }`
on failure. Authentication is a `edupilot_session` httpOnly cookie set by register/login.

The tables below are a summary. Full contracts — request schemas, every status, the writes each
handler performs, and its gaps — are in [docs/routes/api/](docs/routes/api/).

### Auth

| Method | Route                | Access | Notes                              |
| ------ | -------------------- | ------ | ---------------------------------- |
| POST   | `/api/auth/register` | public | `{ name, email, password, role? }` |
| POST   | `/api/auth/login`    | public | `{ email, password, remember? }`   |
| GET    | `/api/auth/google/start` | public | Redirects to Google's consent screen |
| GET    | `/api/auth/google/callback` | public | Verifies the `id_token`, then signs in |
| POST   | `/api/auth/logout`   | any    | Clears the session cookie          |
| GET    | `/api/auth/me`       | auth   | Current user, student profile, and both gate flags |
| GET    | `/api/colleges/search?q=` | auth | College autocomplete for onboarding |

### Courses

| Method | Route                  | Access             | Notes                                        |
| ------ | ---------------------- | ------------------ | -------------------------------------------- |
| GET    | `/api/courses`         | public             | `?q=&level=&tag=&page=&limit=` — published only |
| POST   | `/api/courses`         | instructor / admin | Slug generated from the title, deduped        |
| GET    | `/api/courses/:idOrSlug` | public           | Course + its lesson list                      |
| PATCH  | `/api/courses/:id`     | owner / admin      | Partial update                                |
| DELETE | `/api/courses/:id`     | owner / admin      | Cascades to lessons and enrollments           |

### Lessons

| Method | Route                       | Access        | Notes                                          |
| ------ | --------------------------- | ------------- | ---------------------------------------------- |
| GET    | `/api/courses/:id/lessons`  | public        | Ordered lesson list                            |
| POST   | `/api/courses/:id/lessons`  | owner / admin | Appends to the end unless `order` is given     |
| GET    | `/api/lessons/:id`          | conditional   | Body requires enrolment unless `isFreePreview` |
| PATCH  | `/api/lessons/:id`          | owner / admin | Partial update                                 |
| DELETE | `/api/lessons/:id`          | owner / admin | Also pulls the lesson from progress lists      |

### Enrollments

| Method | Route                             | Access  | Notes                                    |
| ------ | --------------------------------- | ------- | ---------------------------------------- |
| GET    | `/api/enrollments`                | auth    | The caller's enrolled courses            |
| POST   | `/api/enrollments`                | auth    | `{ courseId }` — idempotent              |
| PATCH  | `/api/enrollments/:id/progress`   | owner   | `{ lessonId, completed }`; recomputes `progress` |

### Example

```bash
curl -c jar.txt -X POST localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"sam@edupilot.dev","password":"password123"}'

curl -b jar.txt localhost:3000/api/enrollments
```

## Data model

- **User** — `name`, `email` (unique), `passwordHash` (never serialized), `authProvider` ∈ email/google, `emailVerified`, `role` ∈ student/instructor/admin.
- **StudentProfile** — `userId` → User (**unique**, one profile per person), `collegeId` → College, `collegeName`, `degree`, `specialization`, `studyStatus`, `currentYear`, `graduationYear`, `profileCompleted`.
- **EmailVerificationToken** — `userId` → User, `tokenHash` (SHA-256, never the raw token), `expiresAt` with a **TTL index**.
- **College** — `name`, `normalizedName` (unique), `city`, `state`, `source` ∈ seed/user. Seeded, then extended by whatever students type.
- **RateLimit** — `key`, `count`, `expiresAt` with a TTL index. One fixed window per counted action.
- **Course** — `title`, `slug` (unique), `instructor` → User, `level`, `tags`, `price`, `published`, `lessonCount`. Text index on title/description/tags powers `?q=`.
- **Lesson** — `course` → Course, `title`, `content`, `videoUrl`, `durationMinutes`, `order`, `isFreePreview`.
- **Enrollment** — `student` → User, `course` → Course, `completedLessons[]`, `progress` (0–100), `completedAt`. Compound unique index on `(student, course)`.

## Notes

- `connectDB()` caches the Mongoose connection on `globalThis` so hot reloads in development
  do not open a new connection each time.
- Login returns the same message for an unknown email and a wrong password, so the endpoint
  does not reveal which accounts exist. A used, expired-and-swept, or invented verification token
  reports the same "invalid" for the same reason.
- Email delivery sits behind `sendVerificationEmail()` in [src/lib/email/](src/lib/email/). Postal is
  the implementation; swapping in Resend, SES or Postmark means one new file satisfying
  `EmailTransport`, with no change to the authentication code.
- Errors are normalized in `handleError`: Zod and Mongoose validation → 422, duplicate key → 409,
  anything unexpected → 500 with the detail logged server-side rather than returned.
