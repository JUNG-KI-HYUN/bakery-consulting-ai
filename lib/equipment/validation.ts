/**
 * Equipment Definition / Instance validation (순수함수).
 * Risk/Verdict를 만들지 않는다. SAMPLE→VERIFIED 자동승격 경로 없음.
 */

import type {
  ElectricalRequirement,
  EquipmentCategory,
  EquipmentDataStatus,
  EquipmentDefinition,
  EquipmentDimensionMm,
  EquipmentInstance,
  EquipmentRotationDeg,
  EquipmentSource,
  EquipmentSourceType,
  EquipmentTriState,
  EquipmentVoltage,
  EquipmentPhase,
  ServiceClearanceMm,
  UtilityRequirement,
} from "./types";
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_DATA_STATUSES,
  EQUIPMENT_DEFINITION_SCHEMA_VERSION,
  EQUIPMENT_INSTANCE_SCHEMA_VERSION,
  EQUIPMENT_SOURCE_TYPES,
} from "./types";
import { isEquipmentDefinitionId, isEquipmentInstanceId } from "./identifiers";
import { isLayoutId } from "../space-fit/identifiers";

export type EquipmentValidationFailure = {
  readonly ok: false;
  readonly code: "INVALID_DATA";
  readonly message: string;
};

export type EquipmentValidationSuccess<T> = {
  readonly ok: true;
  readonly value: T;
};

export type EquipmentValidationResult<T> =
  | EquipmentValidationSuccess<T>
  | EquipmentValidationFailure;

function fail(message: string): EquipmentValidationFailure {
  return { ok: false, code: "INVALID_DATA", message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value > 0;
}

function isNonNegInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value >= 0;
}

export function isEquipmentCategory(value: unknown): value is EquipmentCategory {
  return typeof value === "string" && EQUIPMENT_CATEGORIES.some((item) => item === value);
}

export function isEquipmentDataStatus(value: unknown): value is EquipmentDataStatus {
  return typeof value === "string" && EQUIPMENT_DATA_STATUSES.some((item) => item === value);
}

export function isEquipmentSourceType(value: unknown): value is EquipmentSourceType {
  return typeof value === "string" && EQUIPMENT_SOURCE_TYPES.some((item) => item === value);
}

export function parseEquipmentDimensionMm(value: unknown): EquipmentDimensionMm | null {
  if (!isRecord(value)) return null;
  if (value.status === "UNKNOWN") {
    if ("mm" in value) return null; // 0/값으로 저장하지 않음
    return Object.freeze({ status: "UNKNOWN" });
  }
  if (value.status === "KNOWN") {
    if (!isPositiveInt(value.mm)) return null;
    return Object.freeze({ status: "KNOWN", mm: value.mm });
  }
  return null;
}

function parseTriState(value: unknown): EquipmentTriState | undefined | null {
  if (value === undefined) return undefined;
  if (value === true || value === false || value === "UNKNOWN") return value;
  return null;
}

function parseOptionalNonNegNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!isNonNegativeFiniteNumber(value)) return null;
  // reject NaN/Infinity already; reject negative via isNonNegative
  return value;
}

function parseOptionalPositiveNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!isPositiveFiniteNumber(value)) return null;
  return value;
}

function parseServiceClearance(value: unknown): ServiceClearanceMm | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const frontMm = parseOptionalNonNegNumber(value.frontMm);
  const backMm = parseOptionalNonNegNumber(value.backMm);
  const leftMm = parseOptionalNonNegNumber(value.leftMm);
  const rightMm = parseOptionalNonNegNumber(value.rightMm);
  if (
    frontMm === null ||
    backMm === null ||
    leftMm === null ||
    rightMm === null
  ) {
    return null;
  }
  // negative already rejected; explicit NaN check
  for (const n of [value.frontMm, value.backMm, value.leftMm, value.rightMm]) {
    if (typeof n === "number" && (!Number.isFinite(n) || n < 0)) return null;
  }
  return Object.freeze({
    ...(frontMm !== undefined ? { frontMm } : {}),
    ...(backMm !== undefined ? { backMm } : {}),
    ...(leftMm !== undefined ? { leftMm } : {}),
    ...(rightMm !== undefined ? { rightMm } : {}),
  });
}

function parseElectrical(value: unknown): ElectricalRequirement | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const required = parseTriState(value.required);
  if (required === null) return null;
  const powerKw = parseOptionalPositiveNumber(value.powerKw);
  if (powerKw === null && value.powerKw !== undefined && value.powerKw !== null) {
    // negative / NaN / Infinity / 0
    return null;
  }
  if (value.powerKw !== undefined && value.powerKw !== null && !isPositiveFiniteNumber(value.powerKw)) {
    return null;
  }
  const voltage = value.voltage;
  if (
    voltage !== undefined &&
    voltage !== "220V" &&
    voltage !== "380V" &&
    voltage !== "OTHER" &&
    voltage !== "UNKNOWN"
  ) {
    return null;
  }
  const phase = value.phase;
  if (
    phase !== undefined &&
    phase !== "SINGLE" &&
    phase !== "THREE" &&
    phase !== "UNKNOWN"
  ) {
    return null;
  }
  return Object.freeze({
    ...(required !== undefined ? { required } : {}),
    ...(value.powerKw === null
      ? { powerKw: null }
      : powerKw !== undefined
        ? { powerKw }
        : {}),
    ...(voltage !== undefined ? { voltage: voltage as EquipmentVoltage } : {}),
    ...(phase !== undefined ? { phase: phase as EquipmentPhase } : {}),
    ...(typeof value.note === "string" && value.note.trim()
      ? { note: value.note.trim() }
      : {}),
  });
}

function parseUtility(value: unknown): UtilityRequirement | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const required = parseTriState(value.required);
  if (required === null) return null;
  return Object.freeze({
    ...(required !== undefined ? { required } : {}),
    ...(typeof value.note === "string" && value.note.trim()
      ? { note: value.note.trim() }
      : {}),
  });
}

function parseSource(value: unknown): EquipmentSource | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  if (!isEquipmentSourceType(value.sourceType)) return null;
  return Object.freeze({
    sourceType: value.sourceType,
    ...(typeof value.sourceLabel === "string" && value.sourceLabel.trim()
      ? { sourceLabel: value.sourceLabel.trim() }
      : {}),
    ...(typeof value.sourceReference === "string" && value.sourceReference.trim()
      ? { sourceReference: value.sourceReference.trim() }
      : {}),
    ...(typeof value.verifiedBy === "string" && value.verifiedBy.trim()
      ? { verifiedBy: value.verifiedBy.trim() }
      : {}),
    ...(typeof value.verifiedAt === "string" && value.verifiedAt.trim()
      ? { verifiedAt: value.verifiedAt.trim() }
      : {}),
  });
}

/**
 * VERIFIED 기본조건:
 * - source 존재
 * - sourceType !== SAMPLE
 * - verifiedAt 존재 (definition.verifiedAt 또는 source.verifiedAt)
 */
export function assertVerifiedEligibility(input: {
  dataStatus: EquipmentDataStatus;
  source?: EquipmentSource;
  verifiedAt?: string;
}): EquipmentValidationResult<true> {
  if (input.dataStatus !== "VERIFIED") return { ok: true, value: true };
  if (!input.source) {
    return fail("VERIFIED EquipmentDefinition requires source");
  }
  if (input.source.sourceType === "SAMPLE") {
    return fail("VERIFIED cannot use SAMPLE source");
  }
  const verifiedAt = input.verifiedAt?.trim() || input.source.verifiedAt?.trim();
  if (!verifiedAt) {
    return fail("VERIFIED EquipmentDefinition requires verifiedAt");
  }
  return { ok: true, value: true };
}

/** SAMPLE/REFERENCE를 VERIFIED로 자동승격하는 경로를 제공하지 않는다. */
export function cannotAutoPromoteToVerified(
  from: EquipmentDataStatus,
): boolean {
  return from === "SAMPLE" || from === "REFERENCE" || from === "NEEDS_REVIEW";
}

export function parseEquipmentDefinition(value: unknown): EquipmentDefinition | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== EQUIPMENT_DEFINITION_SCHEMA_VERSION) return null;
  if (!isEquipmentDefinitionId(value.equipmentDefinitionId)) return null;
  if (!isEquipmentCategory(value.category)) return null;
  if (typeof value.name !== "string" || value.name.trim() === "") return null;
  if (!isEquipmentDataStatus(value.dataStatus)) return null;
  if (typeof value.createdAt !== "string" || value.createdAt.trim() === "") return null;
  if (typeof value.updatedAt !== "string" || value.updatedAt.trim() === "") return null;

  if (!isRecord(value.dimensions)) return null;
  const widthMm =
    value.dimensions.widthMm === undefined
      ? undefined
      : parseEquipmentDimensionMm(value.dimensions.widthMm);
  const depthMm =
    value.dimensions.depthMm === undefined
      ? undefined
      : parseEquipmentDimensionMm(value.dimensions.depthMm);
  const heightMm =
    value.dimensions.heightMm === undefined
      ? undefined
      : parseEquipmentDimensionMm(value.dimensions.heightMm);
  if (widthMm === null || depthMm === null || heightMm === null) return null;

  if (
    value.rotationAllowed !== undefined &&
    typeof value.rotationAllowed !== "boolean"
  ) {
    return null;
  }

  const electricalRequirement = parseElectrical(value.electricalRequirement);
  if (electricalRequirement === null) return null;
  const waterRequirement = parseUtility(value.waterRequirement);
  if (waterRequirement === null) return null;
  const drainRequirement = parseUtility(value.drainRequirement);
  if (drainRequirement === null) return null;
  const exhaustRequirement = parseUtility(value.exhaustRequirement);
  if (exhaustRequirement === null) return null;
  const serviceClearance = parseServiceClearance(value.serviceClearance);
  if (serviceClearance === null) return null;
  const minimumDeliveryWidthMm =
    value.minimumDeliveryWidthMm === undefined
      ? undefined
      : parseEquipmentDimensionMm(value.minimumDeliveryWidthMm);
  if (minimumDeliveryWidthMm === null) return null;
  const source = parseSource(value.source);
  if (source === null) return null;

  const verifiedAt =
    typeof value.verifiedAt === "string" && value.verifiedAt.trim()
      ? value.verifiedAt.trim()
      : undefined;

  const verifiedCheck = assertVerifiedEligibility({
    dataStatus: value.dataStatus,
    source: source ?? undefined,
    verifiedAt,
  });
  if (!verifiedCheck.ok) return null;

  return Object.freeze({
    schemaVersion: EQUIPMENT_DEFINITION_SCHEMA_VERSION,
    equipmentDefinitionId: value.equipmentDefinitionId,
    category: value.category,
    name: value.name.trim(),
    ...(typeof value.manufacturer === "string" && value.manufacturer.trim()
      ? { manufacturer: value.manufacturer.trim() }
      : {}),
    ...(typeof value.model === "string" && value.model.trim()
      ? { model: value.model.trim() }
      : {}),
    dimensions: Object.freeze({
      ...(widthMm ? { widthMm } : {}),
      ...(depthMm ? { depthMm } : {}),
      ...(heightMm ? { heightMm } : {}),
    }),
    ...(value.rotationAllowed !== undefined
      ? { rotationAllowed: value.rotationAllowed }
      : {}),
    ...(electricalRequirement ? { electricalRequirement } : {}),
    ...(waterRequirement ? { waterRequirement } : {}),
    ...(drainRequirement ? { drainRequirement } : {}),
    ...(exhaustRequirement ? { exhaustRequirement } : {}),
    ...(serviceClearance ? { serviceClearance } : {}),
    ...(minimumDeliveryWidthMm ? { minimumDeliveryWidthMm } : {}),
    dataStatus: value.dataStatus,
    ...(source ? { source } : {}),
    ...(verifiedAt ? { verifiedAt } : {}),
    ...(typeof value.limitation === "string" && value.limitation.trim()
      ? { limitation: value.limitation.trim() }
      : {}),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  });
}

export function validateEquipmentDefinitionInput(
  value: unknown,
): EquipmentValidationResult<EquipmentDefinition> {
  const parsed = parseEquipmentDefinition(value);
  if (!parsed) {
    return fail("EquipmentDefinition is invalid");
  }
  return { ok: true, value: parsed };
}

export function isEquipmentRotationDeg(value: unknown): value is EquipmentRotationDeg {
  return value === 0 || value === 90;
}

/**
 * Instance + Definition 관계 검증.
 * rotationAllowed === false 또는 undefined(미확인)이면 90° 거부.
 */
export function validateEquipmentInstanceForDefinition(
  instance: EquipmentInstance,
  definition: EquipmentDefinition,
): EquipmentValidationResult<EquipmentInstance> {
  if (instance.equipmentDefinitionId !== definition.equipmentDefinitionId) {
    return fail("EquipmentInstance.equipmentDefinitionId does not match Definition");
  }
  if (instance.rotationDeg === 90 && definition.rotationAllowed !== true) {
    return fail("90° rotation requires rotationAllowed=true");
  }
  return { ok: true, value: instance };
}

export function parseEquipmentInstance(value: unknown): EquipmentInstance | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== EQUIPMENT_INSTANCE_SCHEMA_VERSION) return null;
  if (!isEquipmentInstanceId(value.equipmentInstanceId)) return null;
  if (!isEquipmentDefinitionId(value.equipmentDefinitionId)) return null;
  if (!isLayoutId(value.layoutId)) return null;
  if (!isNonNegInt(value.xMm) || !isNonNegInt(value.yMm)) return null;
  if (!isEquipmentRotationDeg(value.rotationDeg)) return null;
  if (typeof value.createdAt !== "string" || value.createdAt.trim() === "") return null;
  if (typeof value.updatedAt !== "string" || value.updatedAt.trim() === "") return null;
  // Instance에 사양 복제 금지
  if (
    "widthMm" in value ||
    "depthMm" in value ||
    "heightMm" in value ||
    "powerKw" in value ||
    "dataStatus" in value
  ) {
    return null;
  }
  return Object.freeze({
    schemaVersion: EQUIPMENT_INSTANCE_SCHEMA_VERSION,
    equipmentInstanceId: value.equipmentInstanceId,
    equipmentDefinitionId: value.equipmentDefinitionId,
    layoutId: value.layoutId,
    xMm: value.xMm,
    yMm: value.yMm,
    rotationDeg: value.rotationDeg,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    ...(typeof value.note === "string" && value.note.trim()
      ? { note: value.note.trim() }
      : {}),
  });
}

/** dataStatus는 Risk/Verdict가 아니다. */
export function equipmentDataStatusIsNotRiskVerdict(
  status: EquipmentDataStatus,
): boolean {
  return (
    status === "VERIFIED" ||
    status === "REFERENCE" ||
    status === "SAMPLE" ||
    status === "NEEDS_REVIEW"
  );
}
