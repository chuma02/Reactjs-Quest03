import { z } from "zod";
import { getTutorVariant, isUserInRollout } from "@/lib/ai/abTesting";
import { canRunLlmRequest, trackUsage } from "@/lib/ai/analytics";
import { featureFlags } from "@/lib/ai/config";
import { recordGovernanceEvent, sanitizeEducationalInput } from "@/lib/ai/dataGovernance";
import { moderateEducationalText } from "@/lib/ai/moderation";
import { withProviderFailover } from "@/lib/ai/provider";
import { buildTutorSystemPrompt } from "@/lib/ai/prompts";

const bodySchema = z.object({
  userId: z.string().min(2),
  language: z.enum(["english", "spanish", "french", "german"]),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string().min(1),
    }),
  ),
});

function buildSseMessage(payload: unknown) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());

  if (!parsed.success) {
    return Response.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const latestUserMessage = [...parsed.data.messages]
    .reverse()
    .find((message) => message.role === "user")?.content;

  if (!latestUserMessage) {
    return Response.json({ error: "Missing user message." }, { status: 400 });
  }

  if (!featureFlags.aiTutor) {
    return Response.json({ error: "AI tutor feature is disabled." }, { status: 403 });
  }

  if (!isUserInRollout(parsed.data.userId, featureFlags.aiTutorRolloutPercent)) {
    return Response.json(
      { error: "AI tutor is not enabled for this user yet." },
      { status: 403 },
    );
  }

  const sanitizedMessages = parsed.data.messages.map((message) => {
    const sanitized = sanitizeEducationalInput(message.content);
    return {
      role: message.role,
      content: sanitized.text,
      redactionCount: sanitized.redactionCount,
    };
  });
  const totalRedactions = sanitizedMessages.reduce(
    (sum, message) => sum + message.redactionCount,
    0,
  );
  recordGovernanceEvent({
    route: "/api/ai/chat",
    userId: parsed.data.userId,
    redactionCount: totalRedactions,
  });

  const latestSanitizedUserMessage = [...sanitizedMessages]
    .reverse()
    .find((message) => message.role === "user")?.content;

  if (!canRunLlmRequest()) {
    return Response.json(
      { error: "Monthly AI budget limit reached. Please try again later." },
      { status: 429 },
    );
  }

  const moderation = await moderateEducationalText(latestSanitizedUserMessage ?? latestUserMessage);
  if (!moderation.allowed) {
    return Response.json(
      {
        error: moderation.reason,
        flaggedCategories: moderation.flaggedCategories,
      },
      { status: 403 },
    );
  }

  const variant = getTutorVariant(parsed.data.userId);
  const systemPrompt = buildTutorSystemPrompt({
    language: parsed.data.language,
    difficulty: parsed.data.difficulty,
    studentId: parsed.data.userId,
  });

  // Build structured messages so OpenAI receives the proper system / user /
  // assistant roles instead of a flat serialised string. The system message
  // carries the tutor persona and variant; subsequent turns keep their roles.
  const structuredMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: `${systemPrompt} Variant: ${variant}` },
    ...sanitizedMessages
      .filter((m): m is typeof m & { role: "user" | "assistant" } =>
        m.role === "user" || m.role === "assistant",
      )
      .map((m) => ({ role: m.role, content: m.content })),
  ];

  // Flat prompt kept as a required fallback for the mock provider which
  // doesn't consume structured messages.
  const flatPrompt = `${systemPrompt}\nVariant: ${variant}\nConversation:\n${parsed.data.messages
    .map(
      (message, index) =>
        `${message.role.toUpperCase()}: ${sanitizedMessages[index]?.content ?? message.content}`,
    )
    .join("\n")}`;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const start = Date.now();
      controller.enqueue(encoder.encode(buildSseMessage({ type: "meta", variant })));

      try {
        await withProviderFailover(async (provider) => {
          const providerStream = provider.streamText({
            // Flat prompt is the mock-provider fallback; structured messages
            // are consumed by real LLM providers for proper multi-turn context.
            prompt: flatPrompt,
            messages: structuredMessages,
            signal: request.signal,
          });

          let usageProvider = provider.name;
          let usageModel = provider.model;
          let usageTotalTokens = 0;
          let usageCost = 0;

          while (true) {
            const next = await providerStream.next();

            if (next.done) {
              usageProvider = next.value.usage.provider;
              usageModel = next.value.usage.model;
              usageTotalTokens = next.value.usage.totalTokens ?? 0;
              usageCost = next.value.usage.estimatedCostUsd ?? 0;
              break;
            }

            controller.enqueue(
              encoder.encode(buildSseMessage({ type: "token", value: next.value.token })),
            );
          }

          trackUsage({
            route: "/api/ai/chat",
            provider: usageProvider,
            model: usageModel,
            totalTokens: usageTotalTokens,
            estimatedCostUsd: usageCost,
            latencyMs: Date.now() - start,
            success: true,
            experiment: "tutor_prompt_variant",
            variant,
          });
        });

        controller.enqueue(encoder.encode(buildSseMessage({ type: "done" })));
      } catch (err) {
        // Client cancelled the request — do not treat as an error.
        const isAbort =
          err instanceof Error &&
          (err.name === "AbortError" || err.message.toLowerCase().includes("aborted"));

        if (!isAbort) {
          trackUsage({
            route: "/api/ai/chat",
            provider: "unknown",
            model: "unknown",
            latencyMs: Date.now() - start,
            success: false,
            experiment: "tutor_prompt_variant",
            variant,
          });
          // Only enqueue the error event if the stream is still open.
          try {
            controller.enqueue(
              encoder.encode(buildSseMessage({ type: "error", message: "Streaming failed." })),
            );
          } catch {
            // stream already cancelled — ignore
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      // Prevent nginx and Vercel edge proxies from buffering SSE frames.
      "X-Accel-Buffering": "no",
    },
  });
}