/**
 * Candidate Decision Evidence Bundle — CandidateStore 단위 상위 통합 (derived-only).
 *
 * CandidateDecisionContext가 identity·binding의 single source of truth다.
 * 기존 FIELD DecisionEvidenceBundle과 Location / Lease / Economic Adapter 결과를 모으기만 한다.
 * Domain 계산을 재실행하지 않고, 새 Constraint / Expert Review / Risk / Verdict / Score를 만들지 않는다.
 * persistence 없음.
 */

import type { CandidateDecisionContext } from "../decision-integration/types";
import { validateCandidateDecisionContext } from "../decision-integration/validation";
import type { EconomicFeasibilityResult } from "../economic-feasibility/types";
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
  context: CandidateDecisionContext,
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
