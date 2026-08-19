# EduPilot — Technical Document

Living record of what this project is, how it is built, and what is deliberately not built yet.
**Keep this file updated in the same change that alters behaviour** — new route, new model field,
new invariant, new dependency.

- Status: backend complete, no product UI yet
- Last updated: 2026-08-19
- Owner: @RajeshKolluri

---

## 1. What we are building

EduPilot is a learning platform: instructors publish courses made of ordered lessons, students
enroll and track completion. The current milestone delivers the **entire backend as a JSON API**
plus a single landing page that documents the endpoints. There is no student- or instructor-facing
UI yet; every feature below is reachable only over HTTP.

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
| Product UI, payments, uploads, tests | not started |

## 2. Architecture

Single Next.js 16 deployable — no separate API process. Route handlers under
[src/app/api/](../src/app/api/) *are* the backend; they talk to MongoDB through Mongoose.

```
browser / curl
      │  fetch with credentials (edupilot_session cookie)
      ▼
Next.js route handler          src/app/api/**/route.ts
      │  1. requireAuth / requireRole   → src/lib/api.ts
      │  2. connectDB()                 → src/lib/db.ts   (cached connection)
      │  3. zodSchema.parse(body)       → src/lib/validation.ts
      │  4. Mongoose model op           → src/models/*.ts
      │  5. ok(data) | handleError(err) → src/lib/api.ts
      ▼
MongoDB (mongoose 9)
```

Four layers, each with one job:

| Layer | Files | Responsibility |
| --- | --- | --- |
| Transport | `src/app/api/**/route.ts` | HTTP shape, authorization decisions, orchestration |
| Cross-cutting | [src/lib/](../src/lib/) | connection, session, response envelope, error mapping, schemas |
| Domain | [src/models/](../src/models/) | schema, indexes, serialization rules |
| Tooling | [scripts/seed.ts](../scripts/seed.ts) | reproducible local data |

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
| Styling | Tailwind CSS 4 | landing page only for now |

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

- Cookie `edupilot_session`, `httpOnly`, `sameSite=lax`, `path=/`, `secure` in production, 7-day max-age.
- HS256 JWT signed with `JWT_SECRET`. Claims: `sub` (user id), `email`, `role`, `iat`, `exp`.
- `getSession()` returns `null` for a missing, malformed, or expired token — verification failures
  are swallowed rather than surfaced, so a stale cookie reads as signed-out.
- Role is carried **in the token**. Cheap to check, but a role change does not take effect until the
  token expires or the user signs in again. Accepted for now (see §7).

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
| **User** | `name`, `email`, `passwordHash`, `role` ∈ {student,instructor,admin}, `avatarUrl`, timestamps | unique `email` |
| **Course** | `title`, `slug`, `description`, `instructor`→User, `level` ∈ {beginner,intermediate,advanced}, `tags[]`, `price`, `coverImageUrl`, `published`, `lessonCount`, timestamps | unique `slug`; `instructor`; `published`; text index on `title`+`description`+`tags` |
| **Lesson** | `course`→Course, `title`, `content`, `videoUrl`, `durationMinutes`, `order`, `isFreePreview`, timestamps | compound `{course:1, order:1}` |
| **Enrollment** | `student`→User, `course`→Course, `completedLessons[]`→Lesson, `progress` 0–100, `completedAt`, timestamps | **unique compound `{student:1, course:1}`** |

Serialization: `passwordHash` is `select: false` (must be opted into with `.select("+passwordHash")`)
**and** deleted in `User.toJSON()` alongside `__v` — two independent guards so a hash cannot leak
through a route that forgets one.

Models are registered with the `mongoose.models.X || mongoose.model(...)` guard, required because hot
reload re-executes the module and Mongoose throws on duplicate model registration.

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

Full request/response reference lives in [README.md](../README.md) and on the landing page
([src/app/page.tsx](../src/app/page.tsx)). This section records the **authorization model**, which is
the part that is easy to get wrong.

| Route | Method | Who may call it | Rule enforced by |
| --- | --- | --- | --- |
| `/api/auth/register`, `/api/auth/login` | POST | public | — |
| `/api/auth/logout` | POST | anyone | — |
| `/api/auth/me` | GET | authenticated | `requireAuth` |
| `/api/courses` | GET | public | filter pinned to `published: true` |
| `/api/courses` | POST | instructor, admin | `requireRole` |
| `/api/courses/:idOrSlug` | GET | public | — |
| `/api/courses/:id` | PATCH, DELETE | course owner, admin | `instructor === session.sub` or `role === admin` |
| `/api/courses/:id/lessons` | GET | public | — |
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

Notable behaviours worth remembering:

- Login returns the identical `401 "Invalid email or password"` for an unknown email and a wrong
  password, so the endpoint does not enumerate accounts.
- Course detail accepts **either** an ObjectId or a slug (a 24-hex test decides), so URLs can be readable.
- New lessons append: `order` defaults to the current lesson count unless supplied.
- Progress writes reject a `lessonId` that belongs to a different course.
- Catalogue `limit` is clamped to 1–50 and `page` is floored at 1.

## 6. Environment, commands, local setup

Required env (see [.env.example](../.env.example)); the app throws a named error if either is missing:

| Var | Purpose |
| --- | --- |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` locally, `mongodb+srv://…` for Atlas |
| `MONGODB_DB` | database name, defaults to `edupilot` |
| `JWT_SECRET` | HS256 signing key — long random string, rotate per environment |

```bash
cp .env.example .env.local
npm run seed      # wipes and reseeds: 1 instructor, 1 student, 1 course, 3 lessons, 1 enrollment
npm run dev
```

`npm run seed` is **destructive** — it runs `deleteMany({})` on all four collections. Never point it at
a shared database. Seed logins: `ada@edupilot.dev` (instructor), `sam@edupilot.dev` (student),
password `password123`.

Other scripts: `npm run build`, `npm start`, `npm run typecheck` (`tsc --noEmit`), `npm run lint`.

## 7. Known gaps and accepted risks

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

7. No rate limiting or lockout anywhere — `/api/auth/login` is brute-forceable.
8. Logout only clears the cookie. The JWT stays valid until `exp`, so a stolen token cannot be
   revoked, and a role or password change does not invalidate live sessions. Fixing this means a
   token version / denylist or server-side sessions.
9. No CSRF token. `sameSite=lax` blocks cross-site POSTs from forms and fetch, which covers the
   common case, but it is the only defence.
10. No email verification, no password reset, no audit log.

**Product / engineering**

11. **No tests and no CI.** Nothing prevents a regression in the authorization rules above.
12. No UI beyond the endpoint reference page — no auth screens, catalogue, or lesson player.
13. `price` is stored and ignored; enrollment is free regardless. No payment integration.
14. No file or video upload — `videoUrl` and `coverImageUrl` are bare URL strings.
15. Deep pagination uses `skip`/`limit`, which degrades on large offsets; `?q=` depends on the text
    index and, as written, cannot combine with relevance sorting.
16. No structured logging, metrics, or health endpoint; `console.error` is the whole story.

## 8. Next steps

1. Tests around the authorization matrix in §5 and the invariants in §4 — highest value, since both
   are enforced by hand-written checks scattered across handlers.
2. Fix §7 items 1–3: published gate on course detail, progress recompute on lesson delete, numeric
   query-param guards.
3. Login rate limiting.
4. Product UI: auth screens → catalogue → course detail → lesson player with progress.
5. Instructor surface: draft/publish flow, lesson reordering endpoint.
6. Payments, if `price` is to mean anything.

## 9. Document conventions

- One section per concern; keep §5's authorization table and §4's invariant list exhaustive — they are
  the parts reviewers rely on.
- When a gap in §7 is closed, delete the entry and describe the behaviour in the relevant section
  rather than leaving it struck through.
- Update *Last updated* on every edit.
