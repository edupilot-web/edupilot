# `/api/learning/*` and `/api/curriculum/*` — progress, events, bookmarks, topic reads

| | |
| --- | --- |
| Files | [learning/progress](../../../src/app/api/learning/progress/route.ts), [learning/events](../../../src/app/api/learning/events/route.ts), [learning/bookmarks](../../../src/app/api/learning/bookmarks/route.ts), [curriculum/topics/[topicId]](../../../src/app/api/curriculum/topics/[topicId]/route.ts), [curriculum/subjects/[subjectId]/topics](../../../src/app/api/curriculum/subjects/[subjectId]/topics/route.ts), [curriculum/search](../../../src/app/api/curriculum/search/route.ts) |
| Methods | all require a session |
| Libraries | [learning/progress.ts](../../../src/lib/learning/progress.ts), [learning/topics.ts](../../../src/lib/learning/topics.ts) |
| Models | [Learning.ts](../../../src/models/Learning.ts), [Topic.ts](../../../src/models/Topic.ts) |
| Design | [TECHNICAL.md §6.12](../../TECHNICAL.md) |

Two rules run through all of these:

- **The client says what happened, never how much it is worth.** No endpoint here accepts a
  percentage. A client that could post one could post 100, and "topics completed" would be a figure
  nobody could defend.
- **Every write re-authorises the topic** against the student's own curriculum. One extra query per
  call, and not negotiable: without it a row can be filed against a topic the student cannot see,
  and another college's engagement numbers can be fabricated from a console.

---

## `POST /api/learning/events` — record a learning event

```json
{ "topicId": "6a970b…", "type": "PRACTICAL_VIEWED", "timeSpentSeconds": 90, "meta": {} }
```

`type` must be one of `LEARNING_EVENT_TYPES`. A closed list, because the browser is what writes
here — an open one would let a client define the platform's own metric vocabulary, and "most studied
topics" would be aggregating whatever names happened to be posted.

Recording the event and applying whatever progress it implies happen in one call, so the two can
never disagree about what an event means. The mapping lives in `EVENT_PROGRESS_SIGNAL` and is read
in exactly one place.

`TOPIC_OPENED` is accepted and **moves nothing**. That is §24's rule made concrete: a page visit is
data, not learning.

`meta` is capped at eight scalar keys with strings truncated to 200 characters. It is stored for
analytics and never read back into a decision, so size is the only risk.

Returns the recomputed progress:

```json
{ "data": { "progress": { "topicId": "…", "status": "in_progress", "progressPercentage": 65, "basicViewed": true, … } } }
```

| Status | When |
| --- | --- |
| 200 | recorded |
| 400 | no `topicId`, or an unknown `type` |
| 401 | no session |
| 404 | the topic does not exist or is not this student's |

---

## `GET /api/learning/progress?subjectId=` — progress across a subject

Returns a map keyed by topic id, for rendering a subject's topic list in one request rather than one
per row.

## `PUT /api/learning/progress` — set signals directly

```json
{ "topicId": "…", "signals": ["basicViewed"], "timeSpentSeconds": 60, "completed": true }
```

`signals` are the five in `PROGRESS_WEIGHTS`; unknown values are dropped. `completed: true` is the
student pressing "Mark as complete" — recorded separately from the automatic threshold, because
those are different facts.

`timeSpentSeconds` is clamped server-side to 600 per call. An unclamped counter fed by a browser is
not a measurement.

Completion is **sticky**: once a topic is complete it stays complete, even if a later change to the
weights would put it below the threshold. A subject card that showed 12 of 20 last week and 11 today
because the platform re-weighted its own scoring is a bug from the student's side.

---

## `GET`, `POST`, `DELETE /api/learning/bookmarks`

`{ "type": "topic" | "subject" | "answer", "referenceId": "…", "label": "…", "href": "…" }`.

The label and href are captured at save time rather than resolved on read: a list that joined three
collections per row would be three queries per row, and a topic later renamed or archived would
render as a blank line in a list the student built themselves.

POST upserts, so a double tap creates one row rather than a duplicate-key error the client has to
interpret. DELETE is idempotent — removing a bookmark that is already gone is a success, not a 404
to special-case on an unstable connection.

---

## `GET /api/curriculum/topics/:topicId`

One topic, its published content, this student's progress and their previous questions — in one
response, with **no model call anywhere in it**. The page renders from the same function
server-side; this exists for client-side refreshes and any future native client.

Content is returned only when `status: "published"`. A draft reaching a student is generated text
nobody has read, presented as their college's study material.

| Status | When |
| --- | --- |
| 200 | the topic |
| 401 | no session |
| 404 | nonexistent, foreign, or malformed id — all three identical |

## `GET /api/curriculum/subjects/:subjectId/topics`

The topic list for one subject with progress against each. Two queries plus one aggregation, not one
per topic: a subject holds twenty to forty topics.

## `GET /api/curriculum/search?q=`

Searches subjects, topics and subtopics **inside the student's own curriculum**. The scope is not a
filter a caller can widen — the subject list searched is resolved from the profile, so a query
cannot reach a regulation they are not on.

A prefix regex rather than the text index: a student typing "bin" expects "Binary Search", while a
text index matches whole terms only. Two characters minimum.
