import { recordProviderFailover } from "@/lib/ai/analytics";
import { aiConfig } from "@/lib/ai/config";
import { createMockProvider } from "@/lib/ai/providers/mock";
import { createOpenAIProvider } from "@/lib/ai/providers/openai";
import type { LLMProvider } from "@/types/ai";

// Registry maps the AI_PROVIDER env value to a factory function.
// Use registerProvider() to add a new provider (Anthropic, Gemini, Cohere,
// Ollama, etc.) without touching this file's existing registrations.
const providerFactories: Record<string, () => LLMProvider> = {
  openai: createOpenAIProvider,
  mock: createMockProvider,
};

/**
 * Register a new LLM provider factory under a string key.
 * The key must match the value you set for AI_PROVIDER in .env.local.
 *
 * @example
 * // src/lib/ai/providers/anthropic.ts  → export function createAnthropicProvider(): LLMProvider {...}
 * // src/lib/ai/provider.ts (or app startup)
 * registerProvider("anthropic", createAnthropicProvider);
 */
export function registerProvider(name: string, factory: () => LLMProvider): void {
  providerFactories[name] = factory;
}

export function getLLMProvider(): LLMProvider {
  if (aiConfig.provider === "openai" && !aiConfig.openaiApiKey) {
    return createMockProvider();
  }

  const factory = providerFactories[aiConfig.provider] ?? createMockProvider;
  return factory();
}

export async function withProviderFailover<T>(fn: (provider: LLMProvider) => Promise<T>) {
  const primary = getLLMProvider();
  try {
    return await fn(primary);
  } catch (err) {
    console.error(
      "[AI] Primary provider failed, falling back to mock provider:",
      err instanceof Error ? err.message : err,
    );
    // Record the failover in analytics so the metrics dashboard reflects
    // real provider reliability rather than masking silent degradation.
    recordProviderFailover();
    const fallback = createMockProvider();
    return fn(fallback);
  }
}