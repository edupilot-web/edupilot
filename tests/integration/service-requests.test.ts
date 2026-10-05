import "./test-db";

import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import mongoose, { Types } from "mongoose";
import { connectDB } from "../../src/lib/db";
import { User } from "../../src/models/User";
import { StudentProfile } from "../../src/models/StudentProfile";
import { ServiceRequest, ServiceRequestEvent } from "../../src/models/ServiceRequest";
import {
  addStudentComment,
  cancelRequest,
  createRequest,
  getForStudent,
  listForStudent,
  transitionRequest,
} from "../../src/lib/service-requests/service";
import { getForAdmin, listQueue } from "../../src/lib/service-requests/admin";
import { canAdminTransition, targetDateFor } from "../../src/lib/service-requests/fields";

/**
 * The help desk.
 *
 * Most of what matters here is what one side cannot see of the other: a student
 * must never read another student's request, and must never read an internal
 * note on their own.
 */

let studentA: Types.ObjectId;
let studentB: Types.ObjectId;
let collegeId: Types.ObjectId;

const ADMIN = { id: String(new Types.ObjectId()), name: "Desk Clerk", collegeId: null as string | null };

before(async () => {
  await connectDB();
  collegeId = new Types.ObjectId();

  for (const key of ["a", "b"] as const) {
    const user = await User.create({
      name: `Student ${key.toUpperCase()}`,
      email: `sr-${key}-${Date.now()}@test.local`,
      passwordHash: "x".repeat(60),
      role: "student",
      emailVerified: true,
    });

    await StudentProfile.create({
      userId: user._id,
      collegeId,
      collegeName: "Test College",
      degree: "B.Tech",
      specialization: "CSE",
      graduationYear: 2028,
      studyStatus: "studying",
    });

    if (key === "a") studentA = user._id;
    else studentB = user._id;
  }

  await ServiceRequest.createIndexes();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(async () => {
  await ServiceRequest.deleteMany({});
  await ServiceRequestEvent.deleteMany({});
});

async function raise(studentId: Types.ObjectId, subject = "I cannot sign in") {
  const result = await createRequest({
    studentId: String(studentId),
    category: "account",
    type: "cannot_sign_in",
    subject,
    description: "It says my password is wrong but I am sure it is right. Tried twice.",
  });
  assert.equal(result.ok, true);
  return result as { ok: true; id: string; ticket: string };
}

describe("raising a request", () => {
  it("issues a human ticket", async () => {
    const created = await raise(studentA);
    // Quoted at a counter, so it has to be readable aloud.
    assert.match(created.ticket, /^SR-\d{4}-\d{5}$/);
  });

  it("never issues the same ticket twice, even concurrently", async () => {
    // Two students submitting in the same instant would collide on the unique
    // index if the sequence were a count rather than an atomic increment.
    const results = await Promise.all([
      raise(studentA, "One"),
      raise(studentA, "Two"),
      raise(studentB, "Three"),
      raise(studentB, "Four"),
    ]);

    const tickets = new Set(results.map((r) => r.ticket));
    assert.equal(tickets.size, 4);
  });

  it("takes the college from the profile, not the caller", async () => {
    const created = await raise(studentA);
    const row = await ServiceRequest.findById(created.id).lean();
    assert.equal(String(row!.collegeId), String(collegeId));
  });

  it("sets a target date from the category", async () => {
    const created = await raise(studentA);
    const row = await ServiceRequest.findById(created.id).lean();
    assert.ok(row!.targetAt, "a target was set");
    // Documents are a five-working-day category.
    assert.ok(row!.targetAt!.getTime() > Date.now());
  });

  it("refuses a type that does not belong to the category", async () => {
    const result = await createRequest({
      studentId: String(studentA),
      category: "account",
      type: "wrong_answer",
      subject: "Wrong type",
      description: "That type belongs to the AI Tutor category, not to account.",
    });

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.code, "invalid-type");
  });

  it("caps how many a student may have open at once", async () => {
    for (let index = 0; index < 10; index += 1) {
      await raise(studentA, `Request ${index}`);
    }

    const overflow = await createRequest({
      studentId: String(studentA),
      category: "technical",
      type: "wont_load",
      subject: "One too many",
      description: "This should be refused because ten are already open.",
    });

    assert.equal(!overflow.ok && overflow.code, "too-many-open");
  });

  it("frees a slot as soon as one is closed", async () => {
    // The cap is on *open* requests, so closing one should let the next through
    // immediately — a per-day-only limit would not.
    const first = await raise(studentA, "First");
    for (let index = 0; index < 9; index += 1) await raise(studentA, `Filler ${index}`);

    await cancelRequest(String(studentA), first.id);

    const after = await createRequest({
      studentId: String(studentA),
      category: "technical",
      type: "wont_load",
      subject: "Now there is room",
      description: "This should be accepted now that one has been cancelled.",
    });
    assert.equal(after.ok, true);
  });
});

describe("what a student may see", () => {
  it("cannot read another student's request", async () => {
    const created = await raise(studentA);

    // Not a 403 — the same answer as a request that does not exist, so an id
    // cannot be probed to learn what anyone else has asked for.
    assert.equal(await getForStudent(String(studentB), created.id), null);
  });

  it("never sees an internal note on their own request", async () => {
    const created = await raise(studentA);

    await transitionRequest({
      requestId: created.id,
      admin: ADMIN,
      comment: "Engineering are looking at the auth logs.",
      internal: true,
    });
    await transitionRequest({
      requestId: created.id,
      admin: ADMIN,
      to: "in_progress",
      comment: "We are working on this.",
    });

    const detail = await getForStudent(String(studentA), created.id);
    const bodies = detail!.timeline.map((entry) => entry.body).join(" | ");

    assert.ok(!bodies.includes("auth logs"), "the internal note is not there");
    assert.ok(bodies.includes("We are working on this"), "the visible reply is");
  });

  it("is never shown which clerk acted", async () => {
    // A student does not need to know which clerk declined their request, and
    // naming them is how one person becomes the target of a complaint about a
    // decision the institution made.
    const created = await raise(studentA);
    await transitionRequest({
      requestId: created.id,
      admin: ADMIN,
      to: "in_review",
      comment: "Picked this up.",
    });

    const detail = await getForStudent(String(studentA), created.id);
    const staffEntries = detail!.timeline.filter((entry) => entry.actorKind === "staff");

    assert.ok(staffEntries.length > 0);
    for (const entry of staffEntries) {
      assert.notEqual(entry.actorName, ADMIN.name);
    }
  });

  it("lists only their own", async () => {
    await raise(studentA, "Mine");
    await raise(studentB, "Theirs");

    const list = await listForStudent(String(studentA));
    assert.equal(list.cards.length, 1);
    assert.equal(list.cards[0].subject, "Mine");
  });
});

describe("moving a request through the desk", () => {
  it("refuses a transition the table does not allow", async () => {
    const created = await raise(studentA);
    await transitionRequest({ requestId: created.id, admin: ADMIN, to: "resolved", resolution: "Done." });

    // Terminal means terminal.
    assert.equal(canAdminTransition("resolved", "in_progress"), false);
    const result = await transitionRequest({
      requestId: created.id,
      admin: ADMIN,
      to: "in_progress",
    });
    assert.equal(!result.ok && result.code, "bad-transition");
  });

  it("will not decline without a reason", async () => {
    // A declined request with no reason is the most common cause of a student
    // coming back to ask the same question at a counter.
    const created = await raise(studentA);
    const result = await transitionRequest({
      requestId: created.id,
      admin: ADMIN,
      to: "rejected",
    });

    assert.equal(!result.ok && result.code, "reason-required");
    const row = await ServiceRequest.findById(created.id).lean();
    assert.equal(row!.status, "submitted", "nothing moved");
  });

  it("shows the reason to the student when it does decline", async () => {
    const created = await raise(studentA);
    await transitionRequest({
      requestId: created.id,
      admin: ADMIN,
      to: "rejected",
      resolution: "Your account was locked after five failed attempts. It is unlocked now.",
    });

    const detail = await getForStudent(String(studentA), created.id);
    assert.equal(detail!.status, "rejected");
    assert.match(detail!.resolution ?? "", /unlocked/);
  });

  it("moves itself off 'waiting on you' when the student replies", async () => {
    const created = await raise(studentA);
    await transitionRequest({
      requestId: created.id,
      admin: ADMIN,
      to: "awaiting_student",
      comment: "Which email address are you using?",
    });

    await addStudentComment({
      studentId: String(studentA),
      requestId: created.id,
      body: "The one ending in @test.local.",
    });

    const row = await ServiceRequest.findById(created.id).lean();
    // Otherwise it sits in a state saying the ball is with the student when it
    // is not, until somebody notices and changes it by hand.
    assert.equal(row!.status, "in_progress");
  });

  it("does not raise the student's unread count for an internal note", async () => {
    const created = await raise(studentA);
    await transitionRequest({
      requestId: created.id,
      admin: ADMIN,
      comment: "Chased engineering.",
      internal: true,
    });

    const row = await ServiceRequest.findById(created.id).lean();
    assert.equal(row!.unreadForStudent, 0);
  });
});

describe("cancelling", () => {
  it("lets a student withdraw an open request", async () => {
    const created = await raise(studentA);
    const result = await cancelRequest(String(studentA), created.id);

    assert.equal(result.ok, true);
    const row = await ServiceRequest.findById(created.id).lean();
    assert.equal(row!.status, "cancelled");
  });

  it("cannot cancel somebody else's", async () => {
    const created = await raise(studentA);
    const result = await cancelRequest(String(studentB), created.id);

    assert.equal(!result.ok && result.code, "not-found");
    const row = await ServiceRequest.findById(created.id).lean();
    assert.equal(row!.status, "submitted");
  });

  it("cannot overwrite a resolution by racing it", async () => {
    // The status is part of the filter, so "is it open" and "close it" are one
    // atomic operation.
    const created = await raise(studentA);
    await transitionRequest({
      requestId: created.id,
      admin: ADMIN,
      to: "resolved",
      resolution: "Unlocked.",
    });

    const result = await cancelRequest(String(studentA), created.id);
    assert.equal(!result.ok && result.code, "closed");

    const row = await ServiceRequest.findById(created.id).lean();
    assert.equal(row!.status, "resolved", "the resolution stands");
  });

  it("refuses a comment on a closed request", async () => {
    const created = await raise(studentA);
    await cancelRequest(String(studentA), created.id);

    const result = await addStudentComment({
      studentId: String(studentA),
      requestId: created.id,
      body: "Actually, I got back in.",
    });
    assert.equal(!result.ok && result.code, "closed");
  });
});

describe("the desk's queue", () => {
  it("scopes to the administrator's college when they have one", async () => {
    await raise(studentA, "In scope");

    const elsewhere = { id: ADMIN.id, collegeId: String(new Types.ObjectId()) };
    const foreign = await listQueue(elsewhere, { filter: "all" });
    assert.equal(foreign.rows.length, 0, "another college's desk sees nothing");

    const own = await listQueue({ id: ADMIN.id, collegeId: String(collegeId) }, { filter: "all" });
    assert.equal(own.rows.length, 1);
  });

  it("returns nothing for a request outside the scope", async () => {
    const created = await raise(studentA);
    const elsewhere = { id: ADMIN.id, collegeId: String(new Types.ObjectId()) };

    assert.equal(await getForAdmin(elsewhere, created.id), null);
  });

  it("shows internal notes to the desk", async () => {
    const created = await raise(studentA);
    await transitionRequest({
      requestId: created.id,
      admin: ADMIN,
      comment: "Engineering are looking at the auth logs.",
      internal: true,
    });

    const detail = await getForAdmin({ id: ADMIN.id, collegeId: null }, created.id);
    assert.ok(detail!.timeline.some((entry) => entry.internal));
  });

  it("offers only the transitions the server would accept", async () => {
    const created = await raise(studentA);
    const detail = await getForAdmin({ id: ADMIN.id, collegeId: null }, created.id);

    for (const option of detail!.nextStatuses) {
      assert.equal(canAdminTransition("submitted", option.key), true);
    }
    // Only the student cancels.
    assert.ok(!detail!.nextStatuses.some((option) => option.key === "cancelled"));
  });
});

describe("target dates", () => {
  it("lands on a working day", () => {
    // A request raised on Friday for a one-day target is due Monday, because
    // nobody is at the desk on Saturday.
    const friday = new Date("2026-10-02T10:00:00Z");
    const due = targetDateFor("account", friday);

    assert.notEqual(due.getDay(), 0, "not a Sunday");
    assert.notEqual(due.getDay(), 6, "not a Saturday");
  });
});
