# `/dashboard` — the signed-in home screen

| | |
| --- | --- |
| File | [../../../src/app/(app)/dashboard/page.tsx](../../../src/app/(app)/dashboard/page.tsx) |
| Access | session required — enforced by `(app)/layout.tsx`, with `proxy.ts` in front |
| Rendering | Server Component; dynamic, because it reads the session |
| Title | `Dashboard · EduPilot` |
| Design | [TECHNICAL.md §6.1, §6.6](../../TECHNICAL.md) |

A greeting line plus four data cards and one "coming soon" strip, in a one-column /
two-column (`xl`) grid.

Access control, the shell, the sidebar and the top bar are shared by every signed-in route and
documented in [../conventions.md](../conventions.md#signed-in-page-conventions).

## What the page does on the server

```ts
const user = await getCurrentUser();   // request-cached; the layout already called it
if (!user) redirect("/login");         // does not trust the layout to have checked
const data = await getDashboard(user.id);
```

`getCurrentUser()` ([current-user.ts](../../../src/lib/current-user.ts)) verifies the JWT, then
reads the user and profile for `session.sub`. It is wrapped in React's `cache`, so the layout and
this page share **one** query per request. A cookie that outlived its user returns `null`.

`getDashboard()` ([dashboard-data.ts](../../../src/lib/dashboard-data.ts)) is **one** loader for the
whole screen rather than one per card. The cards are rendered together, so four separate loaders
would be four round trips to paint one page — and they share the profile read that resolves which
semester the student is in.

The greeting is `Good morning` / `Good afternoon` / `Good evening` from `new Date().getHours()`
on the **server**. Fine for one campus; wrong for anyone in another timezone.

## The cards

All live in [dashboard-cards.tsx](../../../src/components/app/dashboard-cards.tsx) and share one
`Card` wrapper (same radius, border, padding, heading row). Every one is server-rendered from
`getDashboard()`.

| Card | Source | Header link |
| --- | --- | --- |
| This semester | `getCurriculumOverview()` — position, subjects, regulation | `Curriculum` |
| Due soon | `AssignmentStudent`, narrowed to the next fortnight | `All assignments` |
| Your studying | `LearningEvent` + `StudentTopicProgress` | `AI Tutor` |
| Notes from your teachers | `NoteRecipient` | `All notes` |
| Coming soon | nothing — a list of links to unbuilt pages | — |

## What is real

All of it. That is a recent change and the reason for it is worth keeping.

This screen used to render from a module of constants: a wallet balance, a timetable, a notice
board, a placement and a task list. It was the one place in the product that **contradicted the
student's own profile** — it announced a semester-5 fee deadline to a semester-3 student and listed
subjects they were not taking. Invented data is worse than an empty card, because the reader cannot
tell which half of the screen to believe.

The rule now is that a card exists only if a model backs it. Wallet, timetable, placements, events
and the rest had no model and no API, so they are a **Coming soon** strip that links to the same
pages that say they are not built. The roadmap stays visible; nothing on the dashboard promises what
the next tap does not honour.

Two details worth knowing:

- **The streak is derived on read**, not stored. A stored counter needs a midnight job in the right
  timezone to break it, and is wrong for everyone between the day ending and the job running.
  Counting distinct active days backwards is one indexed query over a collection already TTL'd to a
  year. Today not having started yet does not break a streak — someone who studied yesterday and has
  not opened the app this morning is still on one.
- **A day counts if anything happened in it.** Weighting "topic completed" above "topic opened"
  would make the number unexplainable to the person it is shown to.

The semester card says when the position was **derived** from the admission batch rather than
confirmed by the student, and links to `/profile`. A derived semester is a guess, and the student is
the only one who can correct it.

## Empty states

Every card has one, and each says *why* rather than "no data":

| Situation | What the card says |
| --- | --- |
| No assignments at all | "Nothing is due. You are all caught up." |
| Assignments exist, none within a fortnight | "Nothing due in the next fortnight." |
| College has no curriculum configured | "Your college's curriculum is not configured yet." |
| Regulation exists, branch has no subjects | "No subjects are set up for your branch…" |
| Graduated | "You have graduated — there is no current semester." |
| Never studied | "No streak yet / Open a topic to start one" |

`getCurriculumOverview()` already distinguishes these; flattening them to "no subjects" would throw
away the only thing that tells a student whether to fix their profile, wait for their college, or do
nothing.

## Layout note

The grid is `grid-cols-1 … xl:grid-cols-2`, not a bare `grid`. An implicit track is sized to
`min-content`, which lets a card that cannot shrink (a `truncate` line with `nowrap`) widen the
column past the viewport. `minmax(0,1fr)` caps it so the text elides instead.

## Gaps

- Greeting uses server time (above).
- The Coming soon strip is nine links to placeholder pages. That is honest but it is still most of
  the sidebar.
