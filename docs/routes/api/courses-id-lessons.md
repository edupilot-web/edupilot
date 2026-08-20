# `/api/courses/:id/lessons`

| | |
| --- | --- |
| File | [../../../src/app/api/courses/[id]/lessons/route.ts](../../../src/app/api/courses/[id]/lessons/route.ts) |
| Methods | `GET` (public), `POST` (owner or admin) |
| Models | [Lesson.ts](../../../src/models/Lesson.ts), [Course.ts](../../../src/models/Course.ts) |

---

## `GET /api/courses/:id/lessons` — full lesson list

Public. `assertObjectId(id, "course id")` — **ObjectId only here**, unlike
[courses-id.md](courses-id.md#get-apicoursesidorslug--detail) which also accepts a slug. Passing
a slug returns `400 "Invalid course id"`.

`Lesson.find({ course: id }).sort({ order: 1, createdAt: 1 }).lean()` — no `select`, no auth, no
existence check on the course (an unknown id returns an empty array, not a 404).

| Status | When |
| --- | --- |
| 200 | `{ "data": { "lessons": [ … ] } }` |
| 400 | `id` is not a valid ObjectId |
| 500 | unexpected |

### Gap — this bypasses the lesson paywall

Because there is no `.select()`, the response includes **every field of every lesson, `content`
and `videoUrl` included, for anybody who asks.** That defeats the gate on
[`GET /api/lessons/:id`](lessons-id.md), which is careful to require enrolment for anything that
is not `isFreePreview`, and it works on unpublished courses too. Two independent fixes are
needed:

1. project the index fields only (`title order durationMinutes isFreePreview`), the way the
   course-detail handler already does; and
2. apply the same free-preview / enrolled / owner branch as `GET /api/lessons/:id` if full
   bodies are ever to be served from here.

---

## `POST /api/courses/:id/lessons` — add a lesson

`requireAuth()`, `assertObjectId(id, "course id")`, then ownership resolved **through the parent
course** — a lesson has no owner of its own:
`course.instructor.toString() === session.sub || session.role === "admin"`, else
`403 "Only the course owner can add lessons"`.

### Body — `lessonCreateSchema`

| Field | Type | Rules |
| --- | --- | --- |
| `title` | string | required, 3–200 chars |
| `content` | string | optional — the lesson body |
| `videoUrl` | string \| null | optional, must be a URL |
| `durationMinutes` | number | optional, ≥ 0 |
| `order` | integer | optional, ≥ 0; **defaults to `Lesson.countDocuments({ course })`**, i.e. append at the end |
| `isFreePreview` | boolean | optional, default `false` |

`course` is taken from the URL, never the body.

### Writes

```
Lesson.create({ ...body, order, course: id })
Course.updateOne({ _id: id }, { $inc: { lessonCount: 1 } })
```

| Status | When |
| --- | --- |
| 201 | created — `{ "data": { "lesson": … } }` |
| 400 / 401 / 403 / 404 | bad id / no session / not the owner / no such course |
| 422 | schema failure |

### Example

```bash
curl -b jar.txt -X POST localhost:3000/api/courses/66c0f1…/lessons \
  -H 'content-type: application/json' \
  -d '{"title":"Quicksort","content":"Partitioning.","durationMinutes":20}'
```

### Gaps (POST)

- `lessonCount` is maintained by `$inc` **outside a transaction**. A crash between the insert and
  the counter update leaves it drifted, and no reconciliation job exists.
- `order` is not unique and there is no reorder endpoint. An explicit `order` can duplicate an
  existing one; ties fall back to `createdAt`. Inserting in the middle means renumbering by hand,
  one PATCH per lesson.
- The default `order` is another check-then-act: two concurrent appends can both read the same
  count and land on the same `order`.

## Consumers

None. No lesson list UI and no instructor authoring screen.
