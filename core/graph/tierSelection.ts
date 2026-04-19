import type { Tier } from './types';

export const TIER_THRESHOLDS = {
  tier1to2: 0.7,
  tier0to1: 0.35,
  hysteresis: 0.05,
  phoneBias: 0.15,
  phoneViewportCutoff: 500,
} as const;

export interface TierSelectionContext {
  totalCommits: number;
  spanSeconds?: number;
}

function baseTierForScale(scale: number, threshold0to1: number, threshold1to2: number): Tier {
  if (scale >= threshold1to2) return 2;
  if (scale >= threshold0to1) return 1;
  return 0;
}

function applyClamps(tier: Tier, totalCommits: number, spanSeconds?: number): Tier {
  if (totalCommits < 10) return 2;
  const fourteenDays = 14 * 24 * 60 * 60;
  const tightRepo =
    totalCommits < 50 || (spanSeconds !== undefined && spanSeconds < fourteenDays);
  if (tightRepo && tier < 1) return 1;
  return tier;
}

export function selectTier(
  zoomLevel: number,
  viewportWidth: number,
  totalCommits: number,
  currentTier?: Tier,
  context?: TierSelectionContext,
): Tier {
  const phoneBias =
    viewportWidth < TIER_THRESHOLDS.phoneViewportCutoff ? TIER_THRESHOLDS.phoneBias : 0;
  const threshold1to2 = TIER_THRESHOLDS.tier1to2 + phoneBias;
  const threshold0to1 = TIER_THRESHOLDS.tier0to1;
  const H = TIER_THRESHOLDS.hysteresis;

  const target = applyClamps(
    baseTierForScale(zoomLevel, threshold0to1, threshold1to2),
    context?.totalCommits ?? totalCommits,
    context?.spanSeconds,
  );

  if (currentTier === undefined) return target;

  if (target === currentTier) return currentTier;

  if (target > currentTier) {
    if (currentTier === 0 && zoomLevel > threshold0to1 + H) return applyClamps(1, totalCommits, context?.spanSeconds);
    if (currentTier === 1 && zoomLevel > threshold1to2 + H) return applyClamps(2, totalCommits, context?.spanSeconds);
    return currentTier;
  }

  if (currentTier === 2 && zoomLevel < threshold1to2 - H) return applyClamps(1, totalCommits, context?.spanSeconds);
  if (currentTier === 1 && zoomLevel < threshold0to1 - H) return applyClamps(0, totalCommits, context?.spanSeconds);
  return currentTier;
}
