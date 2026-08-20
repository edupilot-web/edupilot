# `POST /api/auth/logout`

| | |
| --- | --- |
| File | [../../../src/app/api/auth/logout/route.ts](../../../src/app/api/auth/logout/route.ts) |
| Access | anyone — no `requireAuth`, so calling it without a session is a no-op that still returns 200 |
| Body | none |

## Behaviour

`clearSessionCookie()` ([auth.ts](../../../src/lib/auth.ts)) deletes the `edupilot_session`
cookie, then `ok({ success: true })`. No database access at all.

## Responses

| Status | When | Body |
| --- | --- | --- |
| 200 | always, signed in or not | `{ "data": { "success": true } }` |
| 500 | cookie store unavailable | `"Internal server error"` |

Idempotent by construction: deleting an absent cookie is not an error, and answering 200 either
way means a client can call it to guarantee a clean state without first checking the session.

## Consumers

Not called by the UI. Both `Sign out` buttons — in the signed-in top bar
([app-topbar.tsx](../../../src/components/app/app-topbar.tsx)) and in the marketing header's
account menu ([site-header.tsx](../../../src/components/site-header.tsx)) — post to
`logoutAction` ([auth-actions.ts](../../../src/lib/auth-actions.ts)), which clears the same
cookie and then redirects to `/login`. Using a form means sign-out works without client JS.

## Example

```bash
curl -b jar.txt -X POST localhost:3000/api/auth/logout
```

## Gaps

- **Sign-out is client-side only.** The JWT it discards stays valid until `exp` — up to 30 days
  with "Remember me". A stolen token cannot be revoked, and a password or role change does not
  invalidate live sessions. Fixing this needs a token version on the user row, a denylist, or
  server-side sessions.
- No "sign out everywhere", because there is nothing that tracks where a user is signed in.
