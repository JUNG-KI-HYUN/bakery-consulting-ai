/**
 * Decision Evidence Integration — 파생 Domain.
 *
 * FIELD / Geometry / Technical Check를 정규화한다.
 * Risk / Verdict / 점수 / 추천·보류·위험을 생성하지 않는다.
 * Layout·Survey에 영구 저장하지 않는다.
 */

import type { EquipmentDataStatus } from "../equipment/types";
import type {
  ConfirmationRequirement,
  EvidenceSourceType,
  VerificationStatus,
} from "../evidence/types";

export const DECISION_EVIDENCE_SCHEMA_VERSION = "decision-evidence-v1" as const;

export type DecisionEvidenceSourceDomain =
  | "FIELD"
  | "TECHNICAL_CHECK"
  | "SPACE_FIT"
  | "EQUIPMENT";

export type DecisionEvidenceCategory =
  | "MEASUREMENT"
  | "ELECTRICAL"
  | "WATER"
  | "DRAINAGE"
  | "EXHAUST"
  | "RESTROOM"
  | "SPACE"
  | "DELIVERY"
  | "GEOMETRY"
  | "EQUIPMENT_DATA";

export const DECISION_EVIDENCE_CATEGORIES: readonly DecisionEvidenceCategory[] = Object.freeze([
  "MEASUREMENT",
  "ELECTRICAL",
  "WATER",
  "DRAINAGE",
  "EXHAUST",
  "RESTROOM",
  "SPACE",
  "DELIVERY",
  "GEOMETRY",
  "EQUIPMENT_DATA",
]);

/** 최종 HARD_FAIL / BLOCK / REJECT가 아니다. */
export type DecisionEvidenceBucket =
  | "OBSERVED_FACT"
  | "OBSERVED_CONSTRAINT"
  | "MISSING_INFORMATION"
  | "EXPERT_REVIEW"
  | "GEOMETRY_ISSUE";

export type DecisionEvidenceImportance = "CORE" | "SUPPORTING";

export interface DecisionEvidenceSourceRef {
  readonly stageId?: string;
  readonly equipmentInstanceId?: string;
  readonly equipmentDefinitionId?: string;
  readonly elementId?: string;
  readonly otherElementId?: string;
  readonly aspectKind?: string;
  readonly warningCode?: string;
  readonly fieldKey?: string;
  /** opaque technical/layout keys only — never PII */
  readonly opaqueKey?: string;
}

export interface DecisionEvidenceItem {
  readonly id: string;
  readonly category: DecisionEvidenceCategory;
  readonly title: string;
  readonly description: string;
  readonly sourceDomain: DecisionEvidenceSourceDomain;
  readonly sourceRef: DecisionEvidenceSourceRef;
  readonly bucket: DecisionEvidenceBucket;
  readonly importance: DecisionEvidenceImportance;
  readonly verificationStatus?: VerificationStatus;
  readonly sourceType?: EvidenceSourceType;
  readonly confirmationRequirement?: ConfirmationRequirement;
  readonly equipmentDataStatus?: EquipmentDataStatus;
}

export interface DecisionEvidenceSummaryCounts {
  readonly observedFacts: number;
  readonly observedConstraints: number;
  readonly missingInformation: number;
  readonly expertReviewItems: number;
  readonly geometryIssues: number;
  readonly coreMissing: number;
}

export interface DecisionEvidenceBundle {
  readonly schemaVersion: typeof DECISION_EVIDENCE_SCHEMA_VERSION;
  readonly candidateStoreId: string;
  readonly surveyId: string;
  readonly layoutId: string;
  readonly generatedAt: string;
  /** 확보된 관찰값. 법적/전문가 검증완료를 뜻하지 않는다. */
  readonly observedFacts: readonly DecisionEvidenceItem[];
  readonly observedConstraints: readonly DecisionEvidenceItem[];
  readonly missingInformation: readonly DecisionEvidenceItem[];
  readonly expertReviewItems: readonly DecisionEvidenceItem[];
  readonly geometryIssues: readonly DecisionEvidenceItem[];
  readonly summary: DecisionEvidenceSummaryCounts;
  readonly disclaimer: string;
  readonly createsVerdict: false;
  readonly createsScore: false;
  readonly createsRisk: false;
}

export const DECISION_EVIDENCE_DISCLAIMER =
  "본 화면은 FIELD 현장정보, SPACE FIT 공간검토, 장비 기술조건 대조 결과를 계약 전 검토 근거로 정리한 것입니다. 법률·세무·건축·전기·소방·위생·급배수·배기 및 인허가 관련 최종 판단은 관련 전문가 확인이 필요합니다.";
