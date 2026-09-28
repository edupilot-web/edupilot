import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cacheKey, normalizeQuestion, questionHash } from "../../src/lib/tutor/cache";

/**
 * The answer cache's normalisation (§17).
 *
 * These tests are the specification of where the line sits, and the line is
 * sharp on both sides. Too eager and two different questions collide, and a
 * student is served a confidently wrong answer instantly. Too shy and the
 * cache never hits, and every student in a semester pays for "what is a linked
 * list?" separately.
 *
 * The `mustCollide` / `mustNotCollide` split below is the whole contract: it is
 * far easier to add a stop-word than to notice, six months later, that it made
 * "what is a stack" and "what is a queue" the same cache entry.
 */

describe("normalizeQuestion", () => {
  it("strips politeness and framing", () => {
    assert.equal(normalizeQuestion("Please explain linked lists to me"), "explain linked lists");
    assert.equal(normalizeQuestion("Can you tell me about recursion?"), "recursion");
  });

  it("is case- and punctuation-insensitive", () => {
    assert.equal(
      normalizeQuestion("What is a Linked List?"),
      normalizeQuestion("what is a linked list")
    );
  });

  it("collapses whitespace", () => {
    assert.equal(normalizeQuestion("explain    binary\n\nsearch"), "explain binary search");
  });

  it("keeps + and # so C++ and C# stay distinguishable", () => {
    assert.notEqual(normalizeQuestion("explain pointers in c++"), normalizeQuestion("explain pointers in c"));
    assert.match(normalizeQuestion("what is c# used for"), /c#/);
  });

  it("never returns an empty string, even for a question that is only filler", () => {
    assert.ok(normalizeQuestion("please tell me").length > 0);
    assert.ok(normalizeQuestion("???").length > 0);
  });

  it("is capped, so a pasted essay cannot become a 40KB index key", () => {
    assert.ok(normalizeQuestion("recursion ".repeat(500)).length <= 500);
  });
});

describe("cache collisions", () => {
  /**
   * Pairs that MUST normalise together. Each one is a real phrasing of the same
   * question, and treating them separately is money spent for nothing.
   */
  const mustCollide: [string, string][] = [
    ["What is a linked list?", "what is a linked list"],
    ["Please explain recursion", "Explain recursion."],
    ["Can you explain BFS to me?", "Explain BFS"],
    ["Tell me about stacks", "about stacks"],
  ];

  /**
   * Pairs that MUST NOT. Every one of these is a distinction a student
   * depends on, and a normaliser that erased any of them would serve a wrong
   * answer with full confidence.
   */
  const mustNotCollide: [string, string][] = [
    ["What is a stack?", "What is a queue?"],
    ["Explain BFS", "Explain DFS"],
    ["What is the difference between an array and a linked list?", "What is a linked list?"],
    ["Why is recursion slow?", "Why is recursion fast?"],
    ["Explain insertion in a BST", "Explain deletion in a BST"],
    ["Explain pointers", "Do not explain pointers"],
  ];

  for (const [left, right] of mustCollide) {
    it(`treats "${left}" and "${right}" as the same question`, () => {
      assert.equal(normalizeQuestion(left), normalizeQuestion(right));
    });
  }

  for (const [left, right] of mustNotCollide) {
    it(`keeps "${left}" and "${right}" apart`, () => {
      assert.notEqual(normalizeQuestion(left), normalizeQuestion(right));
    });
  }
});

describe("cacheKey", () => {
  const base = {
    topicId: "65f000000000000000000001",
    question: "What is a linked list?",
    depthLevel: "basic" as const,
    language: "english" as const,
    promptVersion: "CURRICULUM_TUTOR_V1",
  };

  it("is stable for the same inputs", () => {
    assert.equal(cacheKey(base), cacheKey({ ...base }));
  });

  it("changes with the depth level", () => {
    // The same question at Basic and Expert are different questions, and
    // sharing an entry would serve a beginner an expert answer.
    assert.notEqual(cacheKey(base), cacheKey({ ...base, depthLevel: "expert" }));
  });

  it("changes with the topic", () => {
    // Two colleges' "Linked Lists" are different rows with different syllabus
    // context, so their answers must not be shared.
    assert.notEqual(cacheKey(base), cacheKey({ ...base, topicId: "65f000000000000000000002" }));
  });

  it("changes with the language", () => {
    assert.notEqual(cacheKey(base), cacheKey({ ...base, language: "telugu" }));
  });

  /**
   * The one that matters most operationally. Editing the system prompt must
   * invalidate every entry — otherwise a deployment keeps serving answers
   * produced under rules that no longer apply, indefinitely (§32, §47).
   */
  it("changes with the prompt version, so a prompt edit invalidates the cache", () => {
    assert.notEqual(cacheKey(base), cacheKey({ ...base, promptVersion: "CURRICULUM_TUTOR_V2" }));
  });

  it("ignores phrasing that normalises away", () => {
    assert.equal(
      cacheKey(base),
      cacheKey({ ...base, question: "Please, what is a linked list???" })
    );
  });
});

describe("questionHash", () => {
  it("is short enough for an index and stable across phrasing", () => {
    const hash = questionHash("Please explain recursion");
    assert.equal(hash.length, 32);
    assert.equal(hash, questionHash("Explain recursion."));
  });
});
