export type ChatRole = "system" | "user" | "assistant";

export type DifficultyLevel = "beginner" | "intermediate" | "advanced";

export type SupportedLanguage = "english" | "spanish" | "french" | "german";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type TutorContext = {
  language: SupportedLanguage;
  difficulty: DifficultyLevel;
  classroomId?: string;
  studentId?: string;
};

export type LLMUsage = {
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  latencyMs: number;
};

export type CompletionResult = {
  text: string;
  usage: LLMUsage;
};

export type LLMProvider = {
  name: string;
  model: string;
  completeText(input: {
    prompt: string;
    // Optional structured message array for providers that support multi-turn
    // chat natively (e.g. OpenAI). When supplied, takes precedence over `prompt`.
    messages?: ChatMessage[];
    signal?: AbortSignal;
  }): Promise<CompletionResult>;
  moderateText(input: { text: string; signal?: AbortSignal }): Promise<ModerationResult>;
  streamText(input: {
    prompt: string;
    // Optional structured message array for providers that support multi-turn
    // chat natively (e.g. OpenAI). When supplied, takes precedence over `prompt`.
    messages?: ChatMessage[];
    signal?: AbortSignal;
  }): AsyncGenerator<{ token: string }, CompletionResult, void>;
};

export type ModerationResult = {
  allowed: boolean;
  reason?: string;
  flaggedCategories: string[];
};