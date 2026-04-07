import { z } from "zod";
import { canRunLlmRequest } from "@/lib/ai/analytics";
import { featureFlags } from "@/lib/ai/config";
import { sanitizeEducationalInput } from "@/lib/ai/dataGovernance";
import { moderateEducationalText } from "@/lib/ai/moderation";
import { withProviderFailover } from "@/lib/ai/provider";
import { searchRankingPrompt } from "@/lib/ai/prompts";

const schema = z.object({ query: z.string().min(2) });

// Expanded educational knowledge base the LLM ranks against
const knowledgeBase = [
  {
    id: "grammar-101",
    title: "Present vs Past Tense",
    excerpt: "Use present tense for habitual actions, past tense for completed actions.",
    tags: ["grammar", "tense", "english"],
  },
  {
    id: "vocab-travel",
    title: "Travel Vocabulary Essentials",
    excerpt: "Practice airport, hotel, and city navigation terms in context.",
    tags: ["vocabulary", "travel", "conversation"],
  },
  {
    id: "pronunciation-r",
    title: "Spanish Rolled R Practice",
    excerpt: "Tongue placement drills to improve rolled r pronunciation.",
    tags: ["pronunciation", "spanish", "speaking"],
  },
  {
    id: "subjunctive-spanish",
    title: "Spanish Subjunctive Mood",
    excerpt: "When and how to use the subjunctive for wishes, doubts, and emotions.",
    tags: ["grammar", "spanish", "subjunctive"],
  },
  {
    id: "numbers-french",
    title: "French Numbers and Counting",
    excerpt: "Master vigesimal counting — sixty-ten for 70, four-twenties for 80.",
    tags: ["vocabulary", "french", "numbers"],
  },
  {
    id: "german-cases",
    title: "German Grammatical Cases",
    excerpt: "Overview of nominative, accusative, dative, and genitive with article changes.",
    tags: ["grammar", "german", "cases"],
  },
  {
    id: "english-conditionals",
    title: "English Conditional Sentences",
    excerpt: "Zero, first, second, and third conditionals with examples and exercises.",
    tags: ["grammar", "english", "conditionals"],
  },
  {
    id: "listening-strategies",
    title: "Active Listening Strategies",
    excerpt: "Chunking, contextual guessing, and shadowing for comprehension improvement.",
    tags: ["listening", "comprehension", "strategies"],
  },
];

type KnowledgeEntry = (typeof knowledgeBase)[number];

/**
 * Try to parse a JSON array of IDs from the LLM response.
 * Falls back to keyword scoring when the LLM output cannot be parsed.
 */
function parseRankedIds(llmText: string, fallbackQuery: string): string[] {
  try {
    const match = llmText.match(/\[[\s\S]*?\]/);
    if (match) {
      const ids = JSON.parse(match[0]) as unknown;
      if (Array.isArray(ids) && ids.every((id) => typeof id === "string")) {
        return ids;
      }
    }
  } catch {
    // fall through to keyword fallback
  }

  // Keyword fallback when the LLM returns unparseable output
  const q = fallbackQuery.toLowerCase();
  return knowledgeBase
    .map((entry) => {
      const haystack =
        `${entry.title} ${entry.excerpt} ${entry.tags.join(" ")}`.toLowerCase();
      const score = q
        .split(" ")
        .filter((t) => t.length > 1)
        .reduce((n, t) => n + (haystack.includes(t) ? 1 : 0), 0);
      return { id: entry.id, score };
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((e) => e.id);
}

export async function POST(request: Request) {
  if (!featureFlags.aiSearch) {
    return Response.json({ error: "Search feature is disabled." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid search payload." }, { status: 400 });
  }

  const { text: sanitizedQuery } = sanitizeEducationalInput(parsed.data.query);

  const moderation = await moderateEducationalText(sanitizedQuery);
  if (!moderation.allowed) {
    return Response.json(
      { error: moderation.reason, flaggedCategories: moderation.flaggedCategories },
      { status: 403 },
    );
  }

  if (!canRunLlmRequest()) {
    return Response.json(
      { error: "Monthly AI budget limit reached. Please try again later." },
      { status: 429 },
    );
  }

  const prompt = searchRankingPrompt({
    query: sanitizedQuery,
    entries: knowledgeBase.map(({ id, title, tags }) => ({ id, title, tags })),
  });

  let rankedIds: string[];
  try {
    const result = await withProviderFailover((provider) =>
      provider.completeText({ prompt, signal: request.signal }),
    );
    rankedIds = parseRankedIds(result.text, sanitizedQuery);
  } catch {
    // If the LLM call completely fails, degrade to keyword matching
    rankedIds = parseRankedIds("", sanitizedQuery);
  }

  const index = new Map<string, KnowledgeEntry>(knowledgeBase.map((e) => [e.id, e]));
  const results = rankedIds
    .map((id) => index.get(id))
    .filter((e): e is KnowledgeEntry => e !== undefined)
    .slice(0, 5);

  return Response.json({ results });
}