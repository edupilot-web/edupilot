# `/api/courses/:id`

| | |
| --- | --- |
| File | [../../../src/app/api/courses/[id]/route.ts](../../../src/app/api/courses/[id]/route.ts) |
| Methods | `GET` (public), `PATCH` / `DELETE` (owner or admin) |
| Segment | `params` is a **Promise** — `const { id } = await params` |

---

## `GET /api/courses/:idOrSlug` — detail

Public. The segment is matched by shape: a 24-hex string is treated as an `_id`, anything else as
a `slug`, so both `/api/courses/66c0f1…` and `/api/courses/introduction-to-algorithms` work and
course URLs can be readable.

Returns the course (with `instructor` populated as `name email avatarUrl`) plus a **lesson index**
— `title order durationMinutes isFreePreview` only, sorted by `order` then `createdAt`. Lesson
bodies are deliberately absent; those come from
[lessons-id.md](lessons-id.md), which gates them.

```json
{
  "data": {
    "course": { "_id": "66c0f1…", "title": "Introduction to Algorithms", "lessonCount": 3, "published": true },
    "lessons": [
      { "_id": "66c0f2…", "title": "Big-O notation", "order": 0, "durationMinutes": 12, "isFreePreview": true }
    ]
  }
}
```

| Status | When |
| --- | --- |
| 200 | found |
| 404 | no course with that id or slug |
| 500 | unexpected |

Note there is no `assertObjectId` here — it would reject slugs. A malformed id simply falls into
the slug branch and 404s, which is the right outcome.

### Gap — unpublished courses are readable

This handler does **not** check `published`. Anyone holding an id or slug can read a draft course
and its full lesson index, even though `GET /api/courses` filters drafts out. Slugs are derived
from titles, so they are guessable. The list endpoint is right; this one should match it.

---

## `PATCH /api/courses/:id` — update

`requireAuth()`, then `assertObjectId(id, "course id")` — **id only, no slug** on the write paths.

Ownership: `course.instructor.toString() === session.sub || session.role === "admin"`, otherwise
`403 "Only the course owner can edit this course"`.

Body is `courseUpdateSchema` — `courseCreateSchema.partial()`, so every field is optional and no
field exists here that create does not accept. Applied with `course.set(body)` then `save()`, so
Mongoose validators run.

| Status | When |
| --- | --- |
| 200 | updated — `{ "data": { "course": … } }` |
| 400 | `id` is not a valid ObjectId |
| 401 / 403 | no session / not the owner |
| 404 | no such course |
| 409 | duplicate key |
| 422 | schema or model validation failure |

Two things PATCH cannot do: change the owner (`instructor` is not in the schema) and change the
`slug` (also absent, so a renamed course keeps its original URL).

---

## `DELETE /api/courses/:id` — delete

Same auth and ownership rules as PATCH. Cascades so nothing is orphaned:

```
Lesson.deleteMany({ course })       ─┐ in parallel
Enrollment.deleteMany({ course })   ─┘
course.deleteOne()
```

| Status | When |
| --- | --- |
| 200 | `{ "data": { "success": true } }` |
| 400 / 401 / 403 / 404 | as PATCH |

### Gaps (DELETE)

- Hard delete, no soft-delete flag and no audit record — enrollments and their progress are gone
  with the course.
- The three writes are not in a transaction. A crash between them leaves lessons or enrollments
  pointing at a course that no longer exists, and nothing reconciles that.

## Consumers

None. No course detail screen, no instructor edit UI. Reachable only over HTTP.

## Example

```bash
curl localhost:3000/api/courses/introduction-to-algorithms

curl -b jar.txt -X PATCH localhost:3000/api/courses/66c0f1… \
  -H 'content-type: application/json' -d '{"published":true}'
```
