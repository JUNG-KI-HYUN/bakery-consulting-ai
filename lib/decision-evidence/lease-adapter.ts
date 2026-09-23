/**
 * Lease Research / Rental Market Analysis → Decision Evidence (read-only).
 *
 * analyzeRentalMarket()를 재호출·재계산하지 않는다.
 * Risk / Verdict / Score / OBSERVED_CONSTRAINT를 생성하지 않는다.
 * Lease VerificationStatus·sourceType을 FIELD enum으로 매핑하지 않는다.
 *
 * reference summary는 bucket=OBSERVED_FACT를 유지하되
 * nature=REFERENCE_SUMMARY로 직접 관찰값과 구분한다.
 */

import type { LeaseAnalysisBinding } from "../decision-integration/types";
import type { NumericSummary, RentalMarketResult, ResearchSourceType } from "../research/types";
import { createDecisionEvidenceItem } from "./helpers";
import type { DecisionEvidenceItem, DecisionEvidenceNature } from "./types";

const SOURCE_DOMAIN = "LEASE" as const;
const CATEGORY = "LEASE" as const;

export type LeaseDecisionEvidenceResult = {
  readonly observedFacts: readonly DecisionEvidenceItem[];
  readonly missingInformation: readonly DecisionEvidenceItem[];
  readonly expertReviewItems: readonly DecisionEvidenceItem[];
  /**
   * RentalMarketResult.limitations 원문 보존.
   * 참고 한계·주의·확인 필요 문구를 EXPERT_REVIEW로 자동 분류하지 않는다.
   */
  readonly referenceLimitations: readonly string[];
  readonly createsVerdict: false;
  readonly createsScore: false;
  readonly createsRisk: false;
};

function leaseItem(input: {
  bucket: "OBSERVED_FACT" | "MISSING_INFORMATION" | "EXPERT_REVIEW";
  key: string;
  title: string;
  description: string;
  nature: DecisionEvidenceNature;
  importance?: "CORE" | "SUPPORTING";
  opaqueKey?: string;
  fieldKey?: string;
}): DecisionEvidenceItem {
  return createDecisionEvidenceItem({
    sourceDomain: SOURCE_DOMAIN,
    bucket: input.bucket,
    category: CATEGORY,
    key: input.key,
    title: input.title,
    description: input.description,
    importance: input.importance ?? "SUPPORTING",
    nature: input.nature,
    sourceRef: {
      ...(input.opaqueKey ? { opaqueKey: input.opaqueKey } : {}),
      ...(input.fieldKey ? { fieldKey: input.fieldKey } : {}),
      stageId: "lease-rental-market",
    },
  });
}

function formatOptionalNumber(value: number | null): string {
  if (value === null) return "null";
  return String(value);
}

function summarizeNumeric(
  label: string,
  fieldKey: string,
  summary: NumericSummary,
): DecisionEvidenceItem {
  return leaseItem({
    bucket: "OBSERVED_FACT",
    nature: "REFERENCE_SUMMARY",
    key: `numeric-${fieldKey}`,
    title: `확인된 비교표본 ${label}`,
    description:
      `${label} NumericSummary — sampleCount=${summary.sampleCount}, ` +
      `median=${formatOptionalNumber(summary.median)}, ` +
      `min=${formatOptionalNumber(summary.min)}, ` +
      `max=${formatOptionalNumber(summary.max)}. ` +
      `FRAMEONE 확인 표본 기준 참고값이며 모집단 시장가격이 아닙니다.`,
    fieldKey,
    opaqueKey: `rental.${fieldKey}`,
  });
}

function sameIdSet(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((id, index) => id === right[index]);
}

function formatSourceComposition(
  composition: Partial<Record<ResearchSourceType, number>>,
): string {
  const parts = Object.entries(composition)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .map(([type, count]) => `${type}=${count}`);
  return parts.length > 0 ? parts.join(", ") : "(empty)";
}

/**
 * RentalMarketResult + optional leaseBinding → DecisionEvidence items.
 * 입력 Domain 객체를 mutation하지 않는다.
 */
export function buildLeaseDecisionEvidence(input: {
  rentalMarketResult: RentalMarketResult | null;
  leaseBinding: LeaseAnalysisBinding | null;
}): LeaseDecisionEvidenceResult {
  const observedFacts: DecisionEvidenceItem[] = [];
  const missingInformation: DecisionEvidenceItem[] = [];
  const expertReviewItems: DecisionEvidenceItem[] = [];

  const result = input.rentalMarketResult;
  const binding = input.leaseBinding;

  if (binding === null) {
    missingInformation.push(
      leaseItem({
        bucket: "MISSING_INFORMATION",
        nature: "INTEGRATION_STATE",
        key: "lease-binding-absent",
        title: "임대료 비교분석 미연결",
        description:
          "CandidateDecisionContext.leaseBinding이 없습니다. 임대료 비교분석 binding이 아직 연결되지 않았습니다.",
        importance: "CORE",
        opaqueKey: "leaseBinding",
        fieldKey: "leaseBinding",
      }),
    );
  }

  if (result === null) {
    missingInformation.push(
      leaseItem({
        bucket: "MISSING_INFORMATION",
        nature: "INTEGRATION_STATE",
        key: "rental-market-result-absent",
        title: "Rental Market 분석 결과 없음",
        description:
          "RentalMarketResult가 없습니다. 비교 임대료 분석 결과가 아직 연결되어 있지 않습니다.",
        importance: "CORE",
        opaqueKey: "rentalMarketResult",
        fieldKey: "rentalMarketResult",
      }),
    );

    return Object.freeze({
      observedFacts: Object.freeze(observedFacts),
      missingInformation: Object.freeze(missingInformation),
      expertReviewItems: Object.freeze(expertReviewItems),
      referenceLimitations: Object.freeze([] as string[]),
      createsVerdict: false as const,
      createsScore: false as const,
      createsRisk: false as const,
    });
  }

  if (binding !== null) {
    if (!sameIdSet(binding.selectedResearchRecordIds, result.selectedRecordIds)) {
      missingInformation.push(
        leaseItem({
          bucket: "MISSING_INFORMATION",
          nature: "INTEGRATION_STATE",
          key: "selected-record-ids-mismatch",
          title: "임대 분석 표본 연결 불일치",
          description:
            "leaseBinding.selectedResearchRecordIds와 RentalMarketResult.selectedRecordIds가 일치하지 않습니다. " +
            `bindingCount=${binding.selectedResearchRecordIds.length}, resultCount=${result.selectedRecordIds.length}. ` +
            "저장소 I/O 없이 contract binding만 대조했으며, 판정·점수·Risk로 해석하지 않습니다.",
          importance: "CORE",
          opaqueKey: "selectedRecordIds",
          fieldKey: "selectedRecordIds",
        }),
      );
    }
    if (
      binding.referenceDate !== null &&
      binding.referenceDate !== result.referenceDate
    ) {
      missingInformation.push(
        leaseItem({
          bucket: "MISSING_INFORMATION",
          nature: "INTEGRATION_STATE",
          key: "reference-date-mismatch",
          title: "임대 분석 기준일 연결 불일치",
          description:
            "leaseBinding.referenceDate와 RentalMarketResult.referenceDate가 일치하지 않습니다. " +
            "저장소 I/O 없이 contract binding만 대조했으며, 판정·점수·Risk로 해석하지 않습니다.",
          importance: "SUPPORTING",
          opaqueKey: "referenceDate",
          fieldKey: "referenceDate",
        }),
      );
    }
  }

  if (result.sampleCount === 0) {
    missingInformation.push(
      leaseItem({
        bucket: "MISSING_INFORMATION",
        nature: "REFERENCE_SUMMARY",
        key: "sample-count-zero",
        title: "비교 임대료 표본 없음",
        description:
          "RentalMarketResult.sampleCount=0 입니다. null 결과와 구분되며, 비교표본 참고값을 제시할 수 없습니다.",
        importance: "CORE",
        opaqueKey: "sampleCount",
        fieldKey: "sampleCount",
      }),
    );
  } else {
    observedFacts.push(
      leaseItem({
        bucket: "OBSERVED_FACT",
        nature: "REFERENCE_SUMMARY",
        key: "sample-count",
        title: "확인된 비교표본 수",
        description: `비교표본 sampleCount=${result.sampleCount}. FRAMEONE 확인 표본 기준입니다.`,
        importance: "CORE",
        opaqueKey: "sampleCount",
        fieldKey: "sampleCount",
      }),
    );

    observedFacts.push(
      leaseItem({
        bucket: "OBSERVED_FACT",
        nature: "REFERENCE_SUMMARY",
        key: "sample-sufficiency",
        title: "표본 충분성 상태",
        description:
          result.sampleSufficiency === "REFERENCE_ONLY"
            ? `sampleSufficiency=REFERENCE_ONLY. FRAMEONE 확인 표본 기준의 참고용 통계이며, 표본 충분 여부를 단정하지 않습니다.`
            : `sampleSufficiency=INSUFFICIENT_REFERENCE_ONLY. 비교 임대료 표본이 충분하지 않습니다. 추가 확인이 필요합니다.`,
        importance: "CORE",
        opaqueKey: "sampleSufficiency",
        fieldKey: "sampleSufficiency",
      }),
    );

    if (result.sampleSufficiency === "INSUFFICIENT_REFERENCE_ONLY") {
      missingInformation.push(
        leaseItem({
          bucket: "MISSING_INFORMATION",
          nature: "REFERENCE_SUMMARY",
          key: "insufficient-reference-sample",
          title: "비교 임대료 표본 부족",
          description:
            "비교 임대료 표본이 충분하지 않습니다. 기존 RentalMarketResult.sampleSufficiency=INSUFFICIENT_REFERENCE_ONLY를 따릅니다.",
          importance: "CORE",
          opaqueKey: "sampleSufficiency",
          fieldKey: "sampleSufficiency",
        }),
      );
    }

    observedFacts.push(
      leaseItem({
        bucket: "OBSERVED_FACT",
        nature: "REFERENCE_SUMMARY",
        key: "reference-date",
        title: "비교분석 기준일",
        description: `referenceDate=${result.referenceDate}. 비교표본 참고값의 기준일입니다.`,
        opaqueKey: "referenceDate",
        fieldKey: "referenceDate",
      }),
    );

    observedFacts.push(summarizeNumeric("보증금", "deposit", result.deposit));
    observedFacts.push(summarizeNumeric("월세", "rent", result.rent));
    observedFacts.push(summarizeNumeric("관리비", "managementFee", result.managementFee));
    observedFacts.push(
      summarizeNumeric("전용평당 월세", "rentPerExclusivePyeong", result.rentPerExclusivePyeong),
    );

    observedFacts.push(
      leaseItem({
        bucket: "OBSERVED_FACT",
        nature: "REFERENCE_SUMMARY",
        key: "source-composition",
        title: "비교표본 출처 구성",
        description: `sourceComposition: ${formatSourceComposition(result.sourceComposition)}. Lease sourceType 원값을 보존하며 FIELD verification enum으로 변환하지 않습니다.`,
        opaqueKey: "sourceComposition",
        fieldKey: "sourceComposition",
      }),
    );

    observedFacts.push(
      leaseItem({
        bucket: "OBSERVED_FACT",
        nature: "REFERENCE_SUMMARY",
        key: "selected-record-count",
        title: "선택 표본 opaque 참조 수",
        description: `selectedRecordIds count=${result.selectedRecordIds.length}. 주소·고객명 등 PII는 포함하지 않습니다.`,
        opaqueKey: "selectedRecordIds.count",
        fieldKey: "selectedRecordIds",
      }),
    );
  }

  // limitations는 참고 metadata로만 보존한다. EXPERT_REVIEW로 자동 분류하지 않는다.
  const referenceLimitations = Object.freeze([...result.limitations]);

  return Object.freeze({
    observedFacts: Object.freeze(observedFacts),
    missingInformation: Object.freeze(missingInformation),
    expertReviewItems: Object.freeze(expertReviewItems),
    referenceLimitations,
    createsVerdict: false as const,
    createsScore: false as const,
    createsRisk: false as const,
  });
}
