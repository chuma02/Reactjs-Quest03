import type { CompletionResult, LLMProvider, ModerationResult } from "@/types/ai";

const cannedResponses = [
  "Great effort. Try using the past tense in your second sentence.",
  "Nice vocabulary choice. Add one connector word like 'however' for fluency.",
  "Your sentence is clear. Practice pronunciation of the final consonants.",
];

const blockedPatterns = [/hate/i, /kill/i, /self-harm/i, /suicide/i, /explicit/i, /violent/i];

function mockModeration(text: string): ModerationResult {
  const flaggedCategories = blockedPatterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source);

  if (flaggedCategories.length > 0) {
    return {
      allowed: false,
      reason: "Content blocked by classroom safety moderation.",
      flaggedCategories,
    };
  }

  return { allowed: true, flaggedCategories: [] };
}

export function createMockProvider(): LLMProvider {
  return {
    name: "mock",
    model: "classroom-mock-v1",
    async completeText(input): Promise<CompletionResult> {
      const start = Date.now();
      const pick = cannedResponses[input.prompt.length % cannedResponses.length];
      return {
        text: `${pick}\n\nPractice question: Can you rewrite your sentence using a time expression?`,
        usage: {
          provider: "mock",
          model: "classroom-mock-v1",
          totalTokens: Math.ceil(input.prompt.length / 4),
          estimatedCostUsd: 0,
          latencyMs: Date.now() - start,
        },
      };
    },

    async moderateText(input) {
      return mockModeration(input.text);
    },

    async *streamText(input) {
      const start = Date.now();
      const response = await this.completeText(input);
      const chunks = response.text.split(" ");
      let built = "";

      for (const chunk of chunks) {
        if (input.signal?.aborted) {
          break;
        }
        const token = `${chunk} `;
        built += token;
        await new Promise((resolve) => setTimeout(resolve, 30));
        yield { token };
      }

      return {
        ...response,
        text: built.trim(),
        usage: {
          ...response.usage,
          latencyMs: Date.now() - start,
        },
      };
    },
  };
}