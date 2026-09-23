import {
  createFieldEvidenceMeta,
  parseFieldEvidenceMeta,
  type FieldEvidenceMeta,
} from "./field-evidence-meta";

/**
 * SPACE_EQUIPMENT 관찰 Domain.
 * 최종 설치/반입/영업 가능 판정이 아니다. 현장 1차 관찰만 담는다.
 * MeasurementSet 치수를 복제하지 않는다.
 */

/** 공간·동선 1차 관찰. PLANNABLE ≠ 법적/인허가/영업 가능. */
export type SpaceAssessStatus = "PLANNABLE" | "LIMITED" | "NOT_ASSESSED";

export type DeliveryPrimaryMethod =
  | "GROUND_DIRECT"
  | "STAIRS"
  | "ELEVATOR"
  | "OTHER"
  | "UNKNOWN";

export type ElevatorAccessStatus = "AVAILABLE" | "CONSTRAINED" | "UNKNOWN";
export type PathConstraintObservation =
  | "NO_CONSTRAINT_OBSERVED"
  | "CONSTRAINT_OBSERVED"
  | "UNKNOWN";
export type LoadingAccessStatus = "AVAILABLE" | "LIMITED" | "UNKNOWN";

export interface SpaceObservationField<T> {
  readonly value: T;
  readonly evidence: FieldEvidenceMeta;
}

export interface ProductionSalesSpaceObservation {
  readonly manufacturingSpace: SpaceObservationField<SpaceAssessStatus>;
  readonly salesSpace: SpaceObservationField<SpaceAssessStatus>;
  readonly staffFlow: SpaceObservationField<SpaceAssessStatus>;
  readonly customerFlow: SpaceObservationField<SpaceAssessStatus>;
  readonly packingPickupSpace: SpaceObservationField<SpaceAssessStatus>;
  readonly storageSpace: SpaceObservationField<SpaceAssessStatus>;
  /** MeasurementSet과 중복되지 않는 공간구성 영향 메모만 담는다. */
  readonly structuralConstraintNote?: string;
  readonly note?: string;
}

export interface DeliveryPathObservation {
  readonly primaryDeliveryMethod: SpaceObservationField<DeliveryPrimaryMethod>;
  readonly elevatorAccess: SpaceObservationField<ElevatorAccessStatus>;
  readonly stairTurning: SpaceObservationField<PathConstraintObservation>;
  readonly intermediateDoorCorridor: SpaceObservationField<PathConstraintObservation>;
  readonly loadingAccess: SpaceObservationField<LoadingAccessStatus>;
  readonly note?: string;
}

function obs<T>(value: T, evidence?: Partial<FieldEvidenceMeta>): SpaceObservationField<T> {
  return Object.freeze({
    value,
    evidence: createFieldEvidenceMeta(evidence),
  });
}

export function createDefaultProductionSalesSpace(): ProductionSalesSpaceObservation {
  return Object.freeze({
    manufacturingSpace: obs("NOT_ASSESSED" as const),
    salesSpace: obs("NOT_ASSESSED" as const),
    staffFlow: obs("NOT_ASSESSED" as const),
    customerFlow: obs("NOT_ASSESSED" as const),
    packingPickupSpace: obs("NOT_ASSESSED" as const),
    storageSpace: obs("NOT_ASSESSED" as const),
  });
}

export function createDefaultDeliveryPath(): DeliveryPathObservation {
  return Object.freeze({
    primaryDeliveryMethod: obs("UNKNOWN" as const),
    elevatorAccess: obs("UNKNOWN" as const),
    stairTurning: obs("UNKNOWN" as const),
    intermediateDoorCorridor: obs("UNKNOWN" as const),
    loadingAccess: obs("UNKNOWN" as const),
  });
}

function parseObservation<T>(
  value: unknown,
  parseValue: (raw: unknown) => T | null,
): SpaceObservationField<T> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const parsedValue = parseValue(record.value);
  if (parsedValue === null) return null;
  const evidence = parseFieldEvidenceMeta(record.evidence);
  if (!evidence) return null;
  return Object.freeze({ value: parsedValue, evidence });
}

function isSpaceAssess(value: unknown): value is SpaceAssessStatus {
  return value === "PLANNABLE" || value === "LIMITED" || value === "NOT_ASSESSED";
}

export function parseProductionSalesSpaceObservation(
  value: unknown,
): ProductionSalesSpaceObservation | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const manufacturingSpace = parseObservation(record.manufacturingSpace, (raw) =>
    isSpaceAssess(raw) ? raw : null,
  );
  const salesSpace = parseObservation(record.salesSpace, (raw) =>
    isSpaceAssess(raw) ? raw : null,
  );
  const staffFlow = parseObservation(record.staffFlow, (raw) =>
    isSpaceAssess(raw) ? raw : null,
  );
  const customerFlow = parseObservation(record.customerFlow, (raw) =>
    isSpaceAssess(raw) ? raw : null,
  );
  const packingPickupSpace = parseObservation(record.packingPickupSpace, (raw) =>
    isSpaceAssess(raw) ? raw : null,
  );
  const storageSpace = parseObservation(record.storageSpace, (raw) =>
    isSpaceAssess(raw) ? raw : null,
  );
  if (
    !manufacturingSpace ||
    !salesSpace ||
    !staffFlow ||
    !customerFlow ||
    !packingPickupSpace ||
    !storageSpace
  ) {
    return null;
  }
  if (
    record.structuralConstraintNote !== undefined &&
    typeof record.structuralConstraintNote !== "string"
  ) {
    return null;
  }
  if (record.note !== undefined && typeof record.note !== "string") return null;
  const structuralConstraintNote = record.structuralConstraintNote?.trim();
  const note = record.note?.trim();
  return Object.freeze({
    manufacturingSpace,
    salesSpace,
    staffFlow,
    customerFlow,
    packingPickupSpace,
    storageSpace,
    ...(structuralConstraintNote ? { structuralConstraintNote } : {}),
    ...(note ? { note } : {}),
  });
}

export function parseDeliveryPathObservation(value: unknown): DeliveryPathObservation | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const primaryDeliveryMethod = parseObservation(record.primaryDeliveryMethod, (raw) =>
    raw === "GROUND_DIRECT" ||
    raw === "STAIRS" ||
    raw === "ELEVATOR" ||
    raw === "OTHER" ||
    raw === "UNKNOWN"
      ? raw
      : null,
  );
  const elevatorAccess = parseObservation(record.elevatorAccess, (raw) =>
    raw === "AVAILABLE" || raw === "CONSTRAINED" || raw === "UNKNOWN" ? raw : null,
  );
  const stairTurning = parseObservation(record.stairTurning, (raw) =>
    raw === "NO_CONSTRAINT_OBSERVED" ||
    raw === "CONSTRAINT_OBSERVED" ||
    raw === "UNKNOWN"
      ? raw
      : null,
  );
  const intermediateDoorCorridor = parseObservation(record.intermediateDoorCorridor, (raw) =>
    raw === "NO_CONSTRAINT_OBSERVED" ||
    raw === "CONSTRAINT_OBSERVED" ||
    raw === "UNKNOWN"
      ? raw
      : null,
  );
  const loadingAccess = parseObservation(record.loadingAccess, (raw) =>
    raw === "AVAILABLE" || raw === "LIMITED" || raw === "UNKNOWN" ? raw : null,
  );
  if (
    !primaryDeliveryMethod ||
    !elevatorAccess ||
    !stairTurning ||
    !intermediateDoorCorridor ||
    !loadingAccess
  ) {
    return null;
  }
  if (record.note !== undefined && typeof record.note !== "string") return null;
  const note = record.note?.trim();
  return Object.freeze({
    primaryDeliveryMethod,
    elevatorAccess,
    stairTurning,
    intermediateDoorCorridor,
    loadingAccess,
    ...(note ? { note } : {}),
  });
}

/** MeasurementSet 치수를 화면에 표시할 때만 사용. Domain에 복사하지 않는다. */
export function formatMeasurementMmDisplay(
  dimension: { status: "KNOWN"; mm: number } | { status: "UNKNOWN" } | undefined,
): { kind: "known"; label: string } | { kind: "unknown" } | { kind: "missing" } {
  if (!dimension) return { kind: "missing" };
  if (dimension.status === "UNKNOWN") return { kind: "unknown" };
  return {
    kind: "known",
    label: `${dimension.mm.toLocaleString("ko-KR")} mm`,
  };
}

/** 관찰값만으로 VERIFIED/반입가능/Risk를 만들지 않았는지 (테스트용). */
export function spaceObservationIsNotAutoVerified(
  observation: SpaceObservationField<unknown>,
): boolean {
  return observation.evidence.verificationStatus !== "VERIFIED";
}
