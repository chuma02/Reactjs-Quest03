export type TutorVariant = "control" | "guided";

function hashIdentifier(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function getTutorVariant(userId: string): TutorVariant {
  return hashIdentifier(userId) % 2 === 0 ? "control" : "guided";
}

export function isUserInRollout(userId: string, rolloutPercent: number) {
  const clamped = Math.max(0, Math.min(100, rolloutPercent));
  if (clamped >= 100) {
    return true;
  }
  if (clamped <= 0) {
    return false;
  }
  return hashIdentifier(userId) % 100 < clamped;
}

/**
 * Deterministically assigns a user to one variant for any named experiment.
 * The same (experimentName, userId) pair always returns the same variant,
 * enabling consistent user experience and reliable A/B measurement across
 * sessions without requiring a database.
 *
 * @param experimentName - Unique experiment identifier (e.g. "onboarding_flow_v2")
 * @param userId         - Stable user identifier
 * @param variants       - Non-empty tuple of variant labels; first entry is control
 * @returns The assigned variant label
 */
export function getExperimentVariant<T extends string>(
  experimentName: string,
  userId: string,
  variants: readonly [T, ...T[]],
): T {
  const index = hashIdentifier(`${experimentName}:${userId}`) % variants.length;
  return variants[index];
}