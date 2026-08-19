# EduPilot

A learning platform built with **Next.js 16 (App Router)** and **MongoDB**. Next.js serves as
both the frontend and the backend — the API lives in route handlers under `src/app/api`,
so there is no separate server process.

Architecture, design decisions, invariants and known gaps are documented in
[docs/TECHNICAL.md](docs/TECHNICAL.md) — keep it updated alongside any behaviour change.

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
```

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

For MongoDB Atlas, use the `mongodb+srv://...` connection string instead.

Seed accounts — password `password123`:

- `ada@edupilot.dev` (instructor)
- `sam@edupilot.dev` (student)

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
      courses/route.ts
      courses/[id]/route.ts
      courses/[id]/lessons/route.ts
      lessons/[id]/route.ts
      enrollments/route.ts
      enrollments/[id]/progress/route.ts
    page.tsx              API reference landing page
  lib/
    db.ts                 cached Mongoose connection (survives hot reload)
    auth.ts               JWT sign/verify + session cookie helpers
    api.ts                ok/fail responses, requireAuth/requireRole, error mapping
    validation.ts         Zod schemas + slugify
  models/
    User.ts Course.ts Lesson.ts Enrollment.ts
scripts/
  seed.ts
```

## API

Every response is wrapped: `{ "data": ... }` on success, `{ "error": { "message", "details" } }`
on failure. Authentication is a `edupilot_session` httpOnly cookie set by register/login.

### Auth

| Method | Route                | Access | Notes                              |
| ------ | -------------------- | ------ | ---------------------------------- |
| POST   | `/api/auth/register` | public | `{ name, email, password, role? }` |
| POST   | `/api/auth/login`    | public | `{ email, password }`              |
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
