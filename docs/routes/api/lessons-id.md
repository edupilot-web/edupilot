# `/api/lessons/:id`

| | |
| --- | --- |
| File | [../../../src/app/api/lessons/[id]/route.ts](../../../src/app/api/lessons/[id]/route.ts) |
| Methods | `GET` (conditional), `PATCH` / `DELETE` (course owner or admin) |
| Model | [Lesson.ts](../../../src/models/Lesson.ts) |

The one endpoint whose read access is decided by an explicit branch rather than a helper.

---

## `GET /api/lessons/:id` — lesson body

`assertObjectId(id, "lesson id")`, then:

```
lesson.isFreePreview            → 200, no session needed
otherwise:
  no session                    → 401 "Authentication required"
  owner of the parent course    → 200
  enrolled in the parent course → 200
  role === "admin"              → 200
  anything else                 → 403 "Enroll in this course to view the lesson"
```

Enrolment is checked with `Enrollment.exists({ student: session.sub, course: lesson.course })` —
existence only, so progress is irrelevant to access. Ownership is resolved through the parent
course, which is loaded with `.select("instructor")`.

Note this handler calls `getSession()` directly rather than `requireAuth()`, because a free
preview must work with no session at all.

| Status | When |
| --- | --- |
| 200 | free preview, or owner / enrolled / admin |
| 400 | `id` is not a valid ObjectId |
| 401 | gated lesson, no session |
| 403 | gated lesson, signed in but not entitled |
| 404 | no such lesson |

The whole lesson document is returned, `content` and `videoUrl` included.

> **This gate is currently bypassable.**
> [`GET /api/courses/:id/lessons`](courses-id-lessons.md#gap--this-bypasses-the-lesson-paywall)
> returns every lesson in a course, with full `content`, to anyone. Fix that before treating this
> branch as a paywall.

---

## `PATCH /api/lessons/:id` — update

`requireAuth()`, `assertObjectId`, then ownership via the parent course:
`course?.instructor.toString() === session.sub || session.role === "admin"`, else
`403 "Only the course owner can edit lessons"`.

Body is `lessonUpdateSchema` = `lessonCreateSchema.partial()`. Applied with `lesson.set(...)` then
`save()`. `course` is not a schema field, so a lesson cannot be moved between courses.

| Status | When |
| --- | --- |
| 200 | `{ "data": { "lesson": … } }` |
| 400 / 401 / 403 / 404 | bad id / no session / not the owner / no such lesson |
| 422 | schema or model validation failure |

Because the ownership check reads `course?.instructor`, an orphaned lesson whose course row is
gone answers 403 rather than 404 — the optional chain yields `undefined`, which never equals
`session.sub`. An admin can still edit it.

---

## `DELETE /api/lessons/:id` — delete

Same auth as PATCH. Then:

```
lesson.deleteOne()
Course.updateOne({ _id: lesson.course }, { $inc: { lessonCount: -1 } })   ─┐ in parallel
Enrollment.updateMany({ course }, { $pull: { completedLessons: lesson._id } }) ─┘
```

| Status | When |
| --- | --- |
| 200 | `{ "data": { "success": true } }` |
| 400 / 401 / 403 / 404 | as PATCH |

### Gap — progress goes stale on delete

The `$pull` removes the lesson from every enrollment's `completedLessons`, but **`progress` is not
recomputed** and `completedAt` is not revisited. So after deleting a lesson a student can be left
sitting at a percentage that no longer matches `completed ÷ total`, or below 100 while
`completedAt` is still set. It self-corrects on the next
[progress write](enrollments-id-progress.md), which recomputes from scratch.

Deleting the *last* incomplete lesson is the case that matters: everyone who had finished the rest
should jump to 100, and nobody does until they touch a lesson again.

## Consumers

None. There is no lesson player, so the free-preview / enrolled distinction has no UI behind it
yet.

## Example

```bash
# free preview — works signed out
curl localhost:3000/api/lessons/66c0f2…

# gated lesson — needs the cookie
curl -b jar.txt localhost:3000/api/lessons/66c0f3…
```
