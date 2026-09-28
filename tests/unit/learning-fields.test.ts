import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTO_COMPLETE_AT,
  DEPTH_LEVELS,
  EVENT_PROGRESS_SIGNAL,
  FOLLOW_UPS,
  LEARNING_EVENT_TYPES,
  PROGRESS_SIGNALS,
  PROGRESS_WEIGHTS,
  REQUESTABLE_DEPTH_LEVELS,
  deeperThan,
  followUp,
  isDepthLevel,
  isLearningEventType,
  percentageFor,
  tierForDepth,
} from "../../src/lib/learning/fields";

/**
 * The learning vocabulary's invariants.
 *
 * Most of these guard against the same failure: this file is read by the
 * models, the routes, the prompt builder and four screens, and a value added
 * in one place without the others is how the list silently stops meaning what
 * everything assumes it means.
 */

describe("depth levels", () => {
  it("is a ladder, in order, starting at the syllabus", () => {
    assert.equal(DEPTH_LEVELS[0], "curriculum");
    assert.equal(DEPTH_LEVELS.at(-1), "expert");
  });

  it("does not let a student request level 0", () => {
    // `curriculum` is the syllabus read from the database, not something a
    // model produces. Offering it as a request would be offering to pay a
    // provider to read a field back.
    assert.ok(!REQUESTABLE_DEPTH_LEVELS.includes("curriculum"));
  });

  it("climbs one rung at a time", () => {
    assert.equal(deeperThan("basic"), "practical");
    assert.equal(deeperThan("practical"), "intermediate");
    assert.equal(deeperThan("intermediate"), "advanced");
    assert.equal(deeperThan("advanced"), "expert");
  });

  it("stops at the top rather than wrapping", () => {
    assert.equal(deeperThan("expert"), null);
  });

  it("routes only the two deepest levels to the expensive model", () => {
    assert.equal(tierForDepth("basic"), "default");
    assert.equal(tierForDepth("practical"), "default");
    assert.equal(tierForDepth("intermediate"), "default");
    assert.equal(tierForDepth("advanced"), "advanced");
    assert.equal(tierForDepth("expert"), "advanced");
  });

  it("rejects anything that is not a level", () => {
    assert.ok(isDepthLevel("basic"));
    assert.ok(!isDepthLevel("BASIC"));
    assert.ok(!isDepthLevel("deep"));
    assert.ok(!isDepthLevel(null));
  });
});

describe("progress weights", () => {
  /**
   * The weights sum to 100 so the percentage IS the sum of what was done.
   *
   * If they did not, the percentage would need a separate normalisation step,
   * and that step would be a second place the number is computed — which is
   * how a progress bar and a "topics completed" count start disagreeing.
   */
  it("sums to exactly 100", () => {
    const total = PROGRESS_SIGNALS.reduce((sum, signal) => sum + PROGRESS_WEIGHTS[signal], 0);
    assert.equal(total, 100);
  });

  it("gives nothing for doing nothing", () => {
    assert.equal(percentageFor({}), 0);
  });

  it("gives 100 for doing everything", () => {
    assert.equal(
      percentageFor({
        basicViewed: true,
        practicalViewed: true,
        advancedViewed: true,
        checkAttempted: true,
        questionAsked: true,
      }),
      100
    );
  });

  it("never exceeds 100", () => {
    assert.ok(percentageFor({ basicViewed: true, practicalViewed: true }) <= 100);
  });

  /**
   * §24's actual requirement, as arithmetic: reading the explanation and the
   * practical section is 60%, which is below the completion threshold. A
   * student has to do something more than read to be counted as done.
   */
  it("does not complete a topic on reading alone", () => {
    const reading = percentageFor({ basicViewed: true, practicalViewed: true });
    assert.ok(reading < AUTO_COMPLETE_AT, `reading alone scored ${reading}`);
  });

  it("completes once a student has read, gone deeper and engaged", () => {
    const engaged = percentageFor({
      basicViewed: true,
      practicalViewed: true,
      advancedViewed: true,
      checkAttempted: true,
    });
    assert.ok(engaged >= AUTO_COMPLETE_AT, `engaged only scored ${engaged}`);
  });
});

describe("learning events", () => {
  it("rejects an event type the client invented", () => {
    assert.ok(isLearningEventType("BASIC_VIEWED"));
    assert.ok(!isLearningEventType("basic_viewed"));
    assert.ok(!isLearningEventType("CUSTOM_EVENT"));
  });

  /**
   * The rule §24 states in one sentence, asserted directly: opening a page is
   * not learning. If someone ever adds `TOPIC_OPENED` to the signal map, this
   * fails rather than silently inflating every student's progress.
   */
  it("gives TOPIC_OPENED no progress at all", () => {
    assert.equal(EVENT_PROGRESS_SIGNAL.TOPIC_OPENED, undefined);
  });

  it("maps every progress signal to at least one event", () => {
    // A signal no event can produce is a weight that can never be earned, which
    // would silently cap every student below 100%.
    const reachable = new Set(Object.values(EVENT_PROGRESS_SIGNAL));
    for (const signal of PROGRESS_SIGNALS) {
      assert.ok(reachable.has(signal), `no event produces "${signal}"`);
    }
  });

  it("maps only to real signals", () => {
    for (const [type, signal] of Object.entries(EVENT_PROGRESS_SIGNAL)) {
      assert.ok(isLearningEventType(type), `${type} is not a declared event type`);
      assert.ok(PROGRESS_SIGNALS.includes(signal!), `${type} maps to unknown signal ${signal}`);
    }
  });

  it("declares every event type exactly once", () => {
    assert.equal(new Set(LEARNING_EVENT_TYPES).size, LEARNING_EVENT_TYPES.length);
  });
});

describe("follow-up actions", () => {
  it("interpolates the topic into every question", () => {
    for (const action of FOLLOW_UPS) {
      const question = action.question("Linked Lists");
      assert.ok(
        question.includes("Linked Lists"),
        `"${action.key}" does not mention the topic: ${question}`
      );
    }
  });

  /**
   * The property that makes the cache work at all (§17).
   *
   * A quick action sends a key, and the server turns it into the identical
   * sentence every time — so eight hundred students pressing "Show code" on one
   * topic normalise to one cache entry. Free text never would.
   */
  it("produces a stable question for a given topic", () => {
    const first = followUp("code")?.question("Recursion");
    const second = followUp("code")?.question("Recursion");
    assert.equal(first, second);
  });

  it("returns null for an action the client made up", () => {
    assert.equal(followUp("delete-everything"), null);
  });

  it("gives every action a depth, so pressing one cannot leave the level stale", () => {
    for (const action of FOLLOW_UPS) {
      assert.ok(action.depth, `"${action.key}" has no depth`);
      assert.ok(isDepthLevel(action.depth!), `"${action.key}" has an unknown depth`);
    }
  });
});
