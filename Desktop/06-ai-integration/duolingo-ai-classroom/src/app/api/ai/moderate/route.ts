import { z } from "zod";
import { recordGovernanceEvent, sanitizeEducationalInput } from "@/lib/ai/dataGovernance";
import { moderateEducationalText } from "@/lib/ai/moderation";

const schema = z.object({ text: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid moderation payload." }, { status: 400 });
  }

  // Strip PII before sending to the LLM moderation model.
  const sanitized = sanitizeEducationalInput(parsed.data.text);
  recordGovernanceEvent({
    route: "/api/ai/moderate",
    userId: "anonymous",
    redactionCount: sanitized.redactionCount,
  });

  const result = await moderateEducationalText(sanitized.text);
  return Response.json(result);
}