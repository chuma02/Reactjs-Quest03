import { z } from "zod";
import { canRunLlmRequest, trackUsage } from "@/lib/ai/analytics";
import { featureFlags } from "@/lib/ai/config";
import { recordGovernanceEvent, sanitizeEducationalInput } from "@/lib/ai/dataGovernance";
import { moderateEducationalText } from "@/lib/ai/moderation";
import { withProviderFailover } from "@/lib/ai/provider";
import { pronunciationFeedbackPrompt } from "@/lib/ai/prompts";

const schema = z.object({
  language: z.enum(["english", "spanish", "french", "german"]),
  phrase: z.string().min(2),
  studentAttempt: z.string().min(2),
});

export async function POST(request: Request) {
  if (!featureFlags.aiPronunciation) {
    return Response.json({ error: "Pronunciation coaching is currently disabled." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid pronunciation payload." }, { status: 400 });
  }

  const sanitizedPhrase = sanitizeEducationalInput(parsed.data.phrase);
  const sanitizedAttempt = sanitizeEducationalInput(parsed.data.studentAttempt);

  recordGovernanceEvent({
    route: "/api/ai/pronunciation",
    userId: "anonymous",
    redactionCount: sanitizedPhrase.redactionCount + sanitizedAttempt.redactionCount,
  });

  const moderation = await moderateEducationalText(`${sanitizedPhrase.text}\n${sanitizedAttempt.text}`);
  if (!moderation.allowed) {
    return Response.json({ error: moderation.reason }, { status: 403 });
  }

  if (!canRunLlmRequest()) {
    return Response.json(
      { error: "Monthly AI budget limit reached. Please try again later." },
      { status: 429 },
    );
  }

  const prompt = pronunciationFeedbackPrompt({
    language: parsed.data.language,
    phrase: sanitizedPhrase.text,
    studentAttempt: sanitizedAttempt.text,
  });

  const start = Date.now();
  const result = await withProviderFailover((provider) =>
    provider.completeText({ prompt, signal: request.signal }),
  );

  const outputModeration = await moderateEducationalText(result.text);
  if (!outputModeration.allowed) {
    trackUsage({
      route: "/api/ai/pronunciation",
      ...result.usage,
      latencyMs: Date.now() - start,
      success: false,
      experiment: "pronunciation_feedback_v1",
      variant: parsed.data.language,
    });
    return Response.json(
      { error: "Pronunciation feedback failed classroom safety checks." },
      { status: 422 },
    );
  }

  trackUsage({
    route: "/api/ai/pronunciation",
    ...result.usage,
    latencyMs: Date.now() - start,
    success: true,
    experiment: "pronunciation_feedback_v1",
    variant: parsed.data.language,
  });

  return Response.json({ feedback: result.text, usage: result.usage });
}
