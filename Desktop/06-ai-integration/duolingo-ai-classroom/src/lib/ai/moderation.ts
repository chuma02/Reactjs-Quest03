import { aiConfig } from "@/lib/ai/config";
import { withProviderFailover } from "@/lib/ai/provider";
import type { ModerationResult } from "@/types/ai";

const blockedPatterns = [
  /hate/i,
  /kill/i,
  /self-harm/i,
  /suicide/i,
  /explicit/i,
  /violent/i,
];

function runRuleBasedModeration(text: string): ModerationResult {
  const flaggedCategories: string[] = [];
  blockedPatterns.forEach((pattern) => {
    if (pattern.test(text)) {
      flaggedCategories.push(pattern.source);
    }
  });

  if (flaggedCategories.length > 0) {
    return {
      allowed: false,
      reason: "Content blocked by classroom safety moderation.",
      flaggedCategories,
    };
  }

  return { allowed: true, flaggedCategories: [] };
}

export async function moderateEducationalText(text: string): Promise<ModerationResult> {
  if (!aiConfig.moderationEnabled) {
    return { allowed: true, flaggedCategories: [] };
  }

  const ruleBased = runRuleBasedModeration(text);
  if (!ruleBased.allowed) {
    return ruleBased;
  }

  try {
    const llmModeration = await withProviderFailover((provider) =>
      provider.moderateText({ text }),
    );

    if (!llmModeration.allowed) {
      return {
        allowed: false,
        reason: llmModeration.reason ?? "Content blocked by classroom safety moderation.",
        flaggedCategories: llmModeration.flaggedCategories,
      };
    }

    return { allowed: true, flaggedCategories: [] };
  } catch {
    // If provider moderation is unavailable, keep chat available and rely on rule-based checks.
    return ruleBased;
  }
}