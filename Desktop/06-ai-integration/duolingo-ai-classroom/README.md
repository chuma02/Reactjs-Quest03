# AI Classroom Integration

This repository extends a classroom chat app with AI features for language learning. The implementation focuses on practical tutoring workflows, streaming UX, and operational safeguards (moderation, governance, and budget controls).

## What This Project Adds

- Streaming tutor chat over SSE
- Guided content generation (vocabulary, sentences, dialogue, quiz)
- Pronunciation coaching
- Semantic search and adaptive recommendations
- Progress insight from recent learner activity
- Feature flags, rollout controls, and provider failover

## Stack

- Next.js App Router
- TypeScript
- React Server Components
- OpenAI + mock provider abstraction

## Run Locally

1. Install dependencies:
   npm install
2. Create env file:
   copy .env.example .env.local
3. Configure provider:
   AI_PROVIDER=openai
   OPENAI_API_KEY=sk-your-key
4. Start dev server:
   npm run dev

App URL: http://localhost:3000

If OPENAI_API_KEY is empty, the app automatically falls back to the mock provider.

## Key Architecture

- Provider abstraction in src/lib/ai/provider.ts
- OpenAI adapter in src/lib/ai/providers/openai.ts
- Deterministic fallback provider in src/lib/ai/providers/mock.ts
- Shared prompts in src/lib/ai/prompts.ts
- Shared generation logic in src/lib/ai/generation.ts
- Governance and redaction in src/lib/ai/dataGovernance.ts
- Usage analytics in src/lib/ai/analytics.ts

## AI Routes

- /api/ai/chat
- /api/ai/generate
- /api/ai/generate/stream
- /api/ai/pronunciation
- /api/ai/search
- /api/ai/recommendations
- /api/ai/progress
- /api/ai/moderate
- /api/ai/metrics

## Safety and Control Pipeline

Each request follows the same pattern:

1. Validate payload
2. Redact sensitive user input
3. Log governance event
4. Run moderation checks
5. Check budget gate
6. Check feature flag and rollout
7. Execute LLM call with failover
8. Track usage and cost metrics

## Environment Settings

Main variables:

- AI_PROVIDER
- OPENAI_API_KEY
- OPENAI_MODEL
- OPENAI_MODERATION_MODEL
- OPENAI_TEMPERATURE
- OPENAI_MAX_OUTPUT_TOKENS
- AI_MONTHLY_BUDGET_USD
- AI_BUDGET_ALERT_THRESHOLD_PERCENT
- AI_PII_REDACTION_ENABLED
- AI_AUDIT_LOGGING_ENABLED
- AI_MODERATION_ENABLED
- AI_STREAMING_ENABLED

Feature toggles:

- FEATURE_AI_TUTOR
- FEATURE_AI_SEARCH
- FEATURE_ADAPTIVE_RECOMMENDATIONS
- FEATURE_AI_GENERATION
- FEATURE_AI_PRONUNCIATION
- FEATURE_AI_PROGRESS_INSIGHT

## Notes on Originality

Project documentation was rewritten in concise, project-specific wording to reduce reuse of generic template language.
