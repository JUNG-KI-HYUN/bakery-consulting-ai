/**
 * Candidate Decision Evidence Bundle — CandidateStore 단위 상위 통합 (derived-only).
 *
 * CandidateDecisionContext가 identity·binding의 single source of truth다.
 * 기존 FIELD DecisionEvidenceBundle과 Location / Lease / Economic Adapter 결과를 모으기만 한다.
 * Domain 계산을 재실행하지 않고, 새 Constraint / Expert Review / Risk / Verdict / Score를 만들지 않는다.
 * persistence 없음.
 */

import type {
  CandidateDecisionContext,
  CandidateDecisionContextV2,
} from "../decision-integration/types";
import {
  validateCandidateDecisionContext,
  validateCandidateDecisionContextV2,
} from "../decision-integration/validation";
import type { EconomicFeasibilityResult } from "../economic-feasibility/types";
import {
  buildCandidateLeaseDecisionEvidence,
  type CandidateLeaseDecisionEvidence,
} from "../lease-decision/decision-evidence-adapter";
import type { CandidateLeaseEvidenceSnapshot } from "../lease-decision/types";
import type { RentalMarketResult } from "../research/types";
import {
  buildEconomicDecisionEvidence,
  type EconomicDecisionEvidenceResult,
} from "./economic-adapter";
import { createDecisionEvidenceItem, dedupeById, sortDecisionEvidenceItems } from "./helpers";
import {
  buildLeaseDecisionEvidence,
  type LeaseDecisionEvidenceResult,
} from "./lease-adapter";
import {
  buildLocationDecisionEvidence,
  type LocationDecisionEvidenceInput,
  type LocationDecisionEvidenceResult,
} from "./location-adapter";
import type {
  DecisionEvidenceBundle,
  DecisionEvidenceItem,
  DecisionEvidenceSummaryCounts,
} from "./types";

export const CANDIDATE_DECISION_EVIDENCE_SCHEMA_VERSION =
  "candidate-decision-evidence-v1" as const;

/** locationBinding은 context에서만 가져온다. */
export type CandidateLocationSource = Omit<LocationDecisionEvidenceInput, "locationBinding">;

export type CandidateDecisionEvidenceInput = {
  context: CandidateDecisionContext;
  /** caller가 명시한 생성시각. Domain generatedAt으로 덮어쓰지 않는다. */
  generatedAt: string;
  fieldBundle: DecisionEvidenceBundle | null;
  locationSource: CandidateLocationSource | null;
  rentalMarketResult: RentalMarketResult | null;
  economicResult: EconomicFeasibilityResult | null;
};

export type CandidateDomainEvidence = {
  /** context.fieldBinding과 일치할 때만 채운다. */
  readonly field: DecisionEvidenceBundle | null;
  readonly location: LocationDecisionEvidenceResult;
  readonly lease: LeaseDecisionEvidenceResult;
  readonly economic: EconomicDecisionEvidenceResult;
};

export type CandidateDecisionEvidenceBundle = {
  readonly schemaVersion: typeof CANDIDATE_DECISION_EVIDENCE_SCHEMA_VERSION;
  readonly candidateStoreId: string;
  readonly generatedAt: string;
  readonly decisionContext: CandidateDecisionContext;
  readonly observedFacts: readonly DecisionEvidenceItem[];
  readonly observedConstraints: readonly DecisionEvidenceItem[];
  readonly missingInformation: readonly DecisionEvidenceItem[];
  readonly expertReviewItems: readonly DecisionEvidenceItem[];
  readonly geometryIssues: readonly DecisionEvidenceItem[];
  readonly domainEvidence: CandidateDomainEvidence;
  readonly summary: DecisionEvidenceSummaryCounts;
  readonly createsVerdict: false;
  readonly createsScore: false;
  readonly createsRisk: false;
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function fieldIntegrationItem(input: {
  key: string;
  title: string;
  description: string;
  opaqueKey: string;
}): DecisionEvidenceItem {
  return createDecisionEvidenceItem({
    sourceDomain: "FIELD",
    bucket: "MISSING_INFORMATION",
    category: "SPACE",
    key: input.key,
    title: input.title,
    description: input.description,
    importance: "CORE",
    nature: "INTEGRATION_STATE",
    sourceRef: { stageId: "candidate-field-binding", opaqueKey: input.opaqueKey },
  });
}

function resolveFieldBundle(
  context: Pick<CandidateDecisionContext, "candidateStoreId" | "fieldBinding">,
  fieldBundle: DecisionEvidenceBundle | null,
): { bundle: DecisionEvidenceBundle | null; integration: DecisionEvidenceItem[] } {
  const binding = context.fieldBinding;
  const unusedNote = fieldBundle
    ? " 전달된 FIELD Decision Evidence Bundle은 사용하지 않았습니다."
    : "";

  if (binding === null) {
    return {
      bundle: null,
      integration: [fieldIntegrationItem({
        key: "field-binding-absent",
        title: "현장조사·공간검토 미연결",
        description:
          `CandidateDecisionContext.fieldBinding이 없습니다. FIELD evidence가 연결되지 않은 상태입니다.${unusedNote}`,
        opaqueKey: "fieldBinding",
      })],
    };
  }

  if (binding.layoutId === null) {
    return {
      bundle: null,
      integration: [fieldIntegrationItem({
        key: "field-layout-not-started",
        title: "SPACE FIT layout 미연결",
        description:
          `현장조사(SiteSurvey)는 연결되어 있으나 SPACE FIT layout이 아직 연결되지 않았습니다. Layout 미시작 상태이며 0이나 오류로 해석하지 않습니다.${unusedNote}`,
        opaqueKey: "fieldBinding.layoutId",
      })],
    };
  }

  if (fieldBundle === null) {
    return {
      bundle: null,
      integration: [fieldIntegrationItem({
        key: "field-bundle-absent",
        title: "FIELD Decision Evidence 없음",
        description:
          "fieldBinding은 있으나 FIELD Decision Evidence Bundle이 전달되지 않았습니다. 현장·공간·기술 조건 evidence가 아직 연결되지 않았습니다.",
        opaqueKey: "fieldBundle",
      })],
    };
  }

  const integration: DecisionEvidenceItem[] = [];
  if (fieldBundle.candidateStoreId !== context.candidateStoreId) {
    integration.push(fieldIntegrationItem({
      key: "field-candidate-store-mismatch",
      title: "FIELD evidence 후보점포 불일치",
      description:
        "FIELD Decision Evidence Bundle의 candidateStoreId가 CandidateDecisionContext와 다릅니다. 해당 FIELD evidence를 사용하지 않았습니다.",
      opaqueKey: "fieldBundle.candidateStoreId",
    }));
  }
  if (fieldBundle.surveyId !== binding.surveyId) {
    integration.push(fieldIntegrationItem({
      key: "field-survey-mismatch",
      title: "FIELD evidence 현장조사 불일치",
      description:
        "FIELD Decision Evidence Bundle의 surveyId가 fieldBinding.surveyId와 다릅니다. 해당 FIELD evidence를 사용하지 않았습니다.",
      opaqueKey: "fieldBundle.surveyId",
    }));
  }
  if (fieldBundle.layoutId !== binding.layoutId) {
    integration.push(fieldIntegrationItem({
      key: "field-layout-mismatch",
      title: "FIELD evidence layout 불일치",
      description:
        "FIELD Decision Evidence Bundle의 layoutId가 fieldBinding.layoutId와 다릅니다. 해당 FIELD evidence를 사용하지 않았습니다.",
      opaqueKey: "fieldBundle.layoutId",
    }));
  }
  if (integration.length > 0) return { bundle: null, integration };

  return { bundle: deepFreeze(structuredClone(fieldBundle)), integration };
}

function mergeItems(
  ...lists: ReadonlyArray<readonly DecisionEvidenceItem[]>
): readonly DecisionEvidenceItem[] {
  return sortDecisionEvidenceItems(dedupeById(lists.flat()));
}

/**
 * 기존 Domain result → 기존 Adapter → aggregate.
 * 입력 객체를 mutation하지 않는다. Date.now()를 사용하지 않는다.
 */
export function buildCandidateDecisionEvidenceBundle(
  input: CandidateDecisionEvidenceInput,
): CandidateDecisionEvidenceBundle {
  const validated = validateCandidateDecisionContext(input.context);
  if (!validated.ok) {
    throw new RangeError(`CandidateDecisionContext가 올바르지 않습니다: ${validated.message}`);
  }
  if (typeof input.generatedAt !== "string" || !input.generatedAt.trim()) {
    throw new RangeError("generatedAt은 비어 있을 수 없습니다.");
  }
  const context = validated.value;

  const field = resolveFieldBundle(context, input.fieldBundle);
  const location = buildLocationDecisionEvidence({
    locationBinding: context.locationBinding,
    results: input.locationSource?.results ?? null,
    interpretation: input.locationSource?.interpretation ?? null,
    competitionTarget: input.locationSource?.competitionTarget ?? null,
    competitionResult: input.locationSource?.competitionResult ?? null,
  });
  const lease = buildLeaseDecisionEvidence({
    rentalMarketResult: input.rentalMarketResult,
    leaseBinding: context.leaseBinding,
  });
  const economic = buildEconomicDecisionEvidence({
    economicResult: input.economicResult,
    economicBinding: context.economicBinding,
  });

  const fieldBundle = field.bundle;
  const observedFacts = mergeItems(
    fieldBundle?.observedFacts ?? [],
    location.observedFacts,
    lease.observedFacts,
    economic.observedFacts,
  );
  const observedConstraints = mergeItems(fieldBundle?.observedConstraints ?? []);
  const missingInformation = mergeItems(
    field.integration,
    fieldBundle?.missingInformation ?? [],
    location.missingInformation,
    lease.missingInformation,
    economic.missingInformation,
  );
  const expertReviewItems = mergeItems(
    fieldBundle?.expertReviewItems ?? [],
    location.expertReviewItems,
    lease.expertReviewItems,
    economic.expertReviewItems,
  );
  const geometryIssues = mergeItems(fieldBundle?.geometryIssues ?? []);

  return Object.freeze({
    schemaVersion: CANDIDATE_DECISION_EVIDENCE_SCHEMA_VERSION,
    candidateStoreId: context.candidateStoreId,
    generatedAt: input.generatedAt,
    decisionContext: context,
    observedFacts,
    observedConstraints,
    missingInformation,
    expertReviewItems,
    geometryIssues,
    domainEvidence: Object.freeze({
      field: fieldBundle,
      location,
      lease,
      economic,
    }),
    summary: Object.freeze({
      observedFacts: observedFacts.length,
      observedConstraints: observedConstraints.length,
      missingInformation: missingInformation.length,
      expertReviewItems: expertReviewItems.length,
      geometryIssues: geometryIssues.length,
      coreMissing: missingInformation.filter((item) => item.importance === "CORE").length,
    }),
    createsVerdict: false as const,
    createsScore: false as const,
    createsRisk: false as const,
  });
}

export const CANDIDATE_DECISION_EVIDENCE_V2_SCHEMA_VERSION =
  "candidate-decision-evidence-v2" as const;

export type CandidateDecisionEvidenceInputV2 = Omit<CandidateDecisionEvidenceInput, "context"> & {
  context: CandidateDecisionContextV2;
  candidateLeaseSnapshot: CandidateLeaseEvidenceSnapshot | null;
};

export type CandidateDomainEvidenceV2 = {
  readonly field: DecisionEvidenceBundle | null;
  readonly location: LocationDecisionEvidenceResult;
  /** Rental Market Reference (V1과 동일). */
  readonly lease: LeaseDecisionEvidenceResult;
  /** Candidate-specific Lease Decision Evidence. binding·snapshot이 일치하고 contract 검증을 통과할 때만 채운다. */
  readonly candidateLease: CandidateLeaseDecisionEvidence | null;
  readonly economic: EconomicDecisionEvidenceResult;
};

export type CandidateDecisionEvidenceBundleV2 = {
  readonly schemaVersion: typeof CANDIDATE_DECISION_EVIDENCE_V2_SCHEMA_VERSION;
  readonly candidateStoreId: string;
  readonly generatedAt: string;
  readonly decisionContext: CandidateDecisionContextV2;
  readonly observedFacts: readonly DecisionEvidenceItem[];
  readonly observedConstraints: readonly DecisionEvidenceItem[];
  readonly missingInformation: readonly DecisionEvidenceItem[];
  readonly expertReviewItems: readonly DecisionEvidenceItem[];
  readonly geometryIssues: readonly DecisionEvidenceItem[];
  readonly domainEvidence: CandidateDomainEvidenceV2;
  readonly summary: DecisionEvidenceSummaryCounts;
  readonly createsVerdict: false;
  readonly createsScore: false;
  readonly createsRisk: false;
};

function candidateLeaseIntegrationItem(input: {
  key: string;
  title: string;
  description: string;
  opaqueKey: string;
}): DecisionEvidenceItem {
  return createDecisionEvidenceItem({
    sourceDomain: "LEASE",
    bucket: "MISSING_INFORMATION",
    category: "LEASE",
    key: input.key,
    title: input.title,
    description: input.description,
    importance: "CORE",
    nature: "INTEGRATION_STATE",
    sourceRef: { stageId: "candidate-lease-binding", opaqueKey: input.opaqueKey },
  });
}

/**
 * snapshot이 없거나 일치하지 않거나 contract 검증에 실패하면 snapshot 값을 하나도 사용하지 않고
 * 연결 상태 item만 만든다. 25개 세부 field 상태를 추정해 만들지 않는다.
 */
function resolveCandidateLease(
  context: CandidateDecisionContextV2,
  snapshot: CandidateLeaseEvidenceSnapshot | null,
): { evidence: CandidateLeaseDecisionEvidence | null; integration: DecisionEvidenceItem[] } {
  const binding = context.candidateLeaseBinding;

  if (binding === null) {
    const unusedNote = snapshot
      ? " 전달된 Candidate Lease snapshot은 사용하지 않았습니다."
      : "";
    return {
      evidence: null,
      integration: [candidateLeaseIntegrationItem({
        key: "candidate-lease-binding-absent",
        title: "후보점포 임대차 evidence 미연결",
        description:
          `CandidateDecisionContextV2.candidateLeaseBinding이 없습니다. 후보점포 임대차 evidence가 연결되지 않은 상태이며 개별 임대조건 상태를 추정하지 않습니다.${unusedNote}`,
        opaqueKey: "candidateLeaseBinding",
      })],
    };
  }

  if (snapshot === null) {
    return {
      evidence: null,
      integration: [candidateLeaseIntegrationItem({
        key: "candidate-lease-snapshot-absent",
        title: "후보점포 임대차 snapshot 없음",
        description:
          "candidateLeaseBinding은 있으나 Candidate Lease snapshot이 전달되지 않았습니다. 개별 임대조건 상태를 추정하지 않습니다.",
        opaqueKey: "candidateLeaseSnapshot",
      })],
    };
  }

  const built = buildCandidateLeaseDecisionEvidence({ snapshot });
  if (!built.ok) {
    return {
      evidence: null,
      integration: [candidateLeaseIntegrationItem({
        key: "candidate-lease-snapshot-invalid",
        title: "후보점포 임대차 snapshot 검증 실패",
        description:
          "Candidate Lease snapshot이 contract 검증을 통과하지 못했습니다. 해당 snapshot의 어떤 값도 evidence로 사용하지 않았습니다.",
        opaqueKey: "candidateLeaseSnapshot",
      })],
    };
  }

  const integration: DecisionEvidenceItem[] = [];
  if (built.value.candidateStoreId !== context.candidateStoreId) {
    integration.push(candidateLeaseIntegrationItem({
      key: "candidate-lease-candidate-store-mismatch",
      title: "후보점포 임대차 snapshot 후보점포 불일치",
      description:
        "Candidate Lease snapshot의 candidateStoreId가 CandidateDecisionContextV2와 다릅니다. 해당 snapshot evidence를 사용하지 않았습니다.",
      opaqueKey: "candidateLeaseSnapshot.candidateStoreId",
    }));
  }
  if (built.value.snapshotId !== binding.snapshotId) {
    integration.push(candidateLeaseIntegrationItem({
      key: "candidate-lease-snapshot-mismatch",
      title: "후보점포 임대차 snapshot 불일치",
      description:
        "Candidate Lease snapshot의 snapshotId가 candidateLeaseBinding.snapshotId와 다릅니다. 해당 snapshot evidence를 사용하지 않았습니다.",
      opaqueKey: "candidateLeaseSnapshot.snapshotId",
    }));
  }
  if (integration.length > 0) return { evidence: null, integration };

  return { evidence: built.value, integration };
}

/**
 * V1 입력 + candidateLeaseSnapshot → candidate-decision-evidence-v2.
 * V1 builder와 V1 schema는 그대로 두며, candidate lease는 V2에서만 연결한다.
 * 입력 객체를 mutation하지 않는다. Date.now()를 사용하지 않는다.
 */
export function buildCandidateDecisionEvidenceBundleV2(
  input: CandidateDecisionEvidenceInputV2,
): CandidateDecisionEvidenceBundleV2 {
  const validated = validateCandidateDecisionContextV2(input.context);
  if (!validated.ok) {
    throw new RangeError(`CandidateDecisionContextV2가 올바르지 않습니다: ${validated.message}`);
  }
  if (typeof input.generatedAt !== "string" || !input.generatedAt.trim()) {
    throw new RangeError("generatedAt은 비어 있을 수 없습니다.");
  }
  const context = validated.value;

  const field = resolveFieldBundle(context, input.fieldBundle);
  const location = buildLocationDecisionEvidence({
    locationBinding: context.locationBinding,
    results: input.locationSource?.results ?? null,
    interpretation: input.locationSource?.interpretation ?? null,
    competitionTarget: input.locationSource?.competitionTarget ?? null,
    competitionResult: input.locationSource?.competitionResult ?? null,
  });
  const lease = buildLeaseDecisionEvidence({
    rentalMarketResult: input.rentalMarketResult,
    leaseBinding: context.leaseBinding,
  });
  const candidateLease = resolveCandidateLease(context, input.candidateLeaseSnapshot ?? null);
  const economic = buildEconomicDecisionEvidence({
    economicResult: input.economicResult,
    economicBinding: context.economicBinding,
  });

  const fieldBundle = field.bundle;
  const leaseEvidence = candidateLease.evidence;
  const observedFacts = mergeItems(
    fieldBundle?.observedFacts ?? [],
    location.observedFacts,
    lease.observedFacts,
    leaseEvidence?.observedFacts ?? [],
    economic.observedFacts,
  );
  const observedConstraints = mergeItems(
    fieldBundle?.observedConstraints ?? [],
    leaseEvidence?.observedConstraints ?? [],
  );
  const missingInformation = mergeItems(
    field.integration,
    fieldBundle?.missingInformation ?? [],
    location.missingInformation,
    lease.missingInformation,
    candidateLease.integration,
    leaseEvidence?.missingInformation ?? [],
    economic.missingInformation,
  );
  const expertReviewItems = mergeItems(
    fieldBundle?.expertReviewItems ?? [],
    location.expertReviewItems,
    lease.expertReviewItems,
    leaseEvidence?.expertReviewItems ?? [],
    economic.expertReviewItems,
  );
  const geometryIssues = mergeItems(fieldBundle?.geometryIssues ?? []);

  return Object.freeze({
    schemaVersion: CANDIDATE_DECISION_EVIDENCE_V2_SCHEMA_VERSION,
    candidateStoreId: context.candidateStoreId,
    generatedAt: input.generatedAt,
    decisionContext: context,
    observedFacts,
    observedConstraints,
    missingInformation,
    expertReviewItems,
    geometryIssues,
    domainEvidence: Object.freeze({
      field: fieldBundle,
      location,
      lease,
      candidateLease: leaseEvidence,
      economic,
    }),
    summary: Object.freeze({
      observedFacts: observedFacts.length,
      observedConstraints: observedConstraints.length,
      missingInformation: missingInformation.length,
      expertReviewItems: expertReviewItems.length,
      geometryIssues: geometryIssues.length,
      coreMissing: missingInformation.filter((item) => item.importance === "CORE").length,
    }),
    createsVerdict: false as const,
    createsScore: false as const,
    createsRisk: false as const,
  });
}
