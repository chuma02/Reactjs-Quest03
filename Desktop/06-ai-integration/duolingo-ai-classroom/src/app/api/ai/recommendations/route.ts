import { z } from "zod";
import { featureFlags } from "@/lib/ai/config";
import { canRunLlmRequest, trackUsage } from "@/lib/ai/analytics";
import { recordGovernanceEvent, sanitizeEducationalInput } from "@/lib/ai/dataGovernance";
import { moderateEducationalText } from "@/lib/ai/moderation";
import { withProviderFailover } from "@/lib/ai/provider";
import { adaptiveRecommendationPrompt } from "@/lib/ai/prompts";

const schema = z.object({
  language: z.enum(["english", "spanish", "french", "german"]),
  weakSkills: z.array(z.string()).default([]),
});

export async function POST(request: Request) {
  if (!featureFlags.adaptiveRecommendations) {
    return Response.json({ error: "Feature disabled." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid recommendation payload." }, { status: 400 });
  }

  const sanitizedSkillInputs = parsed.data.weakSkills.map((skill) => sanitizeEducationalInput(skill));
  const sanitizedSkills = sanitizedSkillInputs.map((item) => item.text);
  const redactionCount = sanitizedSkillInputs.reduce((sum, item) => sum + item.redactionCount, 0);
  recordGovernanceEvent({
    route: "/api/ai/recommendations",
    userId: "anonymous",
    redactionCount,
  });

  const prompt = adaptiveRecommendationPrompt({
    language: parsed.data.language,
    weakSkills: sanitizedSkills,
  });

  if (!canRunLlmRequest()) {
    return Response.json(
      { error: "Monthly AI budget limit reached. Please try again later." },
      { status: 429 },
    );
  }

  const start = Date.now();
  const result = await withProviderFailover((provider) =>
    provider.completeText({ prompt, signal: request.signal }),
  );

  const outputModeration = await moderateEducationalText(result.text);
  if (!outputModeration.allowed) {
    trackUsage({
      route: "/api/ai/recommendations",
      ...result.usage,
      latencyMs: Date.now() - start,
      success: false,
      experiment: "adaptive_recommendations_v1",
      variant: parsed.data.language,
    });
    return Response.json(
      {
        error: "Recommendation output did not meet classroom safety requirements.",
        flaggedCategories: outputModeration.flaggedCategories,
      },
      { status: 422 },
    );
  }

  trackUsage({
    route: "/api/ai/recommendations",
    ...result.usage,
    latencyMs: Date.now() - start,
    success: true,
    experiment: "adaptive_recommendations_v1",
    variant: parsed.data.language,
  });

  return Response.json({ recommendation: result.text, usage: result.usage });
}