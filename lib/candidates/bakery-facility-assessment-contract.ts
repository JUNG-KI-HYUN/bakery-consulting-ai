export const BAKERY_FACILITY_CHECK_KEYS = [
  "electricity",
  "waterSupply",
  "drainage",
  "exhaust",
  "landlordConsent",
  "equipmentIngress",
  "manufacturingSpace",
  "drawingOrMeasurement",
  "fireEgress",
  "buildingUsePermit",
  "odorNoise",
] as const;

export type BakeryFacilityCheckKey = (typeof BAKERY_FACILITY_CHECK_KEYS)[number];
export type BakeryFacilityState = "FEASIBLE" | "CONDITIONAL" | "NOT_FEASIBLE" | "UNKNOWN";
export type BakeryFacilityVerificationStatus =
  | "VERIFIED"
  | "NOT_CHECKED"
  | "FIELD_CHECK_REQUIRED"
  | "LANDLORD_CONFIRM_REQUIRED"
  | "EXPERT_CONFIRM_REQUIRED"
  | "AUTHORITY_CONFIRM_REQUIRED"
  | "NO_DATA";
export type BakeryFacilitySourceType =
  | "USER_INPUT"
  | "FIELD"
  | "LANDLORD"
  | "DOCUMENT"
  | "EXPERT"
  | "AUTHORITY"
  | "DERIVED";

export interface BakeryFacilityCheck {
  state: BakeryFacilityState;
  verificationStatus: BakeryFacilityVerificationStatus;
  note?: string;
  sourceType?: BakeryFacilitySourceType;
  observedAt?: string;
}

export interface BakeryFacilityAssessmentRevision {
  revisionId: string;
  checks: Partial<Record<BakeryFacilityCheckKey, BakeryFacilityCheck>>;
  recordedAt: string;
}

export interface BakeryFacilityAssessment {
  assessmentId: string;
  candidateId: string;
  caseId: string;
  checks: Partial<Record<BakeryFacilityCheckKey, BakeryFacilityCheck>>;
  revisions: BakeryFacilityAssessmentRevision[];
  createdAt: string;
  updatedAt: string;
}

export interface BakeryFacilityAssessmentCreateInput {
  candidateId: string;
  caseId: string;
  checks: Partial<Record<BakeryFacilityCheckKey, BakeryFacilityCheck>>;
}

export interface BakeryFacilityAssessmentUpdateInput {
  caseId: string;
  checks: Partial<Record<BakeryFacilityCheckKey, BakeryFacilityCheck>>;
}

export const BAKERY_FACILITY_CHECK_LABELS: Record<BakeryFacilityCheckKey, string> = {
  electricity: "전기",
  waterSupply: "급수",
  drainage: "배수",
  exhaust: "배기",
  landlordConsent: "임대인·관리주체 동의",
  equipmentIngress: "장비 반입",
  manufacturingSpace: "제조공간",
  drawingOrMeasurement: "도면·실측",
  fireEgress: "소방·피난",
  buildingUsePermit: "건축물 용도·영업신고",
  odorNoise: "냄새·소음",
};

export class BakeryFacilityAssessmentValidationError extends Error {}

const FACILITY_STATES = ["FEASIBLE", "CONDITIONAL", "NOT_FEASIBLE", "UNKNOWN"] as const;
const VERIFICATION_STATUSES = [
  "VERIFIED",
  "NOT_CHECKED",
  "FIELD_CHECK_REQUIRED",
  "LANDLORD_CONFIRM_REQUIRED",
  "EXPERT_CONFIRM_REQUIRED",
  "AUTHORITY_CONFIRM_REQUIRED",
  "NO_DATA",
] as const;
const SOURCE_TYPES = ["USER_INPUT", "FIELD", "LANDLORD", "DOCUMENT", "EXPERT", "AUTHORITY", "DERIVED"] as const;

function objectValue(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BakeryFacilityAssessmentValidationError(`${label}은(는) 객체여야 합니다.`);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BakeryFacilityAssessmentValidationError(`${label}은(는) 필수입니다.`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string, maxLength = 1000) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new BakeryFacilityAssessmentValidationError(`${label} 형식이 올바르지 않습니다.`);
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) throw new BakeryFacilityAssessmentValidationError(`${label}은(는) ${maxLength}자 이하여야 합니다.`);
  return normalized;
}

function optionalTimestamp(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new BakeryFacilityAssessmentValidationError("관찰시각 형식이 올바르지 않습니다.");
  }
  return value;
}

function parseCheck(value: unknown, label: string): BakeryFacilityCheck {
  const input = objectValue(value, label);
  if (!FACILITY_STATES.includes(input.state as BakeryFacilityState)) {
    throw new BakeryFacilityAssessmentValidationError(`${label} 상태가 올바르지 않습니다.`);
  }
  if (!VERIFICATION_STATUSES.includes(input.verificationStatus as BakeryFacilityVerificationStatus)) {
    throw new BakeryFacilityAssessmentValidationError(`${label} 확인상태가 올바르지 않습니다.`);
  }
  if (input.sourceType !== undefined && input.sourceType !== null && input.sourceType !== "" && !SOURCE_TYPES.includes(input.sourceType as BakeryFacilitySourceType)) {
    throw new BakeryFacilityAssessmentValidationError(`${label} 출처가 올바르지 않습니다.`);
  }
  const note = optionalText(input.note, `${label} 메모`);
  const observedAt = optionalTimestamp(input.observedAt);
  return {
    state: input.state as BakeryFacilityState,
    verificationStatus: input.verificationStatus as BakeryFacilityVerificationStatus,
    ...(note ? { note } : {}),
    ...(input.sourceType ? { sourceType: input.sourceType as BakeryFacilitySourceType } : {}),
    ...(observedAt ? { observedAt } : {}),
  };
}

function parseChecks(value: unknown) {
  const input = objectValue(value, "시설 확인항목");
  const result: Partial<Record<BakeryFacilityCheckKey, BakeryFacilityCheck>> = {};
  for (const key of Object.keys(input)) {
    if (!BAKERY_FACILITY_CHECK_KEYS.includes(key as BakeryFacilityCheckKey)) {
      throw new BakeryFacilityAssessmentValidationError(`알 수 없는 시설 확인항목입니다: ${key}`);
    }
    result[key as BakeryFacilityCheckKey] = parseCheck(input[key], BAKERY_FACILITY_CHECK_LABELS[key as BakeryFacilityCheckKey]);
  }
  return result;
}

export function parseBakeryFacilityAssessmentCreateInput(value: unknown): BakeryFacilityAssessmentCreateInput {
  const input = objectValue(value, "요청 본문");
  return {
    candidateId: requiredText(input.candidateId, "candidateId"),
    caseId: requiredText(input.caseId, "caseId"),
    checks: parseChecks(input.checks),
  };
}

export function parseBakeryFacilityAssessmentUpdateInput(value: unknown): BakeryFacilityAssessmentUpdateInput {
  const input = objectValue(value, "요청 본문");
  const checks = parseChecks(input.checks);
  if (Object.keys(checks).length === 0) {
    throw new BakeryFacilityAssessmentValidationError("수정할 시설 확인항목이 없습니다.");
  }
  return { caseId: requiredText(input.caseId, "caseId"), checks };
}

export function assertStoredBakeryFacilityAssessment(value: unknown): asserts value is BakeryFacilityAssessment {
  const input = objectValue(value, "저장된 시설검토");
  requiredText(input.assessmentId, "assessmentId");
  requiredText(input.candidateId, "candidateId");
  requiredText(input.caseId, "caseId");
  parseChecks(input.checks);
  if (!Array.isArray(input.revisions) || input.revisions.length === 0) {
    throw new BakeryFacilityAssessmentValidationError("저장된 시설검토 변경이력이 올바르지 않습니다.");
  }
  for (const rawRevision of input.revisions) {
    const revision = objectValue(rawRevision, "시설검토 변경이력");
    requiredText(revision.revisionId, "revisionId");
    parseChecks(revision.checks);
    if (typeof revision.recordedAt !== "string" || !Number.isFinite(Date.parse(revision.recordedAt))) {
      throw new BakeryFacilityAssessmentValidationError("시설검토 변경이력 시각이 올바르지 않습니다.");
    }
  }
  for (const key of ["createdAt", "updatedAt"] as const) {
    if (typeof input[key] !== "string" || !Number.isFinite(Date.parse(input[key]))) {
      throw new BakeryFacilityAssessmentValidationError(`저장된 ${key}가 올바르지 않습니다.`);
    }
  }
}
