# `POST /api/auth/login`

| | |
| --- | --- |
| File | [../../../src/app/api/auth/login/route.ts](../../../src/app/api/auth/login/route.ts) |
| Access | **public** |
| Side effect | sets the `edupilot_session` cookie |
| Schema | `loginSchema` in [validation.ts](../../../src/lib/validation.ts) |

## Request

| Field | Type | Rules |
| --- | --- | --- |
| `email` | string | required, valid email, lower-cased |
| `password` | string | required, non-empty — **no policy check on sign-in**, so an old password that predates the digit rule still works |
| `remember` | boolean | optional; controls session lifetime |

| `remember` | Token TTL | Cookie |
| --- | --- | --- |
| `true` | 30 days | `Max-Age=2592000`, survives a browser restart |
| `false` | 7 days | session cookie, dropped when the browser closes |
| omitted | 7 days | `Max-Age=604800` — the behaviour that predates the flag, so existing clients are unaffected |

## Behaviour

1. `loginSchema.parse(await req.json())`.
2. `authenticate()` ([accounts.ts](../../../src/lib/accounts.ts)): `connectDB()`,
   `User.findOne({ email }).select("+passwordHash")` — the hash must be opted into — then
   `bcrypt.compare`.
3. On success `startSession({ sub, email, role }, { remember })`.
4. `ok({ user: user.toJSON() })`.

## Responses

| Status | When | Body |
| --- | --- | --- |
| 200 | signed in | `{ "data": { "user": … } }` + `Set-Cookie` |
| 401 | unknown email **or** wrong password | `{ "error": { "message": "Invalid email or password" } }` |
| 422 | schema failure | `"Validation failed"` with `issues[]` |
| 500 | unexpected | `"Internal server error"` |

**The 401 is identical for both failure modes.** `authenticate()` returns one
`invalid-credentials` reason whether the row was missing or the hash did not match, so the
endpoint cannot be used to enumerate accounts. Keep it that way — splitting the message is the
easiest accidental regression in the codebase.

Note the timing side channel that remains: a missing user skips `bcrypt.compare` entirely, so an
unknown email answers measurably faster than a wrong password.

## Consumers

None in the UI. `/login` posts to the `loginAction` Server Action, which calls the same
`authenticate()` and maps the failure to a single form banner. See
[../pages/login.md](../pages/login.md).

## Example

```bash
curl -c jar.txt -X POST localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"sam@edupilot.dev","password":"password123","remember":true}'

curl -b jar.txt localhost:3000/api/auth/me
```

## Gaps

- **No rate limiting or lockout anywhere.** This endpoint is brute-forceable, and bcrypt cost 12
  is the only thing slowing an attacker down.
- No CSRF token. `sameSite=lax` blocks cross-site form and fetch POSTs, which covers the common
  case, but it is the only defence.
- No "signed in from a new device" signal, no session list, no way to see or revoke anything.
