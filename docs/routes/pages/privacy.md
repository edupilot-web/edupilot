# `/privacy` — Privacy Policy placeholder

| | |
| --- | --- |
| File | [../../../src/app/(auth)/privacy/page.tsx](../../../src/app/(auth)/privacy/page.tsx) |
| Access | public |
| Rendering | static Server Component — no session read, no database access |
| Reached from | the consent checkbox on [signup.md](signup.md) |

Renders [NoticePage](../../../src/components/notice-page.tsx) with a back link to `/signup`. The
body says the policy has not been written, and then states what the product actually does today
so the placeholder is still truthful:

- Sign-up stores a **name**, an **email address** and a **bcrypt hash** of the password.
- One `httpOnly` cookie (`edupilot_session`) is set.
- Nothing is shared with third parties.

Keep that list accurate. It is the only privacy statement the product has, and it will drift the
moment a new field is collected — an avatar upload, a phone number, an analytics call or a real
OAuth provider each invalidate a line of it.

Companion placeholder: [terms.md](terms.md).
