export const CASE_LIFECYCLE_STAGES = [
  "EXPLORING",
  "CANDIDATE_REVIEW",
  "LEASE_REVIEW",
  "LEASE_SIGNED",
  "PRE_OPEN",
  "OPERATING",
  "CLOSED",
] as const;

export type CaseLifecycleStage = (typeof CASE_LIFECYCLE_STAGES)[number];
export type CaseStatus = "ACTIVE" | "CLOSED";

export const CASE_LIFECYCLE_LABELS: Record<CaseLifecycleStage, string> = {
  EXPLORING: "탐색중",
  CANDIDATE_REVIEW: "후보검토",
  LEASE_REVIEW: "계약검토",
  LEASE_SIGNED: "계약완료",
  PRE_OPEN: "오픈준비",
  OPERATING: "운영중",
  CLOSED: "종료",
};

export interface CaseRecord {
  caseId: string;
  name: string;
  clientName: string;
  bakeryType?: string;
  preferredArea?: string;
  budgetMin?: number;
  budgetMax?: number;
  targetOpeningDate?: string;
  lifecycleStage: CaseLifecycleStage;
  status: CaseStatus;
  analysisRunIds: string[];
  consultationIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CaseCreateInput {
  name: string;
  clientName: string;
  bakeryType?: string;
  preferredArea?: string;
  budgetMin?: number;
  budgetMax?: number;
  targetOpeningDate?: string;
}

export interface CaseUpdateInput extends Partial<CaseCreateInput> {
  lifecycleStage?: CaseLifecycleStage;
}

export class CaseValidationError extends Error {}

function inputObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CaseValidationError("요청 본문은 객체여야 합니다.");
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string, maxLength = 100) {
  if (typeof value !== "string" || !value.trim()) {
    throw new CaseValidationError(`${label}은(는) 필수입니다.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new CaseValidationError(`${label}은(는) ${maxLength}자 이하여야 합니다.`);
  }
  return normalized;
}

function optionalText(value: unknown, label: string, maxLength = 200) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new CaseValidationError(`${label} 형식이 올바르지 않습니다.`);
  }
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) {
    throw new CaseValidationError(`${label}은(는) ${maxLength}자 이하여야 합니다.`);
  }
  return normalized;
}

function optionalBudget(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new CaseValidationError(`${label}은(는) 0 이상의 정수여야 합니다.`);
  }
  return value;
}

function optionalDate(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new CaseValidationError("목표 오픈일 형식이 올바르지 않습니다.");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new CaseValidationError("목표 오픈일이 유효하지 않습니다.");
  }
  return value;
}

function validateBudgetRange(budgetMin?: number, budgetMax?: number) {
  if (budgetMin !== undefined && budgetMax !== undefined && budgetMin > budgetMax) {
    throw new CaseValidationError("최소 예산은 최대 예산보다 클 수 없습니다.");
  }
}

export function parseCaseCreateInput(value: unknown): CaseCreateInput {
  const input = inputObject(value);
  const result: CaseCreateInput = {
    name: requiredText(input.name, "Case 이름"),
    clientName: requiredText(input.clientName, "고객명"),
    bakeryType: optionalText(input.bakeryType, "베이커리 형태"),
    preferredArea: optionalText(input.preferredArea, "희망지역"),
    budgetMin: optionalBudget(input.budgetMin, "최소 예산"),
    budgetMax: optionalBudget(input.budgetMax, "최대 예산"),
    targetOpeningDate: optionalDate(input.targetOpeningDate),
  };
  validateBudgetRange(result.budgetMin, result.budgetMax);
  return result;
}

export function parseCaseUpdateInput(value: unknown): CaseUpdateInput {
  const input = inputObject(value);
  const allowedKeys = [
    "name",
    "clientName",
    "bakeryType",
    "preferredArea",
    "budgetMin",
    "budgetMax",
    "targetOpeningDate",
    "lifecycleStage",
  ];
  if (!allowedKeys.some((key) => Object.hasOwn(input, key))) {
    throw new CaseValidationError("수정할 Case 항목이 없습니다.");
  }
  const result: CaseUpdateInput = {};
  if (Object.hasOwn(input, "name")) result.name = requiredText(input.name, "Case 이름");
  if (Object.hasOwn(input, "clientName")) result.clientName = requiredText(input.clientName, "고객명");
  if (Object.hasOwn(input, "bakeryType")) result.bakeryType = optionalText(input.bakeryType, "베이커리 형태");
  if (Object.hasOwn(input, "preferredArea")) result.preferredArea = optionalText(input.preferredArea, "희망지역");
  if (Object.hasOwn(input, "budgetMin")) result.budgetMin = optionalBudget(input.budgetMin, "최소 예산");
  if (Object.hasOwn(input, "budgetMax")) result.budgetMax = optionalBudget(input.budgetMax, "최대 예산");
  if (Object.hasOwn(input, "targetOpeningDate")) result.targetOpeningDate = optionalDate(input.targetOpeningDate);
  if (Object.hasOwn(input, "lifecycleStage")) {
    if (!CASE_LIFECYCLE_STAGES.includes(input.lifecycleStage as CaseLifecycleStage)) {
      throw new CaseValidationError("알 수 없는 Case 단계입니다.");
    }
    result.lifecycleStage = input.lifecycleStage as CaseLifecycleStage;
  }
  return result;
}

export function validateUpdatedBudgetRange(current: CaseRecord, update: CaseUpdateInput) {
  const budgetMin = Object.hasOwn(update, "budgetMin") ? update.budgetMin : current.budgetMin;
  const budgetMax = Object.hasOwn(update, "budgetMax") ? update.budgetMax : current.budgetMax;
  validateBudgetRange(budgetMin, budgetMax);
}

export function statusForLifecycle(stage: CaseLifecycleStage): CaseStatus {
  return stage === "CLOSED" ? "CLOSED" : "ACTIVE";
}

export function assertStoredCaseRecord(value: unknown): asserts value is CaseRecord {
  const input = inputObject(value);
  requiredText(input.caseId, "caseId", 120);
  requiredText(input.name, "Case 이름");
  requiredText(input.clientName, "고객명");
  if (!CASE_LIFECYCLE_STAGES.includes(input.lifecycleStage as CaseLifecycleStage)) {
    throw new CaseValidationError("저장된 Case 단계가 올바르지 않습니다.");
  }
  if (input.status !== "ACTIVE" && input.status !== "CLOSED") {
    throw new CaseValidationError("저장된 Case 상태가 올바르지 않습니다.");
  }
  for (const key of ["analysisRunIds", "consultationIds"] as const) {
    if (!Array.isArray(input[key]) || !input[key].every((item) => typeof item === "string")) {
      throw new CaseValidationError(`저장된 ${key}가 올바르지 않습니다.`);
    }
  }
  for (const key of ["createdAt", "updatedAt"] as const) {
    if (typeof input[key] !== "string" || !Number.isFinite(Date.parse(input[key] as string))) {
      throw new CaseValidationError(`저장된 ${key}가 올바르지 않습니다.`);
    }
  }
  const budgetMin = optionalBudget(input.budgetMin, "최소 예산");
  const budgetMax = optionalBudget(input.budgetMax, "최대 예산");
  validateBudgetRange(budgetMin, budgetMax);
  optionalText(input.bakeryType, "베이커리 형태");
  optionalText(input.preferredArea, "희망지역");
  optionalDate(input.targetOpeningDate);
}
