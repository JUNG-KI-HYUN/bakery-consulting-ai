import type { createCandidateStoreId } from "../field/identifiers";
import type { AnalysisRunSnapshot } from "../market-data/basic-location/run";

/**
 * Analysis Cluster V1은 관련 분석 실행과 후보점포를 묶는 비공간 reference container다.
 * Market/Submarket/Node 또는 공식상권을 대체하지 않으며 geometry나 판정 결과를 소유하지 않는다.
 */
export const ANALYSIS_CLUSTER_SCHEMA_VERSION = "frameone.analysis-cluster.v1" as const;

export type CandidateStoreId = ReturnType<typeof createCandidateStoreId>;
export type AnalysisRunId = AnalysisRunSnapshot["analysisRunId"];

export interface AnalysisClusterFrameoneContext {
  readonly marketId?: string;
  readonly submarketId?: string;
  readonly nodeId?: string;
}

export interface AnalysisClusterV1 {
  readonly schemaVersion: typeof ANALYSIS_CLUSTER_SCHEMA_VERSION;
  readonly analysisClusterId: string;
  readonly label: string;
  readonly analysisRunIds: readonly AnalysisRunId[];
  readonly candidateStoreIds: readonly CandidateStoreId[];
  readonly frameoneContext?: AnalysisClusterFrameoneContext;
  readonly createdAt: string;
}

export interface AnalysisClusterValidationFailure {
  readonly ok: false;
  readonly code: "INVALID_ANALYSIS_CLUSTER";
  readonly message: string;
  readonly errors: readonly string[];
}

export type AnalysisClusterValidationResult =
  | { readonly ok: true; readonly value: AnalysisClusterV1 }
  | AnalysisClusterValidationFailure;
