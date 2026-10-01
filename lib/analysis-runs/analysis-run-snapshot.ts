import type { BoundEconomicResult } from "../economic-feasibility/workspace-binding";
import type { CompetitionStructureResult } from "../market-data/competition-structure";
import type { ActiveAnalysisTarget } from "../market-data/basic-location/run";
import type { P0BasicLocationViewModel } from "../market-data/basic-location/view-model";
import type { RentalMarketResult, RentalScopeConfirmation } from "../research/types";

export const ANALYSIS_RUN_SNAPSHOT_SCHEMA_VERSION = "frameone.analysis-run-snapshot.v1" as const;

export interface AnalysisRunTargetSnapshot {
  analysisRunId: string;
  label: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  radiusM: 300 | 500;
  source: ActiveAnalysisTarget["source"];
  explorationSnapshot: ActiveAnalysisTarget["explorationSnapshot"];
  officialReference: ActiveAnalysisTarget["officialReference"];
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisRunSectionVersion<TBinding, TResult> {
  generatedAt: string;
  binding: TBinding;
  result: TResult;
}

export interface CompetitionSnapshotResult {
  schemaVersion: CompetitionStructureResult["schemaVersion"];
  sourcePolicy: "APP_GENERATED_AGGREGATE_NO_RAW_TRANSIENT";
  center: CompetitionStructureResult["center"];
  radiusM: CompetitionStructureResult["radiusM"];
  kakaoObservation: CompetitionStructureResult["kakaoObservation"];
  distanceBands: CompetitionStructureResult["distanceBands"];
  directionDistribution: CompetitionStructureResult["directionDistribution"];
  officialAreaReference: CompetitionStructureResult["officialAreaReference"];
  franchiseShare: null;
  provenance: CompetitionStructureResult["provenance"];
  warnings: string[];
}

export interface AnalysisRunSnapshot {
  schemaVersion: typeof ANALYSIS_RUN_SNAPSHOT_SCHEMA_VERSION;
  analysisRunId: string;
  targetSnapshot: AnalysisRunTargetSnapshot;
  createdAt: string;
  updatedAt: string;
  sections: {
    location?: {
      versions: Array<AnalysisRunSectionVersion<{
        analysisRunId: string;
        officialMarketCode: string | null;
      }, P0BasicLocationViewModel>>;
    };
    competition?: {
      transientDetailRestore: "REQUERY_REQUIRED";
      versions: Array<AnalysisRunSectionVersion<CompetitionStructureResult["binding"], CompetitionSnapshotResult>>;
    };
    rental?: {
      versions: Array<AnalysisRunSectionVersion<{
        analysisRunId: string;
        officialMarketCode: string | null;
        confirmationId: string;
        selectedRecordIds: string[];
      }, { confirmation: RentalScopeConfirmation; analysis: RentalMarketResult }>>;
    };
    economic?: {
      versions: Array<AnalysisRunSectionVersion<BoundEconomicResult["binding"], BoundEconomicResult["result"]>>;
    };
  };
}

export type AnalysisRunSectionSaveInput =
  | {
      section: "location";
      target: ActiveAnalysisTarget;
      generatedAt: string;
      result: P0BasicLocationViewModel;
    }
  | {
      section: "competition";
      target: ActiveAnalysisTarget;
      result: CompetitionStructureResult;
    }
  | {
      section: "rental";
      target: ActiveAnalysisTarget;
      generatedAt: string;
      confirmation: RentalScopeConfirmation;
      result: RentalMarketResult;
    }
  | {
      section: "economic";
      target: ActiveAnalysisTarget;
      result: BoundEconomicResult;
    };

export class AnalysisRunSnapshotValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisRunSnapshotValidationError";
  }
}

export function isCanonicalAnalysisRunId(value: unknown): value is string {
  return typeof value === "string" && /^basic-location-run:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function requireTimestamp(value: string, field: string) {
  if (!Number.isFinite(Date.parse(value))) {
    throw new AnalysisRunSnapshotValidationError(`${field}이 유효한 ISO 시각이 아닙니다.`);
  }
  return new Date(value).toISOString();
}

function validateTarget(target: ActiveAnalysisTarget) {
  if (!isCanonicalAnalysisRunId(target.analysisRunId) || target.targetKey !== target.analysisRunId) {
    throw new AnalysisRunSnapshotValidationError("canonical analysisRunId가 올바르지 않습니다.");
  }
  if (!Number.isFinite(target.latitude) || !Number.isFinite(target.longitude)) {
    throw new AnalysisRunSnapshotValidationError("분석대상 좌표가 올바르지 않습니다.");
  }
  requireTimestamp(target.createdAt, "target.createdAt");
  requireTimestamp(target.updatedAt, "target.updatedAt");
}

function assertRunBinding(target: ActiveAnalysisTarget, boundRunId: string) {
  if (boundRunId !== target.analysisRunId) {
    throw new AnalysisRunSnapshotValidationError("section analysisRunId가 저장 대상 Run과 일치하지 않습니다.");
  }
}

function assertOfficialBinding(target: ActiveAnalysisTarget, boundCode: string | null | undefined) {
  const targetCode = target.officialReference?.marketCode ?? null;
  if (boundCode !== null && boundCode !== undefined && boundCode !== targetCode) {
    throw new AnalysisRunSnapshotValidationError("section 공식상권 참조가 저장 대상과 일치하지 않습니다.");
  }
}

export function targetSnapshotFromActiveTarget(target: ActiveAnalysisTarget): AnalysisRunTargetSnapshot {
  validateTarget(target);
  return {
    analysisRunId: target.analysisRunId,
    label: target.label,
    address: target.address,
    latitude: target.latitude,
    longitude: target.longitude,
    radiusM: target.radiusM,
    source: target.source,
    explorationSnapshot: { ...target.explorationSnapshot },
    officialReference: target.officialReference ? { ...target.officialReference } : null,
    createdAt: requireTimestamp(target.createdAt, "target.createdAt"),
    updatedAt: requireTimestamp(target.updatedAt, "target.updatedAt"),
  };
}

export function activeTargetFromSnapshot(target: AnalysisRunTargetSnapshot): ActiveAnalysisTarget {
  return {
    schemaVersion: "active-analysis-target-v2",
    analysisRunId: target.analysisRunId,
    targetKey: target.analysisRunId,
    label: target.label,
    address: target.address,
    latitude: target.latitude,
    longitude: target.longitude,
    radiusM: target.radiusM,
    source: target.source,
    explorationSnapshot: { ...target.explorationSnapshot },
    officialReference: target.officialReference ? { ...target.officialReference } : null,
    createdAt: target.createdAt,
    updatedAt: target.updatedAt,
  };
}

function competitionSnapshot(result: CompetitionStructureResult): CompetitionSnapshotResult {
  return {
    schemaVersion: result.schemaVersion,
    sourcePolicy: "APP_GENERATED_AGGREGATE_NO_RAW_TRANSIENT",
    center: { ...result.center },
    radiusM: result.radiusM,
    kakaoObservation: structuredClone(result.kakaoObservation),
    distanceBands: structuredClone(result.distanceBands),
    directionDistribution: structuredClone(result.directionDistribution),
    officialAreaReference: structuredClone(result.officialAreaReference),
    franchiseShare: null,
    provenance: structuredClone(result.provenance),
    warnings: [...result.warnings],
  };
}

export function normalizeSectionSave(input: AnalysisRunSectionSaveInput) {
  validateTarget(input.target);
  const targetSnapshot = targetSnapshotFromActiveTarget(input.target);
  if (input.section === "location") {
    assertRunBinding(input.target, input.result.analysisRunId);
    assertRunBinding(input.target, input.result.analysisContext.analysisRunId);
    const officialCode = input.target.officialReference?.marketCode ?? null;
    return {
      section: input.section,
      targetSnapshot,
      version: {
        generatedAt: requireTimestamp(input.generatedAt, "location.generatedAt"),
        binding: { analysisRunId: input.target.analysisRunId, officialMarketCode: officialCode },
        result: structuredClone(input.result),
      },
    } as const;
  }
  if (input.section === "competition") {
    assertRunBinding(input.target, input.result.analysisRunId);
    assertRunBinding(input.target, input.result.binding.analysisRunId);
    assertOfficialBinding(input.target, input.result.officialAreaReference.officialMarketCode);
    assertOfficialBinding(input.target, input.result.binding.officialBenchmarkIdentity?.officialMarketCode);
    return {
      section: input.section,
      targetSnapshot,
      version: {
        generatedAt: requireTimestamp(input.result.generatedAt, "competition.generatedAt"),
        binding: structuredClone(input.result.binding),
        result: competitionSnapshot(input.result),
      },
    } as const;
  }
  if (input.section === "rental") {
    assertRunBinding(input.target, input.confirmation.analysisRunId);
    assertOfficialBinding(input.target, input.confirmation.officialMarketCode);
    const selectedRecordIds = [...new Set(input.result.selectedRecordIds)].sort();
    const confirmedIds = [...new Set(input.confirmation.selectedRecordIds)].sort();
    if (JSON.stringify(selectedRecordIds) !== JSON.stringify(confirmedIds)) {
      throw new AnalysisRunSnapshotValidationError("Rental confirmation 표본과 결과 표본이 일치하지 않습니다.");
    }
    return {
      section: input.section,
      targetSnapshot,
      version: {
        generatedAt: requireTimestamp(input.generatedAt, "rental.generatedAt"),
        binding: {
          analysisRunId: input.target.analysisRunId,
          officialMarketCode: input.confirmation.officialMarketCode,
          confirmationId: input.confirmation.confirmationId,
          selectedRecordIds,
        },
        result: {
          confirmation: structuredClone(input.confirmation),
          analysis: structuredClone(input.result),
        },
      },
    } as const;
  }
  assertRunBinding(input.target, input.result.binding.analysisRunId);
  assertOfficialBinding(input.target, input.result.binding.officialBenchmarkIdentity?.officialMarketCode);
  if (!Number.isInteger(input.result.binding.assumptionRevision) || input.result.binding.assumptionRevision < 0) {
    throw new AnalysisRunSnapshotValidationError("Economic assumption revision이 올바르지 않습니다.");
  }
  return {
    section: input.section,
    targetSnapshot,
    version: {
      generatedAt: requireTimestamp(input.result.generatedAt, "economic.generatedAt"),
      binding: structuredClone(input.result.binding),
      result: structuredClone(input.result.result),
    },
  } as const;
}

export function snapshotResultStatus(
  snapshot: AnalysisRunSnapshot | null,
  activeTarget: ActiveAnalysisTarget | null,
): "CURRENT" | "STALE" | "NOT_RUN" {
  if (!snapshot || !activeTarget) return "NOT_RUN";
  if (snapshot.analysisRunId !== activeTarget.analysisRunId) return "STALE";
  const savedCode = snapshot.targetSnapshot.officialReference?.marketCode ?? null;
  const activeCode = activeTarget.officialReference?.marketCode ?? null;
  return savedCode === activeCode ? "CURRENT" : "STALE";
}
