/**
 * Equipment data trust → Decision Evidence.
 * SAMPLE/NEEDS_REVIEW/REFERENCE를 VERIFIED로 바꾸지 않는다.
 */

import type { EquipmentDefinition, EquipmentInstance } from "../equipment/types";
import { createDecisionEvidenceItem } from "./helpers";
import type { DecisionEvidenceItem } from "./types";

export function buildEquipmentDataTrustEvidence(input: {
  instances: readonly EquipmentInstance[];
  definitions: ReadonlyMap<string, EquipmentDefinition> | ReadonlyArray<EquipmentDefinition>;
}): {
  readonly missingInformation: readonly DecisionEvidenceItem[];
  readonly observedFacts: readonly DecisionEvidenceItem[];
} {
  const map: ReadonlyMap<string, EquipmentDefinition> =
    input.definitions instanceof Map
      ? input.definitions
      : new Map(
          (input.definitions as readonly EquipmentDefinition[]).map((item) => [
            item.equipmentDefinitionId,
            item,
          ]),
        );

  const missingInformation: DecisionEvidenceItem[] = [];
  const observedFacts: DecisionEvidenceItem[] = [];

  for (const instance of input.instances) {
    const def = map.get(instance.equipmentDefinitionId);
    if (!def) {
      missingInformation.push(
        createDecisionEvidenceItem({
          sourceDomain: "EQUIPMENT",
          bucket: "MISSING_INFORMATION",
          category: "EQUIPMENT_DATA",
          key: `missing-def:${instance.equipmentInstanceId}`,
          title: "장비 Definition 없음",
          description: "배치된 Instance의 Definition을 찾을 수 없음",
          importance: "CORE",
          sourceRef: {
            equipmentInstanceId: instance.equipmentInstanceId,
            equipmentDefinitionId: instance.equipmentDefinitionId,
          },
        }),
      );
      continue;
    }

    if (def.dataStatus === "SAMPLE") {
      missingInformation.push(
        createDecisionEvidenceItem({
          sourceDomain: "EQUIPMENT",
          bucket: "MISSING_INFORMATION",
          category: "EQUIPMENT_DATA",
          key: `sample:${instance.equipmentInstanceId}`,
          title: `${def.name} · SAMPLE`,
          description: "예시 장비 · 실제 판단 근거로 확정 사용 금지",
          importance: "CORE",
          sourceRef: {
            equipmentInstanceId: instance.equipmentInstanceId,
            equipmentDefinitionId: def.equipmentDefinitionId,
          },
          equipmentDataStatus: "SAMPLE",
        }),
      );
      continue;
    }

    if (def.dataStatus === "NEEDS_REVIEW") {
      missingInformation.push(
        createDecisionEvidenceItem({
          sourceDomain: "EQUIPMENT",
          bucket: "MISSING_INFORMATION",
          category: "EQUIPMENT_DATA",
          key: `needs-review:${instance.equipmentInstanceId}`,
          title: `${def.name} · NEEDS_REVIEW`,
          description: "장비 규격 확인 필요 — VERIFIED로 취급하지 않음",
          importance: "CORE",
          sourceRef: {
            equipmentInstanceId: instance.equipmentInstanceId,
            equipmentDefinitionId: def.equipmentDefinitionId,
          },
          equipmentDataStatus: "NEEDS_REVIEW",
        }),
      );
    } else if (def.dataStatus === "REFERENCE") {
      observedFacts.push(
        createDecisionEvidenceItem({
          sourceDomain: "EQUIPMENT",
          bucket: "OBSERVED_FACT",
          category: "EQUIPMENT_DATA",
          key: `reference:${instance.equipmentInstanceId}`,
          title: `${def.name} · REFERENCE`,
          description: "참고 자료 — VERIFIED로 승격되지 않음",
          importance: "SUPPORTING",
          sourceRef: {
            equipmentInstanceId: instance.equipmentInstanceId,
            equipmentDefinitionId: def.equipmentDefinitionId,
          },
          equipmentDataStatus: "REFERENCE",
        }),
      );
    }

    const width = def.dimensions.widthMm;
    const depth = def.dimensions.depthMm;
    if (
      !width ||
      !depth ||
      width.status === "UNKNOWN" ||
      depth.status === "UNKNOWN"
    ) {
      missingInformation.push(
        createDecisionEvidenceItem({
          sourceDomain: "EQUIPMENT",
          bucket: "MISSING_INFORMATION",
          category: "EQUIPMENT_DATA",
          key: `dims-unknown:${instance.equipmentInstanceId}`,
          title: `${def.name} · 외형 치수 미확인`,
          description: "width/depth UNKNOWN 또는 미입력",
          importance: "SUPPORTING",
          sourceRef: {
            equipmentInstanceId: instance.equipmentInstanceId,
            equipmentDefinitionId: def.equipmentDefinitionId,
          },
          equipmentDataStatus: def.dataStatus,
        }),
      );
    }
  }

  return Object.freeze({
    missingInformation: Object.freeze(missingInformation),
    observedFacts: Object.freeze(observedFacts),
  });
}
