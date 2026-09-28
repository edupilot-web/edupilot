import { fail, handleError, ok, requireAuth } from "@/lib/api";
import { saveAcademicSelection } from "@/lib/onboarding/save";
import type { AcademicSelection } from "@/lib/onboarding/academic-context";

/**
 * PATCH /api/profile/academic — autosave (spec §28, §33)
 * POST  /api/profile/academic — final submit (spec §28 `POST /api/profile/complete`)
 *
 * Two verbs on one route because they are the same write with a different
 * completeness bar. PATCH stores progress and does not care that the profile is
 * unfinished; POST refuses to mark anything complete the server cannot verify
 * (§34). Sharing the handler is what guarantees an autosave is validated exactly
 * as strictly as a submit — a laxer autosave path would be the way around every
 * check in §30.
 *
 * Neither accepts a `profileCompleted` flag. Completion is computed from the
 * resolved context, so a client cannot assert it.
 */

/**
 * Read the selection, keeping "absent" and "explicitly null" apart.
 *
 * That distinction is the whole of the fix for a data-loss bug this endpoint
 * used to have. `saveAcademicSelection` writes every field it resolves, so a
 * key that arrived as `null` merely because the caller did not mention it
 * cleared a stored value — one `PATCH {"currentSemester": 5}` wiped a
 * student's college, branch, regulation, batch and subjects and bounced them
 * back into onboarding.
 *
 * Only keys actually present in the body are carried forward now.
 * `saveAcademicSelection` fills the rest from the stored profile, so a partial
 * update is genuinely partial and an explicit `null` still clears a field.
 *
 * The browser flow always sends the whole selection, so it never triggered
 * this — which is exactly why it was worth fixing rather than relying on every
 * future caller being equally generous.
 */
function readSelection(body: Record<string, unknown>): AcademicSelection {
  const selection: Record<string, unknown> = {};

  const str = (key: string): void => {
    if (!(key in body)) return;
    const value = body[key];
    selection[key] = typeof value === "string" && value.trim() ? value.trim() : null;
  };

  const num = (key: string): void => {
    if (!(key in body)) return;
    const value = body[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      selection[key] = value;
    } else if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      selection[key] = Number(value);
    } else {
      selection[key] = null;
    }
  };

  str("stateId");
  str("collegeId");
  str("universityId");
  str("programId");
  str("branchId");
  str("regulationId");
  str("admissionType");

  num("admissionYear");
  num("currentYear");
  num("currentSemester");
  num("graduationYear");

  if ("subjectIds" in body) {
    selection.subjectIds = Array.isArray(body.subjectIds)
      ? body.subjectIds.filter((entry): entry is string => typeof entry === "string")
      : [];
  }

  return selection as AcademicSelection;
}

async function handle(req: Request, partial: boolean) {
  try {
    const session = await requireAuth();

    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== "object") return fail("Send a JSON body", 400);
      body = parsed as Record<string, unknown>;
    } catch {
      return fail("Send a JSON body", 400);
    }

    const result = await saveAcademicSelection(session.sub, readSelection(body), { partial });

    if (!result.ok) {
      /**
       * 422 for a relationship the server rejected, 400 for "not finished yet".
       *
       * The distinction matters to the client: a 422 carries a `field` the UI
       * should send the student back to and correct, while an `incomplete` 400
       * simply means keep going.
       */
      return fail(result.message, result.code === "incomplete" ? 400 : 422, {
        field: result.field,
        code: result.code,
      });
    }

    return ok({
      completed: result.completed,
      nextStep: result.nextStep,
      /**
       * The resolved context is echoed back so the review screen renders names
       * the *server* resolved rather than the labels the client happened to
       * cache. If the two ever disagree, the student sees the truth.
       */
      context: {
        state: result.context.state,
        college: result.context.college,
        university: result.context.university,
        program: result.context.program,
        branch: result.context.branch,
        regulation: result.context.regulation,
        admissionYear: result.context.admissionYear,
        admissionType: result.context.admissionType,
        currentYear: result.context.currentYear,
        currentSemester: result.context.currentSemester,
        subjects: result.context.subjects,
        expectedGraduationYear: result.context.expectedGraduationYear,
        hasCurriculum: result.context.hasCurriculum,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request) {
  return handle(req, true);
}

export async function POST(req: Request) {
  return handle(req, false);
}
