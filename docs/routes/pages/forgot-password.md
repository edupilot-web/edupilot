# `/forgot-password`, `/reset-password`

| | |
| --- | --- |
| Files | [forgot-password/](../../../src/app/(auth)/forgot-password/page.tsx), [reset-password/](../../../src/app/(auth)/reset-password/page.tsx) |
| Access | public; the reset screen is gated on a token, not a session |
| Service | [password-reset.ts](../../../src/lib/password-reset.ts) |
| Model | [PasswordResetToken.ts](../../../src/models/PasswordResetToken.ts) |
| Design | [TECHNICAL.md §6.4b](../../TECHNICAL.md) |

Two screens. The first sends a link; the second spends it.

---

## `/forgot-password`

**The answer is the same whether or not the address has an account**, and the copy is honest about
that: *"If that address has an EduPilot account, a link is on its way."* Confirming the address exists
would turn this form into a way to ask whether any address in the world belongs to a student — which is
a list worth having if you are writing a phishing mail.

The rate limit is keyed on the **address as typed**, not on a resolved user, so an address with no
account is limited exactly like one with an account. Limiting only real users would make the limiter
itself the oracle the neutral response exists to close. Its error describes the action ("too many reset
requests"), never the account.

One per minute, five per hour. The abuse this guards is mail-bombing somebody: the requester needs no
account and no session, so the only cost to them is the request.

Deliberately **not** gated on being signed out. Somebody signed in on one device who suspects another
session is not theirs should reach this without signing out first — resetting is what removes the other
session.

### Google accounts

They have no password, and they still get mail. That is the point: the mail tells whoever holds the
mailbox to use **Continue with Google**, while the person who typed the address into the form learns
nothing either way. Refusing at the form would leak which addresses are Google accounts.

---

## `/reset-password?token=…`

The token is checked **before the form renders**, so somebody following a stale link is told
immediately rather than choosing a password, typing it twice and then being refused — which reads as
the reset being broken rather than the link being old.

Each reason gets its own words:

| Reason | What the screen says |
| --- | --- |
| `invalid` | may have been mistyped or cut short by the mail client |
| `expired` | links last an hour |
| `used` | **"Your password has already been changed"** — not an error |
| `email-changed` | the account's address has moved since the link was sent |

`used` is worth separating from `invalid`: somebody who has just reset in another tab and clicked the
link again needs to know it worked.

`robots: { index: false, follow: false }` — a reset link must never be indexed or summarised by a
crawler.

---

## What a reset does

1. Sets the new password (bcrypt, 12 rounds).
2. **Revokes every existing session** by stamping `User.sessionsValidFrom`.
3. Marks the address verified — a reset proves mailbox control, which is what verification proves.
4. Spends the link.
5. Redirects to `/login?reset=1`, which confirms it.

Step 2 is the one that matters. People reset because they think somebody else is in their account, and
a reset that left those sessions working would be theatre. Sessions are stateless JWTs with nothing to
delete, so the account carries a moment and any token older than it is refused — by
`getCurrentUser()`, `getCurrentTeacher()` and `requireAuth()`, but **not** by `proxy.ts`, which runs
before the database is reachable and is a cheap cookie check by design.

Step 5 exists because the reset signs the student out, so they land on a sign-in form they did not ask
for. Without a word, that reads as failure.

The token is claimed with a conditional update (`usedAt: null` in the filter), so "is it unused" and
"mark it used" are one atomic operation — three concurrent submissions of one link leave exactly one
succeeding.

## Not built

No password *change* screen for a signed-in user, and no way to change a name or email. A teacher's
college is deliberately immutable, since it is the scope every other query is confined to.
