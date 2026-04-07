import { getUsageSnapshot } from "@/lib/ai/analytics";

export async function UsageSummary() {
  const snapshot = getUsageSnapshot();
  const successRatePercent = (snapshot.successRate * 100).toFixed(1);
  const providerEntries = Object.entries(snapshot.providerBreakdown);
  const experimentEntries = Object.entries(snapshot.experimentBreakdown);
  const utilizationPct = Math.min(100, snapshot.budgetStatus.utilizationPercent);

  return (
    <section className="rounded-xl border border-black/10 p-4 dark:border-white/20">
      <h2 className="text-lg font-semibold">Operational Snapshot</h2>

      {/* Primary metrics */}
      <div className="mt-2 grid gap-3 text-sm md:grid-cols-6">
        <div>
          <p className="text-black/70 dark:text-white/70">Requests</p>
          <p className="text-xl font-semibold">{snapshot.totalRequests}</p>
        </div>
        <div>
          <p className="text-black/70 dark:text-white/70">Errors</p>
          <p className="text-xl font-semibold">{snapshot.errorCount}</p>
        </div>
        <div>
          <p className="text-black/70 dark:text-white/70">Cost (USD)</p>
          <p className="text-xl font-semibold">{snapshot.totalEstimatedCostUsd.toFixed(4)}</p>
        </div>
        <div>
          <p className="text-black/70 dark:text-white/70">Budget Left</p>
          <p className="text-xl font-semibold">{snapshot.budget.remainingUsd.toFixed(4)}</p>
        </div>
        <div>
          <p className="text-black/70 dark:text-white/70">Success Rate</p>
          <p className="text-xl font-semibold">{successRatePercent}%</p>
        </div>
        <div>
          {/* Failover count surfaces silent provider degradation that would
              otherwise be invisible in request-level metrics. */}
          <p className="text-black/70 dark:text-white/70">Failovers</p>
          <p className="text-xl font-semibold">{snapshot.failoverCount}</p>
        </div>
      </div>

      {/* Budget utilization bar — colour-coded: green → yellow → red */}
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-xs text-black/60 dark:text-white/60">
          <span>Budget utilization</span>
          <span>{snapshot.budgetStatus.utilizationPercent}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded bg-black/10 dark:bg-white/10">
          <div
            className={`h-full transition-all duration-300 ${
              snapshot.budgetStatus.alertTriggered
                ? "bg-red-500"
                : utilizationPct > 50
                  ? "bg-yellow-500"
                  : "bg-black/60 dark:bg-white/60"
            }`}
            style={{ width: `${utilizationPct}%` }}
          />
        </div>
      </div>
      <p className="mt-1 text-xs text-black/60 dark:text-white/60">
        Budget status: {snapshot.budgetStatus.canRunRequest ? "active" : "throttled"}
        {snapshot.budgetStatus.alertTriggered
          ? ` — alert: ${snapshot.budgetStatus.utilizationPercent}% of monthly budget used`
          : ""}
      </p>

      {/* Provider breakdown — distinguishes real vs mock traffic at a glance */}
      {providerEntries.length > 0 && (
        <div className="mt-3 border-t border-black/10 pt-3 dark:border-white/10">
          <p className="text-xs font-medium text-black/70 dark:text-white/70">
            Provider breakdown
          </p>
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            {providerEntries.map(([provider, count]) => (
              <span
                key={provider}
                className="rounded border border-black/10 px-2 py-0.5 dark:border-white/10"
              >
                {provider}: {count} req
              </span>
            ))}
          </div>
        </div>
      )}

      {/* A/B experiment breakdown — shows variant distribution for each
          running experiment so effectiveness can be measured. */}
      {experimentEntries.length > 0 && (
        <div className="mt-3 border-t border-black/10 pt-3 dark:border-white/10">
          <p className="text-xs font-medium text-black/70 dark:text-white/70">
            A/B experiment breakdown
          </p>
          <div className="mt-1 space-y-1 text-xs">
            {experimentEntries.map(([experiment, variants]) => (
              <div key={experiment}>
                <span className="font-medium">{experiment}:</span>{" "}
                <span className="text-black/60 dark:text-white/60">
                  {Object.entries(variants)
                    .map(([variant, count]) => `${variant}=${count}`)
                    .join(", ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}