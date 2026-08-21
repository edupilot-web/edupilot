# `/onboarding/*` — build the student profile

| | |
| --- | --- |
| Files | [../../../src/app/(onboarding)/](../../../src/app/(onboarding)/) |
| Access | session **and** a verified address; the layout enforces both |
| Query | `?next=` threaded through every step, consumed at the end |
| Writes | `studentProfiles` (upsert), `colleges` (insert, when a name is new) |

Four routes:

| Route | Purpose |
| --- | --- |
| `/onboarding` | redirect to the first step |
| `/onboarding/education` | **Step 1 of 2** — college, degree, specialization |
| `/onboarding/academic` | **Step 2 of 2** — status, current year, graduation year |
| `/onboarding/complete` | "You're all set 🎉" plus a summary of what was saved |

## Why the gates are split

The layout ([`(onboarding)/layout.tsx`](../../../src/app/(onboarding)/layout.tsx)) checks only two
things: there is a user, and the address is verified.

Whether the *profile* is finished is checked by each page, not the layout, because it means
opposite things depending on where you are:

| Page | `profileCompleted` true means |
| --- | --- |
| `/onboarding/education`, `/onboarding/academic` | you are done — go to `/dashboard` |
| `/onboarding/complete` | you are done — that is why you are here |

Had the layout decided, the completion screen would redirect itself away the moment it succeeded.

`/onboarding/academic` additionally redirects back to step 1 when no profile row exists: step 2
merges into what step 1 creates, so arriving first from a bookmark has nothing to write to.

## Step 1 — education

| Field | Input | Validation (`educationStepSchema`) |
| --- | --- | --- |
| College / University | [`CollegeField`](../../../src/components/onboarding/college-field.tsx) — debounced search over `/api/colleges/search` | `collegeName` 2–160 chars; `collegeId` optional, 24 hex chars |
| Degree / Program | `SelectField` over `DEGREES` | must be one of the twenty |
| Specialization / Branch | `Combobox` with a local suggestion list | 2–120 chars, **free text** |

**Free text is always accepted, for both text fields.** A student whose college is not in the
directory would otherwise have to name a different one, and the row would look correct while being
wrong. An unmatched name is saved as typed *and* added to `colleges` as `source: "user"`, so the
next student searching for it finds it.

`resolveCollege()` re-reads any submitted `collegeId` and honours it only when the stored row still
carries the submitted name, so a tampered form cannot attach an arbitrary label to a real
institution. A duplicate insert lost to a race is resolved by reading the winner's row.

## Step 2 — academic

| Field | Shown when | Validation (`academicStepSchema`) |
| --- | --- | --- |
| Current status | always | `studying` or `graduated` |
| Current year | studying | integer 1–5 |
| Expected graduation / Year of graduation | always | this year … +8 while studying; 1950 … this year once graduated |

The form **branches on status** rather than adding "Graduated" to the year dropdown. A graduate has
no current year, and their graduation year is a fact rather than an estimate — so the selector can
offer sensible options in each case instead of every year from 1950 to 2034.

The two fields are validated together in a `superRefine`, because "an expected graduation cannot be
in the past" and "choose the year you actually graduated" are cross-field rules a flat schema cannot
express. Switching to Graduated also clears `currentYear` **server-side**, so a stale value cannot
survive a hand-edited submission.

## Completion

`profileCompleted` is recomputed from the merged document on every write by
[`isProfileComplete()`](../../../src/models/StudentProfile.ts) — never asserted by the caller, so it
cannot drift from the fields it summarises. Step 1 alone leaves it false.

## What is deliberately not here

Profile photo, bio, skills, interests, LinkedIn, GitHub and résumé — and phone and city, which the
earlier version of this flow did ask for. Two steps is the whole flow; the rest belongs on the
profile screen, which is still a placeholder.

## Security

Every write starts with `requireOnboardingUser()` in
[onboarding-actions.ts](../../../src/lib/onboarding-actions.ts), which re-reads the session and
re-checks verification. A Server Action is a public endpoint reachable with nothing but a session
cookie — the layout that rendered the form is not in the request path when the action runs.

## Gaps

- No way to revisit the steps once finished; editing a saved profile needs the profile screen.
- The college directory is a curated 132-row starting point, not a register. Everything else arrives
  through students typing it, and nothing reviews those additions.
- Free-text specialization means "CSE", "Computer Science" and "Computer Science and Engineering"
  will coexist. Normalising them is a reporting problem for later, not a reason to close the field.
