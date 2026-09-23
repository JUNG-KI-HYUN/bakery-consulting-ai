import type {
  DeliveryPathObservation,
  ElevatorAccessStatus,
  PathConstraintObservation,
  ProductionSalesSpaceObservation,
  SpaceAssessStatus,
} from "../field/space-equipment";

function spaceStatusLabel(status: SpaceAssessStatus | undefined): string {
  switch (status) {
    case "PLANNABLE":
      return "계획 가능으로 관찰";
    case "LIMITED":
      return "공간 제약 있음";
    case "NOT_ASSESSED":
      return "미평가";
    default:
      return "확인되지 않음";
  }
}

function elevatorLabel(value: ElevatorAccessStatus | undefined): string {
  switch (value) {
    case "AVAILABLE":
      return "엘리베이터";
    case "CONSTRAINED":
      return "엘리베이터 / 일부 제약 관찰";
    case "UNKNOWN":
      return "엘리베이터 미확인";
    default:
      return "확인되지 않음";
  }
}

function hasPathConstraint(value: PathConstraintObservation | undefined): boolean {
  return value === "CONSTRAINT_OBSERVED";
}

/**
 * FIELD Space/Delivery 관찰을 Layout에 복사하지 않고 UI 참고문구만 만든다.
 */
export function buildSpaceFitContextNotes(input: {
  productionSalesSpace?: ProductionSalesSpaceObservation | null;
  deliveryPath?: DeliveryPathObservation | null;
}): {
  readonly manufacturingLabel: string;
  readonly deliveryLabel: string;
} {
  const manufacturing = input.productionSalesSpace?.manufacturingSpace.value;
  const elev = input.deliveryPath?.elevatorAccess.value;
  const limited =
    hasPathConstraint(input.deliveryPath?.stairTurning.value) ||
    hasPathConstraint(input.deliveryPath?.intermediateDoorCorridor.value) ||
    input.deliveryPath?.loadingAccess.value === "LIMITED" ||
    elev === "CONSTRAINED";

  let deliveryLabel = elevatorLabel(elev);
  if (limited && elev !== "CONSTRAINED") {
    deliveryLabel = `${deliveryLabel} / 일부 제약 관찰`;
  }

  return {
    manufacturingLabel: `제조공간: ${spaceStatusLabel(manufacturing)}`,
    deliveryLabel: `장비 반입: ${deliveryLabel}`,
  };
}
