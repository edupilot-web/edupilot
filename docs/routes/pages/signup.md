# `/signup` — create an account

| | |
| --- | --- |
| File | [../../../src/app/(auth)/signup/page.tsx](../../../src/app/(auth)/signup/page.tsx) |
| Access | public; redirects away when a valid session exists |
| Query | `?next=` — where to go after the account is created; `?role=teacher` — the teacher form; `?invite=` — a teacher invitation token; `?ref=` — a referral code |
| Rendering | Server Component wrapping a Client Component form |

Same shell, action pattern and no-JS behaviour as [login.md](login.md) — only the differences
are recorded here.

## Composition differences

| Piece | Difference from `/login` |
| --- | --- |
| Panel | per role — "Create your account" / "Teach with EduPilot", `STUDENT_FEATURES` or `TEACHER_FEATURES` from [panel-features.tsx](../../../src/components/auth/panel-features.tsx), `BuildingFutureIllustration` |
| Role switch | [signup-role-switch.tsx](../../../src/components/auth/signup-role-switch.tsx) — links, not client state, so the teacher form arrives server-rendered with its invitation already resolved |
| Shell | `backHref="/login"` renders a mobile back chevron; no `mobileIntro`, so the small screen shows the "Sign up" heading |
| Form | [signup-form.tsx](../../../src/components/auth/signup-form.tsx) — five fields |
| Action | `signupAction` in [auth-actions.ts](../../../src/lib/auth-actions.ts) |

## Fields

| Field | Name | Validation (`signupFormSchema`) |
| --- | --- | --- |
| Full name | `name` | 2–120 chars, trimmed |
| Email address | `email` | required, valid email, lower-cased |
| Password | `password` | `passwordSchema`: 8–200 chars **and at least one digit**; hint reads "At least 8 characters with a number" |
| Confirm password | `confirmPassword` | required, must equal `password` |
| Terms | `terms` | must be `true` — "Accept the Terms of Service to continue" |
| — | `next` | hidden, only when `?next=` was present |

`passwordSchema` is shared with `registerSchema`, so the API cannot accept a password this form
would reject. See [../api/auth-register.md](../api/auth-register.md).

## Submit path

```
signupFormSchema.safeParse   → field errors, no DB call
   │
   ▼ createAccount({ name, email, password })   → src/lib/accounts.ts
   │      email taken → { errors: { email: ["An account with that email already exists."] } }
   ▼ startSession(..., { remember: true })      → 30-day cookie
   │
   ▼ sendVerification(..., { enforceRateLimit: false })
   │      failure is logged and tolerated — the account still exists
   ▼ redirect("/verify-email")                  → ?next= carried through
```

Four specifics:

- **The confirmation match is re-checked inside the action.** Zod skips a schema-level `refine`
  when any individual field is invalid, so a weak password plus unticked terms would otherwise
  hide a mismatched confirmation until the next submit. The action adds the error in the same
  pass.
- **New accounts always get a persistent session** (`remember: true`). There is no "Remember me"
  box on sign-up, and being signed out on browser close would be a poor welcome. The session is also
  what lets the next screen offer Resend and Change email without asking someone to sign in with an
  account they have not confirmed.
- **Sign-up lands on `/verify-email`, not the dashboard or onboarding.** An unconfirmed address is
  the first thing that has to be resolved; see [verify-email.md](verify-email.md).
- **The first verification email is not rate limited** (`enforceRateLimit: false`). Spending the
  user's allowance before they have asked for anything would be perverse. **A delivery failure does
  not fail the sign-up**: the account exists with `emailVerified: false`, which is a valid resting
  state, and the recourse is Resend rather than a second sign-up.

## Role assignment

The student form never sends a role, so `createAccount()` defaults it to `student`.

`?role=teacher` renders [teacher-auth-forms.tsx](../../../src/components/teacher/teacher-auth-forms.tsx)
instead, which posts to `POST /api/teacher/signup`. That is not a second door into the student path:
the account is created only after `checkEligibility()` clears the college's own policy, and it lands
unapproved, able to sign in and look around but not to publish. An `?invite=` token is resolved on the
server before the page renders, so the address and college it fixes are never the client's to choose,
and both are shown read-only. See [TECHNICAL.md §6.13a](../../TECHNICAL.md).

Admins are still made by seeding or by editing the database directly.

> `POST /api/auth/register` *does* accept a `role` field. That is a privilege-escalation hole in
> the API, not in this screen — see [../api/auth-register.md](../api/auth-register.md#gaps).

## Not connected

- The three social buttons (same component as `/login`) — no OAuth backend.
- `Terms of Service` → [terms.md](terms.md) and `Privacy Policy` → [privacy.md](privacy.md) are
  both placeholders. The form asks people to agree to documents nobody has written.
- No email verification: the address is stored unverified and never confirmed.
- No rate limiting, so account creation can be scripted.
