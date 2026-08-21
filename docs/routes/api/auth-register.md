# `POST /api/auth/register`

| | |
| --- | --- |
| File | [../../../src/app/api/auth/register/route.ts](../../../src/app/api/auth/register/route.ts) |
| Access | **public** |
| Side effect | sets the `edupilot_session` cookie — a successful register is also a sign-in |
| Schema | `registerSchema` in [validation.ts](../../../src/lib/validation.ts) |

Creates an account and starts a session. Shared conventions (envelope, error map, cookie TTLs):
[../conventions.md](../conventions.md).

## Request

`Content-Type: application/json`

| Field | Type | Rules |
| --- | --- | --- |
| `name` | string | required, 2–120 chars |
| `email` | string | required, valid email, **lower-cased by the schema** so the unique index behaves case-insensitively |
| `password` | string | required, 8–200 chars **and at least one digit** (`passwordSchema`) |
| `role` | `"student" \| "instructor" \| "admin"` | optional, defaults to `student` — see [Gaps](#gaps) |

Unknown keys are stripped rather than rejected.

## Behaviour

1. `registerSchema.parse(await req.json())` — throws `ZodError` → 422.
2. `createAccount()` ([accounts.ts](../../../src/lib/accounts.ts)):
   `connectDB()`, `User.findOne({ email })`, then `bcrypt.hash(password, 12)` and `User.create`
   with `authProvider: "email"` and **`emailVerified: false`**.
3. `startSession({ sub, email, role })` — **no `remember` argument**, so the cookie is a 7-day
   persistent one.
4. `sendVerification(..., { enforceRateLimit: false })` — mails the link. **A delivery failure does
   not fail the request**: the account exists in a valid unverified state, and the client's recourse
   is to ask for another link rather than to register again.
5. `ok({ user, emailVerificationSent, next }, 201)`.

`next` is `destinationFor(...)`, the same function the browser paths use — a client that follows it
cannot end up somewhere the page gates would bounce it away from. For a fresh account it is always
`/verify-email`.

`passwordHash` cannot escape: the field is `select: false` on the schema *and* deleted in
`User.toJSON()`.

## Responses

| Status | When | Body |
| --- | --- | --- |
| 201 | created | `{ "data": { "user": …, "emailVerificationSent": bool, "next": "/verify-email" } }` + `Set-Cookie` |
| 409 | email already registered | `{ "error": { "message": "An account with that email already exists" } }` |
| 422 | schema failure | `"Validation failed"` with Zod `issues[]` in `details` |
| 500 | anything unexpected | `"Internal server error"` |

```json
{
  "data": {
    "user": {
      "_id": "66c0f0a1b2c3d4e5f6a7b8c9",
      "name": "Sam Student",
      "email": "sam@edupilot.dev",
      "role": "student",
      "avatarUrl": null,
      "createdAt": "2026-08-19T09:12:44.108Z",
      "updatedAt": "2026-08-19T09:12:44.108Z"
    }
  }
}
```

## Race behaviour

`findOne` then `create` is check-then-act, so two simultaneous sign-ups for the same address can
both pass the check. The **unique index on `email` is the real guard**: `createAccount` catches
the duplicate-key error (`code 11000`) and returns the same `email-taken` reason, so the loser
gets a clean 409 rather than a 500.

## Consumers

None in the UI. `/signup` posts to the `signupAction` Server Action instead, which calls the same
`createAccount()` but never sends a role and always requests a 30-day session. See
[../pages/signup.md](../pages/signup.md).

## Example

```bash
curl -i -X POST localhost:3000/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"name":"Sam Student","email":"sam@edupilot.dev","password":"password123"}'
```

## Gaps

- **`role` is client-supplied.** `{"role":"admin"}` in the body creates an admin account, with no
  invite, no approval and no audit trail. That grants the escape hatch every ownership check in
  the API honours (`session.role === "admin"`). The sign-up form is unaffected — it never sends
  the field — so the fix is to drop `role` from `registerSchema` and set it only from a seeded or
  admin-only path.
- No email verification: the address is stored unverified and never confirmed.
- No rate limiting, so account creation can be scripted.
- Returns 409 on a taken email, which confirms that the address has an account — deliberate on a
  sign-up form, but it makes this endpoint an enumeration oracle in a way
  [auth-login.md](auth-login.md) carefully is not.
