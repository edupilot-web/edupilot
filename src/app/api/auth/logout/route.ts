import { clearSessionCookie } from "@/lib/auth";
import { ok, handleError } from "@/lib/api";

export async function POST() {
  try {
    await clearSessionCookie();
    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
