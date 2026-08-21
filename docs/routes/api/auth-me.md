# `GET /api/auth/me`

| | |
| --- | --- |
| File | [../../../src/app/api/auth/me/route.ts](../../../src/app/api/auth/me/route.ts) |
| Access | authenticated — `requireAuth()` |
| Body | none |

Returns the full user document for whoever holds the session cookie. The endpoint clients use to
answer "am I signed in, and as whom".

## Behaviour

1. `requireAuth()` → verifies the JWT, throws `HttpError(401)` when it is missing, malformed or
   expired.
2. `connectDB()`, then `User.findById(session.sub)`.
3. `getStudentProfile(session.sub)` — every client asking "who am I" is really asking "and what is
   this account allowed to do next", so the profile travels with the user.
4. `ok({ user, studentProfile, needsEmailVerification, profileCompleted })` — `toJSON` strips
   `passwordHash` and `__v`.

Unlike most reads here this one is a hydrated document rather than `.lean()`, because `toJSON()`
is where the hash-stripping transform lives.

## Responses

| Status | When | Body |
| --- | --- | --- |
| 200 | signed in | `{ "data": { "user": …, "studentProfile": … \| null, "needsEmailVerification": bool, "profileCompleted": bool } }` |
| 401 | no / bad / expired cookie | `"Authentication required"` |
| 404 | valid token, user row gone | `"User not found"` |
| 500 | unexpected | `"Internal server error"` |

The 404 is reachable: a JWT stays valid for its full TTL, so a deleted account keeps a working
token. Clients should treat 404 here the same as 401 and sign the user out.

```json
{
  "data": {
    "user": {
      "_id": "66c0f0a1b2c3d4e5f6a7b8c9",
      "name": "Ada Lovelace",
      "email": "ada@edupilot.dev",
      "role": "instructor",
      "authProvider": "email",
      "emailVerified": true,
      "avatarUrl": null,
      "createdAt": "2026-08-19T09:12:44.108Z",
      "updatedAt": "2026-08-19T09:12:44.108Z"
    },
    "studentProfile": {
      "collegeId": "6a87…bf1b",
      "collegeName": "University of Cambridge",
      "degree": "PhD",
      "specialization": "Mathematics",
      "studyStatus": "graduated",
      "currentYear": null,
      "graduationYear": 2024,
      "profileCompleted": true
    },
    "needsEmailVerification": false,
    "profileCompleted": true
  }
}
```

## Consumers

None. Server Components read the user directly instead — `getCurrentUser()`
([current-user.ts](../../../src/lib/current-user.ts)) for the signed-in shell, `headerUser()` for
the landing page. Both skip the HTTP hop, and `getCurrentUser()` is wrapped in React's `cache` so
a layout and its page share one query.

This endpoint exists for external clients and for confirming a session from the command line.

## Example

```bash
curl -b jar.txt localhost:3000/api/auth/me
```

## Gaps

- `role` in the response comes from the database, but every **authorization** decision elsewhere
  reads `role` from the token. Right after a role change the two disagree until the user signs in
  again.
- No `PATCH /api/auth/me`, so nothing can update a name, avatar or password. `avatarUrl` is a
  field no endpoint ever writes.
