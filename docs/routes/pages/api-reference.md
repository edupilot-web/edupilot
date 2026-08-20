# `/api-reference` — endpoint list

| | |
| --- | --- |
| File | [../../../src/app/api-reference/page.tsx](../../../src/app/api-reference/page.tsx) |
| Access | **public** — no session check |
| Rendering | fully static Server Component; no session read, no database access |

A single page listing all sixteen endpoints in four groups (Auth, Courses, Lessons,
Enrollments), each row a coloured method chip, the path, and one line of description. Header
carries `Login` and `Sign up` links.

## How the list is produced

Hand-maintained: a literal `ENDPOINTS` array at the top of the page file, plus a
`METHOD_COLORS` map (GET emerald, POST blue, PATCH amber, DELETE rose). Nothing introspects the
filesystem, so **adding a route does not add a row here** — the page silently goes stale.

That makes three places to update when the API changes:

1. the handler under [../../../src/app/api/](../../../src/app/api/),
2. this page's `ENDPOINTS` array,
3. the matching doc in [../](../) plus its row in [../README.md](../README.md).

## Relationship to the other API references

| Where | Depth | Audience |
| --- | --- | --- |
| this page | one line per endpoint | someone poking at the running app |
| [../../../README.md](../../../README.md) | tables with access and body shape, plus a curl example | someone setting the project up |
| `docs/routes/api/*.md` | request schema, step-by-step behaviour, every status, DB writes, gaps | someone changing a handler |

## Gaps

- Listing the whole surface publicly is a deliberate convenience for a project with no product
  UI. It should not survive contact with real users — it is a map of the attack surface, and the
  `role` hole in [../api/auth-register.md](../api/auth-register.md#gaps) is reachable from it.
- Descriptions are prose, not a schema. There is no OpenAPI document, so nothing validates that
  this page, the README and the handlers agree.
- Not linked from anywhere. The landing header does not mention it; you have to know the URL.
