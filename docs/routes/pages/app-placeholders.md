# The nine unbuilt signed-in routes

| | |
| --- | --- |
| Files | `src/app/(app)/<segment>/page.tsx` — one per row below |
| Access | session required, exactly like `/dashboard` |
| Rendering | static Server Components — no session read of their own, no database access |

Seven of the sixteen destinations in the sidebar are built. The other nine are
real route files that render
[ComingSoon](../../../src/components/app/coming-soon.tsx). They are documented together because
they are the same four-line file with a different `APP_ROUTES` constant — nothing about them
differs except copy. **When one is built, give it its own file in this folder and delete its row
here.**

## The routes

Group and blurb come from [nav.ts](../../../src/components/app/nav.ts); the blurb is what the
placeholder page shows as its description.

| Route | Sidebar label | Group | Page title | Blurb shown on screen |
| --- | --- | --- | --- | --- |
| `/score-booster` | Score Booster | Main | `Score Booster · EduPilot` | Targeted practice sets built from the topics you score lowest on. |
| `/mock-interviews` | Mock Interviews | Main | `Mock Interviews · EduPilot` | Practise technical and HR rounds, then review the feedback on each answer. |
| `/timetable` | Timetable | Academics | `Timetable · EduPilot` | The week's classes, rooms and staff, with today highlighted. |
| `/notice-board` | Notice Board | Academics | `Notice Board · EduPilot` | Announcements from the department and the college, newest first. |
| `/events` | Events | Campus | `Events · EduPilot` | Workshops, fests and guest lectures you can register for. |
| `/placements` | Placements | Campus | `Placements · EduPilot` | Open roles, eligibility, and the status of every application you have made. |
| `/wallet` | Campus Wallet | Campus | `Campus Wallet · EduPilot` | Balance, top-ups and a statement of campus spending. |
| `/refer` | Refer & Earn | Campus | `Refer & Earn · EduPilot` | Invite a friend to EduPilot and track the rewards you have earned. |
| `/service-requests` | Service Requests | Support | `Service Requests · EduPilot` | Raise a request for documents, hostel or IT support and follow its progress. |

## What a placeholder page contains

```tsx
export const metadata: Metadata = { title: "AI Tutor · EduPilot" };
export default function Page() {
  return <ComingSoon href={APP_ROUTES.aiTutor} />;
}
```

`ComingSoon` looks the route up in `NAV_GROUPS` and renders a breadcrumb
(`Dashboard › <label>`), the section's icon, its label, its blurb, a `Not built yet` pill, one
line saying the screen has no data model or API behind it, and a `Back to dashboard` button.

It **throws** if the `href` is not in `NAV_GROUPS` — a missing nav entry is a build-time-visible
mistake rather than a blank page.

## Why they exist at all

So no sidebar entry is a dead link and none of them pretends to work. Each is a real route file,
ready to be replaced by the actual screen; the placeholder names the section and says what it
will do, so a visitor is never left wondering whether the click registered.

## Adding or building one

Adding a new signed-in route means four edits, in this order:

1. `APP_ROUTES` in [app-routes.ts](../../../src/lib/app-routes.ts).
2. A `NAV_GROUPS` entry in [nav.ts](../../../src/components/app/nav.ts) — label, icon, blurb.
3. `config.matcher` in [proxy.ts](../../../src/proxy.ts), literally. Next requires the matcher to
   be statically analysable, so it cannot be computed from `PROTECTED_PATHS`. **Miss this and
   the route still works but loses its `?next=` round trip.**
4. The `page.tsx` itself.

Building one for real also means: a model under [src/models/](../../../src/models/), a route
handler under [src/app/api/](../../../src/app/api/) with a Zod schema, and — if the dashboard
shows the same data — deleting the matching export from
[dashboard-data.ts](../../../src/lib/dashboard-data.ts).

## Cross-route note

`/events` is also a link in the **marketing** header on [root.md](root.md). A signed-out visitor
clicking it there is bounced to `/login?next=/events`, and after signing in lands on this
placeholder.
