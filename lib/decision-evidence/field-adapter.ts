/**
 * FIELD → Decision Evidence adapter.
 * OWNER_STATEMENT를 VERIFIED로 바꾸지 않는다.
 */

import type { FacilityObservations } from "../field/facility";
import type { MeasurementSet, MeasuredDimension } from "../field/measurement";
import { REQUIRED_MEASUREMENT_KEYS } from "../field/measurement";
import type {
  DeliveryPathObservation,
  ProductionSalesSpaceObservation,
} from "../field/space-equipment";
import type { FieldEvidenceMeta } from "../field/field-evidence-meta";
import { createDecisionEvidenceItem } from "./helpers";
import type { DecisionEvidenceCategory, DecisionEvidenceItem } from "./types";

const MEASUREMENT_LABELS: Record<string, string> = {
  frontageMm: "전면폭",
  roomWidthMm: "내부 가로",
  roomDepthMm: "내부 깊이",
  ceilingHeightMm: "천장고",
  entranceWidthMm: "출입구 폭",
  entranceHeightMm: "출입구 높이",
  corridorWidthMm: "복도 폭",
  stairWidthMm: "계단 폭",
  elevatorDoorWidthMm: "엘리베이터 문 폭",
};

function formatMm(dimension: MeasuredDimension): string {
  if (dimension.status === "UNKNOWN") return "UNKNOWN";
  return `${dimension.mm.toLocaleString("ko-KR")} mm`;
}

function withEvidence(
  evidence: FieldEvidenceMeta | undefined,
): { fieldEvidence?: FieldEvidenceMeta } {
  return evidence ? { fieldEvidence: evidence } : {};
}

export function buildFieldDecisionEvidence(input: {
  measurement?: MeasurementSet | null;
  facility?: FacilityObservations | null;
  productionSalesSpace?: ProductionSalesSpaceObservation | null;
  deliveryPath?: DeliveryPathObservation | null;
}): {
  readonly observedFacts: readonly DecisionEvidenceItem[];
  readonly missingInformation: readonly DecisionEvidenceItem[];
  readonly expertReviewItems: readonly DecisionEvidenceItem[];
} {
  const observedFacts: DecisionEvidenceItem[] = [];
  const missingInformation: DecisionEvidenceItem[] = [];
  const expertReviewItems: DecisionEvidenceItem[] = [];

  const measurement = input.measurement;
  if (!measurement) {
    missingInformation.push(
      createDecisionEvidenceItem({
        sourceDomain: "FIELD",
        bucket: "MISSING_INFORMATION",
        category: "MEASUREMENT",
        key: "measurementSet",
        title: "실측 세트 미입력",
        description: "FIELD MeasurementSet이 아직 없습니다",
        importance: "CORE",
        sourceRef: { stageId: "measurement", fieldKey: "measurementSet" },
      }),
    );
  } else {
    for (const key of REQUIRED_MEASUREMENT_KEYS) {
      const value = measurement.values[key];
      const label = MEASUREMENT_LABELS[key] ?? key;
      if (!value) {
        missingInformation.push(
          createDecisionEvidenceItem({
            sourceDomain: "FIELD",
            bucket: "MISSING_INFORMATION",
            category: "MEASUREMENT",
            key: `required-${key}`,
            title: `${label} 미확인`,
            description: `필수 실측 ${label}이 아직 입력되지 않았습니다`,
            importance: "CORE",
            sourceRef: { stageId: "measurement", fieldKey: key },
          }),
        );
        continue;
      }
      if (value.status === "UNKNOWN") {
        missingInformation.push(
          createDecisionEvidenceItem({
            sourceDomain: "FIELD",
            bucket: "MISSING_INFORMATION",
            category: "MEASUREMENT",
            key: `unknown-${key}`,
            title: `${label} UNKNOWN`,
            description: `필수 실측 ${label}이 UNKNOWN으로 기록됨`,
            importance: "CORE",
            sourceRef: { stageId: "measurement", fieldKey: key },
          }),
        );
        continue;
      }
      observedFacts.push(
        createDecisionEvidenceItem({
          sourceDomain: "FIELD",
          bucket: "OBSERVED_FACT",
          category: "MEASUREMENT",
          key: `known-${key}`,
          title: `${label} ${formatMm(value)}`,
          description: `FIELD에서 확인된 ${label} 값 (법적/전문가 검증완료를 뜻하지 않음)`,
          importance: "SUPPORTING",
          sourceRef: { stageId: "measurement", fieldKey: key },
        }),
      );
    }
  }

  const facility = input.facility;
  if (facility?.electrical) {
    const cp = facility.electrical.contractPowerKw;
    if (cp.value === null) {
      missingInformation.push(
        createDecisionEvidenceItem({
          sourceDomain: "FIELD",
          bucket: "MISSING_INFORMATION",
          category: "ELECTRICAL",
          key: "contractPowerKw-null",
          title: "계약전력 UNKNOWN",
          description: "FIELD 계약전력이 null(UNKNOWN)로 기록됨",
          importance: "CORE",
          sourceRef: { stageId: "electrical", fieldKey: "contractPowerKw" },
          ...withEvidence(cp.evidence),
        }),
      );
    } else {
      observedFacts.push(
        createDecisionEvidenceItem({
          sourceDomain: "FIELD",
          bucket: "OBSERVED_FACT",
          category: "ELECTRICAL",
          key: "contractPowerKw",
          title: `계약전력 ${cp.value} kW`,
          description: `FIELD 계약전력 관찰값 — source=${cp.evidence.sourceType}, verification=${cp.evidence.verificationStatus}`,
          importance: "SUPPORTING",
          sourceRef: { stageId: "electrical", fieldKey: "contractPowerKw" },
          ...withEvidence(cp.evidence),
        }),
      );
    }
    if (facility.electrical.phaseType.value === "UNKNOWN") {
      missingInformation.push(
        createDecisionEvidenceItem({
          sourceDomain: "FIELD",
          bucket: "MISSING_INFORMATION",
          category: "ELECTRICAL",
          key: "phaseType-unknown",
          title: "전원 유형 UNKNOWN",
          description: "FIELD phaseType이 UNKNOWN",
          importance: "CORE",
          sourceRef: { stageId: "electrical", fieldKey: "phaseType" },
          ...withEvidence(facility.electrical.phaseType.evidence),
        }),
      );
    } else {
      observedFacts.push(
        createDecisionEvidenceItem({
          sourceDomain: "FIELD",
          bucket: "OBSERVED_FACT",
          category: "ELECTRICAL",
          key: "phaseType",
          title: `전원 유형 ${facility.electrical.phaseType.value}`,
          description: "FIELD 전원 유형 관찰값",
          importance: "SUPPORTING",
          sourceRef: { stageId: "electrical", fieldKey: "phaseType" },
          ...withEvidence(facility.electrical.phaseType.evidence),
        }),
      );
    }
    if (facility.electrical.expansionStatus.value === "EXPERT_REVIEW_REQUIRED") {
      expertReviewItems.push(
        createDecisionEvidenceItem({
          sourceDomain: "FIELD",
          bucket: "EXPERT_REVIEW",
          category: "ELECTRICAL",
          key: "expansion-expert",
          title: "전기 증설·용량 전문가 확인 필요",
          description: "FIELD expansionStatus가 EXPERT_REVIEW_REQUIRED",
          importance: "CORE",
          sourceRef: { stageId: "electrical", fieldKey: "expansionStatus" },
          ...withEvidence(facility.electrical.expansionStatus.evidence),
        }),
      );
    }
  }

  pushUtilityMissing(
    missingInformation,
    expertReviewItems,
    "WATER",
    "waterSupply",
    facility?.waterSupply?.supplyPointObserved,
    facility?.waterSupply?.furtherCheckNeeded,
  );
  pushUtilityMissing(
    missingInformation,
    expertReviewItems,
    "DRAINAGE",
    "drainage",
    facility?.drainage?.floorDrainObserved,
    facility?.drainage?.furtherCheckNeeded,
  );

  if (facility?.exhaust) {
    if (facility.exhaust.externalPathChecked.value === "UNKNOWN") {
      missingInformation.push(
        createDecisionEvidenceItem({
          sourceDomain: "FIELD",
          bucket: "MISSING_INFORMATION",
          category: "EXHAUST",
          key: "externalPath-unknown",
          title: "배기 외부 배출경로 UNKNOWN",
          description: "FIELD 배기 외부경로가 UNKNOWN",
          importance: "CORE",
          sourceRef: { stageId: "exhaust", fieldKey: "externalPathChecked" },
          ...withEvidence(facility.exhaust.externalPathChecked.evidence),
        }),
      );
    }
    if (facility.exhaust.expertReviewNeeded.value === "YES") {
      expertReviewItems.push(
        createDecisionEvidenceItem({
          sourceDomain: "FIELD",
          bucket: "EXPERT_REVIEW",
          category: "EXHAUST",
          key: "expert-review",
          title: "배기 전문가 확인 필요",
          description: "FIELD exhaust.expertReviewNeeded = YES",
          importance: "CORE",
          sourceRef: { stageId: "exhaust", fieldKey: "expertReviewNeeded" },
          ...withEvidence(facility.exhaust.expertReviewNeeded.evidence),
        }),
      );
    }
    const confirmation = facility.exhaust.expertReviewNeeded.evidence.confirmationRequirement;
    if (confirmation === "EXPERT_CONFIRMATION_REQUIRED") {
      expertReviewItems.push(
        createDecisionEvidenceItem({
          sourceDomain: "FIELD",
          bucket: "EXPERT_REVIEW",
          category: "EXHAUST",
          key: "confirmation-expert",
          title: "배기 ConfirmationRequirement: 전문가 확인",
          description: "EXPERT_CONFIRMATION_REQUIRED가 설정됨",
          importance: "CORE",
          sourceRef: { stageId: "exhaust", fieldKey: "expertReviewNeeded" },
          ...withEvidence(facility.exhaust.expertReviewNeeded.evidence),
        }),
      );
    }
  }

  if (input.deliveryPath?.primaryDeliveryMethod.value === "UNKNOWN") {
    missingInformation.push(
      createDecisionEvidenceItem({
        sourceDomain: "FIELD",
        bucket: "MISSING_INFORMATION",
        category: "DELIVERY",
        key: "primaryDeliveryMethod-unknown",
        title: "반입 경로 방식 UNKNOWN",
        description: "FIELD primaryDeliveryMethod가 UNKNOWN",
        importance: "CORE",
        sourceRef: { stageId: "deliveryPath", fieldKey: "primaryDeliveryMethod" },
        ...withEvidence(input.deliveryPath.primaryDeliveryMethod.evidence),
      }),
    );
  }

  if (input.productionSalesSpace) {
    const manufacturing = input.productionSalesSpace.manufacturingSpace;
    if (manufacturing.value === "NOT_ASSESSED") {
      missingInformation.push(
        createDecisionEvidenceItem({
          sourceDomain: "FIELD",
          bucket: "MISSING_INFORMATION",
          category: "SPACE",
          key: "manufacturing-not-assessed",
          title: "제조공간 미평가",
          description: "productionSalesSpace.manufacturingSpace = NOT_ASSESSED",
          importance: "SUPPORTING",
          sourceRef: { stageId: "productionSalesSpace", fieldKey: "manufacturingSpace" },
          ...withEvidence(manufacturing.evidence),
        }),
      );
    }
  }

  return Object.freeze({
    observedFacts: Object.freeze(observedFacts),
    missingInformation: Object.freeze(missingInformation),
    expertReviewItems: Object.freeze(expertReviewItems),
  });
}

function pushUtilityMissing(
  missing: DecisionEvidenceItem[],
  experts: DecisionEvidenceItem[],
  category: DecisionEvidenceCategory,
  stageId: string,
  observed:
    | { value: "YES" | "NO" | "UNKNOWN"; evidence: FieldEvidenceMeta }
    | undefined,
  further:
    | { value: "YES" | "NO" | "UNKNOWN"; evidence: FieldEvidenceMeta }
    | undefined,
): void {
  if (!observed) return;
  if (observed.value === "UNKNOWN") {
    missing.push(
      createDecisionEvidenceItem({
        sourceDomain: "FIELD",
        bucket: "MISSING_INFORMATION",
        category,
        key: `${stageId}-unknown`,
        title: `${category} 관찰 UNKNOWN`,
        description: `FIELD ${stageId} 관찰값이 UNKNOWN`,
        importance: "CORE",
        sourceRef: { stageId, fieldKey: stageId },
        ...withEvidence(observed.evidence),
      }),
    );
  }
  if (further?.value === "YES") {
    experts.push(
      createDecisionEvidenceItem({
        sourceDomain: "FIELD",
        bucket: "EXPERT_REVIEW",
        category,
        key: `${stageId}-further`,
        title: `${category} 추가 전문가·현장 확인 필요`,
        description: `FIELD ${stageId}.furtherCheckNeeded = YES`,
        importance: "CORE",
        sourceRef: { stageId, fieldKey: "furtherCheckNeeded" },
        ...withEvidence(further.evidence),
      }),
    );
  }
}
