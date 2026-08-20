# `/api/enrollments`

| | |
| --- | --- |
| File | [../../../src/app/api/enrollments/route.ts](../../../src/app/api/enrollments/route.ts) |
| Methods | `GET`, `POST` — both require a session |
| Model | [Enrollment.ts](../../../src/models/Enrollment.ts) |

---

## `GET /api/enrollments` — my enrolled courses

`requireAuth()`. The query is **scoped to the caller** — `Enrollment.find({ student: session.sub })`
— so there is no way to read someone else's rows and no id parameter to tamper with. Sorted by
`updatedAt: -1`, most recently touched first.

Each row populates its course with `title slug coverImageUrl level lessonCount`, and nests the
course's instructor as `name avatarUrl`.

```json
{
  "data": {
    "enrollments": [
      {
        "_id": "66c0f4…",
        "student": "66c0f0…",
        "course": {
          "_id": "66c0f1…",
          "title": "Introduction to Algorithms",
          "slug": "introduction-to-algorithms",
          "coverImageUrl": null,
          "level": "beginner",
          "lessonCount": 3,
          "instructor": { "_id": "66c0ef…", "name": "Ada Lovelace", "avatarUrl": null }
        },
        "completedLessons": ["66c0f2…"],
        "progress": 33,
        "completedAt": null
      }
    ]
  }
}
```

| Status | When |
| --- | --- |
| 200 | list (empty array when there are none) |
| 401 | no session |

There is no pagination — a student's enrollment list is assumed small.

An instructor calling this gets *their own* enrollments as a learner, not their students'. There
is no endpoint anywhere that lists who is enrolled in a course.

---

## `POST /api/enrollments` — enroll

`requireAuth()`. Body is `enrollSchema`: `{ "courseId": "<ObjectId>" }`, then
`assertObjectId(courseId, "course id")`.

```
Course.findById(courseId).select("published")
  missing            → 404 "Course not found"
  published: false   → 400 "This course is not open for enrollment"
Enrollment.findOne({ student: session.sub, course: courseId })
  exists             → 200 with the existing row      ← idempotent
Enrollment.create({ student, course })                → 201
```

| Status | When |
| --- | --- |
| 201 | new enrollment |
| 200 | already enrolled — the same row, not an error |
| 400 | malformed `courseId`, or the course is unpublished |
| 401 | no session |
| 404 | no such course |
| 409 | duplicate key from the unique index (concurrent double-enroll) |
| 422 | body failed the schema |

**Enrolling twice is not an error.** The distinct status codes are the only way to tell which
happened, so a client that cares must check for 201 rather than the body.

The `{ student, course }` compound index is unique, which is what actually guarantees one
enrollment per pair; the `findOne` above it is a convenience that turns the common case into a
200 instead of a 409.

New rows start at `progress: 0`, `completedLessons: []`, `completedAt: null`.

## Consumers

None. No catalogue and no course detail screen, so nothing in the UI can enroll anyone. This is
the endpoint the dashboard's Curriculum card would read first — it already returns per-course
`progress` — see [../pages/dashboard.md](../pages/dashboard.md).

## Example

```bash
curl -b jar.txt -X POST localhost:3000/api/enrollments \
  -H 'content-type: application/json' -d '{"courseId":"66c0f1…"}'

curl -b jar.txt localhost:3000/api/enrollments
```

## Gaps

- **`price` is ignored.** Enrollment is free whatever the course costs; there is no payment step,
  no order record and no receipt.
- No unenroll. `DELETE /api/enrollments/:id` does not exist, so a mistaken enrollment is
  permanent unless the course is deleted (which cascades) or a row is removed by hand.
- No capacity, prerequisites, cohort dates or eligibility rules of any kind.
- Nothing tells the instructor that somebody enrolled.
