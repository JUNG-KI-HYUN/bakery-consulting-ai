/**
 * Candidate Decision Integration Contract.
 *
 * CandidateStore를 최상위 식별자로, 각 분석 Run/Record/Survey/Layout의
 * binding만 표현한다. 분석 값 복제·Risk/Verdict/Score 생성 금지.
 *
 * Persistence 없음. DecisionEvidence SourceDomain 확장 없음.
 */

export const CANDIDATE_DECISION_CONTEXT_SCHEMA_VERSION =
  "candidate-decision-context-v1" as const;

/**
 * Basic Location / Market analysisRun binding.
 * analysisRunId만 참조한다. Living population / interpretation 값을 복제하지 않는다.
 */
export interface LocationAnalysisBinding {
  readonly analysisRunId: string;
}

/**
 * Lease Research / Rental Market Analysis binding.
 * selectedResearchRecordIds는 RentalMarketResult.selectedRecordIds와 동일 축.
 * referenceDate는 분석 재현용 최소 메타 (결과 수치 복제 금지).
 */
export interface LeaseAnalysisBinding {
  readonly selectedResearchRecordIds: readonly string[];
  /** ISO date/datetime. null = 미지정 (빈 문자열과 구분). */
  readonly referenceDate: string | null;
}

/**
 * Economic Feasibility binding.
 *
 * EconomicFeasibilityResult에는 durable persistent ID가 없다.
 * 임의 ID 체계를 만들지 않고 metadata.generatedAt으로만 바인딩한다.
 * 이 값은 durable store key가 아니다.
 */
export interface EconomicAnalysisBinding {
  /** EconomicFeasibilityResult.metadata.generatedAt */
  readonly generatedAt: string;
  readonly engineVersion: "economic-feasibility-v1";
}

/**
 * FIELD SiteSurvey + SPACE FIT Layout binding.
 * layoutId null = Survey는 있으나 Layout 미시작.
 */
export interface FieldSpaceBinding {
  readonly surveyId: string;
  readonly layoutId: string | null;
}

/**
 * 후보점포 의사결정 컨텍스트 — binding only.
 * Risk / Verdict / Score / HARD_FAIL 필드를 두지 않는다.
 */
export interface CandidateDecisionContext {
  readonly schemaVersion: typeof CANDIDATE_DECISION_CONTEXT_SCHEMA_VERSION;
  readonly candidateStoreId: string;
  readonly locationBinding: LocationAnalysisBinding | null;
  readonly leaseBinding: LeaseAnalysisBinding | null;
  readonly economicBinding: EconomicAnalysisBinding | null;
  readonly fieldBinding: FieldSpaceBinding | null;
  readonly createdAt: string;
  readonly createsVerdict: false;
  readonly createsScore: false;
  readonly createsRisk: false;
}

export type CandidateDecisionValidationFailure = {
  readonly ok: false;
  readonly code: "INVALID_BINDING";
  readonly message: string;
};

export type CandidateDecisionValidationSuccess<T> = {
  readonly ok: true;
  readonly value: T;
};

export type CandidateDecisionValidationResult<T> =
  | CandidateDecisionValidationSuccess<T>
  | CandidateDecisionValidationFailure;
