# `/api/ai/*` — the student AI tutor

| | |
| --- | --- |
| Files | [question/route.ts](../../../src/app/api/ai/question/route.ts), [question/[id]/route.ts](../../../src/app/api/ai/question/[id]/route.ts), [question/[id]/retry/route.ts](../../../src/app/api/ai/question/[id]/retry/route.ts), [topic/deep-dive/route.ts](../../../src/app/api/ai/topic/deep-dive/route.ts), [conversations/route.ts](../../../src/app/api/ai/conversations/route.ts), [conversations/[id]/route.ts](../../../src/app/api/ai/conversations/[id]/route.ts), [history/topic/[topicId]/route.ts](../../../src/app/api/ai/history/topic/[topicId]/route.ts) |
| Methods | all require a session |
| Service | [tutor/service.ts](../../../src/lib/tutor/service.ts) — the pipeline every write goes through |
| Models | [Tutor.ts](../../../src/models/Tutor.ts) |
| Design | [TECHNICAL.md §6.12](../../TECHNICAL.md) |

Only three of these seven routes can reach a model: `POST /question`, `POST /topic/deep-dive` and
`POST /question/:id/retry`. Everything else reads what is already stored, which is the point —
re-reading an answer must never cost a request.

---

## `POST /api/ai/question` — ask about a topic

Body:

```json
{
  "topicId": "6a970b…",
  "subtopicId": null,
  "conversationId": null,
  "question": "What happens if a linked list has a million nodes?",
  "followUpAction": null,
  "depthLevel": "basic",
  "language": "english",
  "stream": false
}
```

**Ids and text only.** There is no field for a provider, a model, a temperature or a token budget —
those are the server's, and a request that could set them could route around the budget, the prompt
and the quota in one call. Any subject or topic *name* in the body is ignored: the context builder
re-resolves the whole academic chain from the database.

`followUpAction` is one of the eight keys in `FOLLOW_UPS`. When it is set, the server owns the
wording and `question` is ignored — which is also what makes the eight most common questions in the
platform normalise to the same cache entries.

### What happens

`authorise the topic → build context → normalise → cache → quota → budget → tier → route →
validate → store → account`. The cache is checked **before** the quota, so a student at their limit
still receives every answer the platform already holds.

### Response

```json
{
  "data": {
    "interaction": {
      "id": "6a9714…",
      "conversationId": "6a9714…",
      "sequence": 1,
      "question": "What is interference in wave optics?",
      "answer": {
        "title": "…", "summary": "…", "explanation": "…",
        "practicalExample": null, "code": null, "codeLanguage": null,
        "keyPoints": [], "commonMistakes": [], "relatedConcepts": [], "nextTopics": [],
        "difficulty": "moderate", "depthLevel": "basic", "offTopicNote": null
      },
      "depthLevel": "basic",
      "language": "english",
      "cacheHit": false,
      "provider": "mock",
      "model": "mock-tutor-1",
      "latencyMs": 313,
      "totalTokens": 1340,
      "createdAt": "2026-09-01T18:10:06.328Z"
    }
  }
}
```

`provider` and `model` are returned but the student UI ignores them (§39): which model answered is
not something a student can act on, and showing it invites trust in one over another on no basis.

### `stream: true`

Newline-delimited JSON, `Content-Type: application/x-ndjson`, one event per line:

```
{"type":"delta","text":"{\"title\":\"Interfe"}
{"type":"delta","text":"rence\",\"summary\":\"…"}
{"type":"done","interaction":{ … }}
```

The deltas are **raw model text** — JSON mid-flight, and it looks it. The client shows it
accumulating as proof that something is happening and swaps to the structured render on `done`,
which carries the answer the server actually validated and stored.

An error after the first byte arrives as `{"type":"error","message":"…"}` rather than a status code;
the response has already begun. An error *before* the first byte falls back to the non-streaming
path and runs the whole provider chain.

## The provider chain

Built per request by [router.ts](../../../src/lib/tutor/router.ts) from the environment, never from
anything in the request body (§18) — nothing a client sends names a provider.

The shipped default:

| Tier | Chain |
| --- | --- |
| default | Vertex `gemini-2.5-flash` → Gemini `gemini-2.5-flash` → mock |
| advanced | Vertex `gemini-2.5-pro` → Vertex `gemini-2.5-flash` → Gemini `gemini-2.5-flash` → mock |

The advanced tier falls through the **default tier** before reaching a third party: a cheaper model
answering beats no answer, and beats escalating to a provider that may not be configured either.

An unconfigured provider is dropped while the chain is *built*, not when it is called, so the chain's
length reflects what can actually be tried rather than making every answer wait on a provider that was
never going to respond. The mock is always last and never dropped — without it, a deployment whose only
credential expired serves errors to every student until somebody notices; with it they get clearly
labelled placeholder text and the failure shows up in the usage dashboard as a chain that fell all the
way through.

A non-retryable failure (a refused credential, a model that does not exist) moves straight to the next
provider. A retryable one gets one short backoff **within the same provider** first: most rate limits
clear in under a second, and the alternative is falling onto a costlier model over a hiccup.

Why Gemini rather than OpenAI as the fallback: it is the same model over the same wire format, so a
fallback answer obeys the same response schema and reads the same to a student — and it fails
independently of Vertex in the way that matters, since an expired service account or a missing IAM role
does not touch an API key. See [TECHNICAL.md §6.9](../../TECHNICAL.md).

The answer is stored whether or not the client is still listening — a closed tab costs the same as a
completed one rather than losing an answer already paid for.

| Status | When |
| --- | --- |
| 200 | answered (JSON, or a stream that has begun) |
| 400 | no `topicId`, an empty question, or one over 2,000 characters |
| 401 | no session |
| 404 | the topic does not exist, is not this student's, or a supplied `conversationId` is not theirs |
| 409 | the student has no academic profile, or their college has no curriculum configured |
| 429 | the daily quota is spent — carries `retryAfterSeconds` |
| 503 | every provider in the chain failed, or the monthly budget is exhausted |

A 404 is returned for a topic belonging to another college *and* for one that does not exist. The
answers are identical on purpose: a different response for each would let anyone enumerate what
another college teaches.

---

## `POST /api/ai/topic/deep-dive` — go one level deeper

Body: `{ "topicId", "subtopicId?", "conversationId?", "currentLevel?", "depthLevel?", "stream?" }`.

Not `/question` with a canned string. There is no student question here — the intent is entirely
"the same topic, one rung up" — and phrasing it as a question would put words in the student's mouth
in their own stored history.

`currentLevel` is what they have read; the server targets the next rung. Pressing the button
repeatedly walks Basic → Practical → Intermediate → Advanced → Expert rather than jumping, which is
§10's requirement. An explicit `depthLevel` overrides that.

Same statuses as `/question`.

---

## `GET /api/ai/question/:id` — read a stored answer

**Never calls a model.** The answer was validated and stored when it was produced, so this is a
`findOne` filtered on the session's user.

| Status | When |
| --- | --- |
| 200 | the interaction |
| 401 | no session |
| 404 | no such id, or it belongs to another student |

## `PATCH /api/ai/question/:id` — mark it helpful

Body `{ "helpful": true }`. Feedback only; it changes nothing about the answer.

---

## `POST /api/ai/question/:id/retry` — ask again / regenerate

The one path that deliberately spends a request. The question and the topic come from the **stored
row**, not the body — a retry that accepted new text would be `/question` under another name, and
would let a caller attach an arbitrary question to an existing thread while calling it a
regeneration. The only thing the body may change is `depthLevel`.

The new answer is stored as a **separate row** with `regeneratedFromId` pointing at the original.
Both are kept: a regeneration that came out worse must not have destroyed the one that was fine.

The cache is bypassed. A student pressing "Ask again" has read the answer and wants a different one;
serving the identical cached text would make the button look broken.

```json
{ "data": { "interaction": { … }, "regeneratedFrom": "6a9714…" } }
```

---

## `GET /api/ai/conversations` — my threads

`?topicId=` narrows to one topic, `?limit=` caps at 100. Scoped to the session's user inside the
query; there is no parameter that widens it.

## `GET /api/ai/conversations/:id` — one thread and its messages

Up to 50 interactions, ordered by `sequence`. No model call.

## `DELETE /api/ai/conversations/:id` — archive

Sets `archivedAt`. Not a delete: the interactions are what the usage and cost records refer to, and
a student tidying their own list is not asking for the platform's accounting to be rewritten.

---

## `GET /api/ai/history/topic/:topicId` — previously asked

Everything this student asked about one topic, across threads, newest first — because a student
returning to a topic remembers the question, not which conversation it was in.

Filtered on `userId`, so an unauthorised topic id returns an empty list rather than a 404. Checking
the topic as well would cost a query to make an empty answer differently empty.

---

## Not built

No endpoint accepts a free-floating question with no topic. That is deliberate: every answer in this
product is grounded on a specific topic of the student's own syllabus, and an ungrounded endpoint
would be the one path around that.
