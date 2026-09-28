import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeSelection } from "../../src/lib/onboarding/save";
import type { AcademicSelection } from "../../src/lib/onboarding/academic-context";

/**
 * The partial-save merge.
 *
 * These exist because of a real data-loss bug: `saveAcademicSelection` writes
 * every field it resolves, and the API route used to collapse an absent key and
 * an explicit `null` into the same thing. One `PATCH {"currentSemester": 5}`
 * therefore emptied a student's college, branch, regulation, batch and
 * subjects, and dropped them back into onboarding with no way to get their
 * profile back.
 *
 * The merge is the only thing standing between a partial request and that
 * outcome, so it is tested on its own rather than only through the route.
 */

const STORED: AcademicSelection = {
  stateId: "state-1",
  collegeId: "college-1",
  universityId: "university-1",
  programId: "program-1",
  branchId: "branch-1",
  regulationId: "regulation-1",
  admissionYear: 2024,
  admissionType: "regular",
  currentYear: 2,
  currentSemester: 3,
  graduationYear: 2028,
  subjectIds: ["subject-1", "subject-2"],
};

describe("mergeSelection", () => {
  it("keeps every field the caller did not mention", () => {
    const merged = mergeSelection(STORED, { currentSemester: 5 });

    assert.equal(merged.collegeId, "college-1");
    assert.equal(merged.programId, "program-1");
    assert.equal(merged.branchId, "branch-1");
    assert.equal(merged.regulationId, "regulation-1");
    assert.equal(merged.admissionYear, 2024);
    assert.equal(merged.graduationYear, 2028);
    assert.equal(merged.currentSemester, 5);
  });

  it("treats an explicit null as a clear, not as an absence", () => {
    const merged = mergeSelection(STORED, { graduationYear: null });
    assert.equal(merged.graduationYear, null);
    // …and nothing else moved.
    assert.equal(merged.collegeId, "college-1");
  });

  it("is a no-op when the same values are sent back", () => {
    const merged = mergeSelection(STORED, { ...STORED });
    assert.deepEqual(merged, STORED);
  });

  it("returns the incoming selection when nothing is stored yet", () => {
    const merged = mergeSelection({}, { stateId: "state-9" });
    assert.equal(merged.stateId, "state-9");
    assert.equal(merged.collegeId, undefined);
  });

  /**
   * The cascade. Without it a partial update produces a coordinate that cannot
   * resolve — a new college with the old branch still attached — and the whole
   * save fails with an error about a field the caller never sent.
   */
  it("clears the subjects when the semester moves", () => {
    const merged = mergeSelection(STORED, { currentSemester: 5 });
    assert.deepEqual(merged.subjectIds, []);
  });

  it("clears everything below the college when the college changes", () => {
    const merged = mergeSelection(STORED, { collegeId: "college-2" });

    assert.equal(merged.collegeId, "college-2");
    assert.equal(merged.universityId, null);
    assert.equal(merged.programId, null);
    assert.equal(merged.branchId, null);
    assert.equal(merged.regulationId, null);
    assert.deepEqual(merged.subjectIds, []);
  });

  it("leaves the batch alone when the college changes", () => {
    // The admission year is not downstream of anything — a transfer student
    // keeps their batch, and the year and semester are re-derived from it.
    const merged = mergeSelection(STORED, { collegeId: "college-2" });
    assert.equal(merged.admissionYear, 2024);
    assert.equal(merged.admissionType, "regular");
  });

  it("does not clear a dependent the caller supplied in the same request", () => {
    // The whole-form submit sends everything at once; the cascade must not undo
    // the choices it is carrying.
    const merged = mergeSelection(STORED, {
      collegeId: "college-2",
      programId: "program-2",
      branchId: "branch-2",
      regulationId: "regulation-2",
      subjectIds: ["subject-9"],
    });

    assert.equal(merged.programId, "program-2");
    assert.equal(merged.branchId, "branch-2");
    assert.equal(merged.regulationId, "regulation-2");
    assert.deepEqual(merged.subjectIds, ["subject-9"]);
    // Only the one dependent nobody supplied is cleared.
    assert.equal(merged.universityId, null);
  });

  it("does not cascade when a field is re-sent unchanged", () => {
    const merged = mergeSelection(STORED, { collegeId: "college-1", currentSemester: 3 });
    assert.equal(merged.branchId, "branch-1");
    assert.deepEqual(merged.subjectIds, ["subject-1", "subject-2"]);
  });

  it("compares subject lists by content, not by identity", () => {
    const merged = mergeSelection(STORED, { subjectIds: ["subject-1", "subject-2"] });
    assert.deepEqual(merged.subjectIds, ["subject-1", "subject-2"]);
  });

  it("ignores keys that are not part of the selection", () => {
    const merged = mergeSelection(STORED, {
      profileCompleted: true,
      onboardingStep: "review",
    } as unknown as AcademicSelection);

    assert.equal("profileCompleted" in merged, false);
    assert.equal("onboardingStep" in merged, false);
  });

  it("does not mutate the stored selection", () => {
    const stored = { ...STORED, subjectIds: [...STORED.subjectIds!] };
    mergeSelection(stored, { collegeId: "college-2" });
    assert.equal(stored.programId, "program-1");
    assert.deepEqual(stored.subjectIds, ["subject-1", "subject-2"]);
  });
});
