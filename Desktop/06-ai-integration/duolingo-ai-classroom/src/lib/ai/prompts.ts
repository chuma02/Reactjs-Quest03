import type { DifficultyLevel, SupportedLanguage, TutorContext } from "@/types/ai";

export function buildTutorSystemPrompt(context: TutorContext): string {
  return [
    "You are Duolingo Classroom AI Tutor.",
    "Teach with short, encouraging, age-appropriate responses.",
    "Always include one actionable correction and one practice question.",
    `Target language: ${context.language}.`,
    `Difficulty level: ${context.difficulty}.`,
    "When translating, include a brief cultural usage note relevant to native speakers of the target language.",
    "Do not produce harmful, hateful, sexual, violent, or unsafe educational content.",
  ].join(" ");
}

export function grammarCorrectionPrompt(input: {
  sentence: string;
  language: SupportedLanguage;
  difficulty: DifficultyLevel;
}): string {
  return [
    `Language: ${input.language}. Difficulty: ${input.difficulty}.`,
    "Task: Correct grammar and explain the correction in simple steps.",
    "Return sections: Corrected sentence, Explanation, One follow-up practice sentence.",
    `Sentence: \"${input.sentence}\"`,
  ].join("\n");
}

export function translationPrompt(input: {
  sourceText: string;
  from: SupportedLanguage;
  to: SupportedLanguage;
}): string {
  return [
    `Translate from ${input.from} to ${input.to}.`,
    "Provide translation, literal meaning, and one cultural usage note.",
    `Text: \"${input.sourceText}\"`,
  ].join("\n");
}

export function scenarioPrompt(input: {
  language: SupportedLanguage;
  difficulty: DifficultyLevel;
  goal: string;
}): string {
  return [
    `Create a language practice scenario in ${input.language}.`,
    `Difficulty: ${input.difficulty}.`,
    `Learning goal: ${input.goal}.`,
    "Include: context, 4 dialogue turns, vocabulary list, and challenge question.",
  ].join("\n");
}

export function adaptiveRecommendationPrompt(input: {
  language: SupportedLanguage;
  weakSkills: string[];
}): string {
  return [
    `Language: ${input.language}.`,
    `Weak skills: ${input.weakSkills.join(", ") || "general fluency"}.`,
    "Provide a 3-item study plan with time estimate and expected outcome.",
  ].join("\n");
}

export function searchRankingPrompt(input: {
  query: string;
  entries: { id: string; title: string; tags: string[] }[];
}): string {
  return [
    "You are a semantic educational content search engine.",
    "Given the learner's query, identify the most relevant knowledge base entries.",
    "Return ONLY a JSON array of entry IDs ordered by relevance (most relevant first).",
    "Include only entries that genuinely match the query intent. If nothing matches, return [].",
    "No explanation, no markdown — only the raw JSON array.",
    `Query: "${input.query}"`,
    "Knowledge base entries:",
    JSON.stringify(input.entries),
    "Response:",
  ].join("\n");
}
export function contentGenerationPrompt(input: {
  topic: string;
  contentType: "vocabulary" | "sentences" | "dialogue" | "quiz";
  language: SupportedLanguage;
  difficulty: DifficultyLevel;
}): string {
  const formatGuides: Record<typeof input.contentType, string> = {
    vocabulary:
      "Return exactly 8 vocabulary items. For each: the word, its definition, one example sentence, and a memory tip.",
    sentences:
      "Return exactly 5 example sentences demonstrating natural usage. Follow each with a concise grammar note.",
    dialogue:
      "Return a 6-turn dialogue between Speaker A and Speaker B that demonstrates the topic in an authentic everyday context.",
    quiz:
      "Return 4 multiple-choice questions with options A-D, the correct answer, and a one-sentence explanation for each.",
  };

  return [
    `Language: ${input.language}. Difficulty: ${input.difficulty}.`,
    `Topic: "${input.topic}".`,
    `Content format: ${input.contentType}.`,
    formatGuides[input.contentType],
    "Every item must be accurate, age-appropriate, and educationally valuable.",
  ].join("\n");
}

export function pronunciationFeedbackPrompt(input: {
  language: SupportedLanguage;
  phrase: string;
  studentAttempt: string;
}): string {
  return [
    `Language: ${input.language}.`,
    `Target phrase: "${input.phrase}".`,
    `Student attempt transcript: "${input.studentAttempt}".`,
    "Provide pronunciation coaching in this exact structure:",
    "1) Accuracy summary (short).",
    "2) Sound-by-sound corrections (max 3 key sounds).",
    "3) Mouth/tongue placement tips.",
    "4) Slow practice version with syllable breaks.",
    "5) One confidence tip for the learner.",
  ].join("\n");
}

export function progressInsightPrompt(input: {
  language: SupportedLanguage;
  difficulty: DifficultyLevel;
  recentMessages: string[];
  weakSkills: string[];
  generationFeedback: "up" | "down" | "none";
}): string {
  return [
    `Language: ${input.language}. Difficulty: ${input.difficulty}.`,
    `Recent learner messages: ${input.recentMessages.slice(-6).join(" | ") || "none"}.`,
    `Detected weak skills: ${input.weakSkills.join(", ") || "none"}.`,
    `Generation feedback sentiment: ${input.generationFeedback}.`,
    "Create a personalized learning progress insight with:",
    "- Current strengths (2 bullets)",
    "- Priority focus areas (2 bullets)",
    "- A 7-day micro-plan with daily 10-minute tasks",
    "- One measurable success metric for next week",
    "Keep it concise, practical, and learner-friendly.",
  ].join("\n");
}
