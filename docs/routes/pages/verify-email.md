# `/verify-email` — confirm the address

| | |
| --- | --- |
| File | [../../../src/app/(auth)/verify-email/page.tsx](../../../src/app/(auth)/verify-email/page.tsx) |
| Access | public — the link is opened wherever the mail was read, often not the browser that signed up |
| Query | `?token=` the emailed token; `?next=` where to go once the address is confirmed |
| Rendering | Server Component; the inbox screen embeds a Client Component |

One route, two jobs. **With `?token=`** it is the endpoint the email points at. **Without one** it
is the "check your email" screen sign-up lands on.

They are the same route on purpose: there is then no second page that could hold a different
opinion about whether the address is confirmed, which is the shape a redirect loop needs.

## Server flow

```
read ?token= and ?next=
   │
   ▼ getCurrentUser()          ← read BEFORE consuming the token: whether a session
   │                             exists decides where success can send the user
   ├── token present ──► verifyEmailToken(token)   → src/lib/email-verification.ts
   │        verified / already-verified
   │            ├── session belongs to that user → redirect(destinationFor(...))
   │            └── otherwise                    → "Email verified 🎉" + sign-in button
   │        expired  → "Your verification link has expired" + a way to get a new one
   │        invalid  → "This verification link is invalid or has already been used"
   │
   └── no token
            ├── no session          → redirect("/login")
            ├── already verified    → redirect(destinationFor(...))
            └── otherwise           → VerifyEmailPanel
```

## Token validation

Performed by `verifyEmailToken()`, not by this page:

1. Reject anything that is not 64 hex characters — a truncated or hand-typed value never reaches
   Mongo.
2. SHA-256 the value and look up `emailVerificationTokens.tokenHash`.
3. Compare in constant time (belt and braces — the query already matched on it).
4. Expired → delete the row, report `expired`.
5. User missing → delete the row, report `invalid`.
6. Delete the row, **then** set `emailVerified`. If the process dies between the two, the link is
   dead rather than reusable.

## What each outcome says, and why

| Outcome | Copy | Way out |
| --- | --- | --- |
| verified | straight into onboarding, or "Email verified 🎉" in a different browser | continue / sign in |
| already verified | the same success screen | continue / sign in |
| expired | "Your verification link has expired" | "Send a new verification email" |
| invalid | "This verification link is invalid or has already been used" | sign in, then resend |

Used, swept by the TTL, and never valid all report **invalid** in identical words. Telling them
apart would tell whoever is holding the link something about the account behind it.

Every state ends in exactly one obvious action. A dead end here is unusually expensive: the student
cannot use the product, and on a Google-less account there is no password-reset path to fall back
on.

## The inbox screen

[verify-email-panel.tsx](../../../src/components/auth/verify-email-panel.tsx), a Client Component.

| Action | Server action | Notes |
| --- | --- | --- |
| Resend email | `resendVerificationAction` | rate limited server-side; the disabled button is a courtesy, not a control |
| Change email | `changeEmailAction` | only while unverified; drops outstanding tokens; counts against the resend limits |
| I've verified — continue | link back to this route | re-reads the account and moves on |
| Back to login | `logoutAction` | signing out is what it has to mean — the session is the unconfirmed account's |

"Change email" is safe precisely because it is unreachable once verified: there is nothing of value
behind an address nobody has confirmed. Reachable after verification it would be an
account-takeover primitive.

## Rate limits

Three rules, all counted (see [../../TECHNICAL.md](../../TECHNICAL.md#36-rate-limiting--rate-limitts)):
1/minute per user, 5/hour per user, 6/hour per destination address. A refusal names the wait rather
than failing silently.

## Gaps

- **The token is consumed on `GET`.** A mail scanner that prefetches links spends it before the
  student clicks, who then sees "invalid" and has to resend. A landing page with a Confirm button
  would fix it at the cost of a click for everyone.
- No "your link is on its way" state distinct from "we already sent one" — the panel always reads as
  if the first mail went out, even when delivery failed and the student has not pressed Resend yet.
