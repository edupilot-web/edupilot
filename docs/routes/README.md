# Route reference

One document per route. Each one covers the whole vertical slice for that URL — the page or
handler file, what runs on the server, what runs in the browser, the data it reads or writes,
who is allowed to reach it, and what about it is not real yet.

Cross-cutting material that would otherwise be repeated in every file lives in
[conventions.md](conventions.md): the response envelope, the error map, the auth helpers, the
session cookie, and the shared page shells. Architecture, the data model and the project-wide
gap list stay in [../TECHNICAL.md](../TECHNICAL.md).

**Keep these files updated in the same change that alters a route.** A new endpoint or screen
means a new file here plus a row in the tables below.

## Pages

| Route | Access | Doc | Built? |
| --- | --- | --- | --- |
| `/` | public | [pages/root.md](pages/root.md) | yes — marketing hero, most header links 404 |
| `/login` | public | [pages/login.md](pages/login.md) | yes |
| `/signup` | public | [pages/signup.md](pages/signup.md) | yes |
| `/forgot-password` | public | [pages/forgot-password.md](pages/forgot-password.md) | placeholder — no reset flow |
| `/terms` | public | [pages/terms.md](pages/terms.md) | placeholder — no text written |
| `/privacy` | public | [pages/privacy.md](pages/privacy.md) | placeholder — no text written |
| `/api-reference` | public | [pages/api-reference.md](pages/api-reference.md) | yes — hand-maintained list |
| `/dashboard` | session | [pages/dashboard.md](pages/dashboard.md) | yes — cards show static content |
| 13 sidebar routes | session | [pages/app-placeholders.md](pages/app-placeholders.md) | no — each says so on screen |

## API

| Method | Route | Access | Doc |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | public | [api/auth-register.md](api/auth-register.md) |
| POST | `/api/auth/login` | public | [api/auth-login.md](api/auth-login.md) |
| POST | `/api/auth/logout` | anyone | [api/auth-logout.md](api/auth-logout.md) |
| GET | `/api/auth/me` | session | [api/auth-me.md](api/auth-me.md) |
| GET, POST | `/api/courses` | public / instructor | [api/courses.md](api/courses.md) |
| GET, PATCH, DELETE | `/api/courses/:id` | public / owner | [api/courses-id.md](api/courses-id.md) |
| GET, POST | `/api/courses/:id/lessons` | public / owner | [api/courses-id-lessons.md](api/courses-id-lessons.md) |
| GET, PATCH, DELETE | `/api/lessons/:id` | conditional / owner | [api/lessons-id.md](api/lessons-id.md) |
| GET, POST | `/api/enrollments` | session | [api/enrollments.md](api/enrollments.md) |
| PATCH | `/api/enrollments/:id/progress` | enrolled student | [api/enrollments-id-progress.md](api/enrollments-id-progress.md) |

## Not a route

Two things in `src/app/` are not routes and have no file here: `layout.tsx` (root HTML shell,
fonts, metadata) and `(app)/layout.tsx` (the session gate and chrome shared by every signed-in
screen). The gate is documented in [conventions.md](conventions.md#signed-in-page-conventions)
because every signed-in route depends on it.

## How the two halves connect today

They mostly do not, and that is the single most useful thing to know about this codebase. The
UI reads the session and static placeholder content; the courses, lessons and enrollments API is
reachable only with `curl` or another HTTP client. Every API doc has a **Consumers** section
saying so explicitly, so nobody goes looking for the screen that calls it.
