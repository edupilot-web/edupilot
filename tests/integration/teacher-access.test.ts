import "./test-db";

import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import mongoose, { Types } from "mongoose";
import { connectDB } from "../../src/lib/db";
import { College } from "../../src/models/College";
import { TeacherInvite } from "../../src/models/TeacherInvite";
import { User } from "../../src/models/User";
import { checkEligibility, issueInvite, policyFor, setPolicy } from "../../src/lib/teaching/invites";
import { teacherInviteEmail } from "../../src/lib/email/templates/teacher-invite";

/**
 * Changing the policy, and the mail that carries an invitation.
 *
 * The gate was already tested (`teacher-eligibility.test.ts`); what was untested
 * was that anybody could *change* it, because until now nobody could — the
 * setting was reachable only by editing the database. These are the refusals
 * that make the new screen safe to put in front of an administrator.
 */

const ADMIN = { id: String(new Types.ObjectId()), name: "Registrar" };

let college: Types.ObjectId;

before(async () => {
  await connectDB();
  delete process.env.TEACHER_AUTO_APPROVE;

  await College.deleteMany({});
  const created = await College.create({
    name: "Policy College",
    normalizedName: "policycollege",
    status: "active",
  });
  college = created._id;

  await TeacherInvite.createIndexes();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(async () => {
  await TeacherInvite.deleteMany({});
  await User.deleteMany({});
  await College.updateOne({ _id: college }, { $unset: { teacherSignup: "" } });
});

describe("changing the policy", () => {
  it("moves a college off the default", async () => {
    assert.equal((await policyFor(String(college)))?.mode, "invite_only");

    const result = await setPolicy({
      collegeId: String(college),
      mode: "domain",
      allowedDomains: ["vrsec.ac.in"],
    });

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.policy.mode, "domain");

    // And the gate agrees, which is the only thing that actually matters.
    const eligible = await checkEligibility({
      collegeId: String(college),
      email: "rao@vrsec.ac.in",
    });
    assert.equal(eligible.ok, true);
  });

  it("normalises what an administrator pastes", async () => {
    const result = await setPolicy({
      collegeId: String(college),
      mode: "domain",
      allowedDomains: ["@VRSEC.ac.in", "https://www.cse.vrsec.ac.in/", "vrsec.ac.in"],
    });

    // Lower-cased, stripped and de-duplicated: the same domain typed three ways
    // is one entry, not three.
    assert.deepEqual(result.ok && result.policy.allowedDomains, [
      "vrsec.ac.in",
      "cse.vrsec.ac.in",
    ]);
  });

  /** `checkEligibility` reads an empty allowlist as "refuse everyone". */
  it("refuses domain mode with no domains", async () => {
    const result = await setPolicy({ collegeId: String(college), mode: "domain", allowedDomains: [] });

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.code, "no-domains");
    // And nothing was written, so the college is still on its previous setting.
    assert.equal((await policyFor(String(college)))?.mode, "invite_only");
  });

  it("refuses a public mailbox provider", async () => {
    // Not a weaker policy than "open" but a worse one: it reads as "our staff"
    // and means "anybody at all".
    const result = await setPolicy({
      collegeId: String(college),
      mode: "domain",
      allowedDomains: ["gmail.com"],
    });

    assert.equal(!result.ok && result.code, "public-domain");
  });

  it("refuses something that is not a domain", async () => {
    for (const bad of ["vrsec", "localhost", "rao@vrsec.ac.in."]) {
      const result = await setPolicy({
        collegeId: String(college),
        mode: "domain",
        allowedDomains: [bad],
      });
      assert.equal(result.ok, false, `expected "${bad}" to be refused`);
    }
  });

  it("keeps the domains when the mode moves away and back", async () => {
    await setPolicy({ collegeId: String(college), mode: "domain", allowedDomains: ["vrsec.ac.in"] });
    await setPolicy({ collegeId: String(college), mode: "invite_only" });

    const parked = await policyFor(String(college));
    assert.equal(parked?.mode, "invite_only");
    // Inert while the mode is anything else, but not retyped on the way back.
    assert.deepEqual(parked?.allowedDomains, ["vrsec.ac.in"]);

    // Inert really does mean inert: a matching address is still refused.
    const refused = await checkEligibility({
      collegeId: String(college),
      email: "rao@vrsec.ac.in",
    });
    assert.equal(refused.ok, false);
  });

  it("turns auto-approve on and off", async () => {
    await setPolicy({ collegeId: String(college), mode: "open", autoApprove: true });
    assert.equal((await policyFor(String(college)))?.autoApprove, true);

    await setPolicy({ collegeId: String(college), mode: "open", autoApprove: false });
    assert.equal((await policyFor(String(college)))?.autoApprove, false);
  });

  it("cannot switch off the platform-wide floor", async () => {
    // `TEACHER_AUTO_APPROVE` is a deployment deciding to trust everyone. A
    // college saying "no thanks" to that is not something this setting can
    // express, and pretending otherwise would be the dangerous direction.
    process.env.TEACHER_AUTO_APPROVE = "true";
    try {
      const result = await setPolicy({
        collegeId: String(college),
        mode: "open",
        autoApprove: false,
      });
      assert.equal(result.ok && result.policy.autoApprove, true);
    } finally {
      delete process.env.TEACHER_AUTO_APPROVE;
    }
  });

  it("refuses a college that does not exist", async () => {
    const result = await setPolicy({ collegeId: String(new Types.ObjectId()), mode: "open" });
    assert.equal(!result.ok && result.code, "unknown-college");
  });
});

describe("what the invitation email carries", () => {
  it("names the college and the sender", async () => {
    const issued = await issueInvite({
      collegeId: String(college),
      email: "rao@example.com",
      designation: "Assistant Professor",
      admin: ADMIN,
    });

    assert.equal(issued.ok, true);
    if (!issued.ok) return;

    // The sender has to reach the mail, which means it has to leave `issueInvite`.
    assert.equal(issued.collegeName, "Policy College");
    assert.equal(issued.designation, "Assistant Professor");
    assert.ok(issued.expiresInDays > 0);

    const mail = teacherInviteEmail({
      collegeName: issued.collegeName,
      invitedByName: ADMIN.name,
      inviteUrl: issued.url,
      expiresInDays: issued.expiresInDays,
      designation: issued.designation,
    });

    // The first question about an unexpected link is "who is this from", and an
    // answer the recipient can check against their own institution is what
    // makes it safe to click.
    assert.match(mail.subject, /Policy College/);
    assert.ok(mail.html.includes("Policy College"));
    assert.ok(mail.html.includes("Registrar"));
    assert.ok(mail.html.includes("Assistant Professor"));

    // The link must survive a client that strips the styled anchor.
    assert.ok(mail.text.includes(issued.url));
  });

  it("escapes a college name into the html", async () => {
    const mail = teacherInviteEmail({
      collegeName: '<script>alert(1)</script> College',
      invitedByName: "Registrar",
      inviteUrl: "https://example.com/signup?role=teacher&invite=abc",
      expiresInDays: 14,
    });

    assert.ok(!mail.html.includes("<script>"));
    assert.ok(mail.html.includes("&lt;script&gt;"));
    // The URL's own ampersand is escaped rather than left to break the markup.
    assert.ok(mail.html.includes("invite=abc"));
  });

  it("reads correctly with no designation", async () => {
    const mail = teacherInviteEmail({
      collegeName: "Policy College",
      invitedByName: "Registrar",
      inviteUrl: "https://example.com/x",
      expiresInDays: 14,
      designation: null,
    });

    // No dangling " as " where the role would have been.
    assert.ok(!mail.html.includes("EduPilot as ."));
    assert.ok(!mail.text.includes(" as ."));
  });
});
