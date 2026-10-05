import "./test-db";

import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import mongoose, { Types } from "mongoose";
import { connectDB } from "../../src/lib/db";
import { College } from "../../src/models/College";
import { TeacherInvite } from "../../src/models/TeacherInvite";
import { User } from "../../src/models/User";
import {
  checkEligibility,
  consumeInvite,
  issueInvite,
  listInvites,
  policyFor,
  revokeInvite,
} from "../../src/lib/teaching/invites";
import { emailMatchesDomains, normaliseDomain } from "../../src/lib/teaching/fields";

/**
 * Who may claim a teacher account.
 *
 * A teacher account is a claim on a college's students, so almost everything
 * here is a refusal. The failure this replaced was that there were none: anyone
 * could pick any college from the directory and land in its approval queue.
 */

const ADMIN = { id: String(new Types.ObjectId()), name: "Registrar" };

let inviteOnly: Types.ObjectId;
let domainCollege: Types.ObjectId;
let openCollege: Types.ObjectId;

async function makeCollege(
  name: string,
  teacherSignup: Record<string, unknown> | null
): Promise<Types.ObjectId> {
  const college = await College.create({
    name,
    normalizedName: name.toLowerCase().replace(/\s+/g, ""),
    status: "active",
    ...(teacherSignup ? { teacherSignup } : {}),
  });
  return college._id;
}

before(async () => {
  await connectDB();
  delete process.env.TEACHER_AUTO_APPROVE;

  // Deliberately no `teacherSignup` at all — the default must be invite-only.
  inviteOnly = await makeCollege("Unconfigured College", null);
  domainCollege = await makeCollege("Domain College", {
    mode: "domain",
    allowedDomains: ["vrsec.ac.in"],
  });
  openCollege = await makeCollege("Open College", { mode: "open" });

  await TeacherInvite.createIndexes();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(async () => {
  await TeacherInvite.deleteMany({});
  await User.deleteMany({});
});

describe("the default", () => {
  /** The whole point of the change. */
  it("is invite-only for a college nobody has configured", async () => {
    const policy = await policyFor(String(inviteOnly));
    assert.equal(policy?.mode, "invite_only");

    const result = await checkEligibility({
      collegeId: String(inviteOnly),
      email: "stranger@gmail.com",
    });

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.code, "invite-required");
  });

  it("does not auto-approve", async () => {
    const policy = await policyFor(String(inviteOnly));
    assert.equal(policy?.autoApprove, false);
  });

  it("refuses a college that does not exist", async () => {
    const result = await checkEligibility({
      collegeId: String(new Types.ObjectId()),
      email: "someone@example.com",
    });
    assert.equal(!result.ok && result.code, "unknown-college");
  });
});

describe("domain mode", () => {
  it("lets a matching address through", async () => {
    const result = await checkEligibility({
      collegeId: String(domainCollege),
      email: "rao@vrsec.ac.in",
    });

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.via, "domain");
  });

  it("accepts a sub-domain", async () => {
    // Institutional mail is often arranged this way, and a teacher does not
    // choose which sub-domain they were given.
    const result = await checkEligibility({
      collegeId: String(domainCollege),
      email: "rao@cse.vrsec.ac.in",
    });
    assert.equal(result.ok, true);
  });

  /** The one a bare `endsWith` would get wrong, and somebody can register it. */
  it("refuses a look-alike domain", async () => {
    const result = await checkEligibility({
      collegeId: String(domainCollege),
      email: "attacker@notvrsec.ac.in",
    });

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.code, "domain-mismatch");
  });

  it("refuses a personal address", async () => {
    const result = await checkEligibility({
      collegeId: String(domainCollege),
      email: "someone@gmail.com",
    });
    assert.equal(!result.ok && result.code, "domain-mismatch");
  });

  it("refuses everything when configured for domains and given none", async () => {
    // An empty allowlist is a misconfiguration. Reading it as "allow anything"
    // would turn a mistake into an open door.
    const broken = await makeCollege("Broken College", { mode: "domain", allowedDomains: [] });

    const result = await checkEligibility({
      collegeId: String(broken),
      email: "anyone@anywhere.com",
    });
    assert.equal(result.ok, false);
  });
});

describe("open mode", () => {
  it("lets anyone through, still pending", async () => {
    const result = await checkEligibility({
      collegeId: String(openCollege),
      email: "anyone@example.com",
    });

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.via, "open");
    assert.equal(result.ok && result.policy.autoApprove, false);
  });
});

describe("invitations", () => {
  async function invite(email = "rao@example.com", collegeId = inviteOnly) {
    const result = await issueInvite({
      collegeId: String(collegeId),
      email,
      admin: ADMIN,
    });
    assert.equal(result.ok, true);
    return result as { ok: true; id: string; token: string; url: string; email: string };
  }

  it("opens an invite-only college for the address invited", async () => {
    const { token } = await invite();

    const result = await checkEligibility({
      collegeId: String(inviteOnly),
      email: "rao@example.com",
      inviteToken: token,
    });

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.via, "invite");
  });

  /** The whole control: the link can be forwarded; only the mailbox can spend it. */
  it("refuses a different address holding the same link", async () => {
    const { token } = await invite("rao@example.com");

    const result = await checkEligibility({
      collegeId: String(inviteOnly),
      email: "somebody-else@example.com",
      inviteToken: token,
    });

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.code, "invite-wrong-email");
  });

  it("does not name the invited address in full", async () => {
    // Enough for the right person to recognise their own, not enough to hand
    // somebody else's to a stranger holding the link.
    const { token } = await invite("rajesh@example.com");

    const result = await checkEligibility({
      collegeId: String(inviteOnly),
      email: "wrong@example.com",
      inviteToken: token,
    });

    assert.ok(!result.ok && !result.message.includes("rajesh@example.com"));
    assert.ok(!result.ok && result.message.includes("@example.com"));
  });

  it("refuses an invitation aimed at another college", async () => {
    const { token } = await invite("rao@example.com", domainCollege);

    const result = await checkEligibility({
      collegeId: String(inviteOnly),
      email: "rao@example.com",
      inviteToken: token,
    });
    assert.equal(!result.ok && result.code, "invite-wrong-college");
  });

  it("refuses an expired one", async () => {
    const { token, id } = await invite();
    await TeacherInvite.updateOne({ _id: id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    const result = await checkEligibility({
      collegeId: String(inviteOnly),
      email: "rao@example.com",
      inviteToken: token,
    });
    assert.equal(!result.ok && result.code, "invite-expired");
  });

  it("refuses a revoked one", async () => {
    const { token, id } = await invite();
    assert.equal(await revokeInvite(id, null), true);

    const result = await checkEligibility({
      collegeId: String(inviteOnly),
      email: "rao@example.com",
      inviteToken: token,
    });
    assert.equal(result.ok, false);
  });

  it("refuses a spent one, and says it was used", async () => {
    const { token, id } = await invite();
    assert.equal(await consumeInvite(id, String(new Types.ObjectId())), true);

    const result = await checkEligibility({
      collegeId: String(inviteOnly),
      email: "rao@example.com",
      inviteToken: token,
    });
    // Distinct from "invalid": somebody who just signed up in another tab needs
    // to know it worked.
    assert.equal(!result.ok && result.code, "invite-used");
  });

  it("is spent once under concurrency", async () => {
    const { id } = await invite();

    const results = await Promise.all([
      consumeInvite(id, String(new Types.ObjectId())),
      consumeInvite(id, String(new Types.ObjectId())),
      consumeInvite(id, String(new Types.ObjectId())),
    ]);

    assert.equal(results.filter(Boolean).length, 1);
  });

  it("never stores the token in a usable form", async () => {
    const { token } = await invite();
    const row = await TeacherInvite.findOne({ email: "rao@example.com" }).lean();

    assert.notEqual(row!.tokenHash, token);
    assert.match(row!.tokenHash, /^[0-9a-f]{64}$/);
  });

  it("works whatever mode the college is in", async () => {
    // A college switching to `domain` must not invalidate invitations already
    // sent, and an invitee has a stronger claim than any policy default.
    const { token } = await invite("outsider@gmail.com", domainCollege);

    const result = await checkEligibility({
      collegeId: String(domainCollege),
      email: "outsider@gmail.com",
      inviteToken: token,
    });
    assert.equal(result.ok, true);
  });

  it("refuses a second live invitation for one address", async () => {
    await invite("rao@example.com");
    const again = await issueInvite({
      collegeId: String(inviteOnly),
      email: "rao@example.com",
      admin: ADMIN,
    });

    assert.equal(again.ok, false);
    assert.equal(!again.ok && again.code, "already-invited");
  });

  it("allows a fresh one after the first is revoked", async () => {
    const { id } = await invite("rao@example.com");
    await revokeInvite(id, null);

    const again = await issueInvite({
      collegeId: String(inviteOnly),
      email: "rao@example.com",
      admin: ADMIN,
    });
    assert.equal(again.ok, true);
  });

  it("will not invite an address that already has an account", async () => {
    // The link would fail at sign-up with "already exists", which reads as the
    // invitation being broken rather than unnecessary.
    await User.create({
      name: "Existing",
      email: "taken@example.com",
      passwordHash: "x".repeat(60),
      role: "teacher",
      emailVerified: true,
    });

    const result = await issueInvite({
      collegeId: String(inviteOnly),
      email: "taken@example.com",
      admin: ADMIN,
    });
    assert.equal(!result.ok && result.code, "already-registered");
  });

  it("scopes a revoke to the college", async () => {
    const { id } = await invite("rao@example.com", domainCollege);

    // Another college's administrator cannot withdraw it.
    assert.equal(await revokeInvite(id, String(inviteOnly)), false);
    assert.equal(await revokeInvite(id, String(domainCollege)), true);
  });

  it("lists with a status a screen can render", async () => {
    const { id } = await invite("pending@example.com");
    await issueInvite({ collegeId: String(inviteOnly), email: "gone@example.com", admin: ADMIN });
    const revoked = await listInvites({ collegeId: String(inviteOnly) });
    assert.equal(revoked.length, 2);
    assert.ok(revoked.every((row) => row.status === "pending"));

    await consumeInvite(id, String(new Types.ObjectId()));
    const after = await listInvites({ collegeId: String(inviteOnly) });
    assert.equal(after.filter((row) => row.status === "accepted").length, 1);
  });
});

describe("domain matching", () => {
  it("normalises what an administrator plausibly types", () => {
    assert.equal(normaliseDomain("@vrsec.ac.in"), "vrsec.ac.in");
    assert.equal(normaliseDomain("https://www.vrsec.ac.in/"), "vrsec.ac.in");
    assert.equal(normaliseDomain("  VRSEC.ac.in  "), "vrsec.ac.in");
  });

  it("matches on a domain boundary, not a suffix", () => {
    assert.equal(emailMatchesDomains("a@vrsec.ac.in", ["vrsec.ac.in"]), true);
    assert.equal(emailMatchesDomains("a@cse.vrsec.ac.in", ["vrsec.ac.in"]), true);
    assert.equal(emailMatchesDomains("a@notvrsec.ac.in", ["vrsec.ac.in"]), false);
    assert.equal(emailMatchesDomains("a@vrsec.ac.in.evil.com", ["vrsec.ac.in"]), false);
  });

  it("handles a malformed address without throwing", () => {
    assert.equal(emailMatchesDomains("not-an-email", ["vrsec.ac.in"]), false);
    assert.equal(emailMatchesDomains("trailing@", ["vrsec.ac.in"]), false);
  });
});
