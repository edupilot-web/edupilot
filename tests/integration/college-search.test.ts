import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import mongoose from "mongoose";

/**
 * Must be the first import that reaches mongoose: it redirects the whole
 * process at a throwaway database.
 */
import "./test-db";

import { connectDB } from "../../src/lib/db";
import { College } from "../../src/models/College";
import { RateLimit } from "../../src/models/RateLimit";
import { GET } from "../../src/app/api/colleges/search/route";
import { consumeRateLimit } from "../../src/lib/rate-limit";

/**
 * The college picker, for somebody who has no account yet.
 *
 * This endpoint sat behind `requireAuth`, which was right while onboarding was
 * its only caller. Teacher sign-up has to name a college *before* an account
 * exists, and the form has no free-text fallback by design — so a 401 here was
 * not a degraded picker, it was a sign-up page nobody could complete.
 *
 * Run with:  npm run test:integration
 */

function search(query: string, headers: Record<string, string> = {}) {
  // The route reads `nextUrl` and `headers`, both of which a plain Request
  // carries in the shape it needs.
  const url = `http://localhost/api/colleges/search?q=${encodeURIComponent(query)}`;
  const request = new Request(url, { headers }) as unknown as Parameters<typeof GET>[0];
  Object.defineProperty(request, "nextUrl", { value: new URL(url) });
  return GET(request);
}

before(async () => {
  await connectDB();
  // A previous run that died before its `after` hook would otherwise collide
  // with the unique index on `normalizedName`.
  await College.deleteMany({});

  await College.create([
    {
      name: "Velagapudi Ramakrishna Siddhartha Engineering College",
      normalizedName: "velagapudiramakrishnasiddharthaengineeringcollege",
      status: "active",
      cityName: "Vijayawada",
      stateName: "Andhra Pradesh",
    },
    {
      name: "Andhra Loyola College",
      normalizedName: "andhraloyolacollege",
      status: "active",
      cityName: "Vijayawada",
      stateName: "Andhra Pradesh",
    },
    {
      // Not on the platform. It must not be offered to anybody.
      name: "Withdrawn Institute of Technology",
      normalizedName: "withdrawninstituteoftechnology",
      status: "inactive",
    },
  ]);

  await RateLimit.createIndexes();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(async () => {
  // The limiter is shared state; a previous test's window would decide this one.
  await RateLimit.deleteMany({});
});

describe("searching without a session", () => {
  /** The failure this replaced: 401 on every keystroke, for every teacher. */
  it("answers a signed-out caller", async () => {
    const response = await search("andhra", { "x-forwarded-for": "203.0.113.10" });
    assert.equal(response.status, 200);

    const payload = (await response.json()) as { data: { colleges: { name: string }[] } };
    assert.ok(payload.data.colleges.some((row) => row.name === "Andhra Loyola College"));
  });

  it("returns the shape the picker reads", async () => {
    const response = await search("loyola", { "x-forwarded-for": "203.0.113.11" });
    const payload = (await response.json()) as {
      data: { colleges: { id: string; name: string; location: string | null }[] };
    };

    const [row] = payload.data.colleges;
    // `location`, not `city`/`stateName`. The form read the latter, which this
    // endpoint has never sent, so every result rendered without its second line.
    assert.ok(row.id);
    assert.equal(row.name, "Andhra Loyola College");
    assert.equal(row.location, "Vijayawada, Andhra Pradesh");
  });

  it("does not offer a college that is not on the platform", async () => {
    const response = await search("withdrawn", { "x-forwarded-for": "203.0.113.12" });
    const payload = (await response.json()) as { data: { colleges: unknown[] } };
    assert.equal(payload.data.colleges.length, 0);
  });

  it("refuses one letter, whoever is asking", async () => {
    // Not a limit but a query guard: a single letter matches an arbitrary slice
    // of the whole directory.
    const response = await search("a", { "x-forwarded-for": "203.0.113.13" });
    const payload = (await response.json()) as { data: { colleges: unknown[] } };
    assert.equal(payload.data.colleges.length, 0);
  });
});

describe("the rate limit that replaced the session check", () => {
  it("blocks once the window is spent", async () => {
    const ip = "203.0.113.20";
    // Spend the window through the limiter directly rather than by issuing 40
    // requests: this asserts the route honours the counter, not how fast it is.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await consumeRateLimit(`colleges:search:${ip}`, { limit: 40, windowSeconds: 5 * 60 });
    }

    const response = await search("andhra", { "x-forwarded-for": ip });
    assert.equal(response.status, 429);
  });

  it("counts each caller separately", async () => {
    const ip = "203.0.113.21";
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await consumeRateLimit(`colleges:search:${ip}`, { limit: 40, windowSeconds: 5 * 60 });
    }

    // One exhausted address must not shut the picker for everyone else.
    const other = await search("andhra", { "x-forwarded-for": "203.0.113.22" });
    assert.equal(other.status, 200);
  });

  it("allows a person typing a name", async () => {
    // 40 in five minutes is well above what typing "Andhra Loyola" costs at one
    // debounced request per 250ms, and far below what hammering the regex needs.
    const ip = "203.0.113.23";
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await search("andhra loyola", { "x-forwarded-for": ip });
      assert.equal(response.status, 200);
    }
  });
});
