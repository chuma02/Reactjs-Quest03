import { canRunLlmRequest, trackUsage } from "@/lib/ai/analytics";
import { featureFlags } from "@/lib/ai/config";
import { recordGovernanceEvent, sanitizeEducationalInput } from "@/lib/ai/dataGovernance";
import {
  buildGenerationPrompt,
  evaluateGenerationQuality,
  generationRequestSchema,
} from "@/lib/ai/generation";
import { moderateEducationalText } from "@/lib/ai/moderation";
import { withProviderFailover } from "@/lib/ai/provider";

const bodySchema = generationRequestSchema;

export async function POST(request: Request) {
  if (!featureFlags.aiGeneration) {
    return Response.json({ error: "Content generation is currently disabled." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid generation request." }, { status: 400 });
  }

  const sanitizedInput = sanitizeEducationalInput(parsed.data.inputText);
  recordGovernanceEvent({
    route: "/api/ai/generate",
    userId: "anonymous",
    redactionCount: sanitizedInput.redactionCount,
  });

  const moderation = await moderateEducationalText(sanitizedInput.text);
  if (!moderation.allowed) {
    return Response.json({ error: moderation.reason }, { status: 403 });
  }

  if (!canRunLlmRequest()) {
    return Response.json(
      { error: "Monthly AI budget limit reached. Please try again later." },
      { status: 429 },
    );
  }

  const prompt = buildGenerationPrompt(parsed.data, sanitizedInput.text);

  const start = Date.now();
  try {
    const result = await withProviderFailover((provider) =>
      provider.completeText({ prompt, signal: request.signal }),
    );

    const outputModeration = await moderateEducationalText(result.text);
    if (!outputModeration.allowed) {
      trackUsage({
        route: "/api/ai/generate",
        ...result.usage,
        latencyMs: Date.now() - start,
        success: false,
        experiment: "generate_prompt_v1",
        variant: parsed.data.mode,
      });
      return Response.json(
        {
          error: "Generated output did not meet classroom safety requirements.",
          flaggedCategories: outputModeration.flaggedCategories,
        },
        { status: 422 },
      );
    }

    const quality = evaluateGenerationQuality(result.text);
    if (!quality.allowed) {
      trackUsage({
        route: "/api/ai/generate",
        ...result.usage,
        latencyMs: Date.now() - start,
        success: false,
        experiment: "generate_prompt_v1",
        variant: parsed.data.mode,
      });
      return Response.json(
        { error: quality.reason ?? "Generated output failed quality control." },
        { status: 422 },
      );
    }

    trackUsage({
      route: "/api/ai/generate",
      ...result.usage,
      latencyMs: Date.now() - start,
      success: true,
      experiment: "generate_prompt_v1",
      variant: parsed.data.mode,
    });

    return Response.json({ result: result.text, usage: result.usage });
  } catch (err) {
    console.error("[generate] LLM completion failed:", err);
    trackUsage({
      route: "/api/ai/generate",
      provider: "unknown",
      model: "unknown",
      latencyMs: Date.now() - start,
      success: false,
      experiment: "generate_prompt_v1",
      variant: parsed.data.mode,
    });
    return Response.json({ error: "Generation failed." }, { status: 500 });
  }
}