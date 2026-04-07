import { getUsageSnapshot } from "@/lib/ai/analytics";
import { featureFlags } from "@/lib/ai/config";
import { getGovernanceSnapshot } from "@/lib/ai/dataGovernance";

export async function GET() {
  const usage = getUsageSnapshot();
  return Response.json({
    ...usage,
    governance: getGovernanceSnapshot(),
    // Expose current feature flag state so ops tooling can see enabled features
    // without needing direct access to server environment variables.
    features: featureFlags,
  });
}