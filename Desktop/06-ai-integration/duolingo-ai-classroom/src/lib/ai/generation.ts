import { z } from "zod";
import {
  grammarCorrectionPrompt,
  scenarioPrompt,
  translationPrompt,
  contentGenerationPrompt,
} from "@/lib/ai/prompts";

export const generationRequestSchema = z.object({
  mode: z.enum(["grammar", "translation", "scenario", "content"]),
  language: z.enum(["english", "spanish", "french", "german"]),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  inputText: z.string().min(2),
  targetLanguage: z.enum(["english", "spanish", "french", "german"]).optional(),
  contentType: z.enum(["vocabulary", "sentences", "dialogue", "quiz"]).optional(),
});

export type GenerationRequest = z.infer<typeof generationRequestSchema>;

export function buildGenerationPrompt(input: GenerationRequest, sanitizedInputText: string): string {
  if (input.mode === "grammar") {
    return grammarCorrectionPrompt({
      sentence: sanitizedInputText,
      language: input.language,
      difficulty: input.difficulty,
    });
  }

  if (input.mode === "translation") {
    return translationPrompt({
      sourceText: sanitizedInputText,
      from: input.language,
      to: input.targetLanguage ?? "english",
    });
  }

  if (input.mode === "content") {
    return contentGenerationPrompt({
      topic: sanitizedInputText,
      contentType: input.contentType ?? "sentences",
      language: input.language,
      difficulty: input.difficulty,
    });
  }

  return scenarioPrompt({
    language: input.language,
    difficulty: input.difficulty,
    goal: sanitizedInputText,
  });
}

export function evaluateGenerationQuality(text: string): { allowed: boolean; reason?: string } {
  const cleaned = text.trim();
  if (cleaned.length < 40) {
    return { allowed: false, reason: "Generated output is too short. Please regenerate." };
  }

  const disallowedPhrases = [
    "as an ai language model",
    "i cannot provide",
    "i can't provide",
    "lorem ipsum",
  ];
  const lowered = cleaned.toLowerCase();
  if (disallowedPhrases.some((phrase) => lowered.includes(phrase))) {
    return { allowed: false, reason: "Generated output did not meet quality standards." };
  }

  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const uniqueLineRatio = lines.length > 0 ? new Set(lines).size / lines.length : 1;
  if (uniqueLineRatio < 0.6) {
    return { allowed: false, reason: "Generated output was overly repetitive. Please regenerate." };
  }

  return { allowed: true };
}
