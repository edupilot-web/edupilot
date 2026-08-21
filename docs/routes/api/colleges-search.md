# `GET /api/colleges/search`

| | |
| --- | --- |
| File | [../../../src/app/api/colleges/search/route.ts](../../../src/app/api/colleges/search/route.ts) |
| Access | authenticated — `requireAuth()` |
| Query | `?q=` the partial college name |

Autocomplete for the college field in onboarding step 1.

## Behaviour

1. `requireAuth()`.
2. `searchColleges(q)` → [../../../src/lib/colleges.ts](../../../src/lib/colleges.ts):
   - normalise the query the same way `colleges.normalizedName` is stored — lower-case, punctuation
     collapsed to spaces. This is what lets `st xaviers` find `St. Xavier's College`.
   - shorter than 2 characters → `[]` without touching the database.
   - two indexed regex queries, prefix first then anywhere, merged with the prefix hits kept in
     front and capped at 8.
3. `ok({ colleges })`.

Ranking matters here: typing `andhra` should offer **Andhra University** before a college that
merely sits in Andhra Pradesh. A single "contains" query cannot express that, and a `$text` index
would match whole words and so return nothing for a half-typed one.

The query is escaped before it becomes a `RegExp` — it is user input on its way into a regex engine.

## Why it is behind auth

Not because the directory is secret. It is called on every keystroke and runs a regex query per
request; open, it is a free way to keep the database busy.

## Responses

| Status | When | Body |
| --- | --- | --- |
| 200 | always, including no matches | `{ "data": { "colleges": [...] } }` |
| 401 | no session | `"Authentication required"` |
| 500 | unexpected | `"Internal server error"` |

```json
{
  "data": {
    "colleges": [
      { "id": "6a87…bf1c", "name": "Andhra Loyola College", "location": "Vijayawada, Andhra Pradesh" },
      { "id": "6a87…bf1b", "name": "Andhra University", "location": "Visakhapatnam, Andhra Pradesh" }
    ]
  }
}
```

## Consumers

[`CollegeField`](../../../src/components/onboarding/college-field.tsx), debounced at 220 ms with the
in-flight request aborted on each new keystroke. A failed lookup is logged and swallowed — the
student can still type the name, which is the point of the field accepting free text.

An empty result is **not** an error state in the UI: it shows "Can't find your college? Keep typing
the full name — we'll add it for you."

## Gaps

- No pagination; the 8-row cap is the whole contract.
- Ranking is prefix-then-contains with no popularity or fuzzy matching, so a typo finds nothing.
- The directory mixes 132 curated rows with whatever students have typed (`source: "user"`), and
  nothing reviews the latter.
