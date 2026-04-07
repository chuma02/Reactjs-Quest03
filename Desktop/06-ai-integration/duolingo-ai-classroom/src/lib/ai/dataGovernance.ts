import { createHash } from "crypto";
import { aiConfig } from "@/lib/ai/config";

type GovernanceEvent = {
  route: string;
  userHash: string;
  redactionCount: number;
  timestamp: string;
};

type GovernanceStore = {
  totalEvents: number;
  totalRedactions: number;
  recentEvents: GovernanceEvent[];
};

const governanceState: GovernanceStore = {
  totalEvents: 0,
  totalRedactions: 0,
  recentEvents: [],
};

const piiPatterns = [
  { category: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  {
    category: "phone",
    pattern: /\b(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g,
  },
  { category: "credit-card", pattern: /\b(?:\d[ -]*?){13,16}\b/g },
];

export function hashUserIdentifier(identifier: string): string {
  return createHash("sha256")
    .update(`${aiConfig.governanceSalt}:${identifier}`)
    .digest("hex")
    .slice(0, 16);
}

export function sanitizeEducationalInput(text: string) {
  if (!aiConfig.piiRedactionEnabled) {
    return { text, redactionCount: 0, categories: [] as string[] };
  }

  let sanitized = text;
  let redactionCount = 0;
  const categories: string[] = [];

  for (const rule of piiPatterns) {
    const matches = sanitized.match(rule.pattern);
    if (!matches || matches.length === 0) {
      continue;
    }

    redactionCount += matches.length;
    categories.push(rule.category);
    sanitized = sanitized.replace(rule.pattern, `[REDACTED_${rule.category.toUpperCase()}]`);
  }

  return {
    text: sanitized,
    redactionCount,
    categories,
  };
}

export function recordGovernanceEvent(input: {
  route: string;
  userId: string;
  redactionCount: number;
}) {
  if (!aiConfig.auditLoggingEnabled) {
    return;
  }

  governanceState.totalEvents += 1;
  governanceState.totalRedactions += input.redactionCount;
  governanceState.recentEvents.unshift({
    route: input.route,
    userHash: hashUserIdentifier(input.userId),
    redactionCount: input.redactionCount,
    timestamp: new Date().toISOString(),
  });

  governanceState.recentEvents = governanceState.recentEvents.slice(0, 100);
}

export function getGovernanceSnapshot() {
  return {
    ...governanceState,
    controls: {
      piiRedactionEnabled: aiConfig.piiRedactionEnabled,
      auditLoggingEnabled: aiConfig.auditLoggingEnabled,
      dataRetentionDays: aiConfig.dataRetentionDays,
    },
  };
}
