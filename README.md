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

## Getting started

```bash
cp .env.example .env.local   # then fill in the values
npm run seed                 # optional: demo instructor, student, course, lessons
npm run dev                  # http://localhost:3000
```

`.env.local`:

```
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=edupilot
JWT_SECRET=<long random string>

# Optional — enables "Continue with Google"
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
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
| `/signup`             | public        | Create an account, then straight to the dashboard      |
| `/onboarding/profile` | session       | Onboarding step 1 — name, phone, city                   |
| `/onboarding/education` | session     | Onboarding step 2 — college, program, current year      |
| `/dashboard`          | session       | Greeting plus six cards, inside the app shell           |
| 13 more app routes    | session       | Sidebar destinations, each a "not built yet" placeholder |
| `/forgot-password`    | public        | Placeholder — no reset flow exists yet                 |
| `/terms`, `/privacy`  | public        | Placeholders the sign-up consent copy links to         |
| `/api-reference`      | public        | The endpoint list below, rendered                      |

New accounts go **sign up → profile → education → dashboard**. `onboardingCompletedAt` on the user is
the gate: the app redirects to onboarding until it is set, and onboarding redirects to the dashboard
once it is, so an abandoned sign-up resumes and a finished user cannot reopen the steps.

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
      layout.tsx          session gate, redirects once onboarding is done
      onboarding/profile, onboarding/education
    (app)/
      layout.tsx          session gate + onboarding gate + app shell
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
    onboarding-actions.ts Server Actions for the two onboarding steps
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
| GET    | `/api/auth/me`       | auth   | Current user                       |

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

- **User** — `name`, `email` (unique), `passwordHash` (never serialized), `role` ∈ student/instructor/admin.
- **Course** — `title`, `slug` (unique), `instructor` → User, `level`, `tags`, `price`, `published`, `lessonCount`. Text index on title/description/tags powers `?q=`.
- **Lesson** — `course` → Course, `title`, `content`, `videoUrl`, `durationMinutes`, `order`, `isFreePreview`.
- **Enrollment** — `student` → User, `course` → Course, `completedLessons[]`, `progress` (0–100), `completedAt`. Compound unique index on `(student, course)`.

## Notes

- `connectDB()` caches the Mongoose connection on `globalThis` so hot reloads in development
  do not open a new connection each time.
- Login returns the same message for an unknown email and a wrong password, so the endpoint
  does not reveal which accounts exist.
- Errors are normalized in `handleError`: Zod and Mongoose validation → 422, duplicate key → 409,
  anything unexpected → 500 with the detail logged server-side rather than returned.
