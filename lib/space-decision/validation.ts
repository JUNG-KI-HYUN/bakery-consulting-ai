/**
 * CandidateSpaceEvidenceSnapshot pure validation.
 * I/O·시간·ID 생성·FIELD mapping·Geometry 해석·Risk 평가를 하지 않는다.
 * 성공 시 caller 입력을 복제한 뒤 deep-freeze한다.
 */

import { sourceRefContainsNoPii } from "../decision-evidence/helpers";
import { isEquipmentDefinitionId } from "../equipment/identifiers";
import {
  isConfirmationRequirement,
  isEvidenceSourceType,
  isVerificationStatus,
} from "../field/field-evidence-meta";
import { isCandidateStoreId } from "../field/identifiers";
import type { EvidenceSourceType } from "../evidence/types";
import {
  CANDIDATE_SPACE_EVIDENCE_SCHEMA_VERSION,
  type CandidateSpaceEvidenceSnapshot,
  type CandidateSpaceEvidenceValidationResult,
  type LayoutAssessmentStatus,
  type ManufacturingRequirement,
  type RequiredEquipmentFitStatus,
  type RequiredEquipmentSetStatus,
  type SpaceAssessmentStatus,
  type SpaceEvidenceSourceRef,
  type SpaceMeasurementStatus,
} from "./types";

const SPACE_ASSESSMENT_STATUSES: readonly SpaceAssessmentStatus[] = [
  "PLANNABLE",
  "LIMITED",
  "NOT_FEASIBLE",
  "NOT_ASSESSED",
  "NOT_APPLICABLE",
];
const EQUIPMENT_FIT_STATUSES: readonly RequiredEquipmentFitStatus[] = [
  "FIT",
  "CONSTRAINED",
  "NOT_FIT",
  "NOT_ASSESSED",
  "NOT_APPLICABLE",
];
const LAYOUT_ASSESSMENT_STATUSES: readonly LayoutAssessmentStatus[] = [
  "ASSESSED",
  "NOT_ASSESSED",
];
const MEASUREMENT_STATUSES: readonly SpaceMeasurementStatus[] = [
  "CONFIRMED",
  "PARTIAL",
  "NOT_CONFIRMED",
];
const REQUIRED_SET_STATUSES: readonly RequiredEquipmentSetStatus[] = [
  "DEFINED",
  "NOT_DEFINED",
];
const MANUFACTURING_REQUIREMENTS: readonly ManufacturingRequirement[] = [
  "REQUIRED",
  "NOT_REQUIRED",
  "UNKNOWN",
];

/** 강한 negative 상태는 현재 근거가 확인된 직접 조사·문서·전문가 평가일 때만 기록한다. */
const STRONG_NEGATIVE_SOURCE_TYPES: readonly EvidenceSourceType[] = [
  "FIELD_CHECK",
  "DOCUMENT",
  "EXPERT_STATEMENT",
];

const FORBIDDEN_KEYS = new Set([
  "risk",
  "riskscore",
  "riskclass",
  "riskseverity",
  "riskfinding",
  "severity",
  "hardblocker",
  "conditionalblocker",
  "verdict",
  "recommendation",
  "finalstatus",
  "finalfeasibility",
  "approved",
  "approval",
  "rejected",
  "contractallowed",
  "contractsafe",
  "safe",
  "score",
  "totalscore",
  "grade",
]);

const SNAPSHOT_KEYS = new Set([
  "schemaVersion",
  "snapshotId",
  "candidateStoreId",
  "capturedAt",
  "manufacturingRequirement",
  "spaceAssessment",
  "equipmentFitAssessment",
  "assessmentBasis",
  "createsRisk",
  "createsVerdict",
  "createsScore",
]);
const SPACE_ASSESSMENT_KEYS = new Set([
  "manufacturingSpace",
  "salesSpace",
  "staffFlow",
  "customerFlow",
  "packingPickupSpace",
  "storageSpace",
]);
const ENTRY_KEYS = new Set(["status", "evidence", "summary"]);
const EVIDENCE_KEYS = new Set([
  "verificationStatus",
  "sourceType",
  "confirmationRequirement",
  "sourceRef",
  "observedAt",
]);
const SOURCE_REF_KEYS = new Set([
  "documentId",
  "opaqueSourceId",
  "fieldKey",
  "stageId",
  "layoutId",
  "measurementId",
]);
const BASIS_KEYS = new Set([
  "layoutAssessmentStatus",
  "measurementStatus",
  "requiredEquipmentSetStatus",
  "requiredEquipmentDefinitionIds",
]);

const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

type Errors = string[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_TIMESTAMP_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function checkKeys(
  errors: Errors,
  path: string,
  value: Record<string, unknown>,
  allowed: Set<string>,
): void {
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      errors.push(`${path}.${key}: Risk/Verdict/Score 필드는 space evidence contract에 둘 수 없습니다.`);
    } else if (!allowed.has(key)) {
      errors.push(`${path}.${key}: 정의되지 않은 필드입니다.`);
    }
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function collectEvidenceErrors(errors: Errors, path: string, value: unknown): void {
  if (!isRecord(value)) {
    errors.push(`${path}는 객체여야 합니다.`);
    return;
  }
  checkKeys(errors, path, value, EVIDENCE_KEYS);
  if (!isVerificationStatus(value.verificationStatus)) {
    errors.push(`${path}.verificationStatus 값이 지원되지 않습니다.`);
  }
  if (!isEvidenceSourceType(value.sourceType)) {
    errors.push(`${path}.sourceType 값이 지원되지 않습니다.`);
  }
  if (!isConfirmationRequirement(value.confirmationRequirement)) {
    errors.push(`${path}.confirmationRequirement 값이 지원되지 않습니다.`);
  }
  if (!isIsoTimestamp(value.observedAt)) {
    errors.push(`${path}.observedAt은 시간대를 포함한 ISO 8601 timestamp여야 합니다.`);
  }

  const sourceRef = value.sourceRef;
  if (!isRecord(sourceRef)) {
    errors.push(`${path}.sourceRef는 객체여야 합니다.`);
    return;
  }
  checkKeys(errors, `${path}.sourceRef`, sourceRef, SOURCE_REF_KEYS);
  const entries = Object.entries(sourceRef).filter(([key]) => SOURCE_REF_KEYS.has(key));
  if (entries.length === 0) {
    errors.push(`${path}.sourceRef에는 최소 하나의 참조 key가 필요합니다.`);
  }
  for (const [key, entry] of entries) {
    if (!isNonEmptyString(entry)) {
      errors.push(`${path}.sourceRef.${key}는 비어 있지 않은 문자열이어야 합니다.`);
    }
  }
  if (!sourceRefContainsNoPii(sourceRef as SpaceEvidenceSourceRef)) {
    errors.push(`${path}.sourceRef에 개인정보로 보이는 값이 있습니다.`);
  }
}

function collectEntryErrors(
  errors: Errors,
  path: string,
  value: unknown,
  allowedStatuses: readonly string[],
  strongNegativeStatus: string,
): void {
  if (!isRecord(value)) {
    errors.push(`${path}는 객체여야 합니다.`);
    return;
  }
  checkKeys(errors, path, value, ENTRY_KEYS);
  if (typeof value.status !== "string" || !allowedStatuses.includes(value.status)) {
    errors.push(`${path}.status 값이 지원되지 않습니다.`);
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(value, "evidence")) {
    errors.push(`${path}.evidence는 null 또는 evidence 객체여야 합니다.`);
  } else if (value.status === "NOT_ASSESSED") {
    if (value.evidence !== null) {
      collectEvidenceErrors(errors, `${path}.evidence`, value.evidence);
    }
  } else if (value.evidence === null || value.evidence === undefined) {
    errors.push(`${path}: ${value.status} 상태는 evidence가 필요합니다.`);
  } else {
    collectEvidenceErrors(errors, `${path}.evidence`, value.evidence);
  }

  if (value.summary !== undefined && !isNonEmptyString(value.summary)) {
    errors.push(`${path}.summary는 비어 있지 않은 문자열이어야 합니다.`);
  }

  if (value.status === strongNegativeStatus && isRecord(value.evidence)) {
    if (
      typeof value.evidence.sourceType !== "string" ||
      !STRONG_NEGATIVE_SOURCE_TYPES.includes(
        value.evidence.sourceType as EvidenceSourceType,
      )
    ) {
      errors.push(
        `${path}: ${strongNegativeStatus}는 FIELD_CHECK, DOCUMENT 또는 EXPERT_STATEMENT 근거가 필요합니다.`,
      );
    }
    if (value.evidence.verificationStatus !== "VERIFIED") {
      errors.push(
        `${path}: ${strongNegativeStatus} 근거의 verificationStatus는 VERIFIED여야 합니다.`,
      );
    }
  }
}

function collectSpaceAssessmentErrors(errors: Errors, value: unknown): void {
  const path = "snapshot.spaceAssessment";
  if (!isRecord(value)) {
    errors.push(`${path}는 객체여야 합니다.`);
    return;
  }
  checkKeys(errors, path, value, SPACE_ASSESSMENT_KEYS);
  for (const key of SPACE_ASSESSMENT_KEYS) {
    collectEntryErrors(
      errors,
      `${path}.${key}`,
      value[key],
      SPACE_ASSESSMENT_STATUSES,
      "NOT_FEASIBLE",
    );
  }
}

function collectBasisErrors(errors: Errors, value: unknown): void {
  const path = "snapshot.assessmentBasis";
  if (!isRecord(value)) {
    errors.push(`${path}는 객체여야 합니다.`);
    return;
  }
  checkKeys(errors, path, value, BASIS_KEYS);
  if (
    typeof value.layoutAssessmentStatus !== "string" ||
    !LAYOUT_ASSESSMENT_STATUSES.includes(
      value.layoutAssessmentStatus as LayoutAssessmentStatus,
    )
  ) {
    errors.push(`${path}.layoutAssessmentStatus 값이 지원되지 않습니다.`);
  }
  if (
    typeof value.measurementStatus !== "string" ||
    !MEASUREMENT_STATUSES.includes(value.measurementStatus as SpaceMeasurementStatus)
  ) {
    errors.push(`${path}.measurementStatus 값이 지원되지 않습니다.`);
  }
  if (
    typeof value.requiredEquipmentSetStatus !== "string" ||
    !REQUIRED_SET_STATUSES.includes(
      value.requiredEquipmentSetStatus as RequiredEquipmentSetStatus,
    )
  ) {
    errors.push(`${path}.requiredEquipmentSetStatus 값이 지원되지 않습니다.`);
  }

  const ids = value.requiredEquipmentDefinitionIds;
  if (!Array.isArray(ids)) {
    errors.push(`${path}.requiredEquipmentDefinitionIds는 배열이어야 합니다.`);
    return;
  }
  const seen = new Set<string>();
  for (const [index, id] of ids.entries()) {
    if (!isEquipmentDefinitionId(id)) {
      errors.push(`${path}.requiredEquipmentDefinitionIds[${index}]가 올바르지 않습니다.`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`${path}.requiredEquipmentDefinitionIds에 중복 ID가 있습니다.`);
    }
    seen.add(id);
  }
  if (value.requiredEquipmentSetStatus === "DEFINED" && ids.length === 0) {
    errors.push(`${path}: DEFINED이면 required equipment definition ID가 필요합니다.`);
  }
  if (value.requiredEquipmentSetStatus === "NOT_DEFINED" && ids.length > 0) {
    errors.push(`${path}: NOT_DEFINED이면 requiredEquipmentDefinitionIds는 비어 있어야 합니다.`);
  }
}

function collectBasisPrerequisiteErrors(
  errors: Errors,
  snapshot: Record<string, unknown>,
): void {
  if (!isRecord(snapshot.assessmentBasis)) return;
  const basis = snapshot.assessmentBasis;
  const layoutAssessed = basis.layoutAssessmentStatus === "ASSESSED";
  const measurementAvailable =
    basis.measurementStatus === "CONFIRMED" || basis.measurementStatus === "PARTIAL";
  const requiredSetDefined = basis.requiredEquipmentSetStatus === "DEFINED";

  if (isRecord(snapshot.spaceAssessment)) {
    for (const key of SPACE_ASSESSMENT_KEYS) {
      const entry = snapshot.spaceAssessment[key];
      if (!isRecord(entry) || entry.status !== "NOT_FEASIBLE") continue;
      if (!layoutAssessed) {
        errors.push(
          `snapshot.spaceAssessment.${key}: NOT_FEASIBLE는 layoutAssessmentStatus=ASSESSED가 필요합니다.`,
        );
      }
      if (!measurementAvailable) {
        errors.push(
          `snapshot.spaceAssessment.${key}: NOT_FEASIBLE는 CONFIRMED 또는 PARTIAL measurement basis가 필요합니다.`,
        );
      }
    }
  }

  if (!isRecord(snapshot.equipmentFitAssessment)) return;
  const fitStatus = snapshot.equipmentFitAssessment.status;
  if (fitStatus === "FIT" || fitStatus === "CONSTRAINED" || fitStatus === "NOT_FIT") {
    if (!requiredSetDefined) {
      errors.push(
        `snapshot.equipmentFitAssessment: ${fitStatus}은 requiredEquipmentSetStatus=DEFINED가 필요합니다.`,
      );
    }
    if (!layoutAssessed) {
      errors.push(
        `snapshot.equipmentFitAssessment: ${fitStatus}은 layoutAssessmentStatus=ASSESSED가 필요합니다.`,
      );
    }
    if (!measurementAvailable) {
      errors.push(
        `snapshot.equipmentFitAssessment: ${fitStatus}은 CONFIRMED 또는 PARTIAL measurement basis가 필요합니다.`,
      );
    }
  }
}

function collectManufacturingConsistencyErrors(
  errors: Errors,
  snapshot: Record<string, unknown>,
): void {
  if (!isRecord(snapshot.spaceAssessment)) return;
  const manufacturing = snapshot.spaceAssessment.manufacturingSpace;
  if (!isRecord(manufacturing)) return;
  if (
    snapshot.manufacturingRequirement === "NOT_REQUIRED" &&
    manufacturing.status !== "NOT_APPLICABLE"
  ) {
    errors.push(
      "snapshot: manufacturingRequirement=NOT_REQUIRED이면 manufacturingSpace.status는 NOT_APPLICABLE이어야 합니다.",
    );
  }
  if (
    snapshot.manufacturingRequirement === "REQUIRED" &&
    manufacturing.status === "NOT_APPLICABLE"
  ) {
    errors.push(
      "snapshot: manufacturingRequirement=REQUIRED이면 manufacturingSpace는 NOT_APPLICABLE일 수 없습니다.",
    );
  }
}

export function validateCandidateSpaceEvidenceSnapshot(
  value: unknown,
): CandidateSpaceEvidenceValidationResult {
  const errors: Errors = [];
  if (!isRecord(value)) {
    errors.push("snapshot은 객체여야 합니다.");
  } else {
    checkKeys(errors, "snapshot", value, SNAPSHOT_KEYS);
    if (value.schemaVersion !== CANDIDATE_SPACE_EVIDENCE_SCHEMA_VERSION) {
      errors.push(
        `snapshot.schemaVersion은 ${CANDIDATE_SPACE_EVIDENCE_SCHEMA_VERSION}이어야 합니다.`,
      );
    }
    if (!isNonEmptyString(value.snapshotId)) {
      errors.push("snapshot.snapshotId는 비어 있지 않은 문자열이어야 합니다.");
    }
    if (!isCandidateStoreId(value.candidateStoreId)) {
      errors.push("snapshot.candidateStoreId가 올바른 CandidateStore ID가 아닙니다.");
    }
    if (!isIsoTimestamp(value.capturedAt)) {
      errors.push("snapshot.capturedAt은 시간대를 포함한 ISO 8601 timestamp여야 합니다.");
    }
    if (
      typeof value.manufacturingRequirement !== "string" ||
      !MANUFACTURING_REQUIREMENTS.includes(
        value.manufacturingRequirement as ManufacturingRequirement,
      )
    ) {
      errors.push("snapshot.manufacturingRequirement 값이 지원되지 않습니다.");
    }
    if (value.createsRisk !== false) errors.push("snapshot.createsRisk는 false여야 합니다.");
    if (value.createsVerdict !== false) {
      errors.push("snapshot.createsVerdict는 false여야 합니다.");
    }
    if (value.createsScore !== false) errors.push("snapshot.createsScore는 false여야 합니다.");

    collectSpaceAssessmentErrors(errors, value.spaceAssessment);
    collectEntryErrors(
      errors,
      "snapshot.equipmentFitAssessment",
      value.equipmentFitAssessment,
      EQUIPMENT_FIT_STATUSES,
      "NOT_FIT",
    );
    collectBasisErrors(errors, value.assessmentBasis);
    collectBasisPrerequisiteErrors(errors, value);
    collectManufacturingConsistencyErrors(errors, value);
  }

  if (errors.length > 0) {
    return Object.freeze({
      ok: false as const,
      code: "INVALID_CANDIDATE_SPACE_EVIDENCE" as const,
      message: errors.join(" "),
      errors: Object.freeze([...errors]),
    });
  }
  return Object.freeze({
    ok: true as const,
    value: deepFreeze(structuredClone(value) as CandidateSpaceEvidenceSnapshot),
  });
}
