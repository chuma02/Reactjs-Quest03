# AI Integration Insights

## Summary

This project converts a standard classroom chat into a guided AI language-learning experience. The implementation is structured around one provider interface, consistent route validation, and predictable safety controls.

## Main Technical Outcomes

- A provider abstraction isolates route code from SDK-specific details.
- Streaming is used in chat and generation where latency is most visible to learners.
- Moderation, redaction, and budget checks are built into the default request flow.
- Shared helper modules keep prompt logic, analytics, and governance consistent.
- A mock provider provides deterministic fallback behavior when live model calls fail.

## Architecture Decisions

### 1. Provider-first design

All model operations are routed through one interface for completion, streaming, and moderation. This makes provider switching a contained change.

### 2. Streaming packets with a small protocol

The app uses a compact packet model for SSE:

- meta
- token
- done
- error

This keeps client logic simple and resilient.

### 3. Safety pipeline by default

Input is sanitized, moderated, and logged before model calls. Output moderation is applied on non-streaming responses. These checks are not optional.

### 4. Operational controls in core flow

Budget limits, usage tracking, and rollout checks are part of normal request handling rather than afterthoughts.

## Prompting Patterns That Worked

- Assign role clearly.
- Specify exact output structure.
- Declare language and difficulty constraints early.

These rules improved consistency across tutoring, generation, and pronunciation responses.

## Compliance and Trust Measures

- PII redaction before provider calls
- Hashed identifiers in governance logs
- Input and output moderation checks
- User-facing guidance about AI limitations
- Abort controls for streamed actions

## Practical Limits

- Cost estimates are lightweight and approximate.
- Analytics are in-memory and not durable across restart.
- Streamed output moderation can be made finer-grained.

## Short Answers to Project Questions

1. LLMs enhance chat by adding corrective tutoring, translation support, pronunciation feedback, and adaptive practice.
2. Most useful capabilities are concise correction, contextual examples, and personalized next-step guidance.
3. Type safety is preserved via typed boundaries, schema validation, and a shared provider contract.
4. Duolingo-style alignment comes from short loops, immediate feedback, and progressive difficulty.
5. OpenAI gpt-4o-mini is a practical default for quality, latency, and cost; mock failover reduces outage risk.