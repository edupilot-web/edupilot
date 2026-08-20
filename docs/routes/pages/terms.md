# `/terms` — Terms of Service placeholder

| | |
| --- | --- |
| File | [../../../src/app/(auth)/terms/page.tsx](../../../src/app/(auth)/terms/page.tsx) |
| Access | public |
| Rendering | static Server Component — no session read, no database access |
| Reached from | the consent checkbox on [signup.md](signup.md) |

Renders [NoticePage](../../../src/components/notice-page.tsx) with
`backHref="/signup"` / `backLabel="Back to sign up"`. The body says plainly that the terms have
not been written and that they must exist before EduPilot accepts accounts from anyone outside
the team — because the sign-up form makes agreeing to them mandatory.

The page exists so the consent copy does not link to a 404. Replacing it is a copy change, not
an engineering one: swap the two `<p>` elements for the real agreement.

Companion placeholder: [privacy.md](privacy.md).
