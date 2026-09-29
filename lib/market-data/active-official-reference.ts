import type { ActiveAnalysisTarget } from "./basic-location/run";
import { competitionOfficialMarketChoices } from "./competition-location";
import type { OfficialMarketSpatialInput } from "./official-market-spatial-relation";

/** Resolves a current official reference only from the Active Target geometry.
 * A reference supplied by URL is treated as a requested code, never as proof. */
export function resolveActiveTargetOfficialReference(
  target: ActiveAnalysisTarget,
  markets: readonly OfficialMarketSpatialInput[],
  now: () => Date = () => new Date(),
): ActiveAnalysisTarget {
  const choices = competitionOfficialMarketChoices(
    {
      analysisPoint: { latitude: target.latitude, longitude: target.longitude },
      analysisRadiusMeters: target.radiusM,
    },
    markets,
  );
  const requestedCode = target.officialReference?.marketCode ?? null;
  const selected = choices.length === 1
    ? choices[0]
    : choices.find((choice) => choice.marketCode === requestedCode) ?? null;
  const selectionMethod = selected
    ? choices.length === 1 ? "AUTO_SINGLE_CANDIDATE" as const : "MANUAL" as const
    : null;
  const selectedAt = selected
    ? target.officialReference?.marketCode === selected.marketCode &&
      target.officialReference.selectedAt
      ? target.officialReference.selectedAt
      : now().toISOString()
    : null;
  return {
    ...target,
    officialReference: selected && selectionMethod && selectedAt
      ? {
          marketCode: selected.marketCode,
          marketName: selected.marketName,
          spatialRelation: selected.relation === "INSIDE" ? "INSIDE" : "RADIUS_OVERLAP",
          selectionMethod,
          selectedAt,
        }
      : null,
    updatedAt: selectedAt ?? target.createdAt,
  };
}
