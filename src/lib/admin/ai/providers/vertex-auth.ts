import { createSign } from "node:crypto";
import { ProviderError } from "@/lib/admin/ai/provider";

/**
 * Google Cloud access tokens for Vertex AI, without an SDK.
 *
 * Vertex authenticates with a short-lived OAuth2 bearer token rather than an API
 * key, which is the main thing that makes it different from the Generative
 * Language API. Getting one is a signed JWT and a form post — about sixty lines
 * — against `google-auth-library` pulling in a transport, a retry policy and a
 * filesystem credential search that would all have to be reconciled with the
 * job runner's. The same reasoning that keeps `gemini.ts` on `fetch`.
 *
 * Three ways to get a token, in the order they are tried:
 *
 *   1. `GOOGLE_VERTEX_ACCESS_TOKEN` — a token minted elsewhere, usually
 *      `gcloud auth print-access-token` during local development. Expires in an
 *      hour and is not refreshable, so it is for a laptop, never a deployment.
 *   2. A **service account key**, as JSON in the environment. The normal choice
 *      for a deployment that is not on Google Cloud.
 *   3. The **metadata server**, when running on Google Cloud with a service
 *      account attached. The best option where it is available, because there is
 *      no key to leak, rotate or check into a repository.
 *
 * Credentials are read from `process.env` at call time, never at import and
 * never from a database document (§22) — the same rule every other provider
 * follows, for the same reason: a long-lived server must not keep serving a
 * rotated-out credential, and the settings screen returns config documents to a
 * browser.
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id?: string;
  token_uri?: string;
};

type CachedToken = { token: string; expiresAt: number; source: string };

/**
 * One cached token per credential.
 *
 * Module-level and therefore per-instance, which is the right scope: a token is
 * valid for an hour and minting one is a round trip plus an RSA signature, so
 * doing it per request would add both to every single answer. Keyed by the
 * credential itself so rotating the service account invalidates the cache
 * without a restart.
 */
const cache = new Map<string, CachedToken>();

/** Refresh this long before expiry, so a token never expires mid-flight. */
const EXPIRY_MARGIN_MS = 120_000;

function env(name: string): string | null {
  return process.env[name]?.trim() || null;
}

export function vertexProjectId(): string | null {
  return (
    env("GOOGLE_VERTEX_PROJECT_ID") ??
    env("GOOGLE_CLOUD_PROJECT") ??
    serviceAccount()?.project_id?.trim() ??
    null
  );
}

/**
 * The region the model is called in.
 *
 * `global` is the default rather than a region: it routes to wherever the model
 * has capacity, which is what most deployments want, and it avoids the
 * "model not found in this region" failure that makes a working configuration
 * look broken. A deployment with a data residency requirement sets a region and
 * accepts the narrower availability.
 */
export function vertexLocation(): string {
  return env("GOOGLE_VERTEX_LOCATION") ?? "global";
}

function serviceAccount(): ServiceAccount | null {
  const raw =
    env("GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON") ?? env("GOOGLE_APPLICATION_CREDENTIALS_JSON");
  if (!raw) return null;

  try {
    /**
     * Base64 is accepted as well as raw JSON.
     *
     * A service account key is multi-line PEM inside JSON, and a good number of
     * deployment platforms mangle newlines in environment variables. Allowing
     * base64 means an operator has a way to set it that cannot be corrupted in
     * transit.
     */
    const text = raw.trimStart().startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");

    const parsed = JSON.parse(text) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key) return null;

    return {
      ...parsed,
      // Platforms that store the key as a single line write "\n" literally.
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

/**
 * Whether a token could be obtained at all.
 *
 * Deliberately does not touch the network: this is called while *building* the
 * fallback chain, once per request, and a chain build that made an HTTP call per
 * candidate provider would add a round trip to every answer. The metadata server
 * is therefore assumed available when the environment advertises Google Cloud,
 * and a wrong guess surfaces as the next provider in the chain being used.
 */
export function canAuthenticate(): boolean {
  if (env("GOOGLE_VERTEX_ACCESS_TOKEN")) return true;
  if (serviceAccount()) return true;
  return onGoogleCloud();
}

function onGoogleCloud(): boolean {
  return Boolean(
    env("GCE_METADATA_HOST") ??
      env("K_SERVICE") ?? // Cloud Run
      env("FUNCTION_TARGET") ?? // Cloud Functions
      env("GAE_SERVICE") // App Engine
  );
}

/** Where the token would come from, for the settings screen's diagnostics. */
export function credentialSource(): string | null {
  if (env("GOOGLE_VERTEX_ACCESS_TOKEN")) return "GOOGLE_VERTEX_ACCESS_TOKEN";
  if (serviceAccount()) return "service account key";
  if (onGoogleCloud()) return "Google Cloud metadata server";
  return null;
}

export async function vertexAccessToken(signal?: AbortSignal): Promise<string> {
  const direct = env("GOOGLE_VERTEX_ACCESS_TOKEN");
  if (direct) return direct;

  const account = serviceAccount();
  if (account) return fromServiceAccount(account, signal);

  if (onGoogleCloud()) return fromMetadataServer(signal);

  throw new ProviderError(
    "not-configured",
    "Vertex AI has no credentials. Set GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON, or run on Google Cloud with a service account attached.",
    { retryable: false }
  );
}

async function fromServiceAccount(
  account: ServiceAccount,
  signal?: AbortSignal
): Promise<string> {
  const key = `sa:${account.client_email}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now() + EXPIRY_MARGIN_MS) return hit.token;

  const now = Math.floor(Date.now() / 1000);
  const tokenUri = account.token_uri || TOKEN_ENDPOINT;

  const claims = {
    iss: account.client_email,
    scope: SCOPE,
    aud: tokenUri,
    iat: now,
    // Google caps the assertion lifetime at an hour; anything longer is rejected
    // outright rather than clamped.
    exp: now + 3600,
  };

  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
    JSON.stringify(claims)
  )}`;

  let signature: string;
  try {
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    signature = signer.sign(account.private_key, "base64url");
  } catch {
    /**
     * A malformed key, almost always newlines lost in transit.
     *
     * Named explicitly because the alternative message an operator sees is
     * "unauthorized", which sends them to check a key that is in fact correct
     * and merely unreadable.
     */
    throw new ProviderError(
      "not-configured",
      "The Vertex AI service account key could not be used to sign a token. Check that private_key kept its newlines — setting the variable base64-encoded avoids the problem.",
      { retryable: false }
    );
  }

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
    signal,
  }).catch(() => null);

  return store(key, response, "service account key");
}

async function fromMetadataServer(signal?: AbortSignal): Promise<string> {
  const key = "metadata";
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now() + EXPIRY_MARGIN_MS) return hit.token;

  const host = env("GCE_METADATA_HOST");
  const url = host
    ? `http://${host}/computeMetadata/v1/instance/service-accounts/default/token`
    : METADATA_TOKEN_URL;

  const response = await fetch(url, {
    headers: { "Metadata-Flavor": "Google" },
    signal,
  }).catch(() => null);

  return store(key, response, "metadata server");
}

async function store(
  key: string,
  response: Response | null,
  source: string
): Promise<string> {
  if (!response) {
    throw new ProviderError(
      "unavailable",
      `Vertex AI could not reach Google's token endpoint (${source}).`
    );
  }

  const payload = (await response.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } | null;

  if (!response.ok || !payload?.access_token) {
    /**
     * `error_description` is safe to surface and is usually the whole answer —
     * "Invalid JWT Signature", "account not found". It describes the assertion
     * this process just built, not the private key itself.
     */
    const detail = payload?.error_description || payload?.error;
    throw new ProviderError(
      "unauthorized",
      `Google refused to issue a Vertex AI token${detail ? `: ${detail}` : "."}`,
      { retryable: false, status: response.status }
    );
  }

  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
  cache.set(key, {
    token: payload.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
    source,
  });

  return payload.access_token;
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

/** Drops every cached token. Exported for the tests. */
export function resetVertexTokenCache(): void {
  cache.clear();
}
