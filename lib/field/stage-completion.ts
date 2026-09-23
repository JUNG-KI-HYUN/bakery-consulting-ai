import type { FacilityObservations } from "./facility";
import type { MeasurementSet } from "./measurement";
import { REQUIRED_MEASUREMENT_KEYS } from "./measurement";
import type {
  DeliveryPathObservation,
  ProductionSalesSpaceObservation,
} from "./space-equipment";
import type { SurveyStageId } from "./stages";

export type StageCompletionCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly missing: readonly string[] };

export interface StageCompletionInput {
  readonly measurementSet?: MeasurementSet;
  readonly facility?: FacilityObservations;
  readonly productionSalesSpace?: ProductionSalesSpaceObservation;
  readonly deliveryPath?: DeliveryPathObservation;
}

/** 직원이 해당 단계를 수행했는지. Evidence VERIFIED와 무관하다. */
export function canCompleteFieldStage(
  stageId: SurveyStageId,
  input: StageCompletionInput,
): StageCompletionCheck {
  switch (stageId) {
    case "measurement":
      return checkMeasurement(input.measurementSet);
    case "ceilingStructure":
      return checkCeilingStructure(input.measurementSet);
    case "electrical":
      return checkElectrical(input.facility);
    case "waterSupply":
      return checkWaterSupply(input.facility);
    case "drainage":
      return checkDrainage(input.facility);
    case "exhaust":
      return checkExhaust(input.facility);
    case "restroom":
      return checkRestroom(input.facility);
    case "productionSalesSpace":
      return checkProductionSalesSpace(input.productionSalesSpace);
    case "deliveryPath":
      return checkDeliveryPath(input.deliveryPath);
    default:
      return { ok: false, missing: ["stage_not_implemented"] };
  }
}

function checkMeasurement(measurementSet: MeasurementSet | undefined): StageCompletionCheck {
  if (!measurementSet) {
    return { ok: false, missing: REQUIRED_MEASUREMENT_KEYS.slice() };
  }
  const missing: string[] = [];
  for (const key of REQUIRED_MEASUREMENT_KEYS) {
    if (!measurementSet.values[key]) missing.push(key);
  }
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

function checkCeilingStructure(measurementSet: MeasurementSet | undefined): StageCompletionCheck {
  if (!measurementSet) {
    return { ok: false, missing: ["pillarPresence", "levelStepPresence"] };
  }
  const missing: string[] = [];
  if (!measurementSet.structure.pillarPresence) missing.push("pillarPresence");
  if (!measurementSet.structure.levelStepPresence) missing.push("levelStepPresence");
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

function checkElectrical(facility: FacilityObservations | undefined): StageCompletionCheck {
  const electrical = facility?.electrical;
  if (!electrical) {
    return {
      ok: false,
      missing: ["contractPowerKw", "phaseType", "panelFieldChecked", "expansionStatus"],
    };
  }
  return { ok: true };
}

function checkWaterSupply(facility: FacilityObservations | undefined): StageCompletionCheck {
  if (!facility?.waterSupply) {
    return {
      ok: false,
      missing: ["locationChecked", "supplyPointObserved", "furtherCheckNeeded"],
    };
  }
  return { ok: true };
}

function checkDrainage(facility: FacilityObservations | undefined): StageCompletionCheck {
  if (!facility?.drainage) {
    return {
      ok: false,
      missing: ["locationChecked", "floorDrainObserved", "furtherCheckNeeded"],
    };
  }
  return { ok: true };
}

function checkExhaust(facility: FacilityObservations | undefined): StageCompletionCheck {
  if (!facility?.exhaust) {
    return {
      ok: false,
      missing: [
        "existingEquipmentObserved",
        "externalPathChecked",
        "landlordConfirmation",
        "expertReviewNeeded",
      ],
    };
  }
  return { ok: true };
}

function checkRestroom(facility: FacilityObservations | undefined): StageCompletionCheck {
  if (!facility?.restroom) {
    return { ok: false, missing: ["location", "usage", "fieldChecked"] };
  }
  return { ok: true };
}

function checkProductionSalesSpace(
  observation: ProductionSalesSpaceObservation | undefined,
): StageCompletionCheck {
  if (!observation) {
    return {
      ok: false,
      missing: [
        "manufacturingSpace",
        "salesSpace",
        "customerFlow",
        "staffFlow",
        "packingPickupSpace",
        "storageSpace",
      ],
    };
  }
  // NOT_ASSESSED 명시값은 완료 가능. 객체 자체가 없으면 공란.
  return { ok: true };
}

function checkDeliveryPath(observation: DeliveryPathObservation | undefined): StageCompletionCheck {
  if (!observation) {
    return {
      ok: false,
      missing: [
        "primaryDeliveryMethod",
        "elevatorAccess",
        "stairTurning",
        "intermediateDoorCorridor",
        "loadingAccess",
      ],
    };
  }
  return { ok: true };
}

/** Phase 4 입력 Stage 목록 */
export const PHASE4_INPUT_STAGE_IDS = [
  "measurement",
  "ceilingStructure",
  "electrical",
  "waterSupply",
  "drainage",
  "exhaust",
  "restroom",
] as const;

/** Phase 4.5 입력 Stage 목록 */
export const PHASE45_INPUT_STAGE_IDS = ["productionSalesSpace", "deliveryPath"] as const;

export const FIELD_INPUT_STAGE_IDS = [
  ...PHASE4_INPUT_STAGE_IDS,
  ...PHASE45_INPUT_STAGE_IDS,
] as const;

export type Phase4InputStageId = (typeof PHASE4_INPUT_STAGE_IDS)[number];
export type Phase45InputStageId = (typeof PHASE45_INPUT_STAGE_IDS)[number];
export type FieldInputStageId = (typeof FIELD_INPUT_STAGE_IDS)[number];

export function isPhase4InputStage(stageId: string): stageId is Phase4InputStageId {
  return (PHASE4_INPUT_STAGE_IDS as readonly string[]).includes(stageId);
}

export function isFieldInputStage(stageId: string): stageId is FieldInputStageId {
  return (FIELD_INPUT_STAGE_IDS as readonly string[]).includes(stageId);
}
