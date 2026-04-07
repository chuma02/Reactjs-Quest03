export const aiConfig = {
  provider: process.env.AI_PROVIDER ?? "openai",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  openaiModerationModel: process.env.OPENAI_MODERATION_MODEL ?? "omni-moderation-latest",
  openaiTemperature: Number(process.env.OPENAI_TEMPERATURE ?? "0.4"),
  openaiTopP: Number(process.env.OPENAI_TOP_P ?? "1"),
  openaiMaxOutputTokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS ?? "500"),
  monthlyBudgetUsd: Number(process.env.AI_MONTHLY_BUDGET_USD ?? "20"),
  budgetAlertThresholdPercent: Number(process.env.AI_BUDGET_ALERT_THRESHOLD_PERCENT ?? "80"),
  dataRetentionDays: Number(process.env.AI_DATA_RETENTION_DAYS ?? "30"),
  piiRedactionEnabled: (process.env.AI_PII_REDACTION_ENABLED ?? "true") === "true",
  auditLoggingEnabled: (process.env.AI_AUDIT_LOGGING_ENABLED ?? "true") === "true",
  governanceSalt: process.env.AI_GOVERNANCE_SALT ?? "classroom-governance",
  moderationEnabled: (process.env.AI_MODERATION_ENABLED ?? "true") === "true",
  streamingEnabled: (process.env.AI_STREAMING_ENABLED ?? "true") === "true",
};

export const featureFlags = {
  aiTutor: (process.env.FEATURE_AI_TUTOR ?? "true") === "true",
  aiTutorRolloutPercent: Number(process.env.FEATURE_AI_TUTOR_ROLLOUT_PERCENT ?? "100"),
  aiSearch: (process.env.FEATURE_AI_SEARCH ?? "true") === "true",
  adaptiveRecommendations: (process.env.FEATURE_ADAPTIVE_RECOMMENDATIONS ?? "true") === "true",
  // Content generation — set FEATURE_AI_GENERATION=false to disable all generation endpoints.
  aiGeneration: (process.env.FEATURE_AI_GENERATION ?? "true") === "true",
  aiGenerationRolloutPercent: Number(process.env.FEATURE_AI_GENERATION_ROLLOUT_PERCENT ?? "100"),
  // Pronunciation coaching
  aiPronunciation: (process.env.FEATURE_AI_PRONUNCIATION ?? "true") === "true",
  aiPronunciationRolloutPercent: Number(process.env.FEATURE_AI_PRONUNCIATION_ROLLOUT_PERCENT ?? "100"),
  // LLM-powered progress insight
  aiProgressInsight: (process.env.FEATURE_AI_PROGRESS_INSIGHT ?? "true") === "true",
  aiProgressInsightRolloutPercent: Number(process.env.FEATURE_AI_PROGRESS_INSIGHT_ROLLOUT_PERCENT ?? "100"),
};

/**
 * Validates critical AI configuration at server startup.
 * Logs warnings so misconfiguration is visible immediately without crashing the app.
 * Only call from server-side modules (this file is never bundled for the browser).
 */
export function validateAiConfig(): void {
  if (aiConfig.provider === "openai") {
    const key = aiConfig.openaiApiKey;
    if (!key) {
      console.warn(
        "[AI] OPENAI_API_KEY is not set. Requests will fall back to the mock provider.",
      );
    } else if (!key.startsWith("sk-")) {
      console.warn(
        "[AI] OPENAI_API_KEY does not match the expected format (should start with sk-).",
        "Verify the key in your .env.local file.",
      );
    }
  }
}