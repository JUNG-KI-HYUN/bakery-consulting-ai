import type { CandidateStoreId } from "../analysis-cluster/types";
import type { SiteCriteriaProfileReference } from "../candidate-screening/types";
import type { SiteCriterionTarget } from "./types";

export const SITE_CRITERION_EVALUATION_SCHEMA_VERSION =
  "frameone.site-criterion-evaluation.v1" as const;
export const CANDIDATE_CRITERIA_EVALUATION_SET_SCHEMA_VERSION =
  "frameone.candidate-criteria-evaluation-set.v1" as const;

export const SITE_CRITERION_EVALUATION_RESULTS = Object.freeze([
  "MATCH",
  "CONDITIONAL_MATCH",
  "GAP",
  "HARD_GAP",
  "UNKNOWN",
] as const);

export type SiteCriterionEvaluationResult =
  (typeof SITE_CRITERION_EVALUATION_RESULTS)[number];

export type SiteCriterionEvaluationSource = "RULE" | "HUMAN";

/** null은 UNKNOWN과 explicit zero를 혼동할 수 있으므로 observed 자체를 생략해 미확인을 표현한다. */
export interface SiteCriterionObservedValue {
  readonly value: SiteCriterionTarget;
  readonly unit?: string;
  readonly sourceSummary?: string;
}

/** Criterion 원본은 복제하지 않고 versioned profile과 stable criterion key만 참조한다. */
export interface SiteCriterionEvaluationV1 {
  readonly schemaVersion: typeof SITE_CRITERION_EVALUATION_SCHEMA_VERSION;
  readonly evaluationId: string;
  readonly candidateStoreId: CandidateStoreId;
  readonly analysisClusterId: string;
  readonly criteriaProfileRef: SiteCriteriaProfileReference;
  readonly criterionKey: string;
  readonly result: SiteCriterionEvaluationResult;
  readonly observed?: SiteCriterionObservedValue;
  readonly rationale: string;
  readonly evidenceRefs: readonly string[];
  readonly evaluatedAt: string;
  readonly evaluationSource?: SiteCriterionEvaluationSource;
  readonly evaluatedBy?: string;
  readonly note?: string;
}

export interface CandidateCriteriaEvaluationSetV1 {
  readonly schemaVersion: typeof CANDIDATE_CRITERIA_EVALUATION_SET_SCHEMA_VERSION;
  readonly evaluationSetId: string;
  readonly candidateStoreId: CandidateStoreId;
  readonly analysisClusterId: string;
  readonly criteriaProfileRef: SiteCriteriaProfileReference;
  readonly evaluations: readonly SiteCriterionEvaluationV1[];
  readonly createdAt: string;
  readonly updatedAt?: string;
}

export interface SiteCriterionEvaluationValidationFailure {
  readonly ok: false;
  readonly code: "INVALID_SITE_CRITERION_EVALUATION";
  readonly message: string;
  readonly errors: readonly string[];
}

export type SiteCriterionEvaluationValidationResult =
  | { readonly ok: true; readonly value: SiteCriterionEvaluationV1 }
  | SiteCriterionEvaluationValidationFailure;

export interface CandidateCriteriaEvaluationSetValidationFailure {
  readonly ok: false;
  readonly code: "INVALID_CANDIDATE_CRITERIA_EVALUATION_SET";
  readonly message: string;
  readonly errors: readonly string[];
}

export type CandidateCriteriaEvaluationSetValidationResult =
  | { readonly ok: true; readonly value: CandidateCriteriaEvaluationSetV1 }
  | CandidateCriteriaEvaluationSetValidationFailure;
