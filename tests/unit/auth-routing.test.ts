import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appGateRedirect,
  destinationFor,
  ONBOARDING_FIRST_STEP,
  VERIFY_EMAIL_PATH,
} from "../../src/lib/auth-routing";

/**
 * Where a signed-in account belongs.
 *
 * One function answers this for every gate in the app — the shell layout, the
 * login and signup pages, the Google callback, the verification actions — so
 * that no two of them can disagree about the order of the checks. Two gates
 * each holding their own copy of "verified? onboarded?" is exactly how a
 * redirect loop starts, which is why the rules are worth pinning here.
 */

const TEACHER_HOME = "/teacher/dashboard";

describe("destinationFor", () => {
  it("sends an unverified account to verify its address first", () => {
    // Nothing else about the account can be trusted yet, so this outranks
    // everything below it.
    assert.equal(
      destinationFor({ needsEmailVerification: true, profileCompleted: false }),
      VERIFY_EMAIL_PATH
    );
  });

  it("sends a verified student with no profile into onboarding", () => {
    assert.equal(
      destinationFor({ needsEmailVerification: false, profileCompleted: false }),
      ONBOARDING_FIRST_STEP
    );
  });

  it("sends a finished student where they were going", () => {
    assert.equal(
      destinationFor({ needsEmailVerification: false, profileCompleted: true }, "/curriculum"),
      "/curriculum"
    );
  });

  it("refuses an off-site next", () => {
    const destination = destinationFor(
      { needsEmailVerification: false, profileCompleted: true },
      "https://evil.example/steal"
    );
    assert.ok(!destination.startsWith("http"));
  });

  /**
   * The teacher rules.
   *
   * The student login accepts a teacher — the account and the session cookie are
   * the same — so without a role check they were sent to `/onboarding/academic`
   * and asked for their admission year and branch. They could complete it, and
   * the result was a student profile attached to a teacher's account.
   */
  it("sends a teacher to the teacher shell, not student onboarding", () => {
    assert.equal(
      destinationFor({ needsEmailVerification: false, profileCompleted: false, role: "teacher" }),
      TEACHER_HOME
    );
  });

  it("still makes a teacher verify their address first", () => {
    assert.equal(
      destinationFor({ needsEmailVerification: true, profileCompleted: false, role: "teacher" }),
      VERIFY_EMAIL_PATH
    );
  });

  it("does not let a next= carry a teacher into the student app", () => {
    assert.equal(
      destinationFor(
        { needsEmailVerification: false, profileCompleted: false, role: "teacher" },
        "/dashboard"
      ),
      TEACHER_HOME
    );
  });

  it("treats an absent role as a student", () => {
    // Every caller that predates teacher accounts omits it, and the student
    // paths are the default they were written against.
    assert.equal(
      destinationFor({ needsEmailVerification: false, profileCompleted: true }),
      destinationFor({ needsEmailVerification: false, profileCompleted: true, role: "student" })
    );
  });
});

describe("appGateRedirect", () => {
  it("lets a finished student through", () => {
    assert.equal(appGateRedirect({ needsEmailVerification: false, profileCompleted: true }), null);
  });

  it("holds an unverified account at verification", () => {
    assert.equal(
      appGateRedirect({ needsEmailVerification: true, profileCompleted: true }),
      VERIFY_EMAIL_PATH
    );
  });

  it("holds an unonboarded student at onboarding", () => {
    assert.equal(
      appGateRedirect({ needsEmailVerification: false, profileCompleted: false }),
      ONBOARDING_FIRST_STEP
    );
  });

  it("bounces a teacher to their own shell rather than into onboarding", () => {
    assert.equal(
      appGateRedirect({ needsEmailVerification: false, profileCompleted: false, role: "teacher" }),
      TEACHER_HOME
    );
  });

  it("agrees with destinationFor about teachers", () => {
    // The two are used by different gates on the same request path. Where they
    // disagree is where a loop lives.
    const teacher = { needsEmailVerification: false, profileCompleted: false, role: "teacher" };
    assert.equal(appGateRedirect(teacher), destinationFor(teacher));
  });
});
