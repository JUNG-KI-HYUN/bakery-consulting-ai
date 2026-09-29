import {
  findRelatedOfficialMarkets,
  type ExecutedSpatialAnalysis,
  type OfficialMarketSpatialInput,
  type OfficialMarketSpatialResult,
} from "./official-market-spatial-relation";
import type { CompetitionStructureResult } from "./competition-structure";

export interface CompetitionLocationPoint {
  latitude: number;
  longitude: number;
  radiusM: 300 | 500;
}

export interface CompetitionLocationTarget extends CompetitionLocationPoint {
  analysisRunId: string;
}

function validCoordinate(value: unknown, minimum: number, maximum: number) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

export function createCompetitionLocationTarget(
  input: CompetitionLocationTarget,
): CompetitionLocationTarget {
  if (typeof input.analysisRunId !== "string" || !input.analysisRunId.trim()) {
    throw new Error("analysisRunId는 비어 있을 수 없습니다.");
  }
  if (
    !validCoordinate(input.latitude, -90, 90) ||
    !validCoordinate(input.longitude, -180, 180)
  ) {
    throw new Error("분석 기준 좌표가 올바르지 않습니다.");
  }
  if (input.radiusM !== 300 && input.radiusM !== 500) {
    throw new Error("radiusM은 300 또는 500이어야 합니다.");
  }
  return Object.freeze({
    analysisRunId: input.analysisRunId,
    latitude: input.latitude,
    longitude: input.longitude,
    radiusM: input.radiusM,
  });
}

export function competitionStructureLocationInput(
  target: CompetitionLocationTarget,
): {
  analysisRunId: string;
  center: { latitude: number; longitude: number };
  radiusM: 300 | 500;
} {
  const validated = createCompetitionLocationTarget(target);
  return {
    analysisRunId: validated.analysisRunId,
    center: { latitude: validated.latitude, longitude: validated.longitude },
    radiusM: validated.radiusM,
  };
}

/** Same coordinates under a different analysisRunId are a different run, never a match. */
export function competitionResultMatchesTarget(
  target: CompetitionLocationTarget | null,
  result: Pick<
    CompetitionStructureResult,
    "analysisRunId" | "binding" | "center" | "radiusM"
  > | null,
) {
  return Boolean(
    target &&
    result &&
    target.analysisRunId.trim() &&
    result.analysisRunId === target.analysisRunId &&
    result.binding.analysisRunId === target.analysisRunId &&
    result.center.latitude === target.latitude &&
    result.center.longitude === target.longitude &&
    result.radiusM === target.radiusM,
  );
}

export function competitionExecutionMatchesTarget(
  target: CompetitionLocationPoint | null,
  execution: {
    analysisPoint: { latitude: number; longitude: number };
    analysisRadiusMeters: 300 | 500;
  },
) {
  return Boolean(
    target &&
    target.latitude === execution.analysisPoint.latitude &&
    target.longitude === execution.analysisPoint.longitude &&
    target.radiusM === execution.analysisRadiusMeters,
  );
}

export function competitionOfficialMarketChoices(
  analysis: ExecutedSpatialAnalysis | null,
  markets: readonly OfficialMarketSpatialInput[],
): OfficialMarketSpatialResult[] {
  const relations = findRelatedOfficialMarkets(analysis, markets);
  if (!relations) return [];
  return [...relations.insideMarkets, ...relations.radiusOverlapMarkets].sort(
    (left, right) => {
      if (left.relation !== right.relation) {
        return left.relation === "INSIDE" ? -1 : 1;
      }
      return (
        left.marketName.localeCompare(right.marketName, "ko-KR") ||
        left.marketCode.localeCompare(right.marketCode)
      );
    },
  );
}

export function initialOfficialMarketCode(
  choices: readonly OfficialMarketSpatialResult[],
) {
  return choices.length === 1 ? choices[0].marketCode : null;
}

export function officialMarketSelectionAfterLocationChange(
  previous: CompetitionLocationPoint | null,
  next: CompetitionLocationPoint | null,
  currentOfficialMarketCode: string | null,
) {
  const changed =
    previous?.latitude !== next?.latitude ||
    previous?.longitude !== next?.longitude ||
    previous?.radiusM !== next?.radiusM;
  return changed ? null : currentOfficialMarketCode;
}
