import { NextRequest } from "next/server";
import { searchColleges } from "@/lib/colleges";
import { handleError, ok, requireAuth } from "@/lib/api";

/**
 * Autocomplete for the college field in onboarding.
 *
 * Behind `requireAuth` even though the directory is not secret: it is called on
 * every keystroke, and an open endpoint that runs a regex query per request is
 * a free way to keep the database busy.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth();

    const query = req.nextUrl.searchParams.get("q") ?? "";
    const colleges = await searchColleges(query);

    return ok({ colleges });
  } catch (err) {
    return handleError(err);
  }
}
