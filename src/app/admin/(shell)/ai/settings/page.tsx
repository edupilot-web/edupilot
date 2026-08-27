import type { Metadata } from "next";
import { Badge, Card, InfoNote, PageHeader } from "@/components/admin/ui";
import { SettingsForm } from "@/components/admin/ai/settings-form";
import { can, requirePermission } from "@/lib/admin/current-admin";
import { formatNumber } from "@/lib/admin/format";
import { AI_PROVIDER_TYPE_LABELS, type AiProviderType } from "@/lib/admin/ai/fields";
import {
  IMPLEMENTED_PROVIDERS,
  ensureProviderConfigs,
  providerFor,
  resolveAiSettings,
} from "@/lib/admin/ai/settings";

export const metadata: Metadata = { title: "AI Settings" };

/**
 * AI Settings (spec §24).
 *
 * Provider, model, generation tuning, content defaults, safety switches and cost
 * monitoring. Rendered on the server so the *state* of each provider — whether
 * its credentials are present — is computed from the environment rather than
 * guessed in the browser.
 *
 * No credential appears on this page or in its payload. What is shown is a
 * boolean: configured, or not. Where a key is missing the fix is named (an
 * environment variable) rather than offering a field to paste it into, because
 * §22 forbids storing one in the database.
 */
export default async function AiSettingsPage() {
  const admin = await requirePermission("ai_settings.view", "/admin/ai/settings");

  const [configs, active] = await Promise.all([ensureProviderConfigs(), resolveAiSettings()]);
  const manageable = can(admin, "ai_settings.manage");

  const providers = configs.map((config) => {
    const type = config.providerType as AiProviderType;
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
      configured: implemented ? providerFor(type).isConfigured() : false,
      temperature: config.temperature ?? 0.4,
      maxTokens: config.maxTokens ?? 8192,
      topP: config.topP ?? 0.95,
      defaultLanguage: config.defaultLanguage ?? "english",
      defaultDifficulty: config.defaultDifficulty ?? "moderate",
      defaultLength: config.defaultLength ?? "standard",
      defaultLevel: config.defaultLevel ?? "undergraduate",
      enableContentValidation: config.enableContentValidation !== false,
      enableHallucinationChecks: config.enableHallucinationChecks !== false,
      requireAdminReview: config.requireAdminReview !== false,
      preventAutomaticPublishing: config.preventAutomaticPublishing !== false,
      usage: {
        requests: config.requestCount ?? 0,
        failed: config.failedCount ?? 0,
        totalTokens: config.totalTokens ?? 0,
        averageDurationMs:
          config.requestCount && config.requestCount > 0
            ? Math.round((config.totalDurationMs ?? 0) / config.requestCount)
            : null,
      },
    };
  });

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="AI Settings"
        description="Provider selection, generation tuning, content defaults, safety and cost monitoring."
        breadcrumbs={[{ label: "AI & Learning" }, { label: "AI Settings" }]}
        meta={
          <Badge tone={active.providerType === "mock" ? "warning" : "success"}>
            Active: {AI_PROVIDER_TYPE_LABELS[active.providerType]} · {active.model}
          </Badge>
        }
      />

      {active.fellBackFrom && (
        <div className="mb-3">
          <InfoNote tone="warning">
            The {AI_PROVIDER_TYPE_LABELS[active.fellBackFrom]} configuration is enabled but its server
            credentials are missing, so generation is falling back to the mock provider and producing
            placeholder text. Set the provider key in the environment and reload.
          </InfoNote>
        </div>
      )}

      <div className="mb-3">
        <InfoNote>
          API keys are read from the server environment (<code>GEMINI_API_KEY</code>) and are never
          stored in the database, returned by this page, or accepted by its form. That is why a
          provider can be shown as &ldquo;not configured&rdquo; here with no field to fix it in —
          the fix belongs in the deployment, not in a document.
        </InfoNote>
      </div>

      <div className="space-y-3">
        {providers.map((provider) => (
          <Card
            key={provider.id}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {provider.providerLabel}
                {provider.isDefault && <Badge tone="info">default</Badge>}
                {provider.enabled ? (
                  <Badge tone="success">enabled</Badge>
                ) : (
                  <Badge tone="neutral">disabled</Badge>
                )}
                {!provider.implemented && <Badge tone="neutral">not implemented yet</Badge>}
                {provider.implemented && !provider.configured && (
                  <Badge tone="warning">credentials missing</Badge>
                )}
              </span>
            }
            description={
              provider.providerType === "mock"
                ? "Produces clearly-marked placeholder content with no external calls. Used for local development and whenever no real provider is available. Its output cannot be published."
                : provider.implemented
                  ? "Structured JSON generation through the provider abstraction. Switching to it changes no UI and no stored content shape."
                  : "A slot in the provider abstraction. The interface exists; the implementation is a later phase."
            }
          >
            <SettingsForm provider={provider} canManage={manageable} />

            <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4 dark:border-slate-800">
              {[
                ["Requests", formatNumber(provider.usage.requests)],
                ["Failed", formatNumber(provider.usage.failed)],
                ["Tokens", formatNumber(provider.usage.totalTokens)],
                [
                  "Avg duration",
                  provider.usage.averageDurationMs === null
                    ? "—"
                    : `${(provider.usage.averageDurationMs / 1000).toFixed(1)}s`,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500">
                    {label}
                  </p>
                  <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                    {value}
                  </p>
                </div>
              ))}
            </div>

            {/*
              Cost is not shown as a currency figure.

              A number here would be an estimate from a local rate table, and an
              estimate rendered as money is read as a bill. Tokens are what the
              platform actually knows.
            */}
            <p className="mt-2 text-[11.5px] text-slate-400 dark:text-slate-500">
              Token counts are as reported by the provider. No monetary estimate is shown, because the
              platform has no billing figure — only usage.
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
