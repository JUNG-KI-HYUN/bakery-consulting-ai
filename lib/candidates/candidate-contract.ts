import type { AnalysisRunTargetSnapshot } from "../analysis-runs/analysis-run-snapshot";

export const CANDIDATE_STORE_STATUSES = [
  "REVIEWING",
  "SHORTLISTED",
  "ON_HOLD",
  "REJECTED",
] as const;

export type CandidateStoreStatus = (typeof CANDIDATE_STORE_STATUSES)[number];
export type CandidateStoreSource = "CASE_DIRECT" | "MARKET_WORKSPACE" | "MARKET_ANALYSIS";
export type CandidateParkingStatus = "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";

export const CANDIDATE_STORE_STATUS_LABELS: Record<CandidateStoreStatus, string> = {
  REVIEWING: "검토중",
  SHORTLISTED: "우선검토",
  ON_HOLD: "보류",
  REJECTED: "제외",
};

export interface CandidateStorePropertyFacts {
  floor?: string;
  exclusiveAreaSqm?: number;
  frontageM?: number;
  parkingStatus?: CandidateParkingStatus;
  parkingNote?: string;
}

export interface CandidateStoreAskingTerms {
  depositWon?: number;
  monthlyRentWon?: number;
  maintenanceFeeWon?: number;
  premiumWon?: number;
}

export interface CandidateAnalysisRunLink {
  analysisRunId: string;
  targetSnapshot: AnalysisRunTargetSnapshot;
  linkedAt: string;
}

export interface CandidateStore {
  candidateId: string;
  caseId: string;
  label: string;
  address?: string;
  unit?: string;
  propertyFacts: CandidateStorePropertyFacts;
  currentAskingTerms: CandidateStoreAskingTerms;
  status: CandidateStoreStatus;
  source: CandidateStoreSource;
  analysisLinks: CandidateAnalysisRunLink[];
  createdAt: string;
  updatedAt: string;
}

export interface CandidateStoreCreateInput {
  caseId: string;
  label: string;
  address?: string;
  unit?: string;
  floor?: string;
  exclusiveAreaSqm?: number;
  frontageM?: number;
  parkingStatus?: CandidateParkingStatus;
  parkingNote?: string;
  depositWon?: number;
  monthlyRentWon?: number;
  maintenanceFeeWon?: number;
  premiumWon?: number;
  source: CandidateStoreSource;
  linkedAnalysisRunId?: string;
}

export type CandidateStoreUpdateInput = Partial<Omit<
  CandidateStoreCreateInput,
  "caseId" | "source" | "linkedAnalysisRunId"
>> & { status?: CandidateStoreStatus };

export class CandidateStoreValidationError extends Error {}

function inputObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CandidateStoreValidationError("요청 본문은 객체여야 합니다.");
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string, maxLength = 120) {
  if (typeof value !== "string" || !value.trim()) {
    throw new CandidateStoreValidationError(`${label}은(는) 필수입니다.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new CandidateStoreValidationError(`${label}은(는) ${maxLength}자 이하여야 합니다.`);
  }
  return normalized;
}

function optionalText(value: unknown, label: string, maxLength = 300) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new CandidateStoreValidationError(`${label} 형식이 올바르지 않습니다.`);
  }
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) {
    throw new CandidateStoreValidationError(`${label}은(는) ${maxLength}자 이하여야 합니다.`);
  }
  return normalized;
}

function optionalNumber(value: unknown, label: string, integer = false) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) {
    throw new CandidateStoreValidationError(`${label} 값이 올바르지 않습니다.`);
  }
  return value;
}

function coordinate(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new CandidateStoreValidationError(`${label} 값이 올바르지 않습니다.`);
  }
  return value;
}

function parkingStatus(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (value !== "AVAILABLE" && value !== "UNAVAILABLE" && value !== "UNKNOWN") {
    throw new CandidateStoreValidationError("주차 상태가 올바르지 않습니다.");
  }
  return value as CandidateParkingStatus;
}

function source(value: unknown): CandidateStoreSource {
  if (value !== "CASE_DIRECT" && value !== "MARKET_WORKSPACE" && value !== "MARKET_ANALYSIS") {
    throw new CandidateStoreValidationError("후보점포 등록 출처가 올바르지 않습니다.");
  }
  return value;
}

function canonicalRunId(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^basic-location-run:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new CandidateStoreValidationError("analysisRunId 형식이 올바르지 않습니다.");
  }
  return value;
}

function parseEditable(input: Record<string, unknown>) {
  return {
    label: requiredText(input.label, "후보점포 이름"),
    address: optionalText(input.address, "주소"),
    unit: optionalText(input.unit, "호수", 100),
    floor: optionalText(input.floor, "층", 100),
    exclusiveAreaSqm: optionalNumber(input.exclusiveAreaSqm, "전용면적"),
    frontageM: optionalNumber(input.frontageM, "전면 길이"),
    parkingStatus: parkingStatus(input.parkingStatus),
    parkingNote: optionalText(input.parkingNote, "주차 메모"),
    depositWon: optionalNumber(input.depositWon, "보증금", true),
    monthlyRentWon: optionalNumber(input.monthlyRentWon, "월세", true),
    maintenanceFeeWon: optionalNumber(input.maintenanceFeeWon, "관리비", true),
    premiumWon: optionalNumber(input.premiumWon, "권리금", true),
  };
}

export function parseCandidateStoreCreateInput(value: unknown): CandidateStoreCreateInput {
  const input = inputObject(value);
  const parsedSource = source(input.source);
  const linkedAnalysisRunId = canonicalRunId(input.linkedAnalysisRunId);
  if (parsedSource === "MARKET_ANALYSIS" && !linkedAnalysisRunId) {
    throw new CandidateStoreValidationError("Market 등록에는 유효한 analysisRunId가 필요합니다.");
  }
  return {
    caseId: requiredText(input.caseId, "caseId"),
    ...parseEditable(input),
    source: parsedSource,
    linkedAnalysisRunId,
  };
}

export function parseCandidateStoreUpdateInput(value: unknown): CandidateStoreUpdateInput {
  const input = inputObject(value);
  const allowed = [
    "label", "address", "unit", "floor", "exclusiveAreaSqm", "frontageM",
    "parkingStatus", "parkingNote", "depositWon", "monthlyRentWon",
    "maintenanceFeeWon", "premiumWon", "status",
  ];
  if (!allowed.some((key) => Object.hasOwn(input, key))) {
    throw new CandidateStoreValidationError("수정할 후보점포 항목이 없습니다.");
  }
  const result: CandidateStoreUpdateInput = {};
  if (Object.hasOwn(input, "label")) result.label = requiredText(input.label, "후보점포 이름");
  if (Object.hasOwn(input, "address")) result.address = optionalText(input.address, "주소");
  if (Object.hasOwn(input, "unit")) result.unit = optionalText(input.unit, "호수", 100);
  if (Object.hasOwn(input, "floor")) result.floor = optionalText(input.floor, "층", 100);
  if (Object.hasOwn(input, "exclusiveAreaSqm")) result.exclusiveAreaSqm = optionalNumber(input.exclusiveAreaSqm, "전용면적");
  if (Object.hasOwn(input, "frontageM")) result.frontageM = optionalNumber(input.frontageM, "전면 길이");
  if (Object.hasOwn(input, "parkingStatus")) result.parkingStatus = parkingStatus(input.parkingStatus);
  if (Object.hasOwn(input, "parkingNote")) result.parkingNote = optionalText(input.parkingNote, "주차 메모");
  if (Object.hasOwn(input, "depositWon")) result.depositWon = optionalNumber(input.depositWon, "보증금", true);
  if (Object.hasOwn(input, "monthlyRentWon")) result.monthlyRentWon = optionalNumber(input.monthlyRentWon, "월세", true);
  if (Object.hasOwn(input, "maintenanceFeeWon")) result.maintenanceFeeWon = optionalNumber(input.maintenanceFeeWon, "관리비", true);
  if (Object.hasOwn(input, "premiumWon")) result.premiumWon = optionalNumber(input.premiumWon, "권리금", true);
  if (Object.hasOwn(input, "status")) {
    if (!CANDIDATE_STORE_STATUSES.includes(input.status as CandidateStoreStatus)) {
      throw new CandidateStoreValidationError("후보점포 상태가 올바르지 않습니다.");
    }
    result.status = input.status as CandidateStoreStatus;
  }
  return result;
}

export function candidateStoreFromInput(
  candidateId: string,
  input: CandidateStoreCreateInput,
  analysisLinks: CandidateAnalysisRunLink[],
  timestamp: string,
): CandidateStore {
  return {
    candidateId,
    caseId: input.caseId,
    label: input.label,
    ...(input.address ? { address: input.address } : {}),
    ...(input.unit ? { unit: input.unit } : {}),
    propertyFacts: {
      ...(input.floor ? { floor: input.floor } : {}),
      ...(input.exclusiveAreaSqm !== undefined ? { exclusiveAreaSqm: input.exclusiveAreaSqm } : {}),
      ...(input.frontageM !== undefined ? { frontageM: input.frontageM } : {}),
      ...(input.parkingStatus ? { parkingStatus: input.parkingStatus } : {}),
      ...(input.parkingNote ? { parkingNote: input.parkingNote } : {}),
    },
    currentAskingTerms: {
      ...(input.depositWon !== undefined ? { depositWon: input.depositWon } : {}),
      ...(input.monthlyRentWon !== undefined ? { monthlyRentWon: input.monthlyRentWon } : {}),
      ...(input.maintenanceFeeWon !== undefined ? { maintenanceFeeWon: input.maintenanceFeeWon } : {}),
      ...(input.premiumWon !== undefined ? { premiumWon: input.premiumWon } : {}),
    },
    status: "REVIEWING",
    source: input.source,
    analysisLinks,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function applyCandidateStoreUpdate(current: CandidateStore, update: CandidateStoreUpdateInput): CandidateStore {
  return {
    ...current,
    ...(Object.hasOwn(update, "label") ? { label: update.label! } : {}),
    ...(Object.hasOwn(update, "address") ? { address: update.address } : {}),
    ...(Object.hasOwn(update, "unit") ? { unit: update.unit } : {}),
    propertyFacts: {
      ...current.propertyFacts,
      ...(Object.hasOwn(update, "floor") ? { floor: update.floor } : {}),
      ...(Object.hasOwn(update, "exclusiveAreaSqm") ? { exclusiveAreaSqm: update.exclusiveAreaSqm } : {}),
      ...(Object.hasOwn(update, "frontageM") ? { frontageM: update.frontageM } : {}),
      ...(Object.hasOwn(update, "parkingStatus") ? { parkingStatus: update.parkingStatus } : {}),
      ...(Object.hasOwn(update, "parkingNote") ? { parkingNote: update.parkingNote } : {}),
    },
    currentAskingTerms: {
      ...current.currentAskingTerms,
      ...(Object.hasOwn(update, "depositWon") ? { depositWon: update.depositWon } : {}),
      ...(Object.hasOwn(update, "monthlyRentWon") ? { monthlyRentWon: update.monthlyRentWon } : {}),
      ...(Object.hasOwn(update, "maintenanceFeeWon") ? { maintenanceFeeWon: update.maintenanceFeeWon } : {}),
      ...(Object.hasOwn(update, "premiumWon") ? { premiumWon: update.premiumWon } : {}),
    },
    status: update.status ?? current.status,
    updatedAt: new Date().toISOString(),
  };
}

export function assertStoredCandidateStore(value: unknown): asserts value is CandidateStore {
  const input = inputObject(value);
  requiredText(input.candidateId, "candidateId");
  requiredText(input.caseId, "caseId");
  requiredText(input.label, "후보점포 이름");
  optionalText(input.address, "주소");
  optionalText(input.unit, "호수", 100);
  if (!CANDIDATE_STORE_STATUSES.includes(input.status as CandidateStoreStatus)) throw new CandidateStoreValidationError("저장된 후보점포 상태가 올바르지 않습니다.");
  source(input.source);
  const facts = inputObject(input.propertyFacts);
  optionalText(facts.floor, "층", 100);
  optionalNumber(facts.exclusiveAreaSqm, "전용면적");
  optionalNumber(facts.frontageM, "전면 길이");
  parkingStatus(facts.parkingStatus);
  optionalText(facts.parkingNote, "주차 메모");
  const terms = inputObject(input.currentAskingTerms);
  for (const [key, label] of [["depositWon", "보증금"], ["monthlyRentWon", "월세"], ["maintenanceFeeWon", "관리비"], ["premiumWon", "권리금"]] as const) {
    optionalNumber(terms[key], label, true);
  }
  if (!Array.isArray(input.analysisLinks)) throw new CandidateStoreValidationError("저장된 분석 연결이 올바르지 않습니다.");
  for (const rawLink of input.analysisLinks) {
    const link = inputObject(rawLink);
    const runId = canonicalRunId(link.analysisRunId);
    const target = inputObject(link.targetSnapshot);
    if (!runId || target.analysisRunId !== runId) throw new CandidateStoreValidationError("저장된 분석 연결 identity가 올바르지 않습니다.");
    optionalText(target.label, "분석 위치 이름");
    optionalText(target.address, "분석 주소");
    coordinate(target.latitude, "위도", -90, 90);
    coordinate(target.longitude, "경도", -180, 180);
    if (target.radiusM !== 300 && target.radiusM !== 500) throw new CandidateStoreValidationError("저장된 분석 반경이 올바르지 않습니다.");
    if (target.source !== "address" && target.source !== "map" && target.source !== "candidate_store") throw new CandidateStoreValidationError("저장된 분석 출처가 올바르지 않습니다.");
    inputObject(target.explorationSnapshot);
    if (target.officialReference !== null) inputObject(target.officialReference);
    if (!Number.isFinite(Date.parse(String(target.createdAt))) || !Number.isFinite(Date.parse(String(target.updatedAt)))) throw new CandidateStoreValidationError("저장된 분석 시각이 올바르지 않습니다.");
    if (!Number.isFinite(Date.parse(String(link.linkedAt)))) throw new CandidateStoreValidationError("저장된 분석 연결 시각이 올바르지 않습니다.");
  }
  for (const key of ["createdAt", "updatedAt"] as const) {
    if (typeof input[key] !== "string" || !Number.isFinite(Date.parse(input[key]))) throw new CandidateStoreValidationError(`저장된 ${key}가 올바르지 않습니다.`);
  }
}
