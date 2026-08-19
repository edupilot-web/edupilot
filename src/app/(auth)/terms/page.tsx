import type { Metadata } from "next";
import { NoticePage } from "@/components/notice-page";

export const metadata: Metadata = { title: "Terms of Service · EduPilot" };

/** Placeholder so the sign-up consent copy does not link to a 404. */
export default function TermsPage() {
  return (
    <NoticePage title="Terms of Service" backHref="/signup" backLabel="Back to sign up">
      <p>These terms have not been written yet.</p>
      <p>
        Replace this page with the real agreement before EduPilot accepts accounts from anyone
        outside the team — the sign-up form asks people to agree to it.
      </p>
    </NoticePage>
  );
}
