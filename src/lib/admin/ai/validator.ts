import type { ResolvedAcademicContext } from "@/lib/admin/ai/context";
import { parseContent } from "@/lib/admin/ai/schema";

/**
 * AIContentValidator — the pipeline between a model response and a saved draft
 * (spec §25).
 *
 *   AI response
 *     → JSON schema validation      (schema.ts)
 *     → academic context validation (this file)
 *     → content validation          (this file)
 *     → consistency check           (this file)
 *     → save draft
 *     → admin review
 *
 * Nothing here can publish, approve or mark content as academically endorsed.
 * The strongest outcome is "save as a draft with warnings attached", which is
 * what §25's last two steps and §42 require.
 *
 * The distinction the whole file turns on:
 *
 *   **error**   the content is not fit to save. The job fails.
 *   **warning** the content is saveable but a reviewer must look at something.
 *
 * Warnings are stored and shown, not swallowed. A hallucination check that
 * quietly passed borderline content would be worse than no check, because it
 * would give a reviewer false confidence.
 */

export type ValidationIssue = {
  stage: "schema" | "context" | "content" | "consistency";
  code: string;
  message: string;
  /** Where in the content, when it can be pinpointed. */
  path?: string;
};

export type ValidationOutcome = {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  /** The parsed content, present only when `ok`. */
  content?: unknown;
};

export type ValidationOptions = {
  /** §24's switch. Off skips the content checks, never the schema one. */
  enableContentValidation?: boolean;
  enableHallucinationChecks?: boolean;
};

/**
 * Phrases that would present generated content as endorsed (§42, §11 rules
 * 17 and 20).
 *
 * Matched case-insensitively against the whole serialised content. This is a
 * *warning*, not an error: an exam-preparation document may legitimately mention
 * "the university syllabus", and refusing to save it would be worse than
 * flagging it for the reviewer who is about to read it anyway.
 */
const ENDORSEMENT_CLAIMS = [
  /university[- ]approved/i,
  /officially\s+approved/i,
  /faculty[- ]approved/i,
  /faculty[- ]verified/i,
  /official\s+syllabus/i,
  /board[- ]approved/i,
  /approved\s+by\s+the\s+(?:university|college|board)/i,
  /accredited\s+by/i,
];

/**
 * Shapes that look like a fabricated citation (§11 rule 10).
 *
 * Deliberately narrow — a page number, an ISBN, a DOI or a "p. 42" reference —
 * because those are the specific things a model invents most confidently and
 * which a reviewer cannot check without the book in hand. General prose that
 * merely names a well-known textbook is not flagged; the reference list on the
 * subject already names those.
 */
const FABRICATION_SHAPES: { pattern: RegExp; code: string; label: string }[] = [
  { pattern: /\bp{1,2}\.\s?\d{1,4}\b/i, code: "page-citation", label: "a page number" },
  { pattern: /\bpages?\s+\d{1,4}\s*[-–]\s*\d{1,4}\b/i, code: "page-range", label: "a page range" },
  { pattern: /\bISBN[\s:-]*[\d-]{10,17}\b/i, code: "isbn", label: "an ISBN" },
  { pattern: /\bdoi\s*:\s*10\.\d{4,}/i, code: "doi", label: "a DOI" },
  { pattern: /\b(?:IEEE|ISO|ANSI|IS)\s?\d{3,5}(?:[-:]\d{2,4})?\b/, code: "standard", label: "a standards number" },
];

function collectStrings(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 12) return out;
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectStrings(entry, out, depth + 1);
    return out;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) collectStrings(entry, out, depth + 1);
  }
  return out;
}

/** Unit numbers the response claims to cover. */
function claimedUnits(content: unknown): number[] {
  if (!content || typeof content !== "object") return [];
  const value = (content as Record<string, unknown>).syllabusUnitsCovered;
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is number => typeof entry === "number");
}

/** Unit numbers that actually appear as `unitNumber` anywhere in the content. */
function usedUnits(content: unknown, found = new Set<number>(), depth = 0): Set<number> {
  if (depth > 12 || !content || typeof content !== "object") return found;

  if (Array.isArray(content)) {
    for (const entry of content) usedUnits(entry, found, depth + 1);
    return found;
  }

  for (const [key, value] of Object.entries(content)) {
    if (key === "unitNumber" && typeof value === "number") found.add(value);
    else usedUnits(value, found, depth + 1);
  }
  return found;
}

/**
 * Run the pipeline.
 *
 * Ordered so that the cheapest and most decisive check runs first: there is no
 * point looking for fabricated citations in something that is not the right
 * shape, and a schema failure is the one an operator can act on immediately.
 */
export function validateGeneratedContent(input: {
  contentType: string;
  raw: unknown;
  context: ResolvedAcademicContext;
  options?: ValidationOptions;
}): ValidationOutcome {
  const { contentType, raw, context } = input;
  const options = input.options ?? {};
  const contentChecks = options.enableContentValidation !== false;
  const hallucinationChecks = options.enableHallucinationChecks !== false;

  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // ── 1. JSON schema ─────────────────────────────────────────────────────
  const parsed = parseContent(contentType, raw);
  if (!parsed.ok) {
    return {
      ok: false,
      errors: parsed.issues.map((issue) => ({
        stage: "schema" as const,
        code: "schema-invalid",
        message: issue,
      })),
      warnings,
    };
  }
  const content = parsed.content;

  // ── 2. Academic context ───────────────────────────────────────────────
  // The coordinate itself was verified before generation (§26). What is checked
  // here is that the *response* stayed inside it: a model that wrote about units
  // the syllabus does not have has broken rule 4, and that is not reviewable —
  // it is wrong.
  const syllabusUnits = new Set(context.subject.units.map((unit) => unit.unitNumber));

  if (syllabusUnits.size > 0) {
    const claimed = claimedUnits(content);
    const inventedClaims = claimed.filter((unit) => !syllabusUnits.has(unit));
    if (inventedClaims.length) {
      errors.push({
        stage: "context",
        code: "unit-not-in-syllabus",
        message: `The response claims to cover unit${inventedClaims.length > 1 ? "s" : ""} ${inventedClaims.join(", ")}, which the ${context.subject.code} syllabus does not contain.`,
        path: "syllabusUnitsCovered",
      });
    }

    const used = [...usedUnits(content)].filter((unit) => !syllabusUnits.has(unit));
    if (used.length) {
      errors.push({
        stage: "context",
        code: "content-outside-syllabus",
        message: `The content is attached to unit${used.length > 1 ? "s" : ""} ${used.join(", ")}, which the syllabus does not contain.`,
      });
    }

    if (!claimed.length) {
      warnings.push({
        stage: "context",
        code: "no-units-declared",
        message:
          "The response did not declare which syllabus units it covers, so its alignment could not be checked automatically.",
        path: "syllabusUnitsCovered",
      });
    }
  } else {
    // No syllabus on record. Generation is allowed but is inherently ungrounded,
    // and a reviewer must be told rather than left to infer it (§9).
    warnings.push({
      stage: "context",
      code: "no-syllabus-on-record",
      message: `${context.subject.name} has no syllabus units on record, so this content could not be grounded on one. Verify it against the curriculum document before approving.`,
    });
  }

  if (!contentChecks) return { ok: errors.length === 0, errors, warnings, content };

  // ── 3. Content ────────────────────────────────────────────────────────
  const strings = collectStrings(content);
  const joined = strings.join("\n");

  for (const claim of ENDORSEMENT_CLAIMS) {
    const match = claim.exec(joined);
    if (match) {
      warnings.push({
        stage: "content",
        code: "endorsement-claim",
        message: `The content contains "${match[0].trim()}". AI-generated material must not present itself as approved by a college, university or faculty. Remove or qualify it before publishing.`,
      });
      break;
    }
  }

  if (hallucinationChecks) {
    /**
     * A citation shape is only suspicious if it is not in the subject's own
     * reference list. Comparing against the list rather than flagging every
     * occurrence is what keeps this from crying wolf on the books the
     * curriculum genuinely prescribes.
     */
    const knownReferences = [
      ...context.subject.referenceBooks.map((book) =>
        [book.title, book.authors, book.publisher].filter(Boolean).join(" ").toLowerCase()
      ),
      ...context.subject.referenceMaterials.map((material) => material.toLowerCase()),
    ].join(" | ");

    for (const shape of FABRICATION_SHAPES) {
      const match = shape.pattern.exec(joined);
      if (!match) continue;
      if (knownReferences.includes(match[0].toLowerCase())) continue;

      warnings.push({
        stage: "content",
        code: `fabrication-${shape.code}`,
        message: `The content cites ${shape.label} ("${match[0].trim()}") that is not in the subject's reference list. Verify it — models invent these confidently.`,
      });
    }

    const unavailable = (content as Record<string, unknown>)?.unavailable;
    if (Array.isArray(unavailable) && unavailable.length) {
      warnings.push({
        stage: "content",
        code: "declared-unavailable",
        message: `The model marked ${unavailable.length} field${unavailable.length > 1 ? "s" : ""} as unavailable rather than inventing them. Review before publishing.`,
      });
    }
  }

  // Empty prose passes the schema (`max`, not `min`) but is not content.
  const emptyish = strings.filter((entry) => entry.trim().length > 0);
  if (!emptyish.length) {
    errors.push({
      stage: "content",
      code: "empty-content",
      message: "The response parsed but contained no text.",
    });
  }

  // ── 4. Consistency ────────────────────────────────────────────────────
  const consistency = checkConsistency(content, context);
  warnings.push(...consistency);

  return { ok: errors.length === 0, errors, warnings, content };
}

/**
 * Internal consistency and completeness (§25 "Duplicate/Consistency Check").
 *
 * Duplicate *records* are prevented by the unique index (§27); what is checked
 * here is duplication and gaps *inside* one response — the same question twice,
 * or a complete course that skipped a unit.
 */
function checkConsistency(content: unknown, context: ResolvedAcademicContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!content || typeof content !== "object") return issues;

  const record = content as Record<string, unknown>;
  const syllabusUnits = context.subject.units.map((unit) => unit.unitNumber);

  // A units array that omits a syllabus unit is a partial course presented as a
  // whole one — the single most likely way a token limit shows up as data.
  if (Array.isArray(record.units) && syllabusUnits.length) {
    const present = new Set(
      record.units
        .map((unit) => (unit && typeof unit === "object" ? (unit as Record<string, unknown>).unitNumber : null))
        .filter((value): value is number => typeof value === "number")
    );
    const missing = syllabusUnits.filter((unit) => !present.has(unit));
    if (missing.length && present.size > 0) {
      issues.push({
        stage: "consistency",
        code: "units-missing",
        message: `The syllabus has ${syllabusUnits.length} units but the content covers ${present.size}. Missing: ${missing.join(", ")}. This is usually a truncated response — regenerate the missing units.`,
        path: "units",
      });
    }
  }

  // Repeated questions across the assessment arrays.
  for (const key of ["questions", "mcqs", "shortAnswers", "longAnswers", "flashcards"] as const) {
    const list = record[key];
    if (!Array.isArray(list) || list.length < 2) continue;

    const seen = new Set<string>();
    let duplicates = 0;
    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const text = String(item.question ?? item.front ?? "").trim().toLowerCase();
      if (!text) continue;
      if (seen.has(text)) duplicates += 1;
      seen.add(text);
    }
    if (duplicates) {
      issues.push({
        stage: "consistency",
        code: "duplicate-items",
        message: `${duplicates} duplicate item${duplicates > 1 ? "s" : ""} in "${key}".`,
        path: key,
      });
    }
  }

  return issues;
}
