import OpenAI from "openai";
import { aiConfig } from "@/lib/ai/config";
import type { CompletionResult, LLMProvider, ModerationResult } from "@/types/ai";

// Errors that are safe to retry (transient). Auth/request errors are not retried.
const RETRYABLE_ERRORS = new Set([
  "RateLimitError",
  "InternalServerError",
  "APIConnectionError",
  "APIConnectionTimeoutError",
]);

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable =
        err instanceof OpenAI.APIError && RETRYABLE_ERRORS.has(err.constructor.name);
      if (isRetryable && attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt) * 1000; // 1 s, 2 s
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error("[OpenAI] Retry attempts exhausted.");
}

function estimateCostUsd(totalTokens: number): number {
  return Number((totalTokens * 0.0000006).toFixed(6));
}

function mapOpenAIModeration(result: OpenAI.Moderations.Moderation): ModerationResult {
  const flaggedCategories = Object.entries(result.categories)
    .filter(([, flagged]) => Boolean(flagged))
    .map(([category]) => category);

  if (result.flagged || flaggedCategories.length > 0) {
    return {
      allowed: false,
      reason: "Content blocked by LLM moderation.",
      flaggedCategories,
    };
  }

  return { allowed: true, flaggedCategories: [] };
}

export function createOpenAIProvider(): LLMProvider {
  // Client instantiated inside the factory so it is never created with an empty key
  // at module load time. The guard in provider.ts prevents calling this function
  // when the key is absent, but creating lazily is an extra safety layer.
  const client = new OpenAI({ apiKey: aiConfig.openaiApiKey });
  const model = aiConfig.openaiModel;

  return {
    name: "openai",
    model,
    async completeText(input): Promise<CompletionResult> {
      const start = Date.now();
      // Prefer structured messages (multi-turn context) over flat prompt string.
      const apiMessages: OpenAI.Chat.ChatCompletionMessageParam[] =
        input.messages && input.messages.length > 0
          ? input.messages.map((m) => ({ role: m.role, content: m.content }))
          : [{ role: "user", content: input.prompt }];

      const completion = await withRetry(() =>
        client.chat.completions.create({
          model,
          messages: apiMessages,
          temperature: aiConfig.openaiTemperature,
          top_p: aiConfig.openaiTopP,
          max_completion_tokens: aiConfig.openaiMaxOutputTokens,
        }),
      );

      const text = completion.choices[0]?.message?.content ?? "";
      const usage = completion.usage;
      const totalTokens = usage?.total_tokens ?? Math.ceil(text.length / 4);

      return {
        text,
        usage: {
          provider: "openai",
          model,
          promptTokens: usage?.prompt_tokens,
          completionTokens: usage?.completion_tokens,
          totalTokens,
          estimatedCostUsd: estimateCostUsd(totalTokens),
          latencyMs: Date.now() - start,
        },
      };
    },

    async moderateText(input) {
      const moderation = await withRetry(() =>
        client.moderations.create(
          {
            model: aiConfig.openaiModerationModel,
            input: input.text,
          },
          {
            signal: input.signal,
          },
        ),
      );

      const first = moderation.results[0];
      if (!first) {
        return { allowed: true, flaggedCategories: [] };
      }

      return mapOpenAIModeration(first);
    },

    async *streamText(input) {
      const start = Date.now();
      let assembledText = "";
      // Prefer structured messages (multi-turn context) over flat prompt string.
      const apiMessages: OpenAI.Chat.ChatCompletionMessageParam[] =
        input.messages && input.messages.length > 0
          ? input.messages.map((m) => ({ role: m.role, content: m.content }))
          : [{ role: "user", content: input.prompt }];

      const stream = await withRetry(() =>
        client.chat.completions.create(
          {
            model,
            messages: apiMessages,
            temperature: aiConfig.openaiTemperature,
            top_p: aiConfig.openaiTopP,
            max_completion_tokens: aiConfig.openaiMaxOutputTokens,
            stream: true,
          },
          // Pass the signal so the underlying HTTP request is cancelled
          // immediately when the client aborts, not on the next polled chunk.
          { signal: input.signal },
        ),
      );

      for await (const chunk of stream) {
        if (input.signal?.aborted) {
          break;
        }

        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (!delta) {
          continue;
        }
        assembledText += delta;
        yield { token: delta };
      }

      const totalTokens = Math.ceil(assembledText.length / 4);
      return {
        text: assembledText,
        usage: {
          provider: "openai",
          model,
          totalTokens,
          estimatedCostUsd: estimateCostUsd(totalTokens),
          latencyMs: Date.now() - start,
        },
      };
    },
  };
}