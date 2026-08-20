# `/forgot-password` — placeholder

| | |
| --- | --- |
| File | [../../../src/app/(auth)/forgot-password/page.tsx](../../../src/app/(auth)/forgot-password/page.tsx) |
| Access | public |
| Rendering | static Server Component — no session read, no database access |
| Reached from | the `Forgot password?` link on [login.md](login.md) |

## What it does

Renders [NoticePage](../../../src/components/notice-page.tsx) — a centred card with the brand
lockup, a title, body copy and a back link to `/login`. There is **no form and no input**: the
page states that EduPilot cannot email reset links yet and tells the reader to ask an
administrator to reset the account directly.

## Why it is not built

A working reset needs three things this codebase does not have:

1. A token collection (single-use, expiring, hashed at rest).
2. An email sender and a deliverable from-address.
3. A password-change path that also invalidates live sessions — and sessions currently cannot be
   revoked at all, because a JWT stays valid until `exp`.

## What building it would touch

- New model for reset tokens; new `POST /api/auth/forgot-password` and
  `POST /api/auth/reset-password` handlers.
- Reuse `passwordSchema` from [validation.ts](../../../src/lib/validation.ts) so the new password
  obeys the same policy as sign-up.
- Rate limiting, which does not exist anywhere yet — an unthrottled reset endpoint is an email
  bomb and an account-enumeration oracle.
- Replace this page with a real form; keep the same `NoticePage` for the "check your inbox"
  confirmation.
