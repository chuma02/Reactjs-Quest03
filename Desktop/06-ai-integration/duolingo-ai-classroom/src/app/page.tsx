import { Suspense } from "react";
import { AiClassroomApp } from "@/components/AiClassroomApp";
import { UsageSummary } from "@/components/UsageSummary";

export default function Home() {
  return (
    <main className="min-h-screen bg-background px-4 py-6 md:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header className="rounded-xl border border-black/10 p-4 dark:border-white/20">
          <h1 className="text-2xl font-semibold">Duolingo AI Classroom</h1>
          <p className="text-sm text-black/70 dark:text-white/70">
            Type-safe educational AI platform with streaming tutor responses,
            moderation, and provider failover.
          </p>
        </header>

        <Suspense
          fallback={
            <div className="rounded-xl border border-black/10 p-4 text-sm dark:border-white/20">
              Loading AI usage snapshot...
            </div>
          }
        >
          <UsageSummary />
        </Suspense>

        <AiClassroomApp />
      </div>
    </main>
  );
}
