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
| `/verify-email` | public | [pages/verify-email.md](pages/verify-email.md) | yes — link target *and* the check-your-inbox screen |
| `/onboarding/*` | session | [pages/onboarding.md](pages/onboarding.md) | yes — two steps plus a completion screen |
| `/forgot-password` | public | [pages/forgot-password.md](pages/forgot-password.md) | placeholder — no reset flow |
| `/terms` | public | [pages/terms.md](pages/terms.md) | placeholder — no text written |
| `/privacy` | public | [pages/privacy.md](pages/privacy.md) | placeholder — no text written |
| `/api-reference` | public | [pages/api-reference.md](pages/api-reference.md) | yes — hand-maintained list |
| `/dashboard` | session | [pages/dashboard.md](pages/dashboard.md) | yes — cards show static content |
| `/curriculum` | session | not written — see [TECHNICAL.md §6.11](../TECHNICAL.md) | yes |
| `/curriculum/[subjectId]` | session | not written — see [TECHNICAL.md §6.11](../TECHNICAL.md) | yes |
| `/curriculum/[subjectId]/topics/[topicId]` | session | [pages/curriculum-topic.md](pages/curriculum-topic.md) | yes |
| `/ai-tutor` | session | not written — see [TECHNICAL.md §6.12](../TECHNICAL.md) | yes — a hub, deliberately not a chat |
| `/assignments`, `/assignments/[id]` | session | not written — see [TECHNICAL.md §6.13](../TECHNICAL.md) | yes |
| `/notes`, `/notes/[id]` | session | not written — see [TECHNICAL.md §6.13](../TECHNICAL.md) | yes |
| `/notifications` | session | not written — see [TECHNICAL.md §6.13](../TECHNICAL.md) | yes |
| `/profile` | session | not written — see [TECHNICAL.md §6.10](../TECHNICAL.md) | yes — read-only, links to the academic flow in edit mode |
| `/settings` | session | not written — see [TECHNICAL.md §6.13](../TECHNICAL.md) | yes — notification preferences |
| `/teacher/login`, `/teacher/signup` | public | not written — see [TECHNICAL.md §6.13](../TECHNICAL.md) | yes |
| `/teacher/**` | teacher session | not written — see [TECHNICAL.md §6.13](../TECHNICAL.md) | yes — dashboard, assignments, submissions, notes, students, profile |
| `/admin/**` | admin session | not written — see [TECHNICAL.md §6.7, §6.9, §6.12, §6.13](../TECHNICAL.md) | yes |
| 9 sidebar routes | session | [pages/app-placeholders.md](pages/app-placeholders.md) | no — each says so on screen |

## API

| Method | Route | Access | Doc |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | public | [api/auth-register.md](api/auth-register.md) |
| PATCH, POST | `/api/profile/academic` | session | not written — see [TECHNICAL.md §6.10](../TECHNICAL.md) |
| POST | `/api/auth/login` | public | [api/auth-login.md](api/auth-login.md) |
| POST | `/api/auth/logout` | anyone | [api/auth-logout.md](api/auth-logout.md) |
| GET | `/api/auth/me` | session | [api/auth-me.md](api/auth-me.md) |
| GET | `/api/colleges/search` | session | [api/colleges-search.md](api/colleges-search.md) |
| POST | `/api/ai/question` | session | [api/ai-tutor.md](api/ai-tutor.md) |
| GET, PATCH | `/api/ai/question/:id` | session | [api/ai-tutor.md](api/ai-tutor.md) |
| POST | `/api/ai/question/:id/retry` | session | [api/ai-tutor.md](api/ai-tutor.md) |
| POST | `/api/ai/topic/deep-dive` | session | [api/ai-tutor.md](api/ai-tutor.md) |
| GET | `/api/ai/conversations`, `/:id` | session | [api/ai-tutor.md](api/ai-tutor.md) |
| GET | `/api/ai/history/topic/:topicId` | session | [api/ai-tutor.md](api/ai-tutor.md) |
| GET, PUT | `/api/learning/progress` | session | [api/learning.md](api/learning.md) |
| POST | `/api/learning/events` | session | [api/learning.md](api/learning.md) |
| GET, POST, DELETE | `/api/learning/bookmarks` | session | [api/learning.md](api/learning.md) |
| GET | `/api/curriculum/topics/:topicId` | session | [api/learning.md](api/learning.md) |
| GET | `/api/curriculum/subjects/:id/topics` | session | [api/learning.md](api/learning.md) |
| GET | `/api/curriculum/search` | session | [api/learning.md](api/learning.md) |
| POST | `/api/teacher/signup`, `/api/teacher/login` | public | [api/teaching.md](api/teaching.md) |
| GET, PUT | `/api/teacher/profile` | teacher | [api/teaching.md](api/teaching.md) |
| GET | `/api/teacher/academic-context`, `/api/teacher/subjects` | teacher | [api/teaching.md](api/teaching.md) |
| GET, POST | `/api/teacher/assignments` | teacher | [api/teaching.md](api/teaching.md) |
| GET, PUT | `/api/teacher/assignments/:id` | owning teacher | [api/teaching.md](api/teaching.md) |
| POST | `/api/teacher/assignments/:id/publish`, `/close` | owning teacher | [api/teaching.md](api/teaching.md) |
| GET, POST | `/api/teacher/assignments/:id/submissions[/:studentId]` | owning teacher | [api/teaching.md](api/teaching.md) |
| GET, POST, PUT | `/api/teacher/notes[/:id]` | teacher | [api/teaching.md](api/teaching.md) |
| POST | `/api/teacher/notes/:id/publish`, `/archive` | owning teacher | [api/teaching.md](api/teaching.md) |
| GET | `/api/student/assignments[/:id]` | the recipient | [api/teaching.md](api/teaching.md) |
| POST | `/api/student/assignments/:id/submit` | the recipient | [api/teaching.md](api/teaching.md) |
| GET | `/api/student/notes[/:id]` | the recipient | [api/teaching.md](api/teaching.md) |
| POST | `/api/student/notes/:id/bookmark` | the recipient | [api/teaching.md](api/teaching.md) |
| POST, GET | `/api/files/upload`, `/api/files/:fileId` | per purpose | [api/teaching.md](api/teaching.md) |
| GET | `/api/notifications`, `/unread-count` | the recipient | [api/notifications.md](api/notifications.md) |
| PATCH, POST | `/api/notifications/:id/read`, `/read-all` | the recipient | [api/notifications.md](api/notifications.md) |
| GET, PUT | `/api/notification-preferences` | the owner | [api/notifications.md](api/notifications.md) |
| GET | `/api/admin/teachers` | `teacher.view` | [api/teaching.md](api/teaching.md) |
| POST | `/api/admin/teachers/:id/status` | `teacher.approve` | [api/teaching.md](api/teaching.md) |
| GET, POST, DELETE | `/api/admin/teachers/:id/subjects` | `teacher.assign` | [api/teaching.md](api/teaching.md) |
| GET, POST | `/api/courses` | public / instructor | [api/courses.md](api/courses.md) |
| GET, PATCH, DELETE | `/api/courses/:id` | public / owner | [api/courses-id.md](api/courses-id.md) |
| GET, POST | `/api/courses/:id/lessons` | public / owner | [api/courses-id-lessons.md](api/courses-id-lessons.md) |
| GET, PATCH, DELETE | `/api/lessons/:id` | conditional / owner | [api/lessons-id.md](api/lessons-id.md) |
| GET, POST | `/api/enrollments` | session | [api/enrollments.md](api/enrollments.md) |
| PATCH | `/api/enrollments/:id/progress` | enrolled student | [api/enrollments-id-progress.md](api/enrollments-id-progress.md) |

## Not a route

Three things in `src/app/` are not routes and have no file here: `layout.tsx` (root HTML shell,
fonts, metadata), `(app)/layout.tsx` (the session gate and chrome shared by every signed-in
screen), and `(onboarding)/layout.tsx` (the same gate minus the sidebar). The gates are documented
in [conventions.md](conventions.md#signed-in-page-conventions) and in
[../TECHNICAL.md](../TECHNICAL.md#65-route-protection--proxyts-and-auth-routingts), because the
order in which they redirect is a single shared rule rather than per-route behaviour.

## How the two halves connect today

They mostly do not, and that is the single most useful thing to know about this codebase. The
UI reads the session and static placeholder content; the courses, lessons and enrollments API is
reachable only with `curl` or another HTTP client. Every API doc has a **Consumers** section
saying so explicitly, so nobody goes looking for the screen that calls it.
