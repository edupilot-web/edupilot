import { handleError, ok, requireAuth } from "@/lib/api";
import { listStudentNotes, type NoteFilter } from "@/lib/teaching/student-view";

/**
 * GET /api/student/notes  (§32, §58)
 *
 * Read from `NoteRecipient`, so a student keeps last semester's notes after
 * moving up a year — which a live audience resolution would quietly take away
 * (§101, "historical notes remain accessible").
 */
const FILTERS: NoteFilter[] = ["all", "recent", "bookmarked"];

export async function GET(req: Request) {
  try {
    const session = await requireAuth();
    const params = new URL(req.url).searchParams;

    const requested = params.get("filter") ?? "all";
    const filter = (FILTERS as string[]).includes(requested)
      ? (requested as NoteFilter)
      : "all";

    const result = await listStudentNotes(session.sub, {
      filter,
      subjectId: params.get("subjectId"),
      limit: Number(params.get("limit")) || 30,
      skip: Number(params.get("skip")) || 0,
    });

    return ok({ notes: result.cards, total: result.total, filter });
  } catch (err) {
    return handleError(err);
  }
}
