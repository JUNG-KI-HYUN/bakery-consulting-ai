/**
 * Equipment Domain — Definition / Instance 분리.
 *
 * Phase 0 EQUIPMENT_SCHEMA.md + Phase 5C 계약:
 * - opaque ID: equipment_<uuid> / equipment_instance_<uuid>
 * - dataStatus: VERIFIED | REFERENCE | SAMPLE | NEEDS_REVIEW
 * - UNKNOWN 치수를 0으로 만들지 않는다
 * - Risk/Verdict를 생성하지 않는다
 */

import {
  createEquipmentDefinitionId,
  createEquipmentInstanceId,
  isEquipmentDefinitionId,
  isEquipmentInstanceId,
} from "./identifiers";
import { isLayoutId } from "../space-fit/identifiers";

export const EQUIPMENT_DEFINITION_SCHEMA_VERSION = "equipment-definition-v1" as const;
export const EQUIPMENT_INSTANCE_SCHEMA_VERSION = "equipment-instance-v1" as const;

/**
 * 베이커리 실무 최소 category.
 * Phase 0 전체 목록의 부분집합. 과도한 확장 금지.
 */
export type EquipmentCategory =
  | "OVEN"
  | "MIXER"
  | "PROOFER"
  | "REFRIGERATOR"
  | "FREEZER"
  | "SHOWCASE"
  | "WORKTABLE"
  | "SINK"
  | "OTHER";

export const EQUIPMENT_CATEGORIES: readonly EquipmentCategory[] = Object.freeze([
  "OVEN",
  "MIXER",
  "PROOFER",
  "REFRIGERATOR",
  "FREEZER",
  "SHOWCASE",
  "WORKTABLE",
  "SINK",
  "OTHER",
]);

/**
 * 장비 사양 신뢰상태.
 * FIELD Evidence VerificationStatus와 다른 축이다.
 */
export type EquipmentDataStatus = "VERIFIED" | "REFERENCE" | "SAMPLE" | "NEEDS_REVIEW";

export const EQUIPMENT_DATA_STATUSES: readonly EquipmentDataStatus[] = Object.freeze([
  "VERIFIED",
  "REFERENCE",
  "SAMPLE",
  "NEEDS_REVIEW",
]);

/**
 * 장비 사양 출처.
 * 배베스토리 등 협력 참고는 PARTNER_REFERENCE — MANUFACTURER와 동일 취급 금지.
 */
export type EquipmentSourceType =
  | "MANUFACTURER"
  | "PARTNER_REFERENCE"
  | "CUSTOMER_DOCUMENT"
  | "INTERNAL_REFERENCE"
  | "SAMPLE"
  | "OTHER";

export const EQUIPMENT_SOURCE_TYPES: readonly EquipmentSourceType[] = Object.freeze([
  "MANUFACTURER",
  "PARTNER_REFERENCE",
  "CUSTOMER_DOCUMENT",
  "INTERNAL_REFERENCE",
  "SAMPLE",
  "OTHER",
]);

export interface EquipmentSource {
  readonly sourceType: EquipmentSourceType;
  readonly sourceLabel?: string;
  readonly sourceReference?: string;
  readonly verifiedBy?: string;
  readonly verifiedAt?: string;
}

/** KNOWN mm만 양의 정수. 생략 = 미입력, UNKNOWN = 명시적 모름. 0 저장 금지. */
export type EquipmentDimensionMm =
  | { readonly status: "KNOWN"; readonly mm: number }
  | { readonly status: "UNKNOWN" };

export interface EquipmentDimensions {
  readonly widthMm?: EquipmentDimensionMm;
  readonly depthMm?: EquipmentDimensionMm;
  readonly heightMm?: EquipmentDimensionMm;
}

export type EquipmentTriState = boolean | "UNKNOWN";

export type EquipmentVoltage = "220V" | "380V" | "OTHER" | "UNKNOWN";
export type EquipmentPhase = "SINGLE" | "THREE" | "UNKNOWN";

export interface ElectricalRequirement {
  readonly required?: EquipmentTriState;
  readonly powerKw?: number | null;
  readonly voltage?: EquipmentVoltage;
  readonly phase?: EquipmentPhase;
  readonly note?: string;
}

export interface UtilityRequirement {
  readonly required?: EquipmentTriState;
  readonly note?: string;
}

export interface ServiceClearanceMm {
  readonly frontMm?: number | null;
  readonly backMm?: number | null;
  readonly leftMm?: number | null;
  readonly rightMm?: number | null;
}

/**
 * 장비 카탈로그 사양. 좌표 없음.
 * Layout에 전체를 복제하지 않는다.
 */
export interface EquipmentDefinition {
  readonly schemaVersion: typeof EQUIPMENT_DEFINITION_SCHEMA_VERSION;
  readonly equipmentDefinitionId: string;
  readonly category: EquipmentCategory;
  readonly name: string;
  readonly manufacturer?: string;
  readonly model?: string;
  readonly dimensions: EquipmentDimensions;
  /** true: 0/90 허용. false: 0만. undefined: 미확인 → 90° Instance 거부(보수). */
  readonly rotationAllowed?: boolean;
  readonly electricalRequirement?: ElectricalRequirement;
  readonly waterRequirement?: UtilityRequirement;
  readonly drainRequirement?: UtilityRequirement;
  readonly exhaustRequirement?: UtilityRequirement;
  readonly serviceClearance?: ServiceClearanceMm;
  readonly minimumDeliveryWidthMm?: EquipmentDimensionMm;
  readonly dataStatus: EquipmentDataStatus;
  readonly source?: EquipmentSource;
  readonly verifiedAt?: string;
  readonly limitation?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type EquipmentRotationDeg = 0 | 90;

/**
 * Layout에 배치된 장비. 사양 수치를 복사하지 않고 Definition ID만 참조.
 */
export interface EquipmentInstance {
  readonly schemaVersion: typeof EQUIPMENT_INSTANCE_SCHEMA_VERSION;
  readonly equipmentInstanceId: string;
  readonly equipmentDefinitionId: string;
  readonly layoutId: string;
  readonly xMm: number;
  readonly yMm: number;
  readonly rotationDeg: EquipmentRotationDeg;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly note?: string;
}

export function createKnownEquipmentMm(mm: number): EquipmentDimensionMm {
  if (!Number.isInteger(mm) || !Number.isFinite(mm) || mm <= 0) {
    throw new RangeError("KNOWN equipment dimension must be a positive finite integer mm");
  }
  return Object.freeze({ status: "KNOWN", mm });
}

export function createUnknownEquipmentDimension(): EquipmentDimensionMm {
  return Object.freeze({ status: "UNKNOWN" });
}

export function createEquipmentDefinition(input: {
  category: EquipmentCategory;
  name: string;
  dataStatus: EquipmentDataStatus;
  createdAt: string;
  equipmentDefinitionId?: string;
  manufacturer?: string;
  model?: string;
  dimensions?: EquipmentDimensions;
  rotationAllowed?: boolean;
  electricalRequirement?: ElectricalRequirement;
  waterRequirement?: UtilityRequirement;
  drainRequirement?: UtilityRequirement;
  exhaustRequirement?: UtilityRequirement;
  serviceClearance?: ServiceClearanceMm;
  minimumDeliveryWidthMm?: EquipmentDimensionMm;
  source?: EquipmentSource;
  verifiedAt?: string;
  limitation?: string;
}): EquipmentDefinition {
  const equipmentDefinitionId = input.equipmentDefinitionId ?? createEquipmentDefinitionId();
  if (!isEquipmentDefinitionId(equipmentDefinitionId)) {
    throw new RangeError("equipmentDefinitionId must use equipment_<uuid>");
  }
  const name = input.name.trim();
  if (name === "") {
    throw new RangeError("EquipmentDefinition.name is required");
  }
  return Object.freeze({
    schemaVersion: EQUIPMENT_DEFINITION_SCHEMA_VERSION,
    equipmentDefinitionId,
    category: input.category,
    name,
    ...(input.manufacturer?.trim() ? { manufacturer: input.manufacturer.trim() } : {}),
    ...(input.model?.trim() ? { model: input.model.trim() } : {}),
    dimensions: Object.freeze({ ...(input.dimensions ?? {}) }),
    ...(input.rotationAllowed !== undefined ? { rotationAllowed: input.rotationAllowed } : {}),
    ...(input.electricalRequirement
      ? { electricalRequirement: Object.freeze({ ...input.electricalRequirement }) }
      : {}),
    ...(input.waterRequirement
      ? { waterRequirement: Object.freeze({ ...input.waterRequirement }) }
      : {}),
    ...(input.drainRequirement
      ? { drainRequirement: Object.freeze({ ...input.drainRequirement }) }
      : {}),
    ...(input.exhaustRequirement
      ? { exhaustRequirement: Object.freeze({ ...input.exhaustRequirement }) }
      : {}),
    ...(input.serviceClearance
      ? { serviceClearance: Object.freeze({ ...input.serviceClearance }) }
      : {}),
    ...(input.minimumDeliveryWidthMm
      ? { minimumDeliveryWidthMm: input.minimumDeliveryWidthMm }
      : {}),
    dataStatus: input.dataStatus,
    ...(input.source ? { source: Object.freeze({ ...input.source }) } : {}),
    ...(input.verifiedAt?.trim() ? { verifiedAt: input.verifiedAt.trim() } : {}),
    ...(input.limitation?.trim() ? { limitation: input.limitation.trim() } : {}),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });
}

export function createEquipmentInstance(input: {
  equipmentDefinitionId: string;
  layoutId: string;
  xMm: number;
  yMm: number;
  rotationDeg: EquipmentRotationDeg;
  createdAt: string;
  equipmentInstanceId?: string;
  note?: string;
}): EquipmentInstance {
  if (!isEquipmentDefinitionId(input.equipmentDefinitionId)) {
    throw new RangeError("EquipmentInstance requires equipmentDefinitionId");
  }
  if (!isLayoutId(input.layoutId)) {
    throw new RangeError("EquipmentInstance requires layoutId");
  }
  const equipmentInstanceId = input.equipmentInstanceId ?? createEquipmentInstanceId();
  if (!isEquipmentInstanceId(equipmentInstanceId)) {
    throw new RangeError("equipmentInstanceId must use equipment_instance_<uuid>");
  }
  if (
    !Number.isInteger(input.xMm) ||
    !Number.isInteger(input.yMm) ||
    input.xMm < 0 ||
    input.yMm < 0
  ) {
    throw new RangeError("EquipmentInstance xMm/yMm must be non-negative integers");
  }
  if (input.rotationDeg !== 0 && input.rotationDeg !== 90) {
    throw new RangeError("EquipmentInstance rotationDeg supports 0 or 90 only");
  }
  return Object.freeze({
    schemaVersion: EQUIPMENT_INSTANCE_SCHEMA_VERSION,
    equipmentInstanceId,
    equipmentDefinitionId: input.equipmentDefinitionId,
    layoutId: input.layoutId,
    xMm: input.xMm,
    yMm: input.yMm,
    rotationDeg: input.rotationDeg,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  });
}
