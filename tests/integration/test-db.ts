import { basename } from "node:path";

/**
 * Points every model in the process at a throwaway database, one per test file.
 *
 * Imported **first**, before anything that touches mongoose. Module bodies run
 * in import order, so this executes before `connectDB` is ever called — and
 * `connectDB` reads `MONGODB_DB` at call time, which is what makes the
 * override effective at all.
 *
 * Its own module rather than a few lines at the top of each test, because
 * `import` statements are hoisted: an assignment written above the imports in
 * a test file would run *after* them, and the suite would connect to the real
 * database and then drop it.
 *
 * **The name includes the test file.** Node's runner executes each file in its
 * own process, in parallel — so two suites sharing one database name each drop
 * it while the other is mid-query, and the failure ("the database is currently
 * being dropped") looks like a bug in the code under test rather than in the
 * harness. One database per file makes the suites genuinely independent, and
 * they can be run in any order or alone.
 */

const REAL_DB = process.env.MONGODB_DB?.trim() || "edupilot";

/**
 * The test file that is running, reduced to something a database name accepts.
 *
 * `process.argv[1]` is the file the runner spawned. Falling back to a constant
 * keeps this working if that ever stops being true — at the cost of the
 * isolation above, which is why the fallback is deliberately obvious in the
 * name rather than silently identical to a real suite's.
 */
function suiteKey(): string {
  const entry = process.argv[1] ?? "";
  const name = basename(entry).replace(/\.(test|spec)\.[tj]s$/, "");
  const cleaned = name.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  return cleaned || "unknown_suite";
}

export const TEST_DB = `${REAL_DB}_test_${suiteKey()}`;

process.env.MONGODB_DB = TEST_DB;

/**
 * Index building is off in production and on elsewhere. Forced on here because
 * the unique indexes are part of what these tests exercise — the notification
 * deduplication test asserts on one directly, and a suite that ran without them
 * would pass against a schema whose constraints were never created.
 */
process.env.MONGODB_AUTO_INDEX = "true";
