import type { CandidateStoreId } from "../analysis-cluster/types";
import type { SiteCriteriaProfileReference } from "../candidate-screening/types";

export const SITE_GRADE_INPUT_SCHEMA_VERSION = "frameone.site-grade-input.v1" as const;
export const SITE_GRADE_RESULT_SCHEMA_VERSION = "frameone.site-grade-result.v1" as const;

export const SITE_GRADES = Object.freeze(["A", "B", "C", "D", "U"] as const);
export type SiteGrade = (typeof SITE_GRADES)[number];

/** Site Grade와 독립된 Evidence 충분성/신뢰도 축이다. Grade를 자동 변경하지 않는다. */
export const EVIDENCE_CONFIDENCE_LEVELS = Object.freeze([
  "HIGH",
  "MEDIUM",
  "LOW",
  "UNKNOWN",
] as const);
export type EvidenceConfidence = (typeof EVIDENCE_CONFIDENCE_LEVELS)[number];

/** Grade Rule Engine의 reference-only 입력 계약. 원본 Candidate/Profile/Evaluation을 복제하지 않는다. */
export interface SiteGradeInputV1 {
  readonly schemaVersion: typeof SITE_GRADE_INPUT_SCHEMA_VERSION;
  readonly candidateStoreId: CandidateStoreId;
  readonly analysisClusterId: string;
  readonly criteriaProfileRef: SiteCriteriaProfileReference;
  readonly criteriaEvaluationSetId: string;
  readonly ruleSetVersion: string;
  readonly evidenceConfidenceRef?: string;
  readonly riskSnapshotRef?: string;
}

/** 계산 규칙을 포함하지 않는 Grade 결과 저장 계약. */
export interface SiteGradeResultV1 {
  readonly schemaVersion: typeof SITE_GRADE_RESULT_SCHEMA_VERSION;
  readonly siteGradeResultId: string;
  readonly candidateStoreId: CandidateStoreId;
  readonly analysisClusterId: string;
  readonly criteriaProfileRef: SiteCriteriaProfileReference;
  readonly evaluationSetId: string;
  readonly ruleSetVersion: string;
  readonly grade: SiteGrade;
  readonly matchedCriteriaKeys: readonly string[];
  readonly conditionalCriteriaKeys: readonly string[];
  readonly gapCriteriaKeys: readonly string[];
  readonly hardGapCriteriaKeys: readonly string[];
  readonly unknownCriteriaKeys: readonly string[];
  readonly rationale: readonly string[];
  readonly generatedAt: string;
  readonly generatedBy?: string;
  readonly evidenceConfidence?: EvidenceConfidence;
  readonly reviewRequired?: boolean;
}

export interface SiteGradeValidationFailure {
  readonly ok: false;
  readonly code: "INVALID_SITE_GRADE_CONTRACT";
  readonly message: string;
  readonly errors: readonly string[];
}

export type SiteGradeValidationResult<T extends SiteGradeInputV1 | SiteGradeResultV1> =
  | { readonly ok: true; readonly value: T }
  | SiteGradeValidationFailure;
