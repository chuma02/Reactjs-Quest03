import { z } from "zod";
import { canRunLlmRequest, trackUsage } from "@/lib/ai/analytics";
import { featureFlags } from "@/lib/ai/config";
import { recordGovernanceEvent, sanitizeEducationalInput } from "@/lib/ai/dataGovernance";
import { moderateEducationalText } from "@/lib/ai/moderation";
import { withProviderFailover } from "@/lib/ai/provider";
import { progressInsightPrompt } from "@/lib/ai/prompts";

const schema = z.object({
  language: z.enum(["english", "spanish", "french", "german"]),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  recentMessages: z.array(z.string()).default([]),
  weakSkills: z.array(z.string()).default([]),
  generationFeedback: z.enum(["up", "down", "none"]).default("none"),
});

export async function POST(request: Request) {
  if (!featureFlags.aiProgressInsight) {
    return Response.json({ error: "Progress insight is currently disabled." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid progress payload." }, { status: 400 });
  }

  const sanitizedMessages = parsed.data.recentMessages.map((item) => sanitizeEducationalInput(item));
  const sanitizedWeakSkills = parsed.data.weakSkills.map((item) => sanitizeEducationalInput(item));

  recordGovernanceEvent({
    route: "/api/ai/progress",
    userId: "anonymous",
    redactionCount:
      sanitizedMessages.reduce((sum, item) => sum + item.redactionCount, 0) +
      sanitizedWeakSkills.reduce((sum, item) => sum + item.redactionCount, 0),
  });

  const moderation = await moderateEducationalText(
    [...sanitizedMessages.map((m) => m.text), ...sanitizedWeakSkills.map((s) => s.text)].join("\n"),
  );
  if (!moderation.allowed) {
    return Response.json({ error: moderation.reason }, { status: 403 });
  }

  if (!canRunLlmRequest()) {
    return Response.json(
      { error: "Monthly AI budget limit reached. Please try again later." },
      { status: 429 },
    );
  }

  const prompt = progressInsightPrompt({
    language: parsed.data.language,
    difficulty: parsed.data.difficulty,
    recentMessages: sanitizedMessages.map((m) => m.text),
    weakSkills: sanitizedWeakSkills.map((s) => s.text),
    generationFeedback: parsed.data.generationFeedback,
  });

  const start = Date.now();
  const result = await withProviderFailover((provider) =>
    provider.completeText({ prompt, signal: request.signal }),
  );

  const outputModeration = await moderateEducationalText(result.text);
  if (!outputModeration.allowed) {
    trackUsage({
      route: "/api/ai/progress",
      ...result.usage,
      latencyMs: Date.now() - start,
      success: false,
      experiment: "progress_insight_v1",
      variant: parsed.data.difficulty,
    });
    return Response.json(
      { error: "Progress insight failed classroom safety checks." },
      { status: 422 },
    );
  }

  trackUsage({
    route: "/api/ai/progress",
    ...result.usage,
    latencyMs: Date.now() - start,
    success: true,
    experiment: "progress_insight_v1",
    variant: parsed.data.difficulty,
  });

  return Response.json({ insight: result.text, usage: result.usage });
}
