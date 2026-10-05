import "./test-db";

import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { connectDB } from "../../src/lib/db";
import { User } from "../../src/models/User";
import { PasswordResetToken } from "../../src/models/PasswordResetToken";
import { RateLimit } from "../../src/models/RateLimit";
import {
  checkResetToken,
  consumeReset,
  requestReset,
  sessionIsFresh,
} from "../../src/lib/password-reset";

/**
 * Password reset — the one flow that hands over an account.
 *
 * Most of what is tested here is what the flow refuses to do: reveal whether an
 * address exists, honour a link twice, or leave an intruder's session working
 * after the password they stole has been changed.
 */

const EMAIL = "reset-target@test.local";
const GOOGLE_EMAIL = "reset-google@test.local";
const OLD_PASSWORD = "OldPassword#1";

/** The token as it is stored, so tests can find a row without the raw value. */
function hashed(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Pull the raw token out of the row the service just wrote.
 *
 * The service returns nothing — by design, since the token exists only for as
 * long as it takes to render an email. Tests therefore mint their own and write
 * the hash, which exercises every path after issuance.
 */
async function issueFor(userId: mongoose.Types.ObjectId, email: string, token: string, options: { expiresAt?: Date; usedAt?: Date | null } = {}) {
  await PasswordResetToken.deleteMany({ userId });
  await PasswordResetToken.create({
    userId,
    tokenHash: hashed(token),
    sentTo: email,
    expiresAt: options.expiresAt ?? new Date(Date.now() + 60 * 60_000),
    usedAt: options.usedAt ?? null,
  });
}

let userId: mongoose.Types.ObjectId;

before(async () => {
  await connectDB();
  process.env.EMAIL_TRANSPORT = "console";

  await User.deleteMany({ email: { $in: [EMAIL, GOOGLE_EMAIL] } });

  const user = await User.create({
    name: "Reset Target",
    email: EMAIL,
    passwordHash: await bcrypt.hash(OLD_PASSWORD, 10),
    role: "student",
    emailVerified: false,
  });
  userId = user._id;

  await User.create({
    name: "Google Person",
    email: GOOGLE_EMAIL,
    googleId: "google-subject-123",
    authProvider: "google",
    role: "student",
    emailVerified: true,
  });

  await PasswordResetToken.createIndexes();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(async () => {
  await PasswordResetToken.deleteMany({});
  /**
   * The limiter is keyed on the **address**, not on a resolved user, so that an
   * address with no account is limited exactly like one with an account. That
   * makes it shared state between tests that all use one address, so it is
   * cleared here rather than worked around with a different email per case.
   */
  await RateLimit.deleteMany({});
  await User.updateOne({ _id: userId }, { $set: { sessionsValidFrom: null, email: EMAIL } });
});

describe("requesting a reset", () => {
  it("says the same thing for an address with no account", async () => {
    // The whole point: this form must not be usable to discover whether an
    // address belongs to a student.
    const real = await requestReset(EMAIL);
    // Different addresses, so the per-address cooldown does not confuse the two.
    const absent = await requestReset(`nobody-${Date.now()}@test.local`);

    assert.equal(real.ok, true);
    assert.equal(absent.ok, true);
    assert.deepEqual(real, absent);
  });

  it("writes a token for a real account and none for an absent one", async () => {
    await requestReset(EMAIL);
    assert.equal(await PasswordResetToken.countDocuments({ userId }), 1);

    const before = await PasswordResetToken.countDocuments({});
    await requestReset(`nobody-${Date.now()}@test.local`);
    assert.equal(await PasswordResetToken.countDocuments({}), before);
  });

  it("never stores the token in a usable form", async () => {
    await requestReset(EMAIL);
    const row = await PasswordResetToken.findOne({ userId }).lean();

    // 64 hex characters is a SHA-256 digest, not a 64-byte token.
    assert.match(row!.tokenHash, /^[0-9a-f]{64}$/);
  });

  it("writes no token for a Google account", async () => {
    // It has no password to reset. The mail explains that to the mailbox owner;
    // the requester still learns nothing.
    const result = await requestReset(GOOGLE_EMAIL);
    assert.equal(result.ok, true);

    const google = await User.findOne({ email: GOOGLE_EMAIL }).lean();
    assert.equal(await PasswordResetToken.countDocuments({ userId: google!._id }), 0);
  });

  it("replaces an outstanding link rather than adding a second", async () => {
    // Two live links is two chances for an old mail to be found and used.
    await issueFor(userId, EMAIL, "a".repeat(64));
    await requestReset(EMAIL);

    assert.equal(await PasswordResetToken.countDocuments({ userId }), 1);
    assert.equal(await PasswordResetToken.countDocuments({ tokenHash: hashed("a".repeat(64)) }), 0);
  });
});

describe("checking a link", () => {
  it("accepts a live one", async () => {
    await issueFor(userId, EMAIL, "b".repeat(64));
    const check = await checkResetToken("b".repeat(64));

    assert.equal(check.ok, true);
    assert.equal(check.ok && check.email, EMAIL);
  });

  it("rejects one that does not exist", async () => {
    const check = await checkResetToken("c".repeat(64));
    assert.equal(check.ok, false);
    assert.equal(!check.ok && check.reason, "invalid");
  });

  it("rejects an expired one", async () => {
    await issueFor(userId, EMAIL, "d".repeat(64), { expiresAt: new Date(Date.now() - 1000) });
    const check = await checkResetToken("d".repeat(64));
    assert.equal(!check.ok && check.reason, "expired");
  });

  it("rejects a spent one", async () => {
    await issueFor(userId, EMAIL, "e".repeat(64), { usedAt: new Date() });
    const check = await checkResetToken("e".repeat(64));
    // Distinct from "invalid": somebody who just reset in another tab needs to
    // know it worked, not that something is broken.
    assert.equal(!check.ok && check.reason, "used");
  });

  it("rejects one sent to an address the account no longer uses", async () => {
    // The link proves control of *that* mailbox. If the account has moved on,
    // so has the authority the link represents.
    await issueFor(userId, EMAIL, "f".repeat(64));
    await User.updateOne({ _id: userId }, { $set: { email: "moved@test.local" } });

    const check = await checkResetToken("f".repeat(64));
    assert.equal(!check.ok && check.reason, "email-changed");
  });
});

describe("completing a reset", () => {
  it("sets the new password", async () => {
    await issueFor(userId, EMAIL, "g".repeat(64));
    const result = await consumeReset("g".repeat(64), "BrandNew#Password1");
    assert.equal(result.ok, true);

    const user = await User.findById(userId).select("+passwordHash").lean();
    assert.equal(await bcrypt.compare("BrandNew#Password1", user!.passwordHash!), true);
    assert.equal(await bcrypt.compare(OLD_PASSWORD, user!.passwordHash!), false);
  });

  it("spends the link", async () => {
    await issueFor(userId, EMAIL, "h".repeat(64));
    await consumeReset("h".repeat(64), "BrandNew#Password1");

    const again = await consumeReset("h".repeat(64), "Another#Password1");
    assert.equal(again.ok, false);
    assert.equal(!again.ok && again.reason, "used");
  });

  /**
   * The race a doubled submit creates.
   *
   * Claiming the token is a conditional update with `usedAt: null` in the
   * filter, so "is it unused" and "mark it used" are one atomic operation.
   */
  it("honours one link once under concurrency", async () => {
    await issueFor(userId, EMAIL, "i".repeat(64));

    const results = await Promise.all([
      consumeReset("i".repeat(64), "First#Password1"),
      consumeReset("i".repeat(64), "Second#Password1"),
      consumeReset("i".repeat(64), "Third#Password1"),
    ]);

    assert.equal(results.filter((r) => r.ok).length, 1, "exactly one succeeded");
  });

  it("revokes every existing session", async () => {
    // The reason most people reset: they believe somebody else is in there.
    const before = Math.floor(Date.now() / 1000) - 60;

    await issueFor(userId, EMAIL, "j".repeat(64));
    await consumeReset("j".repeat(64), "BrandNew#Password1");

    const user = await User.findById(userId).lean();
    assert.ok(user!.sessionsValidFrom, "a revocation mark was written");
    assert.equal(sessionIsFresh(before, user!.sessionsValidFrom), false);
  });

  it("marks the address verified", async () => {
    // A reset proves mailbox control, which is what verification proves.
    // Asking twice would be asking for something already demonstrated.
    await issueFor(userId, EMAIL, "k".repeat(64));
    await consumeReset("k".repeat(64), "BrandNew#Password1");

    const user = await User.findById(userId).lean();
    assert.equal(user!.emailVerified, true);
  });

  it("refuses a password under 8 characters", async () => {
    await issueFor(userId, EMAIL, "l".repeat(64));
    const result = await consumeReset("l".repeat(64), "short");

    assert.equal(!result.ok && result.reason, "weak");
    // And the link is still good, so the student can try again.
    const check = await checkResetToken("l".repeat(64));
    assert.equal(check.ok, true);
  });

  it("does not spend the link when the token is bad", async () => {
    await issueFor(userId, EMAIL, "m".repeat(64));
    await consumeReset("n".repeat(64), "BrandNew#Password1");

    const check = await checkResetToken("m".repeat(64));
    assert.equal(check.ok, true, "an unrelated failure left this link alone");
  });
});

describe("session freshness", () => {
  it("honours everything when nothing has been revoked", () => {
    assert.equal(sessionIsFresh(1000, null), true);
    assert.equal(sessionIsFresh(undefined, null), true);
  });

  it("refuses a session older than the mark", () => {
    const mark = new Date();
    const issued = Math.floor((mark.getTime() - 60_000) / 1000);
    assert.equal(sessionIsFresh(issued, mark), false);
  });

  it("honours a session issued after the mark", () => {
    const mark = new Date();
    const issued = Math.floor((mark.getTime() + 60_000) / 1000);
    assert.equal(sessionIsFresh(issued, mark), true);
  });

  it("absorbs the rounding in a whole-second iat", () => {
    // `iat` is whole seconds, so a session minted in the same second as a reset
    // would otherwise be refused by a few hundred milliseconds.
    const mark = new Date();
    const issued = Math.floor(mark.getTime() / 1000);
    assert.equal(sessionIsFresh(issued, mark), true);
  });

  it("refuses a token with no iat once anything has been revoked", () => {
    // Fails closed: a token that cannot prove when it was minted cannot prove
    // it was minted after the revocation.
    assert.equal(sessionIsFresh(undefined, new Date()), false);
  });
});
