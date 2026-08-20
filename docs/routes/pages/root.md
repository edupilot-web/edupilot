# `/` — landing page

| | |
| --- | --- |
| File | [../../../src/app/page.tsx](../../../src/app/page.tsx) |
| Access | public |
| Rendering | Server Component; dynamic, because it reads the session cookie |
| Title | `EduPilot — Learn. Connect. Grow.` |

The marketing page: a sticky header and one hero section. It is the only public product page —
every other link in the header is intended information architecture that does not exist yet.

## Composition

| Piece | File | Kind |
| --- | --- | --- |
| Page | [page.tsx](../../../src/app/page.tsx) | server — reads the session, renders the two below |
| Header | [site-header.tsx](../../../src/components/site-header.tsx) | client — nav, Explore dropdown, mobile menu, account menu |
| Hero | [hero.tsx](../../../src/components/hero.tsx) | server — copy, two CTAs, wave divider |
| Illustration | [hero-illustration.tsx](../../../src/components/hero-illustration.tsx) | inline SVG, no image request |
| Brand / icons | [brand.tsx](../../../src/components/brand.tsx), [icons.tsx](../../../src/components/icons.tsx) | inline SVG |

## Backend work this page does

`headerUser()` in the page file:

1. `getSession()` — verify the cookie; `null` means render the signed-out header.
2. `connectDB()`, then `User.findById(session.sub).select("name").lean()`.
3. Returns `{ name, notifications: 3 }`. **The notification count is hard-coded** — there is no
   notifications model. Marked with a `TODO` in the file.

The whole block is wrapped in `try/catch`: a database that is down or misconfigured logs and
falls back to the signed-out header rather than failing the marketing page. This is the only
place in the codebase where a failed `connectDB()` is deliberately swallowed.

## Header states

| Session | Right-hand cluster |
| --- | --- |
| signed out | `Sign in` link + `Join Now` button (`/login`, `/signup`) |
| signed in | search icon, bell with unread dot, avatar with initials, `Ada L.`-style short name, account menu with `Sign out` |

`Sign out` posts to `logoutAction` ([auth-actions.ts](../../../src/lib/auth-actions.ts)), which
clears the cookie and redirects to `/login` — the same action the signed-in top bar uses.

The header closes its popovers on outside click and on `Escape` via a local `useDismiss` hook,
and closes every panel on link click rather than in an effect keyed to `pathname`, which would
cascade renders.

## Links that do not resolve

Documented rather than fixed, because the pages are not written yet.

| Link | Where | Result |
| --- | --- | --- |
| `Explore` + its three children (`/explore`, `/explore/courses`, `/explore/programs`, `/explore/research`) | header nav | 404 |
| `/resources`, `/scholarships`, `/mentorship`, `/community` | header nav | 404 |
| `/events` | header nav | **redirects to `/login?next=/events`** — `/events` is a signed-in app route, not a marketing page |
| `Explore courses` | hero secondary CTA → `/explore` | 404 |

`Get started free` → `/signup` and the account-menu links do work.

## Gaps

- No catalogue UI, so the hero's "Explore courses" has nothing to point at even though
  `GET /api/courses` exists. See [../api/courses.md](../api/courses.md).
- Unread notification count is a literal `3`.
- Header nav is aspirational; seven of its eight destinations are dead or mis-targeted (above).
