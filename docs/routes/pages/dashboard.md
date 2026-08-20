# `/dashboard` — the signed-in home screen

| | |
| --- | --- |
| File | [../../../src/app/(app)/dashboard/page.tsx](../../../src/app/(app)/dashboard/page.tsx) |
| Access | session required — enforced by `(app)/layout.tsx`, with `proxy.ts` in front |
| Rendering | Server Component; dynamic, because it reads the session |
| Title | `Dashboard · EduPilot` |

The only built screen behind the sidebar. A greeting line plus six cards in a
one-column / two-column (`xl`) grid.

Access control, the shell, the sidebar and the top bar are shared by every signed-in route and
documented in [../conventions.md](../conventions.md#signed-in-page-conventions).

## What the page does on the server

```ts
const user = await getCurrentUser();   // request-cached; the layout already called it
if (!user) redirect("/login");         // does not trust the layout to have checked
const firstName = user.name.trim().split(/\s+/)[0];
```

`getCurrentUser()` ([current-user.ts](../../../src/lib/current-user.ts)) verifies the JWT, then
reads `name email role` for `session.sub`. It is wrapped in React's `cache`, so the layout and
this page share **one** query per request. A cookie that outlived its user returns `null`.

The greeting is `Good morning` / `Good afternoon` / `Good evening` from `new Date().getHours()`
on the **server**. Fine for one campus; wrong for anyone in another timezone.

## The six cards

All six live in [dashboard-cards.tsx](../../../src/components/app/dashboard-cards.tsx) and share
one `Card` wrapper (same radius, border, padding, heading row). They are server-rendered — there
is no interactivity to lose, because nothing on them can be persisted.

| Card | Reads from `dashboard-data.ts` | Action in the header |
| --- | --- | --- |
| Daily Tasks | `DAILY_TASKS`, `taskCompletion()` | — |
| Campus Wallet | `WALLET_BALANCE`, `WALLET_ENTRIES`, `formatRupees()` | `Top Up` → `/wallet` |
| Streaks | `STREAK` (`days` + Monday-first `week[]`) | — |
| Today's Timetable | `TIMETABLE` | `View all` → `/timetable` |
| Notice Board | `NOTICES` | `View all` → `/notice-board` |
| Placements | `PLACEMENT` | `Apply` → `/placements` |

Every one of those links lands on a "not built yet" placeholder — see
[app-placeholders.md](app-placeholders.md).

## What is real and what is not

**Real:** the signed-in user's first name, and the unread dot on the top bar's bell (which is
`NOTICES.length`, so it is real only in the sense that it matches the list below it).

**Not real:** everything else. [dashboard-data.ts](../../../src/lib/dashboard-data.ts) is static
content with a module-level comment saying so. There are no models for tasks, wallets, streaks,
timetables, notices or placements — the database has Users, Courses, Lessons and Enrollments and
nothing else.

The screen is built against that module so wiring a card to real data is a one-place change:
give the card its own query and delete the matching export. Two consequences of doing it this
way:

- **The task list is read-only.** A tick that could not be persisted would be a lie, so the
  checkboxes render as icons, not inputs, until a tasks API exists.
- **The progress percentage is derived** (`taskCompletion()`), not stored, so the bar cannot
  disagree with the items above it.

## Layout note

The grid is `grid-cols-1 … xl:grid-cols-2`, not a bare `grid`. An implicit track is sized to
`min-content`, which lets a card that cannot shrink (a `truncate` line with `nowrap`) widen the
column past the viewport. `minmax(0,1fr)` caps it so the text elides instead.

## Gaps

- No card is connected to the API that *does* exist. The obvious first wiring is Curriculum
  progress from [../api/enrollments.md](../api/enrollments.md), which already returns each
  course with its `progress`.
- Greeting uses server time (above).
- The `Top Up`, `View all` and `Apply` buttons all lead to placeholders, so the screen reads as
  more finished than the product is.
