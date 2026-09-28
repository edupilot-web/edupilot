import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TUTOR_ANSWER_JSON_SCHEMA,
  fallbackAnswer,
  parseTutorAnswer,
  tutorAnswerSchema,
} from "../../src/lib/tutor/schema";
import { topicSlug, canonicalTopicKey, difficultyForUnit } from "../../src/lib/learning/topic-identity";

/**
 * What the tutor accepts from a model, and what it refuses (§64).
 *
 * The refusals matter more than the acceptances. A response missing its
 * explanation that parsed anyway would put a blank panel in front of a student
 * with nothing indicating anything had gone wrong — which is worse than the
 * error, because nobody would ever find out.
 */

const VALID = {
  title: "Linked Lists",
  summary: "A chain of nodes, each pointing at the next.",
  explanation: "A linked list stores a sequence as a chain of nodes...",
  practicalExample: null,
  code: null,
  codeLanguage: null,
  keyPoints: ["Insert at the front is O(1)"],
  commonMistakes: [],
  relatedConcepts: [],
  nextTopics: [],
  difficulty: "moderate",
  depthLevel: "basic",
  offTopicNote: null,
};

describe("parseTutorAnswer", () => {
  it("accepts a well-formed answer", () => {
    const result = parseTutorAnswer(VALID);
    assert.ok(result.ok);
    assert.equal(result.answer.title, "Linked Lists");
  });

  it("fills in arrays the model omitted", () => {
    // "No common mistakes worth listing" is a legitimate answer, and failing
    // the whole response over it would spend a second request to get the same
    // content back.
    const { commonMistakes, relatedConcepts, ...without } = VALID;
    void commonMistakes;
    void relatedConcepts;

    const result = parseTutorAnswer(without);
    assert.ok(result.ok);
    assert.deepEqual(result.answer.commonMistakes, []);
    assert.deepEqual(result.answer.relatedConcepts, []);
  });

  it("fills in nullables the model omitted", () => {
    const { practicalExample, code, ...without } = VALID;
    void practicalExample;
    void code;

    const result = parseTutorAnswer(without);
    assert.ok(result.ok);
    assert.equal(result.answer.practicalExample, null);
    assert.equal(result.answer.code, null);
  });

  it("maps the difficulty labels a model actually returns", () => {
    for (const [given, expected] of [
      ["medium", "moderate"],
      ["Hard", "difficult"],
      ["MODERATE", "moderate"],
    ] as const) {
      const result = parseTutorAnswer({ ...VALID, difficulty: given });
      assert.ok(result.ok, `"${given}" was rejected`);
      assert.equal(result.answer.difficulty, expected);
    }
  });

  it("refuses a response with no explanation", () => {
    const result = parseTutorAnswer({ ...VALID, explanation: "" });
    assert.ok(!result.ok);
  });

  it("refuses a response that is not an object", () => {
    for (const value of [null, "an answer", 42, []]) {
      const result = parseTutorAnswer(value);
      assert.ok(!result.ok, `${JSON.stringify(value)} was accepted`);
    }
  });

  it("refuses a depth level outside the ladder", () => {
    const result = parseTutorAnswer({ ...VALID, depthLevel: "godlike" });
    assert.ok(!result.ok);
  });

  it("drops non-strings out of an array rather than failing", () => {
    const result = parseTutorAnswer({ ...VALID, keyPoints: ["real", 42, null, "also real"] });
    assert.ok(result.ok);
    assert.deepEqual(result.answer.keyPoints, ["real", "also real"]);
  });

  it("reports which field was wrong, so a correction retry can quote it", () => {
    const result = parseTutorAnswer({ ...VALID, title: "" });
    assert.ok(!result.ok);
    assert.ok(result.issues.some((issue) => issue.startsWith("title")));
  });
});

describe("the JSON Schema hint", () => {
  /**
   * The literal JSON Schema is hand-written, so it can drift from the zod
   * object that actually enforces the shape. This is the test that stops it:
   * a field added to zod and forgotten here would leave the provider
   * unconstrained on exactly the field somebody just decided mattered.
   */
  it("declares every field the zod schema does", () => {
    const zodKeys = Object.keys(tutorAnswerSchema.shape).sort();
    const jsonKeys = Object.keys(
      TUTOR_ANSWER_JSON_SCHEMA.properties as Record<string, unknown>
    ).sort();

    assert.deepEqual(jsonKeys, zodKeys);
  });

  it("requires only fields an answer is meaningless without", () => {
    const required = TUTOR_ANSWER_JSON_SCHEMA.required as string[];
    assert.ok(required.includes("explanation"));
    assert.ok(required.includes("title"));
    // Nullable fields must NOT be required, or a model with nothing to say
    // about them has to invent something.
    assert.ok(!required.includes("code"));
    assert.ok(!required.includes("offTopicNote"));
  });
});

describe("fallbackAnswer", () => {
  it("is itself schema-valid, so the last resort cannot fail validation", () => {
    const result = parseTutorAnswer(fallbackAnswer("Linked Lists", "basic"));
    assert.ok(result.ok);
  });

  it("says nothing academic", () => {
    // A fallback that guessed at content would be the one piece of text in the
    // system reaching a student without ever being grounded on their syllabus.
    const answer = fallbackAnswer("Linked Lists", "advanced");
    assert.ok(!answer.code);
    assert.deepEqual(answer.keyPoints, []);
    assert.match(answer.explanation, /could not/i);
  });

  it("never carries the un-requestable depth level through", () => {
    assert.equal(fallbackAnswer("X", "curriculum").depthLevel, "basic");
  });
});

describe("topic identity", () => {
  it("slugifies a syllabus title", () => {
    assert.equal(
      topicSlug("Singly linked lists: insertion, deletion, traversal"),
      "singly-linked-lists-insertion-deletion-traversal"
    );
  });

  /**
   * The specific bug this guards: deleting punctuation instead of replacing it
   * fuses "array/linked" into "arraylinked", a spelling no other rendering of
   * the title produces — so the canonical key stops matching across colleges
   * and shared content silently reaches none of them.
   */
  it("turns punctuation into a separator, not into nothing", () => {
    assert.equal(topicSlug("Stack ADT and array/linked implementations"), "stack-adt-and-array-linked-implementations");
  });

  it("collapses the noise words that do not distinguish a topic", () => {
    assert.equal(canonicalTopicKey("Introduction to Pointers"), "pointers");
    assert.equal(canonicalTopicKey("Recursion and its cost"), "recursion-its-cost");
  });

  it("makes the same topic collide across colleges", () => {
    assert.equal(
      canonicalTopicKey("Introduction to Binary Search Trees"),
      canonicalTopicKey("Binary Search Trees")
    );
  });

  it("keeps different topics apart", () => {
    assert.notEqual(canonicalTopicKey("Breadth first search"), canonicalTopicKey("Depth first search"));
    assert.notEqual(canonicalTopicKey("Stacks"), canonicalTopicKey("Queues"));
  });

  it("never produces an empty key, even for a title that is all noise", () => {
    assert.ok(canonicalTopicKey("Introduction").length > 0);
    assert.ok(canonicalTopicKey("Overview of concepts").length > 0);
  });

  it("grades difficulty by position in the course", () => {
    assert.equal(difficultyForUnit(1, 5), "basic");
    assert.equal(difficultyForUnit(3, 5), "intermediate");
    assert.equal(difficultyForUnit(5, 5), "advanced");
    // A topic with no unit cannot be graded, and guessing would be worse.
    assert.equal(difficultyForUnit(null, 5), "basic");
  });
});
