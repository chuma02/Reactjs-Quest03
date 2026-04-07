import { aiConfig } from "@/lib/ai/config";
import type { LLMUsage } from "@/types/ai";

type UsageEvent = LLMUsage & {
  route: string;
  timestamp: string;
  success: boolean;
  experiment?: string;
  variant?: string;
};

type RouteMetrics = {
  requests: number;
  errors: number;
  avgLatencyMs: number;
  // Running cost total for this route so cost-per-feature is visible in snapshots.
  estimatedCostUsd: number;
};

type UsageStore = {
  totalRequests: number;
  totalEstimatedCostUsd: number;
  providerBreakdown: Record<string, number>;
  errorCount: number;
  // Incremented each time withProviderFailover switches to the mock provider.
  failoverCount: number;
  routeBreakdown: Record<string, RouteMetrics>;
  experimentBreakdown: Record<string, Record<string, number>>;
  recentEvents: UsageEvent[];
};

const usageState: UsageStore = {
  totalRequests: 0,
  totalEstimatedCostUsd: 0,
  providerBreakdown: {},
  errorCount: 0,
  failoverCount: 0,
  routeBreakdown: {},
  experimentBreakdown: {},
  recentEvents: [],
};

export function trackUsage(event: Omit<UsageEvent, "timestamp">) {
  usageState.totalRequests += 1;
  usageState.providerBreakdown[event.provider] =
    (usageState.providerBreakdown[event.provider] ?? 0) + 1;
  usageState.totalEstimatedCostUsd += event.estimatedCostUsd ?? 0;
  usageState.errorCount += event.success ? 0 : 1;

  const currentRoute = usageState.routeBreakdown[event.route] ?? {
    requests: 0,
    errors: 0,
    avgLatencyMs: 0,
    estimatedCostUsd: 0,
  };
  const nextRequests = currentRoute.requests + 1;
  const nextAvgLatency =
    (currentRoute.avgLatencyMs * currentRoute.requests + event.latencyMs) / nextRequests;

  usageState.routeBreakdown[event.route] = {
    requests: nextRequests,
    errors: currentRoute.errors + (event.success ? 0 : 1),
    avgLatencyMs: Number(nextAvgLatency.toFixed(2)),
    estimatedCostUsd: Number(
      (currentRoute.estimatedCostUsd + (event.estimatedCostUsd ?? 0)).toFixed(6),
    ),
  };

  if (event.experiment && event.variant) {
    const experiment = usageState.experimentBreakdown[event.experiment] ?? {};
    experiment[event.variant] = (experiment[event.variant] ?? 0) + 1;
    usageState.experimentBreakdown[event.experiment] = experiment;
  }

  usageState.recentEvents.unshift({ ...event, timestamp: new Date().toISOString() });
  usageState.recentEvents = usageState.recentEvents.slice(0, 50);
}

export function isBudgetExceeded() {
  return usageState.totalEstimatedCostUsd >= aiConfig.monthlyBudgetUsd;
}

export function canRunLlmRequest(estimatedReserveUsd = 0.01) {
  const remaining = aiConfig.monthlyBudgetUsd - usageState.totalEstimatedCostUsd;
  return remaining >= estimatedReserveUsd;
}

export function isBudgetAlertTriggered() {
  if (aiConfig.monthlyBudgetUsd <= 0) {
    return true;
  }
  const utilization = (usageState.totalEstimatedCostUsd / aiConfig.monthlyBudgetUsd) * 100;
  return utilization >= aiConfig.budgetAlertThresholdPercent;
}

/**
 * Called by withProviderFailover whenever the primary provider fails and the
 * application falls back to the mock provider. Surfaces in the metrics dashboard
 * so reliability degradation is immediately visible.
 */
export function recordProviderFailover() {
  usageState.failoverCount += 1;
}

export function getUsageSnapshot() {
  const budgetRemaining = Math.max(
    0,
    aiConfig.monthlyBudgetUsd - usageState.totalEstimatedCostUsd,
  );
  const successRate =
    usageState.totalRequests === 0
      ? 1
      : (usageState.totalRequests - usageState.errorCount) / usageState.totalRequests;
  const budgetUtilizationPercent =
    aiConfig.monthlyBudgetUsd <= 0
      ? 100
      : (usageState.totalEstimatedCostUsd / aiConfig.monthlyBudgetUsd) * 100;

  return {
    ...usageState,
    successRate: Number(successRate.toFixed(4)),
    budgetStatus: {
      exceeded: isBudgetExceeded(),
      canRunRequest: canRunLlmRequest(),
      alertThresholdPercent: aiConfig.budgetAlertThresholdPercent,
      utilizationPercent: Number(budgetUtilizationPercent.toFixed(2)),
      alertTriggered: isBudgetAlertTriggered(),
    },
    budget: {
      monthlyBudgetUsd: aiConfig.monthlyBudgetUsd,
      remainingUsd: Number(budgetRemaining.toFixed(4)),
    },
  };
}