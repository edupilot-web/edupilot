import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { recordAudit } from "@/lib/admin/audit";
import { fail, ok, readJson, readString, withPermission } from "@/lib/admin/ai/api";
import { AiProviderConfig } from "@/models/AiCourseContent";
import {
  AI_CONTENT_LENGTHS,
  AI_CONTENT_LEVELS,
  AI_DIFFICULTIES,
  AI_LANGUAGES,
  AI_PROVIDER_TYPE_LABELS,
  type AiProviderType,
} from "@/lib/admin/ai/fields";
import {
  IMPLEMENTED_PROVIDERS,
  ensureProviderConfigs,
  providerFor,
  resolveAiSettings,
} from "@/lib/admin/ai/settings";

/**
 * GET / PATCH /api/admin/ai/settings  (spec §24, §35)
 *
 * Reading needs `ai_settings.view`; changing needs `ai_settings.manage` (§33).
 *
 * **No credential ever crosses this boundary.** The response reports whether a
 * provider *is* configured — a boolean derived from the environment — and never
 * the key itself, and the PATCH refuses any attempt to write one into the
 * document (§22, §44).
 */

/** Keys that must never be accepted into `configuration`. */
const SECRET_KEY = /key|secret|token|password|credential|authorization/i;

export async function GET() {
  return withPermission("ai_settings.view", async () => {
    await connectDB();

    const configs = await ensureProviderConfigs();
    const active = await resolveAiSettings();

    return ok({
      active: {
        providerType: active.providerType,
        model: active.model,
        /**
         * Set when an enabled provider could not run and the mock stood in.
         * Surfaced because the alternative is an operator wondering why every
         * generation is placeholder text.
         */
        fellBackFrom: active.fellBackFrom,
        safety: active.safety,
        defaults: active.defaults,
      },
      providers: configs.map((config) => {
        const type = config.providerType as AiProviderType;
        const provider = providerFor(type);
        const implemented = IMPLEMENTED_PROVIDERS.includes(type);

        return {
          id: String(config._id),
          providerName: config.providerName,
          providerType: type,
          providerLabel: AI_PROVIDER_TYPE_LABELS[type] ?? type,
          model: config.model,
          enabled: config.enabled === true,
          isDefault: config.isDefault === true,

          implemented,
          /** Whether the server has what this provider needs. Never the key. */
          configured: implemented ? provider.isConfigured() : false,

          temperature: config.temperature,
          maxTokens: config.maxTokens,
          topP: config.topP,

          defaultLanguage: config.defaultLanguage,
          defaultDifficulty: config.defaultDifficulty,
          defaultLength: config.defaultLength,
          defaultLevel: config.defaultLevel,

          enableContentValidation: config.enableContentValidation !== false,
          enableHallucinationChecks: config.enableHallucinationChecks !== false,
          requireAdminReview: config.requireAdminReview !== false,
          preventAutomaticPublishing: config.preventAutomaticPublishing !== false,

          // §24 cost monitoring.
          usage: {
            requests: config.requestCount ?? 0,
            failed: config.failedCount ?? 0,
            totalTokens: config.totalTokens ?? 0,
            estimatedCostMicros: config.estimatedCostMicros ?? 0,
            averageDurationMs:
              config.requestCount && config.requestCount > 0
                ? Math.round((config.totalDurationMs ?? 0) / config.requestCount)
                : null,
          },

          updatedAt: config.updatedAt,
        };
      }),
    });
  });
}

export async function PATCH(req: Request) {
  return withPermission("ai_settings.manage", async (admin) => {
    const body = await readJson(req);
    if (!body) return fail("Send a JSON body.", 400, { code: "invalid-body" });

    const id = readString(body, "id");
    if (!Types.ObjectId.isValid(id)) {
      return fail("Which provider configuration should change?", 400, { code: "missing-id" });
    }

    await connectDB();

    const config = await AiProviderConfig.findById(id).lean();
    if (!config) return fail("That provider configuration no longer exists.", 404, { code: "not-found" });

    const type = config.providerType as AiProviderType;
    const patch: Record<string, unknown> = { updatedBy: new Types.ObjectId(admin.id) };

    // ── Enabling ─────────────────────────────────────────────────────────
    if ("enabled" in body) {
      const enabled = body.enabled === true;

      if (enabled) {
        if (!IMPLEMENTED_PROVIDERS.includes(type)) {
          return fail(
            `${AI_PROVIDER_TYPE_LABELS[type]} has no implementation yet, so it cannot be enabled.`,
            409,
            { code: "provider-not-implemented" }
          );
        }
        // Refuse to enable a provider that would immediately fall back. Better
        // to say why now than to have every job silently run on the mock.
        if (!providerFor(type).isConfigured()) {
          return fail(
            `${AI_PROVIDER_TYPE_LABELS[type]} is missing its server credentials. Set GEMINI_API_KEY in the environment — it is never stored in the database — and try again.`,
            409,
            { code: "provider-not-configured" }
          );
        }
      }

      patch.enabled = enabled;
    }

    if (body.isDefault === true) {
      // One default at a time, cleared before the new one is set.
      await AiProviderConfig.updateMany({ _id: { $ne: config._id } }, { $set: { isDefault: false } });
      patch.isDefault = true;
      patch.enabled = true;
    }

    // ── Model and tuning ─────────────────────────────────────────────────
    const model = readString(body, "model");
    if (model) patch.model = model;

    for (const [key, min, max] of [
      ["temperature", 0, 2],
      ["topP", 0, 1],
    ] as const) {
      if (key in body) {
        const value = Number(body[key]);
        if (!Number.isFinite(value) || value < min || value > max) {
          return fail(`${key} must be between ${min} and ${max}.`, 400, { code: "out-of-range", field: key });
        }
        patch[key] = value;
      }
    }

    if ("maxTokens" in body) {
      const value = Number(body.maxTokens);
      if (!Number.isInteger(value) || value < 256 || value > 200_000) {
        return fail("maxTokens must be a whole number between 256 and 200000.", 400, {
          code: "out-of-range",
          field: "maxTokens",
        });
      }
      patch.maxTokens = value;
    }

    // ── Content defaults ─────────────────────────────────────────────────
    const enums: [string, readonly string[]][] = [
      ["defaultLanguage", AI_LANGUAGES],
      ["defaultDifficulty", AI_DIFFICULTIES],
      ["defaultLength", AI_CONTENT_LENGTHS],
      ["defaultLevel", AI_CONTENT_LEVELS],
    ];
    for (const [key, allowed] of enums) {
      if (key in body) {
        const value = readString(body, key);
        if (!allowed.includes(value)) {
          return fail(`${key} must be one of: ${allowed.join(", ")}.`, 400, { code: "invalid-value", field: key });
        }
        patch[key] = value;
      }
    }

    // ── Safety ───────────────────────────────────────────────────────────
    for (const key of [
      "enableContentValidation",
      "enableHallucinationChecks",
      "requireAdminReview",
      "preventAutomaticPublishing",
    ] as const) {
      if (key in body) patch[key] = body[key] === true;
    }

    // ── Configuration, minus anything secret ─────────────────────────────
    if (body.configuration && typeof body.configuration === "object") {
      const incoming = body.configuration as Record<string, unknown>;
      const rejected = Object.keys(incoming).filter((key) => SECRET_KEY.test(key));
      if (rejected.length) {
        return fail(
          `Credentials are never stored in the database. Remove ${rejected.join(", ")} and set them in the server environment instead.`,
          400,
          { code: "secret-rejected" }
        );
      }
      patch.configuration = incoming;
    }

    await AiProviderConfig.updateOne({ _id: config._id }, { $set: patch });

    await recordAudit({
      actor: admin,
      action: "ai.settings.updated",
      entityType: "AiProviderConfig",
      entityId: String(config._id),
      entityLabel: config.providerName,
      before: {
        enabled: config.enabled,
        model: config.model,
        temperature: config.temperature,
        requireAdminReview: config.requireAdminReview,
      },
      // The patch never contains a credential, so it is safe to record verbatim.
      after: patch,
    });

    return ok({ id: String(config._id), updated: Object.keys(patch).filter((key) => key !== "updatedBy") });
  });
}
