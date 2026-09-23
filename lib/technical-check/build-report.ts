/**
 * buildTechnicalCheckReport — pure derived computation.
 * Layout / Survey / Definition을 mutation하지 않는다.
 * 결과를 파일로 저장하지 않는다.
 */

import type { EquipmentDefinition, EquipmentInstance } from "../equipment/types";
import type { FacilityObservations } from "../field/facility";
import type { MeasurementSet } from "../field/measurement";
import type { DeliveryPathObservation } from "../field/space-equipment";
import type { SpaceFitLayout } from "../space-fit/types";
import { checkEquipmentElectrical, summarizeKnownEquipmentPower } from "./electrical";
import { checkEquipmentDelivery } from "./delivery";
import { equipmentDataStatusNote, aspect } from "./helpers";
import {
  checkEquipmentDrainage,
  checkEquipmentExhaust,
  checkEquipmentWater,
} from "./utilities";
import {
  TECHNICAL_CHECK_DISCLAIMER,
  TECHNICAL_CHECK_SCHEMA_VERSION,
  type EquipmentTechnicalCheck,
  type TechnicalCheckReport,
  type TechnicalCheckStatus,
  type TechnicalCheckStatusCounts,
} from "./types";

function definitionMap(
  definitions: ReadonlyMap<string, EquipmentDefinition> | ReadonlyArray<EquipmentDefinition>,
): ReadonlyMap<string, EquipmentDefinition> {
  if (definitions instanceof Map) {
    return definitions;
  }
  const list = definitions as ReadonlyArray<EquipmentDefinition>;
  return new Map(list.map((item) => [item.equipmentDefinitionId, item]));
}

function countStatuses(
  checks: readonly EquipmentTechnicalCheck[],
  powerArithmetic: TechnicalCheckStatus | null,
): TechnicalCheckStatusCounts {
  const counts = {
    noConflictObserved: 0,
    constraintObserved: 0,
    insufficientData: 0,
    expertReviewRequired: 0,
    notApplicable: 0,
  };
  const bump = (status: TechnicalCheckStatus) => {
    switch (status) {
      case "NO_CONFLICT_OBSERVED":
        counts.noConflictObserved += 1;
        break;
      case "CONSTRAINT_OBSERVED":
        counts.constraintObserved += 1;
        break;
      case "INSUFFICIENT_DATA":
        counts.insufficientData += 1;
        break;
      case "EXPERT_REVIEW_REQUIRED":
        counts.expertReviewRequired += 1;
        break;
      case "NOT_APPLICABLE":
        counts.notApplicable += 1;
        break;
    }
  };
  for (const check of checks) {
    bump(check.electrical.status);
    bump(check.water.status);
    bump(check.drainage.status);
    bump(check.exhaust.status);
    bump(check.delivery.status);
  }
  if (powerArithmetic) bump(powerArithmetic);
  return Object.freeze(counts);
}

export function buildEquipmentTechnicalCheck(input: {
  instance: EquipmentInstance;
  definition: EquipmentDefinition | null;
  facility: FacilityObservations | null | undefined;
  measurement: MeasurementSet | null | undefined;
  deliveryPath: DeliveryPathObservation | null | undefined;
}): EquipmentTechnicalCheck {
  if (!input.definition) {
    const blocked = aspect(
      "electrical",
      "INSUFFICIENT_DATA",
      "장비정보를 찾을 수 없음",
    );
    return Object.freeze({
      equipmentInstanceId: input.instance.equipmentInstanceId,
      equipmentDefinitionId: input.instance.equipmentDefinitionId,
      equipmentName: "장비정보를 찾을 수 없음",
      dataStatus: "NEEDS_REVIEW" as const,
      dataStatusNote: "장비 Definition 누락",
      electrical: blocked,
      water: aspect("water", "INSUFFICIENT_DATA", "장비정보를 찾을 수 없음"),
      drainage: aspect("drainage", "INSUFFICIENT_DATA", "장비정보를 찾을 수 없음"),
      exhaust: aspect("exhaust", "INSUFFICIENT_DATA", "장비정보를 찾을 수 없음"),
      delivery: aspect("delivery", "INSUFFICIENT_DATA", "장비정보를 찾을 수 없음"),
      blockingNote: "장비정보를 찾을 수 없음",
    });
  }

  const definition = input.definition;
  return Object.freeze({
    equipmentInstanceId: input.instance.equipmentInstanceId,
    equipmentDefinitionId: definition.equipmentDefinitionId,
    equipmentName: definition.name,
    dataStatus: definition.dataStatus,
    dataStatusNote: equipmentDataStatusNote(definition.dataStatus),
    electrical: checkEquipmentElectrical({
      definition,
      electrical: input.facility?.electrical,
    }),
    water: checkEquipmentWater({
      definition,
      waterSupply: input.facility?.waterSupply,
    }),
    drainage: checkEquipmentDrainage({
      definition,
      drainage: input.facility?.drainage,
    }),
    exhaust: checkEquipmentExhaust({
      definition,
      exhaust: input.facility?.exhaust,
    }),
    delivery: checkEquipmentDelivery({
      definition,
      measurement: input.measurement,
      deliveryPath: input.deliveryPath,
    }),
  });
}

export function buildTechnicalCheckReport(input: {
  layout: SpaceFitLayout;
  definitions: ReadonlyMap<string, EquipmentDefinition> | ReadonlyArray<EquipmentDefinition>;
  facility?: FacilityObservations | null;
  measurement?: MeasurementSet | null;
  deliveryPath?: DeliveryPathObservation | null;
  generatedAt: string;
}): TechnicalCheckReport {
  const map = definitionMap(input.definitions);
  const instances = input.layout.equipmentInstances ?? [];
  const equipmentChecks = Object.freeze(
    instances.map((instance) =>
      buildEquipmentTechnicalCheck({
        instance,
        definition: map.get(instance.equipmentDefinitionId) ?? null,
        facility: input.facility,
        measurement: input.measurement,
        deliveryPath: input.deliveryPath,
      }),
    ),
  );

  const powerSummary = summarizeKnownEquipmentPower({
    instances,
    definitions: map,
    electrical: input.facility?.electrical,
  });

  return Object.freeze({
    schemaVersion: TECHNICAL_CHECK_SCHEMA_VERSION,
    layoutId: input.layout.layoutId,
    surveyId: input.layout.surveyId,
    candidateStoreId: input.layout.candidateStoreId,
    generatedAt: input.generatedAt,
    equipmentChecks,
    powerSummary,
    statusCounts: countStatuses(equipmentChecks, powerSummary.arithmeticStatus),
    disclaimer: TECHNICAL_CHECK_DISCLAIMER,
    geometrySeparated: true as const,
    createsRiskOrVerdict: false as const,
  });
}

/** Technical status는 Risk/Verdict가 아니다. */
export function technicalStatusIsNotRiskVerdict(status: TechnicalCheckStatus): boolean {
  return (
    status === "NO_CONFLICT_OBSERVED" ||
    status === "CONSTRAINT_OBSERVED" ||
    status === "INSUFFICIENT_DATA" ||
    status === "EXPERT_REVIEW_REQUIRED" ||
    status === "NOT_APPLICABLE"
  );
}
