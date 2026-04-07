"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { assessDifficultyAction } from "@/app/actions";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type SearchResult = {
  id: string;
  title: string;
  excerpt: string;
  tags: string[];
};

const initialMessages: ChatMessage[] = [
  {
    role: "assistant",
    content:
      "Hello! I am your AI tutor. Share a sentence in your target language and I will coach you.",
  },
];

export function AiClassroomApp() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState("spanish");
  const [difficulty, setDifficulty] = useState("beginner");
  const [isStreaming, setIsStreaming] = useState(false);
  const [generationMode, setGenerationMode] = useState("grammar");
  const [generationInput, setGenerationInput] = useState("");
  const [generationOutput, setGenerationOutput] = useState("");
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStage, setGenerationStage] = useState("idle");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [recommendation, setRecommendation] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [metrics, setMetrics] = useState<{ totalRequests: number; totalEstimatedCostUsd: number } | null>(null);
  const [contentType, setContentType] = useState("sentences");
  const [generationFeedback, setGenerationFeedback] = useState<"up" | "down" | null>(null);
  const [pronunciationPhrase, setPronunciationPhrase] = useState("");
  const [pronunciationAttempt, setPronunciationAttempt] = useState("");
  const [pronunciationFeedback, setPronunciationFeedback] = useState("");
  const [isPronunciationLoading, setIsPronunciationLoading] = useState(false);
  const [progressInsight, setProgressInsight] = useState("");
  const [isProgressLoading, setIsProgressLoading] = useState(false);
  const [assessmentInput, setAssessmentInput] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [adaptiveSuggestion, setAdaptiveSuggestion] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const generationAbortRef = useRef<AbortController | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const [assessmentState, assessmentAction, isAssessing] = useActionState(
    assessDifficultyAction,
    {},
  );

  const userId = useMemo(() => "student-demo-001", []);

  // Auto-scroll the chat to the latest message whenever messages update.
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const dismissed = window.localStorage.getItem("aiOnboardingDismissed") === "1";
    if (dismissed) {
      setShowOnboarding(false);
    }
  }, []);

  async function sendTutorMessage() {
    if (!input.trim() || isStreaming) {
      return;
    }

    const currentInput = input;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: currentInput }]);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    setIsStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          userId,
          language,
          difficulty,
          // Cap at 12 messages (6 turns) to stay within model token limits
          messages: [...messages, { role: "user", content: currentInput }].slice(-12),
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Streaming request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const packets = buffer.split("\n\n");
        buffer = packets.pop() ?? "";

        packets.forEach((packet) => {
          const line = packet
            .split("\n")
            .find((candidate) => candidate.startsWith("data: "));

          if (!line) {
            return;
          }

          // Use slice(6) to strip the "data: " prefix safely regardless of
          // whether the JSON payload itself contains the string "data: ".
          const payload = JSON.parse(line.slice(6)) as {
            type: "meta" | "token" | "done" | "error";
            value?: string;
            message?: string;
          };

          if (payload.type === "token" && payload.value) {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                next[next.length - 1] = {
                  ...last,
                  content: `${last.content}${payload.value}`,
                };
              }
              return next;
            });
          }

          if (payload.type === "error") {
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = {
                role: "assistant",
                content: payload.message ?? "Tutor stream failed.",
              };
              return next;
            });
          }

          if (payload.type === "done") {
            // Server signals end of stream — break out of the read loop
            // immediately rather than waiting for the socket to close.
            reader.cancel().catch(() => undefined);
          }
        });
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: "assistant",
          content: "Tutor response unavailable. Please try again.",
        };
        return next;
      });
    } finally {
      setIsStreaming(false);
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }

  async function runGeneration() {
    if (!generationInput.trim() || isGenerating) return;
    setIsGenerating(true);
    setGenerationOutput("");
    setGenerationFeedback(null);
    setGenerationProgress(5);
    setGenerationStage("starting");

    const requestBody: Record<string, unknown> = {
      mode: generationMode,
      language,
      difficulty,
      inputText: generationInput,
      targetLanguage: "english",
    };
    if (generationMode === "content") {
      requestBody.contentType = contentType;
    }

    const controller = new AbortController();
    generationAbortRef.current = controller;

    try {
      const response = await fetch("/api/ai/generate/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok || !response.body) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Generation failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const packets = buffer.split("\n\n");
        buffer = packets.pop() ?? "";

        for (const packet of packets) {
          const line = packet
            .split("\n")
            .find((candidate) => candidate.startsWith("data: "));

          if (!line) {
            continue;
          }

          const payload = JSON.parse(line.slice(6)) as {
            type: "meta" | "token" | "done" | "error";
            value?: string;
            message?: string;
            stage?: string;
            progress?: number;
          };

          if (typeof payload.progress === "number") {
            setGenerationProgress(payload.progress);
          }

          if (payload.type === "meta" && payload.stage) {
            setGenerationStage(payload.stage);
          }

          if (payload.type === "token" && payload.value) {
            setGenerationOutput((prev) => `${prev}${payload.value}`);
            setGenerationStage("generating");
          }

          if (payload.type === "error") {
            throw new Error(payload.message ?? "Streaming generation failed.");
          }

          if (payload.type === "done") {
            setGenerationProgress(100);
            setGenerationStage("done");
            reader.cancel().catch(() => undefined);
            break;
          }
        }
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      if (isAbort) {
        setGenerationOutput((prev) => prev || "Generation cancelled.");
      } else {
        setGenerationOutput(err instanceof Error ? err.message : "Generation failed. Please try again.");
      }
      setGenerationProgress(100);
      setGenerationStage("error");
    } finally {
      setIsGenerating(false);
      generationAbortRef.current = null;
    }
  }

  function stopGenerationStreaming() {
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    setIsGenerating(false);
    setGenerationStage("cancelled");
  }

  async function runSearch() {
    const response = await fetch("/api/ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: searchQuery }),
    });

    const data = (await response.json()) as { results?: SearchResult[] };
    setSearchResults(data.results ?? []);
  }

  async function runRecommendations() {
    const response = await fetch("/api/ai/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language,
        weakSkills: ["pronunciation", "past tense"],
      }),
    });

    const data = (await response.json()) as { recommendation?: string; error?: string };
    setRecommendation(data.recommendation ?? data.error ?? "No recommendation available.");
  }

  // When the difficulty assessment returns a CEFR level, automatically update
  // the difficulty selector and surface an adaptive content suggestion so the
  // learner knows what to try next.
  useEffect(() => {
    if (!assessmentState.result) return;
    const text = assessmentState.result.toUpperCase();
    if (/\bC[12]\b/.test(text)) {
      setDifficulty("advanced");
      setAdaptiveSuggestion(
        "Advanced level detected. Try the Scenario mode with a complex topic, or generate a Quiz to challenge yourself.",
      );
    } else if (/\bB[12]\b/.test(text)) {
      setDifficulty("intermediate");
      setAdaptiveSuggestion(
        "Intermediate level detected. Dialogue generation works well here — pick a real-life topic to practice natural conversation flow.",
      );
    } else if (/\bA[12]\b/.test(text)) {
      setDifficulty("beginner");
      setAdaptiveSuggestion(
        "Beginner level detected. Start with Vocabulary lists or Example Sentences to build core words before moving to dialogue.",
      );
    }
  }, [assessmentState.result]);

  async function runPronunciationFeedback() {
    if (!pronunciationPhrase.trim() || !pronunciationAttempt.trim() || isPronunciationLoading) {
      return;
    }

    setIsPronunciationLoading(true);
    setPronunciationFeedback("");
    try {
      const response = await fetch("/api/ai/pronunciation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          phrase: pronunciationPhrase,
          studentAttempt: pronunciationAttempt,
        }),
      });
      const data = (await response.json()) as { feedback?: string; error?: string };
      setPronunciationFeedback(data.feedback ?? data.error ?? "No pronunciation feedback available.");
    } catch {
      setPronunciationFeedback("Pronunciation feedback failed. Please try again.");
    } finally {
      setIsPronunciationLoading(false);
    }
  }

  async function runProgressInsight() {
    if (isProgressLoading) {
      return;
    }

    setIsProgressLoading(true);
    setProgressInsight("");
    try {
      const weakSkills = [
        generationFeedback === "down" ? "output quality preference mismatch" : null,
        searchQuery.toLowerCase().includes("pronunciation") ? "pronunciation" : null,
        searchQuery.toLowerCase().includes("grammar") ? "grammar" : null,
      ].filter((item): item is string => item !== null);

      const recentMessages = messages.slice(-8).map((m) => m.content);
      const response = await fetch("/api/ai/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          difficulty,
          recentMessages,
          weakSkills,
          generationFeedback: generationFeedback ?? "none",
        }),
      });
      const data = (await response.json()) as { insight?: string; error?: string };
      setProgressInsight(data.insight ?? data.error ?? "No progress insight available.");
    } catch {
      setProgressInsight("Unable to generate progress insight right now.");
    } finally {
      setIsProgressLoading(false);
    }
  }

  async function loadMetrics() {
    const response = await fetch("/api/ai/metrics");
    const data = (await response.json()) as {
      totalRequests: number;
      totalEstimatedCostUsd: number;
    };
    setMetrics(data);
  }

  const latestUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const assessmentValidationMessage =
    assessmentInput.trim().length === 0
      ? "Add a sentence sample to assess level."
      : assessmentInput.trim().length < 6
        ? "Sample is too short (minimum 6 characters)."
        : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {showOnboarding && (
        <section className="rounded-xl border border-black/10 p-4 lg:col-span-2 dark:border-white/20" aria-live="polite">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">AI Feature Guide</h2>
              <p className="mt-1 text-sm text-black/70 dark:text-white/70">
                The tutor streams responses in real time, can be interrupted, and may make mistakes.
                Verify important feedback, especially translations and pronunciation tips.
              </p>
              <ul className="mt-2 list-disc pl-5 text-sm text-black/70 dark:text-white/70">
                <li>Use "Abort" or "Cancel" any time to keep control.</li>
                <li>Use quality feedback buttons so the app adapts recommendations.</li>
                <li>Ask for explanations when a correction is unclear.</li>
              </ul>
            </div>
            <button
              type="button"
              className="rounded-md border border-black/20 px-3 py-2 text-sm"
              onClick={() => {
                setShowOnboarding(false);
                window.localStorage.setItem("aiOnboardingDismissed", "1");
              }}
            >
              Dismiss
            </button>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-black/10 p-4 dark:border-white/20">
        <h2 className="text-lg font-semibold">Streaming AI Tutor Chat</h2>
        <div className="mt-2 flex gap-2">
          <select
            className="rounded-md border border-black/15 px-2 py-1 text-sm"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            <option value="english">English</option>
            <option value="spanish">Spanish</option>
            <option value="french">French</option>
            <option value="german">German</option>
          </select>
          <select
            className="rounded-md border border-black/15 px-2 py-1 text-sm"
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value)}
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        <div className="mt-3 h-64 space-y-2 overflow-y-auto rounded-lg border border-black/10 p-2 text-sm dark:border-white/20">
          {messages.map((message, index) => {
            const isLastAssistant =
              message.role === "assistant" && index === messages.length - 1;
            return (
              <p key={`${message.role}-${index}`}>
                <span className="font-semibold">
                  {message.role === "user" ? "You" : "Tutor"}:
                </span>{" "}
                {message.content
                  ? (
                    <>
                      {message.content}
                      {/* Blinking cursor while this bubble is still streaming */}
                      {isLastAssistant && isStreaming && (
                        <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-current align-middle" />
                      )}
                    </>
                  )
                  : isLastAssistant && isStreaming
                    ? <span className="italic text-black/50 dark:text-white/50">Typing…</span>
                    : null}
              </p>
            );
          })}
          {/* Invisible anchor kept at the bottom for auto-scroll */}
          <div ref={chatBottomRef} />
        </div>

        <div className="mt-3 flex gap-2">
          <input
            className="w-full rounded-md border border-black/15 px-2 py-2 text-sm"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendTutorMessage();
              }
            }}
            placeholder="Type your language practice sentence..."
          />
          <button
            className="rounded-md border border-black/20 px-3 py-2 text-sm"
            onClick={sendTutorMessage}
            type="button"
          >
            Send
          </button>
          <button
            className="rounded-md border border-black/20 px-3 py-2 text-sm"
            onClick={stopStreaming}
            type="button"
            disabled={!isStreaming}
          >
            Abort
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-black/10 p-4 dark:border-white/20">
        <h2 className="text-lg font-semibold">AI Content Generation</h2>
        <div className="mt-2 flex gap-2">
          <select
            className="rounded-md border border-black/15 px-2 py-1 text-sm"
            value={generationMode}
            onChange={(event) => setGenerationMode(event.target.value)}
          >
            <option value="grammar">Grammar correction</option>
            <option value="translation">Translation help</option>
            <option value="scenario">Conversation scenario</option>
            <option value="content">Content generation</option>
          </select>
          {generationMode === "content" && (
            <select
              className="rounded-md border border-black/15 px-2 py-1 text-sm"
              value={contentType}
              onChange={(event) => setContentType(event.target.value)}
            >
              <option value="vocabulary">Vocabulary list</option>
              <option value="sentences">Example sentences</option>
              <option value="dialogue">Dialogue</option>
              <option value="quiz">Quiz questions</option>
            </select>
          )}
          <button
            className="rounded-md border border-black/20 px-3 py-2 text-sm disabled:opacity-50"
            type="button"
            onClick={runGeneration}
            disabled={isGenerating || !generationInput.trim()}
          >
            {isGenerating ? "Streaming..." : generationOutput ? "Regenerate" : "Generate"}
          </button>
          <button
            className="rounded-md border border-black/20 px-3 py-2 text-sm disabled:opacity-50"
            type="button"
            onClick={stopGenerationStreaming}
            disabled={!isGenerating}
          >
            Cancel
          </button>
        </div>

        <div className="mt-2" aria-live="polite" aria-atomic="true">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-black/60 dark:text-white/60">
              {isGenerating
                ? generationStage === "moderating"
                  ? "Final safety checks..."
                  : "Streaming lesson output..."
                : generationStage === "done"
                  ? "Completed"
                  : generationStage === "cancelled"
                    ? "Cancelled"
                    : generationStage === "error"
                      ? "Needs retry"
                      : "Ready"}
            </span>
            <span>{generationProgress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded bg-black/10 dark:bg-white/10">
            <div
              className="h-full bg-black/70 transition-all duration-200 dark:bg-white/70"
              style={{ width: `${generationProgress}%` }}
            />
          </div>
        </div>

        <textarea
          className="mt-3 h-24 w-full rounded-md border border-black/15 p-2 text-sm"
          value={generationInput}
          onChange={(event) => setGenerationInput(event.target.value)}
          placeholder="Enter text to correct/translate or a scenario goal..."
        />
        <pre className="mt-3 h-32 overflow-auto rounded-md border border-black/10 p-2 text-xs whitespace-pre-wrap dark:border-white/20">
          {generationOutput || "Generated educational output appears here."}
          {isGenerating && <span className="ml-1 inline-block animate-pulse">|</span>}
        </pre>
        {generationOutput && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="text-black/50 dark:text-white/50">Output quality:</span>
            <button
              type="button"
              aria-label="Good output"
              className={`rounded border px-2 py-0.5 ${generationFeedback === "up" ? "border-green-500 text-green-600 font-semibold" : "border-black/20"}`}
              onClick={() => setGenerationFeedback("up")}
            >
              Good
            </button>
            <button
              type="button"
              aria-label="Poor output"
              className={`rounded border px-2 py-0.5 ${generationFeedback === "down" ? "border-red-500 text-red-600 font-semibold" : "border-black/20"}`}
              onClick={() => setGenerationFeedback("down")}
            >
              Poor
            </button>
            {generationFeedback === "up" && (
              <span className="text-green-600">Helpful feedback captured for your review.</span>
            )}
            {generationFeedback === "down" && (
              <span className="text-black/50 dark:text-white/50">Try regenerating or adjusting the difficulty level.</span>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-black/10 p-4 dark:border-white/20">
        <h2 className="text-lg font-semibold">Pronunciation Coach</h2>
        <div className="mt-2 space-y-2">
          <input
            className="w-full rounded-md border border-black/15 px-2 py-2 text-sm"
            value={pronunciationPhrase}
            onChange={(event) => setPronunciationPhrase(event.target.value)}
            placeholder="Target phrase (what learner should say)"
          />
          <input
            className="w-full rounded-md border border-black/15 px-2 py-2 text-sm"
            value={pronunciationAttempt}
            onChange={(event) => setPronunciationAttempt(event.target.value)}
            placeholder="Learner attempt transcript"
          />
          <button
            className="rounded-md border border-black/20 px-3 py-2 text-sm disabled:opacity-50"
            type="button"
            onClick={runPronunciationFeedback}
            disabled={isPronunciationLoading || !pronunciationPhrase.trim() || !pronunciationAttempt.trim()}
          >
            {isPronunciationLoading ? "Analyzing..." : "Get Pronunciation Feedback"}
          </button>
        </div>
        <pre className="mt-3 h-28 overflow-auto rounded-md border border-black/10 p-2 text-xs whitespace-pre-wrap dark:border-white/20">
          {pronunciationFeedback || "Pronunciation coaching appears here."}
        </pre>
      </section>

      <section className="rounded-xl border border-black/10 p-4 dark:border-white/20">
        <h2 className="text-lg font-semibold">AI Search + Recommendations</h2>
        <div className="mt-2 flex gap-2">
          <input
            className="w-full rounded-md border border-black/15 px-2 py-2 text-sm"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search grammar, pronunciation, vocabulary..."
          />
          <button
            className="rounded-md border border-black/20 px-3 py-2 text-sm"
            type="button"
            onClick={runSearch}
          >
            Search
          </button>
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          {searchResults.map((result) => (
            <li key={result.id} className="rounded-md border border-black/10 p-2 dark:border-white/20">
              <p className="font-semibold">{result.title}</p>
              <p>{result.excerpt}</p>
            </li>
          ))}
        </ul>
        <button
          className="mt-3 rounded-md border border-black/20 px-3 py-2 text-sm"
          type="button"
          onClick={runRecommendations}
        >
          Generate Study Recommendations
        </button>
        <pre className="mt-2 h-20 overflow-auto rounded-md border border-black/10 p-2 text-xs whitespace-pre-wrap dark:border-white/20">
          {recommendation || "Personalized plan appears here."}
        </pre>
        <button
          className="mt-2 rounded-md border border-black/20 px-3 py-2 text-sm disabled:opacity-50"
          type="button"
          onClick={runProgressInsight}
          disabled={isProgressLoading}
        >
          {isProgressLoading ? "Building insight..." : "Generate Progress Insight"}
        </button>
        <pre className="mt-2 h-20 overflow-auto rounded-md border border-black/10 p-2 text-xs whitespace-pre-wrap dark:border-white/20">
          {progressInsight || "LLM-powered progress insight appears here."}
        </pre>
      </section>

      <section className="rounded-xl border border-black/10 p-4 dark:border-white/20">
        <h2 className="text-lg font-semibold">AI Form Assistance + Monitoring</h2>
        <form action={assessmentAction} className="space-y-2">
          <input
            type="text"
            name="sampleText"
            className="w-full rounded-md border border-black/15 px-2 py-2 text-sm"
            placeholder="Paste a learner sentence for difficulty assessment"
            value={assessmentInput}
            onChange={(event) => setAssessmentInput(event.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md border border-black/20 px-2 py-1 text-xs"
              onClick={() => setAssessmentInput(input || latestUserMessage)}
            >
              Autofill from chat
            </button>
            {assessmentValidationMessage && (
              <span className="text-xs text-red-600">{assessmentValidationMessage}</span>
            )}
          </div>
          <select
            name="language"
            defaultValue={language}
            className="rounded-md border border-black/15 px-2 py-1 text-sm"
          >
            <option value="english">English</option>
            <option value="spanish">Spanish</option>
            <option value="french">French</option>
            <option value="german">German</option>
          </select>
          <button
            className="rounded-md border border-black/20 px-3 py-2 text-sm"
            disabled={isAssessing || Boolean(assessmentValidationMessage)}
            type="submit"
          >
            {isAssessing ? "Assessing..." : "Assess Difficulty"}
          </button>
        </form>

        <pre className="mt-3 h-20 overflow-auto rounded-md border border-black/10 p-2 text-xs whitespace-pre-wrap dark:border-white/20">
          {assessmentState.result ?? assessmentState.error ?? "Assessment results appear here."}
        </pre>
        {adaptiveSuggestion && (
          <p className="mt-2 rounded-md border border-black/10 bg-black/5 px-3 py-2 text-xs text-black/80 dark:border-white/20 dark:bg-white/5 dark:text-white/80">
            <span className="font-semibold">Adaptive suggestion: </span>
            {adaptiveSuggestion}
          </p>
        )}

        <button
          className="mt-3 rounded-md border border-black/20 px-3 py-2 text-sm"
          type="button"
          onClick={loadMetrics}
        >
          Refresh AI Metrics
        </button>
        <pre className="mt-2 rounded-md border border-black/10 p-2 text-xs whitespace-pre-wrap dark:border-white/20">
          {metrics
            ? JSON.stringify(metrics, null, 2)
            : "Operational metrics and estimated cost will appear here."}
        </pre>
      </section>
    </div>
  );
}