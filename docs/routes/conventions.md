# Route conventions

What every route doc in this folder assumes. Read once; the per-route files link back here
instead of repeating it.

## API conventions

### Response envelope

Every handler answers with one of two shapes, so a client needs exactly one parser:

```json
{ "data": { "user": { "…": "…" } } }
{ "error": { "message": "Course not found", "details": null } }
```

Built by `ok(data, status?)` and `fail(message, status?, details?)` in
[../../src/lib/api.ts](../../src/lib/api.ts). `details` is only populated for validation
failures, where it carries Zod's `issues[]` or Mongoose's field errors.

### Error map

No handler builds an error response for an expected failure by hand. It throws, and the single
`catch { return handleError(err) }` at the bottom of each handler maps it:

| Thrown | Status | Body message |
| --- | --- | --- |
| `HttpError(status, msg)` | its own | `msg` |
| `ZodError` | 422 | `"Validation failed"` + `issues[]` in `details` |
| `mongoose.Error.ValidationError` | 422 | `"Validation failed"` + field errors |
| Mongo duplicate key (`code 11000`) | 409 | `"A record with those details already exists"` |
| anything else | 500 | `"Internal server error"` — the real error is only logged |

A route doc's **Responses** table lists the statuses that route produces itself; the four rows
above can come from any of them.

### Authentication

A `edupilot_session` cookie — httpOnly, `sameSite=lax`, `path=/`, `secure` in production —
holding an HS256 JWT with `sub`, `email`, `role`, `iat`, `exp`. Set by
`/api/auth/register`, `/api/auth/login` and both auth Server Actions; cleared by
`/api/auth/logout` and `logoutAction`.

Three helpers gate the handlers:

| Helper | Fails with | Meaning |
| --- | --- | --- |
| `requireAuth()` | 401 `"Authentication required"` | any signed-in user |
| `requireRole(...roles)` | 403 `"You do not have permission to perform this action"` | that user's `role` must be in the list |
| `assertObjectId(id, label)` | 400 `"Invalid <label>"` | reject a malformed id before it reaches Mongo |

**The role comes from the token, not from a database read.** A role change does not take effect
until the token expires or the user signs in again. Ownership checks, by contrast, always read
the row: `resource.owner.toString() === session.sub || session.role === "admin"`.

### Request shape

- Bodies are JSON, parsed with `await req.json()` and validated by a Zod schema from
  [../../src/lib/validation.ts](../../src/lib/validation.ts). Unknown keys are stripped, not
  rejected.
- Update schemas are `.partial()` of the matching create schema, so PATCH is genuinely partial
  and can never accept a field create does not.
- Dynamic segments arrive as a **Promise** in Next 16: `const { id } = await params`.
- Every handler calls `connectDB()` before touching a model. It memoizes the connection on
  `globalThis`, so this is cheap after the first request.

### Session cookie side effects

`startSession()` writes the cookie from inside a route handler or Server Action, so a successful
register/login response carries a `Set-Cookie` header. TTL depends on `remember`:

| `remember` | Token TTL | Cookie |
| --- | --- | --- |
| `true` | 30 days | `Max-Age=2592000`, survives a browser restart |
| `false` | 7 days | session cookie, dropped when the browser closes |
| omitted | 7 days | `Max-Age=604800` |

## Page conventions

### Public page conventions

`/login`, `/signup`, `/forgot-password`, `/terms` and `/privacy` sit in the `(auth)` route
group — a grouping only, it adds no layout. The landing page and `/api-reference` sit at the
app root. All of them render under
[../../src/app/layout.tsx](../../src/app/layout.tsx), which sets `<html lang="en">`, the two
Geist fonts and the default metadata.

### Signed-in page conventions

Every route in the `(app)` group renders inside
[../../src/app/(app)/layout.tsx](../../src/app/(app)/layout.tsx), which is the **authority** on
access:

```
request → proxy.ts            cookie present?  no → /login?next=…
        → (app)/layout.tsx    getCurrentUser() valid?  no → /login
        → AppShell            sidebar + top bar + notice slot
        → page.tsx            the screen itself
```

- [../../src/proxy.ts](../../src/proxy.ts) (Next 16's renamed middleware) is an *optimistic*
  check: it only asks whether the cookie exists, never whether the JWT verifies. Its value is
  the `?next=` round trip, which a layout cannot do because a layout cannot read the URL.
- The layout verifies the token and loads the user through `getCurrentUser()`, which is wrapped
  in React's `cache`, so the layout and the page inside it share one query per request.
- `AppShell` owns the mobile drawer state and one shared amber notice slot. Controls with no
  backend (search, the notification bell, Upgrade to Pro) route through that slot and say they
  are not connected rather than looking broken.
- The path list lives once in [../../src/lib/app-routes.ts](../../src/lib/app-routes.ts).
  `proxy.ts`'s `config.matcher` repeats it literally because Next requires the matcher to be
  statically analysable — **adding a signed-in screen means editing both places.**

### `?next=` handling

`/login` and `/signup` accept `?next=`, run it through `safeDestination()`
([../../src/lib/redirects.ts](../../src/lib/redirects.ts)) and fall back to `/dashboard`. Only
single-slash relative paths survive, so `?next=https://evil.example` and `?next=//evil.example`
cannot turn sign-in into an open redirect.

Neither page is bounced by the proxy when a cookie is present. That is deliberate: with an
expired token, redirecting on cookie presence alone loops forever
(`/login` → `/dashboard` → invalid → `/login`). Both pages verify the session themselves and
redirect only when it is genuinely valid.

### Server / client split

Pages are Server Components. Anything holding state or listening for events is a Client
Component: the two auth forms, the sidebar, the top bar, the app shell, the marketing header,
the social buttons. Dashboard cards are server-rendered — they have no interactivity to lose,
because nothing on them can be persisted yet.
