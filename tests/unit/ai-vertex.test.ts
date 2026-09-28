import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createVerify, generateKeyPairSync } from "node:crypto";
import {
  canAuthenticate,
  credentialSource,
  resetVertexTokenCache,
  vertexLocation,
  vertexProjectId,
} from "../../src/lib/admin/ai/providers/vertex-auth";
import { VertexAIProvider } from "../../src/lib/admin/ai/providers/vertex";
import { buildRoute, describeRoute } from "../../src/lib/tutor/router";
import { defaultModelFor, IMPLEMENTED_PROVIDERS } from "../../src/lib/admin/ai/settings";
import { AI_PROVIDER_TYPES, AI_PROVIDER_TYPE_LABELS } from "../../src/lib/admin/ai/fields";
import { geminiErrorFor, readGeminiResponse } from "../../src/lib/admin/ai/providers/gemini-core";

/**
 * Vertex AI as the primary provider, with Gemini behind it.
 *
 * Almost everything here is about *configuration* rather than the model: which
 * provider a deployment ends up on, whether an unconfigured one is silently
 * skipped, and whether a credential can leak into a message. Those are the
 * failures that are invisible until a bill or an incident, and none of them
 * need a network call to test.
 */

const VERTEX_VARS = [
  "GOOGLE_VERTEX_PROJECT_ID",
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_VERTEX_LOCATION",
  "GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON",
  "GOOGLE_APPLICATION_CREDENTIALS_JSON",
  "GOOGLE_VERTEX_ACCESS_TOKEN",
  "GCE_METADATA_HOST",
  "K_SERVICE",
  "FUNCTION_TARGET",
  "GAE_SERVICE",
  "GEMINI_API_KEY",
  "GOOGLE_AI_API_KEY",
  "AI_DEFAULT_PROVIDER",
  "AI_DEFAULT_MODEL",
  "AI_ADVANCED_PROVIDER",
  "AI_ADVANCED_MODEL",
  "AI_FALLBACK_PROVIDERS",
];

const saved = new Map<string, string | undefined>();

function setEnv(values: Record<string, string | undefined>): void {
  for (const name of VERTEX_VARS) {
    if (!saved.has(name)) saved.set(name, process.env[name]);
    delete process.env[name];
  }
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) process.env[name] = value;
  }
  resetVertexTokenCache();
}

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
  resetVertexTokenCache();
});

/** A throwaway RSA key, so the signing path is exercised for real. */
function serviceAccountJson(): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return JSON.stringify({
    type: "service_account",
    project_id: "edupilot-test",
    client_email: "tutor@edupilot-test.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  });
}

describe("vertex configuration", () => {
  it("is registered as an implemented provider with a label", () => {
    assert.ok(AI_PROVIDER_TYPES.includes("vertex"));
    assert.ok(IMPLEMENTED_PROVIDERS.includes("vertex"));
    assert.equal(AI_PROVIDER_TYPE_LABELS.vertex, "Google Vertex AI");
  });

  it("defaults to Flash, not Pro", () => {
    // The everyday model is the one that decides the bill: the tutor answers
    // thousands of ordinary questions and a handful of hard ones.
    assert.equal(defaultModelFor("vertex"), "gemini-2.5-flash");
  });

  it("needs a project before it counts as configured", () => {
    setEnv({ GOOGLE_VERTEX_ACCESS_TOKEN: "ya29.test" });
    assert.equal(vertexProjectId(), null);
    assert.equal(new VertexAIProvider().isConfigured(), false);
  });

  it("needs a credential before it counts as configured", () => {
    setEnv({ GOOGLE_VERTEX_PROJECT_ID: "edupilot-test" });
    assert.equal(canAuthenticate(), false);
    assert.equal(new VertexAIProvider().isConfigured(), false);
  });

  it("is configured with a project and a service account", () => {
    setEnv({
      GOOGLE_VERTEX_PROJECT_ID: "edupilot-test",
      GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON: serviceAccountJson(),
    });
    assert.equal(new VertexAIProvider().isConfigured(), true);
    assert.equal(credentialSource(), "service account key");
  });

  it("takes the project from the service account when none is set", () => {
    setEnv({ GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON: serviceAccountJson() });
    assert.equal(vertexProjectId(), "edupilot-test");
  });

  it("accepts a base64-encoded service account", () => {
    // Most deployment platforms mangle newlines in environment variables, and a
    // service account key is multi-line PEM inside JSON.
    setEnv({
      GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON: Buffer.from(serviceAccountJson()).toString("base64"),
    });
    assert.equal(vertexProjectId(), "edupilot-test");
    assert.equal(canAuthenticate(), true);
  });

  it("ignores a service account that is not parseable", () => {
    setEnv({
      GOOGLE_VERTEX_PROJECT_ID: "edupilot-test",
      GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON: "not json and not base64 json",
    });
    assert.equal(canAuthenticate(), false);
  });

  it("recognises a Google Cloud runtime with no key at all", () => {
    setEnv({ GOOGLE_VERTEX_PROJECT_ID: "edupilot-test", K_SERVICE: "edupilot-web" });
    assert.equal(canAuthenticate(), true);
    assert.equal(credentialSource(), "Google Cloud metadata server");
  });

  it("defaults the location to global", () => {
    setEnv({});
    assert.equal(vertexLocation(), "global");
    setEnv({ GOOGLE_VERTEX_LOCATION: "asia-south1" });
    assert.equal(vertexLocation(), "asia-south1");
  });
});

describe("the fallback chain", () => {
  it("puts Vertex first and Gemini behind it", () => {
    setEnv({
      GOOGLE_VERTEX_PROJECT_ID: "edupilot-test",
      GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON: serviceAccountJson(),
      GEMINI_API_KEY: "test-key",
      AI_DEFAULT_PROVIDER: "vertex",
      AI_FALLBACK_PROVIDERS: "gemini",
    });

    const route = buildRoute("default").map((entry) => entry.providerType);
    assert.deepEqual(route, ["vertex", "gemini", "mock"]);
  });

  it("skips Vertex entirely when it is not configured", () => {
    // The chain's length must reflect what can actually be tried, or every
    // answer waits for a provider that was never going to respond.
    setEnv({ GEMINI_API_KEY: "test-key", AI_DEFAULT_PROVIDER: "vertex", AI_FALLBACK_PROVIDERS: "gemini" });

    const route = buildRoute("default").map((entry) => entry.providerType);
    assert.deepEqual(route, ["gemini", "mock"]);
  });

  it("always ends at the mock, even with nothing configured", () => {
    setEnv({});
    const route = buildRoute("default");
    assert.deepEqual(
      route.map((entry) => entry.providerType),
      ["mock"]
    );
  });

  it("falls from the advanced tier through the default tier first", () => {
    // A cheaper model answering beats no answer, and beats escalating to a
    // third party that may not be configured either.
    setEnv({
      GOOGLE_VERTEX_PROJECT_ID: "edupilot-test",
      GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON: serviceAccountJson(),
      GEMINI_API_KEY: "test-key",
      AI_DEFAULT_PROVIDER: "vertex",
      AI_DEFAULT_MODEL: "gemini-2.5-flash",
      AI_ADVANCED_PROVIDER: "vertex",
      AI_ADVANCED_MODEL: "gemini-2.5-pro",
      AI_FALLBACK_PROVIDERS: "gemini",
    });

    const route = buildRoute("advanced").map((entry) => `${entry.providerType}:${entry.model}`);
    assert.deepEqual(route, [
      "vertex:gemini-2.5-pro",
      "vertex:gemini-2.5-flash",
      "gemini:gemini-2.5-flash",
      "mock:mock-tutor-1",
    ]);
  });

  it("does not try one provider-and-model twice", () => {
    setEnv({
      GOOGLE_VERTEX_PROJECT_ID: "edupilot-test",
      GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON: serviceAccountJson(),
      AI_DEFAULT_PROVIDER: "vertex",
      AI_DEFAULT_MODEL: "gemini-2.5-flash",
      AI_FALLBACK_PROVIDERS: "vertex:gemini-2.5-flash",
    });

    const route = buildRoute("default").map((entry) => entry.providerType);
    assert.deepEqual(route, ["vertex", "mock"]);
  });

  it("ignores a typo in the fallback list rather than failing", () => {
    setEnv({
      GEMINI_API_KEY: "test-key",
      AI_DEFAULT_PROVIDER: "gemini",
      AI_FALLBACK_PROVIDERS: "vertexx,not-a-provider",
    });

    const route = buildRoute("default").map((entry) => entry.providerType);
    assert.deepEqual(route, ["gemini", "mock"]);
  });

  it("describes the chain without leaking a credential", () => {
    setEnv({
      GOOGLE_VERTEX_PROJECT_ID: "edupilot-test",
      GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON: serviceAccountJson(),
      GEMINI_API_KEY: "super-secret-key",
      AI_DEFAULT_PROVIDER: "vertex",
      AI_FALLBACK_PROVIDERS: "gemini",
    });

    const described = JSON.stringify(describeRoute("default"));
    assert.ok(!described.includes("super-secret-key"));
    assert.ok(!described.includes("private_key"));
    assert.ok(described.includes("vertex"));
  });
});

describe("the shared Gemini wire format", () => {
  const flavour = { label: "Vertex AI", credentialHint: "GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON" };

  it("treats a truncated response as a failure, not a success", () => {
    // The most dangerous kind of success: the JSON parses, the units array is
    // simply short, and a reviewer cannot see that the model was cut off.
    assert.throws(
      () =>
        readGeminiResponse(
          { candidates: [{ content: { parts: [{ text: '{"units":[' }] }, finishReason: "MAX_TOKENS" }] },
          flavour,
          { model: "gemini-2.5-flash", maxTokens: 4096, startedAt: Date.now() }
        ),
      /token limit/i
    );
  });

  it("treats a blocked prompt as non-retryable", () => {
    try {
      readGeminiResponse({ promptFeedback: { blockReason: "SAFETY" } }, flavour, {
        model: "gemini-2.5-flash",
        maxTokens: 4096,
        startedAt: Date.now(),
      });
      assert.fail("expected a rejection");
    } catch (err) {
      assert.equal((err as { code: string }).code, "content-filtered");
      assert.equal((err as { retryable: boolean }).retryable, false);
    }
  });

  it("reads usage and text from a good response", () => {
    const result = readGeminiResponse(
      {
        candidates: [{ content: { parts: [{ text: '{"ok":' }, { text: "true}" }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, totalTokenCount: 14 },
      },
      flavour,
      { model: "gemini-2.5-flash", maxTokens: 4096, startedAt: Date.now() }
    );

    assert.equal(result.text, '{"ok":true}');
    assert.equal(result.usage.totalTokens, 14);
    assert.equal(result.model, "gemini-2.5-flash");
  });

  it("names the provider an operator configured, not the wire format", () => {
    const error = geminiErrorFor(401, null, flavour);
    assert.match(error.message, /Vertex AI/);
    assert.match(error.message, /GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON/);
  });

  it("never echoes a provider message back on an auth failure", () => {
    // Google sometimes reflects part of the credential in a 401/403 body.
    const error = geminiErrorFor(403, { error: { message: "key AIzaSyLEAKED rejected" } }, flavour);
    assert.ok(!error.message.includes("AIzaSyLEAKED"));
    assert.equal(error.retryable, false);
  });

  it("marks a rate limit retryable and a bad model not", () => {
    assert.equal(geminiErrorFor(429, null, flavour).retryable, true);
    assert.equal(geminiErrorFor(404, null, flavour).retryable, false);
    assert.equal(geminiErrorFor(500, null, flavour).retryable, true);
  });
});

/**
 * The token exchange and the endpoint, against a stubbed transport.
 *
 * This is the riskiest code in the provider and the part that cannot be checked
 * against the real service from a test run: a JWT that Google rejects looks
 * exactly like a missing IAM role from the outside. Verifying the assertion with
 * the public half of the key proves the signature is real rather than merely
 * present.
 */
describe("the Vertex credential exchange", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function keypair() {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    return {
      publicKey,
      json: JSON.stringify({
        type: "service_account",
        project_id: "edupilot-test",
        client_email: "tutor@edupilot-test.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      }),
    };
  }

  /** Records every request and answers each with a canned response. */
  function stub(responses: { body: unknown; status?: number }[]) {
    const calls: { url: string; init: RequestInit }[] = [];
    let index = 0;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      const canned = responses[Math.min(index, responses.length - 1)];
      index += 1;
      return new Response(JSON.stringify(canned.body), {
        status: canned.status ?? 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    return calls;
  }

  const OK_TOKEN = { body: { access_token: "ya29.minted", expires_in: 3600 } };
  const OK_MODEL = {
    body: {
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 },
    },
  };

  const CALL_OPTIONS = {
    model: "gemini-2.5-flash",
    temperature: 0,
    maxTokens: 64,
    topP: 1,
    timeoutMs: 5_000,
  };

  it("signs a JWT that verifies against the service account public key", async () => {
    const { publicKey, json } = keypair();
    setEnv({ GOOGLE_VERTEX_PROJECT_ID: "edupilot-test", GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON: json });

    const calls = stub([OK_TOKEN, OK_MODEL]);
    await new VertexAIProvider().generate({ system: "s", user: "u" }, CALL_OPTIONS);

    const assertion = new URLSearchParams(calls[0].init.body as string).get("assertion")!;
    const [header, claims, signature] = assertion.split(".");

    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${claims}`);
    assert.ok(verifier.verify(publicKey, Buffer.from(signature, "base64url")), "signature verifies");

    const decoded = JSON.parse(Buffer.from(claims, "base64url").toString("utf8"));
    assert.equal(decoded.iss, "tutor@edupilot-test.iam.gserviceaccount.com");
    assert.equal(decoded.scope, "https://www.googleapis.com/auth/cloud-platform");
    assert.equal(decoded.aud, "https://oauth2.googleapis.com/token");
    // Google rejects an assertion longer than an hour outright.
    assert.ok(decoded.exp - decoded.iat <= 3600);
  });

  it("calls the global endpoint by default and sends the bearer token", async () => {
    const { json } = keypair();
    setEnv({ GOOGLE_VERTEX_PROJECT_ID: "edupilot-test", GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON: json });

    const calls = stub([OK_TOKEN, OK_MODEL]);
    await new VertexAIProvider().generate({ system: "s", user: "u" }, CALL_OPTIONS);

    assert.equal(
      calls[1].url,
      "https://aiplatform.googleapis.com/v1/projects/edupilot-test/locations/global/publishers/google/models/gemini-2.5-flash:generateContent"
    );
    const headers = calls[1].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer ya29.minted");
  });

  it("uses the regional host when a region is pinned", async () => {
    // `global` has no region prefix; getting this wrong is a DNS failure rather
    // than an API error, which reads as the whole product being down.
    const { json } = keypair();
    setEnv({
      GOOGLE_VERTEX_PROJECT_ID: "edupilot-test",
      GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON: json,
      GOOGLE_VERTEX_LOCATION: "asia-south1",
    });

    const calls = stub([OK_TOKEN, OK_MODEL]);
    await new VertexAIProvider().generate({ system: "s", user: "u" }, CALL_OPTIONS);

    assert.ok(calls[1].url.startsWith("https://asia-south1-aiplatform.googleapis.com/"));
    assert.ok(calls[1].url.includes("/locations/asia-south1/"));
  });

  it("mints one token for many calls", async () => {
    // A token lasts an hour and costs a round trip plus an RSA signature.
    const { json } = keypair();
    setEnv({ GOOGLE_VERTEX_PROJECT_ID: "edupilot-test", GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON: json });

    const calls = stub([OK_TOKEN, OK_MODEL, OK_MODEL, OK_MODEL]);
    const provider = new VertexAIProvider();

    await provider.generate({ system: "s", user: "u" }, CALL_OPTIONS);
    await provider.generate({ system: "s", user: "u" }, CALL_OPTIONS);

    const tokenCalls = calls.filter((call) => call.url.includes("oauth2.googleapis.com"));
    assert.equal(tokenCalls.length, 1);
  });

  it("sends a response schema only when one is supplied", async () => {
    const { json } = keypair();
    setEnv({ GOOGLE_VERTEX_PROJECT_ID: "edupilot-test", GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON: json });

    const calls = stub([OK_TOKEN, OK_MODEL]);
    await new VertexAIProvider().generateStructured(
      { system: "s", user: "u" },
      { ...CALL_OPTIONS, jsonSchema: { type: "object" } }
    );

    const body = JSON.parse(calls[1].init.body as string);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.deepEqual(body.generationConfig.responseSchema, { type: "object" });
    assert.equal(body.systemInstruction.parts[0].text, "s");
  });

  it("reports a refused assertion as unauthorized, not as a generic failure", async () => {
    const { json } = keypair();
    setEnv({ GOOGLE_VERTEX_PROJECT_ID: "edupilot-test", GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON: json });

    stub([{ body: { error: "invalid_grant", error_description: "Invalid JWT Signature." }, status: 400 }]);

    await assert.rejects(
      () => new VertexAIProvider().generate({ system: "s", user: "u" }, CALL_OPTIONS),
      (err: { code: string; message: string; retryable: boolean }) => {
        assert.equal(err.code, "unauthorized");
        assert.equal(err.retryable, false);
        // The description names what is wrong with the assertion just built; it
        // is not the key itself, and it is the whole diagnosis for an operator.
        assert.match(err.message, /Invalid JWT Signature/);
        return true;
      }
    );
  });

  it("explains an unusable private key as configuration, not as a rejected credential", async () => {
    // Almost always newlines lost in transit. "unauthorized" would send an
    // operator to check a key that is correct and merely unreadable.
    setEnv({
      GOOGLE_VERTEX_PROJECT_ID: "edupilot-test",
      GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: "tutor@edupilot-test.iam.gserviceaccount.com",
        private_key: "-----BEGIN PRIVATE KEY-----\nnot-a-key\n-----END PRIVATE KEY-----\n",
      }),
    });

    stub([OK_TOKEN]);
    await assert.rejects(
      () => new VertexAIProvider().generate({ system: "s", user: "u" }, CALL_OPTIONS),
      (err: { code: string; message: string }) => {
        assert.equal(err.code, "not-configured");
        assert.match(err.message, /newlines/);
        return true;
      }
    );
  });
});
