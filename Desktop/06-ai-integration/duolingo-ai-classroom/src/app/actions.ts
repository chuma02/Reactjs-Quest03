"use server";

import { z } from "zod";
import { canRunLlmRequest } from "@/lib/ai/analytics";
import { recordGovernanceEvent, sanitizeEducationalInput } from "@/lib/ai/dataGovernance";
import { moderateEducationalText } from "@/lib/ai/moderation";
import { withProviderFailover } from "@/lib/ai/provider";

const assessmentSchema = z.object({
  sampleText: z.string().min(6),
  language: z.enum(["english", "spanish", "french", "german"]),
});

export type AssessmentState = {
  result?: string;
  error?: string;
};

export async function assessDifficultyAction(
  _prevState: AssessmentState,
  formData: FormData,
): Promise<AssessmentState> {
  const parsed = assessmentSchema.safeParse({
    sampleText: formData.get("sampleText"),
    language: formData.get("language"),
  });

  if (!parsed.success) {
    return { error: "Please provide valid text and language." };
  }

  const sanitizedSample = sanitizeEducationalInput(parsed.data.sampleText);
  recordGovernanceEvent({
    route: "server-action:assessDifficulty",
    userId: "anonymous",
    redactionCount: sanitizedSample.redactionCount,
  });

  // Enforce the same educational safety pipeline as every API route.
  const moderation = await moderateEducationalText(sanitizedSample.text);
  if (!moderation.allowed) {
    return { error: moderation.reason ?? "Content blocked by classroom safety moderation." };
  }

  if (!canRunLlmRequest()) {
    return { error: "Monthly AI budget limit reached. Please try again later." };
  }

  const prompt = [
    `Assess learner level for ${parsed.data.language}.`,
    "Return CEFR estimate, confidence, and one suggested next exercise.",
    `Sample: \"${sanitizedSample.text}\"`,
  ].join("\n");

  try {
    const result = await withProviderFailover((provider) =>
      provider.completeText({ prompt }),
    );

    return { result: result.text };
  } catch {
    return { error: "Unable to run assessment right now." };
  }
}