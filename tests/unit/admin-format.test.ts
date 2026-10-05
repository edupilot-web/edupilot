import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatRelative, formatUntil } from "../../src/lib/admin/format";

/**
 * `formatUntil`, the future-tense sibling of `formatRelative`.
 *
 * Every date the admin UI rendered was in the past until teacher invitations,
 * whose interesting date is a deadline. Put through `formatRelative`, a live
 * invitation reads "-14 days ago" — which is not merely ugly, it says the
 * opposite of the truth about whether the link still works.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function inFuture(ms: number): Date {
  return new Date(Date.now() + ms);
}

describe("formatUntil", () => {
  it("counts forwards", () => {
    assert.equal(formatUntil(inFuture(30 * 1000)), "in under a minute");
    assert.equal(formatUntil(inFuture(20 * MINUTE)), "in 20 minutes");
    assert.equal(formatUntil(inFuture(5 * HOUR)), "in 5 hours");
    assert.equal(formatUntil(inFuture(14 * DAY)), "in 14 days");
  });

  it("says tomorrow rather than 'in 1 days'", () => {
    assert.equal(formatUntil(inFuture(DAY)), "tomorrow");
    assert.equal(formatUntil(inFuture(HOUR)), "in 1 hour");
  });

  /** The bug this function exists to prevent. */
  it("never renders a negative duration", () => {
    for (const ms of [30 * 1000, MINUTE, HOUR, DAY, 13 * DAY, 400 * DAY]) {
      const out = formatUntil(inFuture(ms));
      assert.ok(!out.includes("-"), `"${out}" should not contain a minus sign`);
      assert.ok(!out.includes("ago"), `"${out}" should not be past tense`);
    }
  });

  it("hands a date that has passed back to formatRelative", () => {
    // A deadline behind us is an ordinary past date, and "in -1 days" would be
    // the same bug the other way round.
    const past = new Date(Date.now() - 3 * DAY);
    assert.equal(formatUntil(past), formatRelative(past));
    assert.match(formatUntil(past), /ago$/);
  });

  it("falls back to an absolute date far out", () => {
    // Beyond a month "in 73 days" stops being useful and a real date is better.
    const out = formatUntil(inFuture(90 * DAY));
    assert.ok(!out.startsWith("in "), `"${out}" should be an absolute date`);
  });

  it("matches formatRelative on nothing and on nonsense", () => {
    for (const value of [null, undefined, "", "not a date"]) {
      assert.equal(formatUntil(value), "—");
      assert.equal(formatRelative(value), "—");
    }
  });

  it("accepts an ISO string, which is what a row carries", () => {
    // `listInvites` serialises its dates, so the page never holds a `Date`.
    assert.equal(formatUntil(inFuture(3 * DAY).toISOString()), "in 3 days");
  });
});
