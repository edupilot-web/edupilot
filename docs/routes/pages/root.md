# `/` — landing page

| | |
| --- | --- |
| File | [../../../src/app/page.tsx](../../../src/app/page.tsx) |
| Access | public |
| Rendering | Server Component; dynamic, because it reads the session cookie |
| Title | `EduPilot — your syllabus, explained` |

The marketing page. A sticky header, a hero and a row of feature cards — **for one audience at a
time**.

## The rule this page is written to

**Every claim maps to something built, and every link goes somewhere that resolves.**

That is not a style note; it is a correction. The first version of this page advertised **Explore,
Resources, Scholarships, Mentorship, Community and Events** — six sections of a different product, all
six of them 404s — and its hero offered to help visitors "discover opportunities, connect with peers
and mentors", which nothing here does. The secondary call to action pointed at `/explore`, also a 404.

A nav that lies about what a product does is worse than a short one: the visitor who clicks
*Scholarships* and lands on an error has learned something true and unflattering about the whole
thing.

There are no marketing sub-pages to link to, and inventing them to fill a nav bar is how the previous
version happened. What the header carries instead is the one choice a visitor actually needs to make.

## One audience at a time

Students and teachers want different things from this page and neither is served by scrolling past the
other. An earlier version stacked both — six student features, a how-it-works section, a teacher
section, a closing call to action — so a teacher scrolled through all of the student material before
reaching anything addressed to them, and a student scrolled past a teacher section to reach the end.

The page now shows **one** audience and offers a switch. Students are the default, because they are
almost all of the traffic; a teacher arriving from a colleague's link goes straight to
`/?for=teachers`.

The switch is a **link, not client state**. It costs a navigation, which Next makes cheap, and buys
three things state would not: the teacher view is server-rendered rather than appearing after
hydration, the URL is shareable, and there is no flash of the wrong audience on first paint.

It renders twice and is visible once — in the header above `lg`, inline above the headline below it.
A switch hidden behind a hamburger is a switch most visitors never find.

## Composition

| Piece | File | Kind |
| --- | --- | --- |
| Page | [page.tsx](../../../src/app/page.tsx) | server — reads the session, composes the rest |
| Header | [site-header.tsx](../../../src/components/site-header.tsx) | client — the switch and the account menu |
| Body | [landing-sections.tsx](../../../src/components/landing-sections.tsx) | server — the switch, both audience views, the footer |

## What each view says

| | Students (default) | Teachers |
| --- | --- | --- |
| Headline | Your syllabus, explained and kept up with | Choose a subject, not a list of students |
| Cards | syllabus, AI tutor, assignments & notes, wallet | audience resolves itself, publish once, mark and give feedback, reminders |
| Primary CTA | Get started free, or **Go to your dashboard** when signed in | Create a teacher account |
| The honest note | most colleges are not configured yet | new accounts are approved before they can publish |

Both notes exist for the same reason: a student from an unconfigured college would otherwise sign up,
onboard and find an empty Curriculum screen with no explanation, and a teacher who signs up and cannot
publish would otherwise wonder why. A sentence each, on the page rather than after the fact.

Four cards, not six. The page is a hero, a row and a footer — there is nothing to scroll for.

## Two things it used to get wrong about the signed-in visitor

**The notification bell was fake.** A `<button>` with no handler, showing a hard-coded `3` behind a
`TODO: replace with a real unread count once notifications exist`. Notifications had existed for a
while. It is now a `<Link>` to `/notifications` carrying the real count from the service, and
`HeaderUser.notifications` is a **required** number rather than an optional one — a caller that does
not know the count has to say `0`, which is at least honest.

**"Join Now" was shown to people who had already joined** and were signed in at the time. Somebody
signed in wants one thing from this page, so the button is now *Go to dashboard*, the hero CTA becomes
*Go to your dashboard*, and both the "Teaching instead?" prompt and the closing sign-up section
disappear.

A dead search button was removed. There is no public search to wire it to.

## Failure behaviour

A database that cannot be reached falls back to the signed-out header rather than throwing. Somebody
evaluating the product should not meet a stack trace.
