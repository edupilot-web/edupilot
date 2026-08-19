import type { Metadata } from "next";
import { NoticePage } from "@/components/notice-page";

export const metadata: Metadata = { title: "Privacy Policy · EduPilot" };

/** Placeholder so the sign-up consent copy does not link to a 404. */
export default function PrivacyPage() {
  return (
    <NoticePage title="Privacy Policy" backHref="/signup" backLabel="Back to sign up">
      <p>This policy has not been written yet.</p>
      <p>
        For reference, sign-up currently stores a name, an email address and a bcrypt hash of the
        password, and sets one <code className="font-mono text-[13px]">httpOnly</code> session
        cookie. Nothing is shared with third parties.
      </p>
    </NoticePage>
  );
}
