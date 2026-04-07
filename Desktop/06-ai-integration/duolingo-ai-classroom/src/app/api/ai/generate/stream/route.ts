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

function buildSseMessage(payload: unknown) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(request: Request) {
  if (!featureFlags.aiGeneration) {
    return Response.json({ error: "Content generation is currently disabled." }, { status: 403 });
  }

  const parsed = generationRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid generation request." }, { status: 400 });
  }

  const sanitizedInput = sanitizeEducationalInput(parsed.data.inputText);
  recordGovernanceEvent({
    route: "/api/ai/generate/stream",
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
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const start = Date.now();
      let assembledText = "";
      controller.enqueue(encoder.encode(buildSseMessage({ type: "meta", stage: "starting", progress: 5 })));

      try {
        controller.enqueue(encoder.encode(buildSseMessage({ type: "meta", stage: "generating", progress: 20 })));

        await withProviderFailover(async (provider) => {
          const providerStream = provider.streamText({ prompt, signal: request.signal });
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

            const token = next.value.token;
            assembledText += token;
            const progress = Math.min(85, 20 + Math.floor(assembledText.length / 30));

            controller.enqueue(
              encoder.encode(buildSseMessage({ type: "token", value: token, progress })),
            );
          }

          controller.enqueue(encoder.encode(buildSseMessage({ type: "meta", stage: "moderating", progress: 90 })));

          const outputModeration = await moderateEducationalText(assembledText);
          if (!outputModeration.allowed) {
            trackUsage({
              route: "/api/ai/generate/stream",
              provider: usageProvider,
              model: usageModel,
              totalTokens: usageTotalTokens,
              estimatedCostUsd: usageCost,
              latencyMs: Date.now() - start,
              success: false,
              experiment: "generate_stream_prompt_v1",
              variant: parsed.data.mode,
            });
            controller.enqueue(
              encoder.encode(
                buildSseMessage({
                  type: "error",
                  message: "Generated output did not meet classroom safety requirements.",
                  progress: 100,
                }),
              ),
            );
            return;
          }

          const quality = evaluateGenerationQuality(assembledText);
          if (!quality.allowed) {
            trackUsage({
              route: "/api/ai/generate/stream",
              provider: usageProvider,
              model: usageModel,
              totalTokens: usageTotalTokens,
              estimatedCostUsd: usageCost,
              latencyMs: Date.now() - start,
              success: false,
              experiment: "generate_stream_prompt_v1",
              variant: parsed.data.mode,
            });
            controller.enqueue(
              encoder.encode(
                buildSseMessage({
                  type: "error",
                  message: quality.reason ?? "Generated output failed quality control.",
                  progress: 100,
                }),
              ),
            );
            return;
          }

          trackUsage({
            route: "/api/ai/generate/stream",
            provider: usageProvider,
            model: usageModel,
            totalTokens: usageTotalTokens,
            estimatedCostUsd: usageCost,
            latencyMs: Date.now() - start,
            success: true,
            experiment: "generate_stream_prompt_v1",
            variant: parsed.data.mode,
          });
        });

        controller.enqueue(encoder.encode(buildSseMessage({ type: "done", progress: 100 })));
      } catch (err) {
        const isAbort =
          err instanceof Error &&
          (err.name === "AbortError" || err.message.toLowerCase().includes("aborted"));

        if (!isAbort) {
          console.error("[generate-stream] Streaming failed:", err);
          trackUsage({
            route: "/api/ai/generate/stream",
            provider: "unknown",
            model: "unknown",
            latencyMs: Date.now() - start,
            success: false,
            experiment: "generate_stream_prompt_v1",
            variant: parsed.data.mode,
          });
          try {
            controller.enqueue(
              encoder.encode(
                buildSseMessage({ type: "error", message: "Streaming generation failed.", progress: 100 }),
              ),
            );
          } catch {
            // stream cancelled by client
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
      "X-Accel-Buffering": "no",
    },
  });
}
