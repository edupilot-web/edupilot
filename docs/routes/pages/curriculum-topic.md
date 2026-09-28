# `/curriculum/[subjectId]/topics/[topicId]`

| | |
| --- | --- |
| Page | [page.tsx](../../../src/app/(app)/curriculum/[subjectId]/topics/[topicId]/page.tsx) — server component |
| Client | [topic-learning.tsx](../../../src/components/app/topic-learning.tsx), [tutor-panel.tsx](../../../src/components/app/tutor-panel.tsx) |
| Data | [learning/topics.ts](../../../src/lib/learning/topics.ts) — `getTopicView()` |
| Access | session required; the topic must belong to the student's own curriculum |
| Design | [TECHNICAL.md §6.12](../../TECHNICAL.md) |

The core learning screen. Everything on it is server-rendered from the database — the syllabus, the
prepared explanation, the practical section, the key points, the self-check, the student's progress
and the questions they asked before. **No model is called to render this page.** The AI is reached
only when the student presses "Go deeper" or asks something, and that happens client-side against
`/api/ai/*`.

## Authorisation

Comes from the **topic**, not the URL. `getTopicView()` resolves the student's college, programme,
branch and regulation from their profile and requires the topic's subject to match, so a foreign
`subjectId` in the path changes nothing about what may be read.

| Situation | Response |
| --- | --- |
| The student's own topic | 200 |
| No session | 307 → `/login?next=…` (the proxy) |
| A topic from another college | 404 |
| A well-formed id that does not exist | 404 |
| A malformed id | 404 |
| The right topic, the wrong `subjectId` in the path | 307 → the canonical URL |

The three 404s are identical on purpose: a different answer for a foreign id would let anyone
enumerate what another college teaches. All six rows were verified against the running server.

The redirect is the exception, and it is not a security hole: the topic *is* the student's, only the
path is stale — which is what a bookmark taken before a curriculum edit looks like. Sending them to
the canonical URL is the honest answer, and it keeps the breadcrumb from pointing at a subject the
topic does not belong to.

## Layout

Desktop is three columns — topic rail, content, tutor. Below `xl` the tutor drops under the content;
below `lg` the rail disappears. The single column is the base case and the desktop grid is the
variant, because most of these students are on an Android phone on a slow connection (§78).

## Sections

| Section | Source | Shown when |
| --- | --- | --- |
| Header, progress bar | `StudentTopicProgress` | always |
| Basic explanation, why it matters, analogy, terminology | `TopicContent`, `status: published` | content exists |
| Practical example, real-world uses, code | same | any of the three is present |
| Key points, common mistakes | same | non-empty |
| Check your understanding | same — **answers included** | non-empty |
| Provenance note | `TopicContent.origin` | content exists |
| From your syllabus | `CurriculumSubject.units[]` | the topic has a unit |
| Previous / next / mark complete | `Topic.sequence` | always |

With no published content the page says so and points at the tutor, rather than rendering an empty
shell. That is the normal state for most topics today — 63 of 9,010 have a published explanation.

The self-check answers ship with the questions. A check that called a model to mark itself is a
check most students would never finish waiting for.

**The syllabus is quoted in its own visually distinct block**, and the provenance line says whether a
person or a model wrote the explanation. Those are the two distinctions §54 and §36 exist to
protect: what the regulation prescribes, and what the platform is adding.

Markdown is rendered as React nodes — paragraphs, headings, lists, `**bold**` and `` `code` `` —
never through `dangerouslySetInnerHTML`. The content is model output, and rendering it as HTML would
make a provider's response a script-injection surface.

## Progress

The client posts **events**, never percentages. `TOPIC_OPENED` fires on mount and is worth nothing;
`BASIC_VIEWED` fires alongside it because the basic explanation is above the fold and already
rendered, so there is no honest way to claim it was not seen. The practical section reports when it
is opened, the self-check when an answer is revealed.

A heartbeat posts 90 seconds every 90 seconds while the tab is **visible** — a tab left open
overnight is not nine hours of study. The server clamps each increment regardless; the visibility
check is the honest client, not the enforcement.

Every response carries the server's recomputed progress, and the bar renders that. The client never
computes a percentage, so the bar and the database cannot disagree.

## The tutor panel

Quick actions first, text box second (§39). A student who has just read an explanation does not know
what to type; they know they want it simpler, or with code, or with an example. The buttons send a
**key**, not a sentence, which is also what makes the eight commonest questions in the platform
normalise onto the same cache entries.

The depth selector starts at Basic and moves to whatever the last answer came back at. "Explain in
more depth" targets one rung up, never a jump.

"Previously asked" states what each button costs: View is free, Ask again uses one of today's
questions. Answers stream in as raw text and are replaced by the structured render when the server
confirms what it stored.

The model name is returned by the API and **not shown**. Which model answered is not something a
student can act on, and showing it invites trust in one over another on no basis.

## Not built

Bookmarking from this page (the API exists, the button does not). Practice mode. Language switching —
`TopicContent` is keyed on language but only English is written. The "focus on" subtopic selector is
present and empty everywhere, because nothing writes subtopics yet.
