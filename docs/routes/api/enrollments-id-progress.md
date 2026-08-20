# `PATCH /api/enrollments/:id/progress`

| | |
| --- | --- |
| File | [../../../src/app/api/enrollments/[id]/progress/route.ts](../../../src/app/api/enrollments/[id]/progress/route.ts) |
| Access | **the enrolled student only** — not the instructor, not an admin |
| Model | [Enrollment.ts](../../../src/models/Enrollment.ts) |

Marks one lesson complete or incomplete and recomputes the whole progress figure.

## Request

Path: `:id` is the **enrollment** id, not a course or lesson id. `assertObjectId(id, "enrollment id")`.

Body — `progressSchema`:

| Field | Type | Rules |
| --- | --- | --- |
| `lessonId` | string | required; also `assertObjectId`-checked |
| `completed` | boolean | **defaults to `true`** when omitted |

## Behaviour

1. `requireAuth()`.
2. Load the enrollment; `enrollment.student.toString() === session.sub` or
   `403 "You can only update your own progress"`. This is the one ownership check in the codebase
   with **no admin escape hatch** — nobody can edit somebody else's progress.
3. Load the lesson and confirm it belongs to this enrollment's course, else
   `400 "That lesson does not belong to this course"`.
4. Build a `Set` of the current `completedLessons`, add or delete `lessonId`.
5. `totalLessons = Lesson.countDocuments({ course })` — the **live count**, not the cached
   `Course.lessonCount`, so a drifted counter cannot corrupt the percentage.
6. `progress = totalLessons === 0 ? 0 : round(done.size / totalLessons * 100)`.
7. `completedAt = progress === 100 ? new Date() : null` — set exactly when it hits 100, cleared
   otherwise.
8. Save and return the whole enrollment.

Because the set is rebuilt every time, the call is **idempotent**: marking the same lesson
complete twice changes nothing, and progress can only ever equal what the array implies.

## Responses

| Status | When |
| --- | --- |
| 200 | `{ "data": { "enrollment": … } }` |
| 400 | bad enrollment/lesson id, or the lesson belongs to another course |
| 401 | no session |
| 403 | the enrollment belongs to someone else |
| 404 | no such enrollment, or no such lesson |
| 422 | body failed the schema |

```json
{
  "data": {
    "enrollment": {
      "_id": "66c0f4…",
      "student": "66c0f0…",
      "course": "66c0f1…",
      "completedLessons": ["66c0f2…", "66c0f3…"],
      "progress": 67,
      "completedAt": null
    }
  }
}
```

## Example

```bash
curl -b jar.txt -X PATCH localhost:3000/api/enrollments/66c0f4…/progress \
  -H 'content-type: application/json' \
  -d '{"lessonId":"66c0f3…","completed":true}'
```

## Consumers

None. There is no lesson player, so nothing in the UI can complete a lesson. The dashboard's
Daily Tasks card looks like the place this would surface, but that card is static content and
deliberately read-only — see [../pages/dashboard.md](../pages/dashboard.md).

## Gaps

- **Recomputation only happens here.** Deleting a lesson leaves `progress` stale until the next
  call to this endpoint — see
  [lessons-id.md](lessons-id.md#gap--progress-goes-stale-on-delete).
- `completedAt` is overwritten on every write that leaves progress at 100, so re-ticking an
  already-finished course moves the completion date forward.
- The read-modify-write on `completedLessons` is not atomic. Two concurrent calls for different
  lessons can lose one of them — last save wins. `$addToSet`/`$pull` plus a recompute would fix it.
- Nothing records *when* a given lesson was completed, only the set, so there is no history and
  no per-lesson timestamp to build a streak or a report from.
- No `progress` endpoint for an instructor: there is no way to see a class's completion.
