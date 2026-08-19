import type { Metadata } from "next";
import { NoticePage } from "@/components/notice-page";

export const metadata: Metadata = { title: "Forgot password · EduPilot" };

/**
 * Placeholder. A real reset flow needs a token collection and an email sender,
 * neither of which exists yet — so this says so rather than silently failing.
 */
export default function ForgotPasswordPage() {
  return (
    <NoticePage title="Password reset is not available yet">
      <p>
        EduPilot cannot email reset links yet, so there is no way to change your password from this
        screen.
      </p>
      <p>
        If you have lost access to your account, ask an administrator to reset it for you directly.
      </p>
    </NoticePage>
  );
}
