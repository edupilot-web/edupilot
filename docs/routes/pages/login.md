# `/login` — sign in

| | |
| --- | --- |
| File | [../../../src/app/(auth)/login/page.tsx](../../../src/app/(auth)/login/page.tsx) |
| Access | public; redirects away when a valid session exists |
| Query | `?next=` — where to go after signing in |
| Rendering | Server Component wrapping a Client Component form |

## Composition

| Piece | File | Kind |
| --- | --- | --- |
| Page | [login/page.tsx](../../../src/app/(auth)/login/page.tsx) | server — reads `?next=`, redirects signed-in visitors, supplies the panel copy |
| Panel bullets | `SIGN_IN_FEATURES` in [panel-features.tsx](../../../src/components/auth/panel-features.tsx) | shared with the other three auth screens |
| Shell | [auth-shell.tsx](../../../src/components/auth/auth-shell.tsx) | server — two-column layout, brand lockup, dot grid and wave, mobile header |
| Form | [login-form.tsx](../../../src/components/auth/login-form.tsx) | **client** — `useActionState`, field state, pending button |
| Fields | [fields.tsx](../../../src/components/auth/fields.tsx) | labelled input, password reveal toggle, checkbox, per-field errors, form banner |
| Social buttons | [social-sign-in.tsx](../../../src/components/auth/social-sign-in.tsx) | client — Google / Microsoft / Apple, none wired |
| Action | `loginAction` in [auth-actions.ts](../../../src/lib/auth-actions.ts) | server action |
| Illustration | `StudyingTogetherIllustration` in [illustrations.tsx](../../../src/components/auth/illustrations.tsx) | inline SVG |

Below `lg` the marketing panel drops away and the form column shows a centred logo plus the
`mobileIntro` block ("Welcome back! 👋"), matching the mobile design.

## Server side of the page itself

```ts
const { next } = await props.searchParams;      // searchParams is a Promise in Next 16
const destination = safeDestination(next);      // sanitised, defaults to /dashboard
if (await getSession()) redirect(destination);  // already signed in
```

`next` is passed to the form only when it was actually present in the URL, so the hidden input
does not appear on a plain visit.

## Submit path

```
<form action={loginAction}>  ── FormData: email, password, remember?, next?
   │
   ▼ loginFormSchema.safeParse        invalid → { errors } rendered per field, no DB call
   │
   ▼ authenticate({ email, password })  → src/lib/accounts.ts (bcrypt.compare)
   │                                     not ok → { message: "Invalid email or password." }
   ▼ startSession({ sub, email, role }, { remember })   → sets edupilot_session
   │
   ▼ redirect(safeDestination(next))   → 303 to /dashboard
```

`authenticate()` is the same function `POST /api/auth/login` calls — one implementation of
"check a password", two transports. See [../api/auth-login.md](../api/auth-login.md).

### Fields

| Field | Name | Validation (`loginFormSchema`) |
| --- | --- | --- |
| Email address | `email` | required, must parse as an email, lower-cased |
| Password | `password` | required (no policy check on sign-in) |
| Remember me | `remember` | checkbox, defaults to **checked**; `"on"` → `true` |
| — | `next` | hidden, only when `?next=` was present |

`remember` maps straight onto session lifetime: ticked → 30 days and a persistent cookie,
unticked → 7-day token in a cookie the browser drops on close. See
[../conventions.md](../conventions.md#session-cookie-side-effects).

## Four decisions worth knowing

- **Works without client JS.** It is a real `<form action={serverAction}>`; React renders a
  native POST. Validation, session and redirect all work with scripting disabled — the JS path
  only adds inline errors without a full reload.
- **Fields are controlled.** React resets an uncontrolled form once its action settles, which
  would wipe the email after a failed attempt.
- **Failures never say which half was wrong.** One `Invalid email or password.` banner covers
  both an unknown email and a bad password, so the screen does not enumerate accounts — matching
  the API.
- **Unexpected errors are generic.** A thrown exception logs server-side and shows
  `Something went wrong on our end. Please try again.`

## Not connected

- Google / Microsoft / Apple: no OAuth client, redirect URI or callback exists. Each button
  shows "… sign-in is not connected yet. Please use your email and password."
- No rate limiting or lockout, on this form or the API. The credential check is brute-forceable.

## One sign-in for both roles

A teacher signing in here is accepted — the account, the password hash and the session cookie are the
same — and `destinationFor` sends them to `/teacher/dashboard` rather than student onboarding, which
they would never be able to finish. `/teacher/login` still exists because every teacher gate redirects
there, `proxy.ts` included; it renders the same shell and the same fields, with the teacher panel copy.
