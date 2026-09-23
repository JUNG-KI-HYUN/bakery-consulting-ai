/**
 * Technical Check → Decision Evidence.
 * NOT_APPLICABLE / NO_CONFLICT_OBSERVED는 대량 item을 만들지 않는다.
 * Geometry OVERLAP과 중복 생성하지 않는다 (Technical은 설비 요구조건 축만).
 */

import type {
  EquipmentTechnicalCheck,
  KnownEquipmentPowerSummary,
  TechnicalCheckAspect,
  TechnicalCheckReport,
} from "../technical-check/types";
import { createDecisionEvidenceItem } from "./helpers";
import type { DecisionEvidenceCategory, DecisionEvidenceItem } from "./types";

function categoryForAspect(kind: TechnicalCheckAspect["kind"]): DecisionEvidenceCategory {
  switch (kind) {
    case "electrical":
      return "ELECTRICAL";
    case "water":
      return "WATER";
    case "drainage":
      return "DRAINAGE";
    case "exhaust":
      return "EXHAUST";
    case "delivery":
      return "DELIVERY";
  }
}

function mapAspect(
  check: EquipmentTechnicalCheck,
  aspect: TechnicalCheckAspect,
): DecisionEvidenceItem | null {
  if (aspect.status === "NOT_APPLICABLE" || aspect.status === "NO_CONFLICT_OBSERVED") {
    return null;
  }
  const category = categoryForAspect(aspect.kind);
  const baseRef = {
    equipmentInstanceId: check.equipmentInstanceId,
    equipmentDefinitionId: check.equipmentDefinitionId,
    aspectKind: aspect.kind,
    opaqueKey: check.equipmentInstanceId,
  };

  if (aspect.status === "CONSTRAINT_OBSERVED") {
    return createDecisionEvidenceItem({
      sourceDomain: "TECHNICAL_CHECK",
      bucket: "OBSERVED_CONSTRAINT",
      category,
      key: `${check.equipmentInstanceId}:${aspect.kind}:constraint`,
      title: `${check.equipmentName} · ${aspect.kind} 제약 관찰`,
      description: aspect.message,
      importance: "CORE",
      sourceRef: baseRef,
      fieldEvidence: aspect.fieldEvidence,
      equipmentDataStatus: check.dataStatus,
    });
  }
  if (aspect.status === "INSUFFICIENT_DATA") {
    return createDecisionEvidenceItem({
      sourceDomain: "TECHNICAL_CHECK",
      bucket: "MISSING_INFORMATION",
      category,
      key: `${check.equipmentInstanceId}:${aspect.kind}:insufficient`,
      title: `${check.equipmentName} · ${aspect.kind} 자료 부족`,
      description: aspect.message,
      importance: check.dataStatus === "SAMPLE" ? "CORE" : "SUPPORTING",
      sourceRef: baseRef,
      fieldEvidence: aspect.fieldEvidence,
      equipmentDataStatus: check.dataStatus,
    });
  }
  if (aspect.status === "EXPERT_REVIEW_REQUIRED") {
    return createDecisionEvidenceItem({
      sourceDomain: "TECHNICAL_CHECK",
      bucket: "EXPERT_REVIEW",
      category,
      key: `${check.equipmentInstanceId}:${aspect.kind}:expert`,
      title: `${check.equipmentName} · ${aspect.kind} 전문가 확인`,
      description: aspect.message,
      importance: "CORE",
      sourceRef: baseRef,
      fieldEvidence: aspect.fieldEvidence,
      equipmentDataStatus: check.dataStatus,
    });
  }
  return null;
}

export function buildTechnicalDecisionEvidence(report: TechnicalCheckReport): {
  readonly observedConstraints: readonly DecisionEvidenceItem[];
  readonly missingInformation: readonly DecisionEvidenceItem[];
  readonly expertReviewItems: readonly DecisionEvidenceItem[];
} {
  const observedConstraints: DecisionEvidenceItem[] = [];
  const missingInformation: DecisionEvidenceItem[] = [];
  const expertReviewItems: DecisionEvidenceItem[] = [];

  for (const check of report.equipmentChecks) {
    for (const aspect of [
      check.electrical,
      check.water,
      check.drainage,
      check.exhaust,
      check.delivery,
    ]) {
      const item = mapAspect(check, aspect);
      if (!item) continue;
      if (item.bucket === "OBSERVED_CONSTRAINT") observedConstraints.push(item);
      else if (item.bucket === "MISSING_INFORMATION") missingInformation.push(item);
      else if (item.bucket === "EXPERT_REVIEW") expertReviewItems.push(item);
    }
  }

  pushPowerSummary(report.powerSummary, observedConstraints, expertReviewItems);

  return Object.freeze({
    observedConstraints: Object.freeze(observedConstraints),
    missingInformation: Object.freeze(missingInformation),
    expertReviewItems: Object.freeze(expertReviewItems),
  });
}

function pushPowerSummary(
  summary: KnownEquipmentPowerSummary,
  constraints: DecisionEvidenceItem[],
  experts: DecisionEvidenceItem[],
): void {
  if (summary.arithmeticStatus === "CONSTRAINT_OBSERVED" && summary.arithmeticMessage) {
    constraints.push(
      createDecisionEvidenceItem({
        sourceDomain: "TECHNICAL_CHECK",
        bucket: "OBSERVED_CONSTRAINT",
        category: "ELECTRICAL",
        key: "power-sum-vs-contract",
        title: "확인된 장비 요구전력 합계 vs 계약전력",
        description: summary.arithmeticMessage,
        importance: "CORE",
        sourceRef: { fieldKey: "knownEquipmentPowerKw", opaqueKey: "power-summary" },
      }),
    );
  } else if (
    summary.arithmeticStatus === "EXPERT_REVIEW_REQUIRED" &&
    summary.arithmeticMessage
  ) {
    experts.push(
      createDecisionEvidenceItem({
        sourceDomain: "TECHNICAL_CHECK",
        bucket: "EXPERT_REVIEW",
        category: "ELECTRICAL",
        key: "power-sum-expert",
        title: "전력 합계 비교 전문가 확인",
        description: summary.arithmeticMessage,
        importance: "CORE",
        sourceRef: { fieldKey: "knownEquipmentPowerKw", opaqueKey: "power-summary" },
      }),
    );
  }
}
