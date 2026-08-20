# `/api/courses`

| | |
| --- | --- |
| File | [../../../src/app/api/courses/route.ts](../../../src/app/api/courses/route.ts) |
| Methods | `GET` (public catalogue), `POST` (instructor / admin) |
| Model | [Course.ts](../../../src/models/Course.ts) |

---

## `GET /api/courses` — catalogue

Public, no session needed. **The filter is pinned to `published: true`**, so drafts never appear
here.

### Query parameters

| Param | Default | Rules |
| --- | --- | --- |
| `page` | `1` | `Math.max(1, Number(page))` |
| `limit` | `12` | clamped to 1–50 |
| `q` | — | full-text search via `$text`, using the text index on `title` + `description` + `tags` |
| `level` | — | exact match: `beginner` \| `intermediate` \| `advanced` |
| `tag` | — | exact match against one element of `tags[]` |

`level` and `tag` are **not validated** — an unknown value matches nothing and returns an empty
page rather than a 400.

### Behaviour

`Course.find(filter)` with `.populate("instructor", "name email avatarUrl")`,
`.sort({ createdAt: -1 })`, `.skip((page-1)*limit)`, `.limit(limit)`, `.lean()` — run in parallel
with a `countDocuments(filter)` for the pagination block.

### Response — 200

```json
{
  "data": {
    "items": [
      {
        "_id": "66c0f1…",
        "title": "Introduction to Algorithms",
        "slug": "introduction-to-algorithms",
        "description": "Sorting, searching and complexity analysis from first principles.",
        "instructor": { "_id": "66c0f0…", "name": "Ada Lovelace", "email": "ada@edupilot.dev", "avatarUrl": null },
        "level": "beginner",
        "tags": ["algorithms", "computer-science"],
        "price": 0,
        "coverImageUrl": null,
        "published": true,
        "lessonCount": 3
      }
    ],
    "pagination": { "page": 1, "limit": 12, "total": 1, "pages": 1 }
  }
}
```

### Gaps (GET)

- **Non-numeric `?page=` / `?limit=` produce `NaN`**, which survives `Math.max`/`Math.min` and
  reaches `.skip()` — a 500 where a 400 belongs. `?page=abc` reproduces it.
- `?q=` uses `$text` but the sort stays `createdAt: -1`, so relevance is never used and cannot be
  combined with it as written.
- `skip`/`limit` degrades on deep offsets; there is no cursor pagination.
- No result caching and no `Cache-Control` header, so every catalogue view is a live query.

---

## `POST /api/courses` — create

`requireRole("instructor", "admin")`. The creator becomes the owner: `instructor: session.sub`,
taken from the token, never from the body.

### Body — `courseCreateSchema`

| Field | Type | Rules |
| --- | --- | --- |
| `title` | string | required, 3–200 chars |
| `description` | string | optional, ≤ 5000 |
| `level` | enum | optional, defaults to `beginner` |
| `tags` | string[] | optional, ≤ 20 items, each 1–40 chars |
| `price` | number | optional, ≥ 0 — **stored and then ignored everywhere** |
| `coverImageUrl` | string \| null | optional, must be a URL |
| `published` | boolean | optional, defaults to `false` |

`slug` is not accepted. It is generated: `slugify(title)` (lower-cased, non-alphanumerics
stripped, spaces to `-`, capped at 80 chars), then `-2`, `-3`… until `Course.exists({ slug })` is
false.

### Responses

| Status | When |
| --- | --- |
| 201 | created — `{ "data": { "course": … } }` |
| 401 | no session |
| 403 | signed in as a `student` |
| 409 | slug collision that beat the loop (duplicate key) |
| 422 | schema failure |

### Example

```bash
curl -b jar.txt -X POST localhost:3000/api/courses \
  -H 'content-type: application/json' \
  -d '{"title":"Systems Design","level":"advanced","tags":["systems"],"published":true}'
```

### Gaps (POST)

- The slug loop is check-then-act, so it races; the unique index keeps the data correct and the
  loser sees a 409.
- `published: true` can be set at creation, so there is no review step between "draft" and
  "publicly listed".
- `price` is accepted and stored but no code path ever charges for anything — enrollment is free
  regardless.
- `coverImageUrl` is a bare string; there is no upload endpoint and no validation that the URL
  resolves to an image.

## Consumers

None. There is no catalogue screen and no instructor UI — this endpoint is reachable only over
HTTP. The landing hero's "Explore courses" button points at `/explore`, which does not exist.
