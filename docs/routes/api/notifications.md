# `/api/notifications/*`, `/api/notification-preferences`

| | |
| --- | --- |
| Files | [notifications/](../../../src/app/api/notifications/), [notification-preferences/](../../../src/app/api/notification-preferences/) |
| Service | [notifications/service.ts](../../../src/lib/notifications/service.ts) |
| Model | [Notification.ts](../../../src/models/Notification.ts) |
| Design | [TECHNICAL.md §6.13](../../TECHNICAL.md) |

One service for every notification in the platform (§35). Assignments and notes
do not each own a copy of "work out who wants this, write the rows, mark them
delivered" — they raise an event and the service decides everything else.

The schema is where that is enforced rather than merely intended: there is no
`assignmentId` field and no `noteId` field, only `entityType` + `entityId`. A
future announcement or attendance notification (§95) is a new enum value, not a
new table and not a new service.

---

## `GET /api/notifications`

Cursor pagination on `createdAt` (§91), not `skip`. A notification list grows at
the top, so an offset shifts under the reader every time something arrives and
page two silently repeats a row from page one.

```
GET /api/notifications?cursor=2026-09-28T10:14:00.000Z&limit=20&unread=true
```

```json
{
  "data": {
    "notifications": [
      {
        "id": "…",
        "type": "ASSIGNMENT_PUBLISHED",
        "category": "assignments",
        "title": "New assignment: Implement a Binary Search Tree",
        "message": "Data Structures · Prof. Rao · Due 10 Sep, 11:59 pm",
        "href": "/assignments/…",
        "metadata": { "subjectName": "Data Structures", "dueAt": "…" },
        "isRead": false,
        "createdAt": "…"
      }
    ],
    "nextCursor": "…"
  }
}
```

`href` is stored on the row rather than derived on read, so the list renders
without a per-row switch and a link that was correct when sent keeps working if
the route later changes shape. `metadata` holds the handful of scalars the card
renders, denormalised — a list of twenty is one query rather than twenty joins
across three collections.

Scoped to the session's user inside the query. There is no parameter that widens
it, because §71 has no "and also show me someone else's" mode to express.

---

## `GET /api/notifications/unread-count`

Its own endpoint, because the bell polls it and the list does not need fetching
to render a badge. Capped at 100 server-side — the badge shows "99+" past that,
and counting a hundred thousand rows to render two characters is work nobody
sees.

## `PATCH /api/notifications/:id/read`

Idempotent: a notification already read is a success, not a 404, so two taps on
one card do not produce an error on the second.

## `POST /api/notifications/read-all`

One update over the unread filter rather than a read followed by a loop, so
clearing a hundred is one round trip.

---

## `GET`, `PUT /api/notification-preferences`

The response carries the **vocabulary** alongside the values — which categories
exist, which may be switched off, which channels actually work:

```json
{
  "data": {
    "channels": { "assignments": { "in_app": true, "email": false, "push": false }, "…": {} },
    "mutedUntil": null,
    "categories": [
      { "key": "assignments", "label": "New assignments", "blurb": "…", "optional": true },
      { "key": "account", "label": "Account and approvals", "blurb": "…", "optional": false }
    ],
    "availableChannels": [{ "key": "in_app", "available": true }, { "key": "email", "available": false }]
  }
}
```

The vocabulary is `availableChannels`, **not** `channels`. Both were called `channels` at first, and
since one arrived through a spread of the stored preferences and the other was written out in the same
object literal, TypeScript accepted it and the second silently overwrote the first: the endpoint
returned the list of channels where the user's own settings should have been, so every client saw the
defaults regardless of what was stored. A duplicate key that a spread hides is not something review
catches, which is why the two now have different names rather than a comment asking people to be
careful.

So the settings screen renders from one request and cannot offer a toggle the
server would ignore. A switch a user sets that silently changes nothing is worse
than an absent one.

`/settings` ([settings-screen.tsx](../../../src/components/app/settings-screen.tsx)) is that screen.
It server-renders from `getPreferences()` directly, so it paints with the real
values instead of flashing defaults, and calls this endpoint only to write.

**`account` is not optional.** "Your teacher account was rejected" is not a
notification somebody opts out of — it is the only way they learn what happened,
and `shouldDeliver()` skips the preference lookup entirely for that category.

On write, unknown categories and channels are **dropped rather than rejected**:
a client sending a stale category after a rename should not have its whole save
refused, and an accepted-but-unknown key would sit in the document forever
pretending to mean something.

Preferences are merged over the defaults on read, so a category added after a
user saved their settings arrives switched on rather than missing.

---

## Delivery

Creation and delivery are separate (§37). Writing the row *is* the in-app
notification; other channels are registered providers and get the same payload.

**No provider is registered today.** `IMPLEMENTED_CHANNELS` lists only
`in_app`, so email and push appear in the preferences response as unavailable.
Adding a Brevo provider is a `registerNotificationProvider()` call and nothing
else in the module changes — the seam §75 asks for.

## Deduplication (§63)

The unique index on `(recipientId, type, entityType, entityId)` means a retried
fan-out writes nothing the second time. It is a **database** guarantee rather
than a check the fan-out has to remember, which matters because the fan-out is
the code most likely to be retried.

It is an `insertOne` with `ordered: false`, never an upsert: a duplicate must be
a no-op, not an update, or re-running a fan-out would resurrect a notification
the student has already read by resetting `isRead`. Mongo reports a partially
successful unordered bulk as an *error* carrying the successes, so the service
reads the rejection rather than treating the whole chunk as failed — on a retry
the duplicates are the expected case.

Two reminders for one assignment would collide on that key, which is why "due in
24 hours" and "due in 2 hours" are tracked on `AssignmentStudent.remindersSent`
and why the overdue notice is a different *type*. That is the honest shape: they
really are different messages.
