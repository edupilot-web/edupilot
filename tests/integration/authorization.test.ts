import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mongoose, { Types } from "mongoose";

/**
 * Must be the first import that reaches mongoose: it redirects the whole
 * process at a throwaway database. Everything below is imported after it, so
 * `connectDB` reads the overridden name.
 */
import { TEST_DB } from "./test-db";

import { connectDB } from "../../src/lib/db";
import { CurriculumSubject, Regulation } from "../../src/models/Curriculum";
import { StudentProfile } from "../../src/models/StudentProfile";
import { Topic, TopicContent } from "../../src/models/Topic";
import { AiConversation, AiInteraction } from "../../src/models/Tutor";
import { getSubjectTopics, getTopicView } from "../../src/lib/learning/topics";
import { buildTutorContext } from "../../src/lib/tutor/context";
import { getConversation, getInteraction, historyForTopic } from "../../src/lib/tutor/history";
import { authorizeTopic } from "../../src/lib/learning/progress";

/**
 * The three tests §74 calls critical, plus the ones that fall out of them.
 *
 *   - Student A must not reach Student B's AI history.
 *   - A student at College A must not reach College B's curriculum.
 *   - An R23 student must not see R20's subject mapping.
 *
 * Written against the real functions and a real database, not against mocks.
 * A mocked authorisation test asserts that the mock was called; these assert
 * that a query written with the wrong filter would actually return the wrong
 * row — which is the only version of this test that could ever fail usefully.
 *
 * **It runs against its own database** (see `test-db.ts`), which is dropped
 * before and after. Pointing this at a real deployment would create colleges
 * called "Test College" in the directory students pick from.
 *
 * Run with:  npm run test:integration
 */

// ── Fixtures ──────────────────────────────────────────────────────────────

const id = () => new Types.ObjectId();

const collegeA = id();
const collegeB = id();
const programA = id();
const programB = id();
const branchA = id();
const branchB = id();

const studentA = id();
const studentB = id();
const studentR20 = id();

let regulationR23: Types.ObjectId;
let regulationR20: Types.ObjectId;

let subjectA: Types.ObjectId;
let subjectB: Types.ObjectId;
let subjectR20: Types.ObjectId;

let topicA: Types.ObjectId;
let topicB: Types.ObjectId;
let topicR20: Types.ObjectId;

let conversationA: Types.ObjectId;
let interactionA: Types.ObjectId;

before(async () => {
  await connectDB();

  // Guard rail. If the override above ever stops working, this stops the suite
  // before it writes fixtures into somebody's real data.
  assert.equal(
    mongoose.connection.name,
    TEST_DB,
    `refusing to run: connected to "${mongoose.connection.name}" instead of "${TEST_DB}"`
  );

  await mongoose.connection.dropDatabase();

  const r23 = await Regulation.create({
    collegeId: collegeA,
    code: "R23",
    name: "R23 Regulations",
    effectiveFromYear: 2023,
  });
  const r20 = await Regulation.create({
    collegeId: collegeA,
    code: "R20",
    name: "R20 Regulations",
    effectiveFromYear: 2020,
  });
  const rB = await Regulation.create({
    collegeId: collegeB,
    code: "R23",
    name: "R23 Regulations",
    effectiveFromYear: 2023,
  });

  regulationR23 = r23._id;
  regulationR20 = r20._id;

  const makeSubject = async (input: {
    collegeId: Types.ObjectId;
    programId: Types.ObjectId;
    branchId: Types.ObjectId;
    regulationId: Types.ObjectId;
    name: string;
    code: string;
  }) => {
    const subject = await CurriculumSubject.create({
      ...input,
      year: 2,
      semester: 3,
      units: [{ unitNumber: 1, title: "Unit One", topics: ["Alpha", "Beta"] }],
    });
    return subject._id;
  };

  subjectA = await makeSubject({
    collegeId: collegeA,
    programId: programA,
    branchId: branchA,
    regulationId: regulationR23,
    name: "Data Structures",
    code: "CS201",
  });

  subjectB = await makeSubject({
    collegeId: collegeB,
    programId: programB,
    branchId: branchB,
    regulationId: rB._id,
    name: "Data Structures and Algorithms",
    code: "CSB201",
  });

  subjectR20 = await makeSubject({
    collegeId: collegeA,
    programId: programA,
    branchId: branchA,
    regulationId: regulationR20,
    name: "Data Structures through C++",
    code: "CS201X",
  });

  const makeTopic = async (subjectId: Types.ObjectId, title: string, slug: string) => {
    const topic = await Topic.create({
      subjectId,
      title,
      slug,
      sequence: 1,
      unitNumber: 1,
      unitTitle: "Unit One",
      status: "published",
    });
    return topic._id;
  };

  topicA = await makeTopic(subjectA, "Linked Lists", "linked-lists");
  topicB = await makeTopic(subjectB, "Linked Lists", "linked-lists");
  topicR20 = await makeTopic(subjectR20, "Linked Lists in C++", "linked-lists-in-c");

  await TopicContent.create({
    topicId: topicA,
    subjectId: subjectA,
    basicExplanation: "A chain of nodes.",
    keyPoints: ["One"],
    status: "published",
    origin: "authored",
    approvedAt: new Date(),
    publishedAt: new Date(),
  });

  const profile = (userId: Types.ObjectId, overrides: Record<string, unknown>) =>
    StudentProfile.create({
      userId,
      collegeName: "Test College",
      degree: "B.Tech",
      specialization: "CSE",
      graduationYear: 2027,
      currentYear: 2,
      currentSemester: 3,
      ...overrides,
    });

  await profile(studentA, {
    collegeId: collegeA,
    programId: programA,
    branchId: branchA,
    regulationId: regulationR23,
  });
  await profile(studentB, {
    collegeId: collegeB,
    programId: programB,
    branchId: branchB,
    regulationId: rB._id,
  });
  await profile(studentR20, {
    collegeId: collegeA,
    programId: programA,
    branchId: branchA,
    regulationId: regulationR20,
  });

  const conversation = await AiConversation.create({
    userId: studentA,
    subjectId: subjectA,
    topicId: topicA,
    title: "What is a linked list?",
    messageCount: 1,
  });
  conversationA = conversation._id;

  const interaction = await AiInteraction.create({
    userId: studentA,
    conversationId: conversationA,
    subjectId: subjectA,
    topicId: topicA,
    sequence: 1,
    question: "What is a linked list?",
    answer: { title: "Linked lists", summary: "A chain of nodes.", explanation: "..." },
    status: "ok",
  });
  interactionA = interaction._id;
});

after(async () => {
  if (mongoose.connection.name === TEST_DB) {
    await mongoose.connection.dropDatabase();
  }
  await mongoose.connection.close();
});

// ── §74: one student's AI history is not another's ────────────────────────

describe("a student cannot reach another student's AI history", () => {
  it("returns the conversation to its owner", async () => {
    const own = await getConversation(String(studentA), String(conversationA));
    assert.ok(own);
    assert.equal(own.interactions.length, 1);
  });

  it("returns nothing to anyone else, given the exact id", async () => {
    const stolen = await getConversation(String(studentB), String(conversationA));
    assert.equal(stolen, null);
  });

  it("returns nothing for another student's interaction", async () => {
    assert.ok(await getInteraction(String(studentA), String(interactionA)));
    assert.equal(await getInteraction(String(studentB), String(interactionA)), null);
  });

  it("keeps another student's questions out of the per-topic history", async () => {
    const own = await historyForTopic(String(studentA), String(topicA));
    assert.equal(own.length, 1);

    // Student B is handed a topic id that genuinely has history — just not
    // theirs. The filter is on the user, so the list is empty.
    const other = await historyForTopic(String(studentB), String(topicA));
    assert.equal(other.length, 0);
  });

  /**
   * The subtler leak, and the one a `userId` filter on the *interaction* alone
   * would miss: passing someone else's `conversationId` into a new question
   * would pull their previous turns into this student's prompt. The context
   * builder verifies the conversation against both the user and the topic.
   */
  it("refuses another student's conversation id when building a prompt", async () => {
    const result = await buildTutorContext({
      userId: String(studentB),
      topicId: String(topicB),
      conversationId: String(conversationA),
      depthLevel: "basic",
    });

    assert.ok(!result.ok);
    assert.equal(result.code, "conversation-not-found");
  });
});

// ── §74: one college's curriculum is not another's ────────────────────────

describe("a student cannot reach another college's curriculum", () => {
  it("shows a student their own subject's topics", async () => {
    const own = await getSubjectTopics(String(studentA), String(subjectA));
    assert.ok(own);
    assert.equal(own.topics.length, 1);
  });

  it("returns null for another college's subject", async () => {
    assert.equal(await getSubjectTopics(String(studentA), String(subjectB)), null);
  });

  it("returns null for another college's topic", async () => {
    assert.ok(await getTopicView(String(studentA), String(topicA)));
    assert.equal(await getTopicView(String(studentA), String(topicB)), null);
  });

  /**
   * The answer for a foreign topic and for a topic that does not exist must be
   * *identical*. A different response for each would let anyone enumerate
   * which topic ids are real, and therefore what another college teaches.
   */
  it("answers a foreign id and a nonexistent id identically", async () => {
    const foreign = await getTopicView(String(studentA), String(topicB));
    const missing = await getTopicView(String(studentA), String(new Types.ObjectId()));
    const malformed = await getTopicView(String(studentA), "not-an-object-id");

    assert.equal(foreign, null);
    assert.equal(missing, null);
    assert.equal(malformed, null);
  });

  it("refuses to build a tutor context for another college's topic", async () => {
    const result = await buildTutorContext({
      userId: String(studentA),
      topicId: String(topicB),
      depthLevel: "basic",
    });

    assert.ok(!result.ok);
    assert.equal(result.code, "topic-not-found");
  });

  it("refuses to record progress against another college's topic", async () => {
    // Without this the progress endpoint would file a row against a topic the
    // student cannot see, and inflate another college's engagement numbers.
    assert.ok(await authorizeTopic(String(studentA), String(topicA)));
    assert.equal(await authorizeTopic(String(studentA), String(topicB)), null);
  });
});

// ── §74: regulations do not leak into each other ──────────────────────────

describe("a regulation's curriculum is its own", () => {
  it("gives the R23 student the R23 subject", async () => {
    assert.ok(await getSubjectTopics(String(studentA), String(subjectA)));
  });

  /**
   * Same college, same programme, same branch, same semester — only the
   * regulation differs. This is the case a filter missing `regulationId` would
   * pass, and it is why the coordinate is in the query rather than checked
   * afterwards.
   */
  it("hides the R20 subject from the R23 student", async () => {
    assert.equal(await getSubjectTopics(String(studentA), String(subjectR20)), null);
    assert.equal(await getTopicView(String(studentA), String(topicR20)), null);
  });

  it("hides the R23 subject from the R20 student", async () => {
    assert.equal(await getSubjectTopics(String(studentR20), String(subjectA)), null);
    assert.ok(await getSubjectTopics(String(studentR20), String(subjectR20)));
  });
});

// ── The context the model is actually given ───────────────────────────────

describe("the tutor context", () => {
  it("is built from the database, not from anything a caller supplied", async () => {
    const result = await buildTutorContext({
      userId: String(studentA),
      topicId: String(topicA),
      depthLevel: "basic",
    });

    assert.ok(result.ok);
    assert.equal(result.context.subject.code, "CS201");
    assert.equal(result.context.student.regulationCode, "R23");
    assert.equal(result.context.topic.title, "Linked Lists");
    // The syllabus unit travels with it — that is the grounding.
    assert.deepEqual(result.context.subject.unit?.topics, ["Alpha", "Beta"]);
  });

  it("carries no conversation history when there is no conversation", async () => {
    const result = await buildTutorContext({
      userId: String(studentA),
      topicId: String(topicA),
      depthLevel: "basic",
    });

    assert.ok(result.ok);
    assert.equal(result.context.recentTurns.length, 0);
    assert.equal(result.context.conversationSummary, null);
  });

  it("refuses a student with no academic coordinate", async () => {
    const orphan = id();
    await StudentProfile.create({
      userId: orphan,
      collegeName: "Uncatalogued College",
      degree: "B.Tech",
      specialization: "CSE",
      graduationYear: 2028,
    });

    const result = await buildTutorContext({
      userId: String(orphan),
      topicId: String(topicA),
      depthLevel: "basic",
    });

    assert.ok(!result.ok);
    assert.equal(result.code, "incomplete-profile");
  });

  it("refuses a student with no profile at all", async () => {
    const result = await buildTutorContext({
      userId: String(id()),
      topicId: String(topicA),
      depthLevel: "basic",
    });

    assert.ok(!result.ok);
    assert.equal(result.code, "no-profile");
  });
});

// ── Prepared content is only shown when it is published ───────────────────

describe("prepared content visibility", () => {
  it("shows published content", async () => {
    const view = await getTopicView(String(studentA), String(topicA));
    assert.ok(view?.content);
    assert.equal(view.content.basicExplanation, "A chain of nodes.");
  });

  /**
   * The whole review workflow depends on this one filter. A draft reaching a
   * student is generated text nobody has read, presented as their college's
   * study material.
   */
  it("hides a draft", async () => {
    await TopicContent.updateOne({ topicId: topicA }, { $set: { status: "ai-draft" } });

    const view = await getTopicView(String(studentA), String(topicA));
    assert.equal(view?.content, null);

    await TopicContent.updateOne({ topicId: topicA }, { $set: { status: "published" } });
  });

  it("hides content awaiting approval", async () => {
    await TopicContent.updateOne({ topicId: topicA }, { $set: { status: "editor-review" } });
    assert.equal((await getTopicView(String(studentA), String(topicA)))?.content, null);

    await TopicContent.updateOne({ topicId: topicA }, { $set: { status: "approved" } });
    assert.equal((await getTopicView(String(studentA), String(topicA)))?.content, null);

    await TopicContent.updateOne({ topicId: topicA }, { $set: { status: "published" } });
  });
});
