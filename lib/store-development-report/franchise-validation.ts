import { isCandidatePhotoCategory } from "../candidate-photo/category";
import { isCandidateStoreId } from "../field/identifiers";
import { HARD_RISK_GATE_STATUSES } from "../site-grade/hard-risk-gate-types";
import { SITE_GRADES } from "../site-grade/types";
import { SITE_CRITERION_EVALUATION_RESULTS } from "../site-criteria/evaluation-types";
import {
  FRANCHISE_REPORT_INPUT_SCHEMA_VERSION,
  FRANCHISE_REPORT_PRODUCT_TYPES,
  HUMAN_CONTRACT_DECISION_SCHEMA_VERSION,
  HUMAN_CONTRACT_DECISIONS,
  REPORT_EXTENSION_SECTION_STATUSES,
  REPORT_PRESENTATION_AVAILABILITY_STATUSES,
  REPORT_REDISTRIBUTION_STATUSES,
  REPORT_SOURCE_SNAPSHOT_DOMAINS,
  REPORT_THEME_SCHEMA_VERSION,
  type FranchiseReportContractFailureCode,
  type FranchiseReportContractFailureV1,
  type FranchiseReportContractValidationResult,
  type FranchiseReportInputV1,
  type HumanContractDecisionV1,
  type MarketIntelligencePresentationV1,
  type ReportPresentationValueV1,
  type ReportThemeV1,
  type SourceProvenancePresentationV1,
} from "./franchise-contracts";

const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/u;
const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,127}$/u;
const OPAQUE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,159}$/u;
const HUMAN_DECISION_ID_PATTERN = /^human_decision_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const COLOR_PATTERN = /^#[0-9A-F]{6}$/iu;
const VERIFICATION_STATUSES = Object.freeze(["VERIFIED", "ESTIMATED", "UNKNOWN", "CONFLICTED", "STALE"] as const);

const THEME_KEYS = new Set([
  "schemaVersion", "themeId", "version", "brandDisplayName", "reportDisplayName",
  "logoAssetRef", "referenceStoreImageRef", "coverImageAssetRef", "colors", "footerText",
]);
const COLOR_KEYS = new Set(["primary", "accent", "ink", "muted", "surface", "border"]);
const HUMAN_DECISION_KEYS = new Set([
  "schemaVersion", "decisionId", "candidateStoreId", "decision", "reasons",
  "confirmationNeeded", "nextActions", "criteriaEvaluationSetId", "riskSnapshotRef",
  "decidedAt", "decidedBy", "approvedAt",
]);
const INPUT_KEYS = new Set([
  "schemaVersion", "productType", "project", "scope", "presetRef", "brand", "theme",
  "criteriaPresentation", "candidates", "comparisonPages", "marketIntelligence",
  "extensionSections", "approvedDecisions", "sourceSnapshotRefs", "generatedAt",
]);
const CANDIDATE_KEYS = new Set([
  "candidateStoreId", "displayCode", "address", "region", "lifecycleLabel", "siteGrade",
  "approvedDecisionRef", "lease", "demandAndBackground", "criteriaPresentation",
  "riskPresentation", "confirmationNeeded", "nextActions", "map", "photos",
  "marketIntelligence", "sources",
]);
const PRESENTATION_VALUE_KEYS = new Set(["availabilityStatus", "value", "displayValue", "unit"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyText(value: unknown, max = 500): value is string {
  return typeof value === "string" && value === value.trim() && value.length > 0 && value.length <= max;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T/u.test(value)
    && Number.isFinite(Date.parse(value));
}

export function isFranchiseReportStableId(value: unknown): value is string {
  return typeof value === "string" && STABLE_ID_PATTERN.test(value);
}

export function isFranchiseReportVersion(value: unknown): value is string {
  return typeof value === "string" && VERSION_PATTERN.test(value);
}

export function isReportAssetReferenceV1(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= 160
    && OPAQUE_REF_PATTERN.test(value)
    && !/^(?:data|file|https?):/iu.test(value)
    && !/[\\/]/u.test(value);
}

function isOpaqueReference(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= 160
    && OPAQUE_REF_PATTERN.test(value)
    && !/^(?:data|file|https?):/iu.test(value)
    && !/[\\/]/u.test(value);
}

function unknownKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, path: string, errors: string[]) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${path}.${key}는 허용되지 않습니다.`);
}

function failure(
  code: FranchiseReportContractFailureCode,
  message: string,
  errors: readonly string[],
): FranchiseReportContractFailureV1 {
  return Object.freeze({ ok: false, code, message, errors: Object.freeze([...errors]) });
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function validTextArray(value: unknown, path: string, errors: string[], minimum = 0): value is readonly string[] {
  if (!Array.isArray(value)) {
    errors.push(`${path}는 문자열 배열이어야 합니다.`);
    return false;
  }
  value.forEach((item, index) => {
    if (!isNonEmptyText(item, 500)) errors.push(`${path}[${index}]는 비어 있지 않은 고객용 문구여야 합니다.`);
  });
  if (value.length < minimum) errors.push(`${path}는 최소 ${minimum}개가 필요합니다.`);
  return value.every((item) => isNonEmptyText(item, 500)) && value.length >= minimum;
}

function validateReference(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`${path}는 id/version reference여야 합니다.`);
    return;
  }
  unknownKeys(value, new Set(["id", "version"]), path, errors);
  if (!isFranchiseReportStableId(value.id)) errors.push(`${path}.id가 stable identifier 규칙과 다릅니다.`);
  if (!isFranchiseReportVersion(value.version)) errors.push(`${path}.version이 올바르지 않습니다.`);
}

function validatePresentationValue(value: unknown, path: string, errors: string[]): value is ReportPresentationValueV1 {
  if (!isRecord(value)) {
    errors.push(`${path}는 presentation value여야 합니다.`);
    return false;
  }
  unknownKeys(value, PRESENTATION_VALUE_KEYS, path, errors);
  if (!REPORT_PRESENTATION_AVAILABILITY_STATUSES.includes(value.availabilityStatus as never)) {
    errors.push(`${path}.availabilityStatus가 올바르지 않습니다.`);
  }
  if (!isNonEmptyText(value.displayValue, 160)) errors.push(`${path}.displayValue가 필요합니다.`);
  if (value.unit !== null && !isNonEmptyText(value.unit, 40)) errors.push(`${path}.unit은 null 또는 비어 있지 않은 문자열이어야 합니다.`);
  if (!["string", "number", "boolean"].includes(typeof value.value) && value.value !== null) {
    errors.push(`${path}.value가 고객용 primitive가 아닙니다.`);
  }
  if (typeof value.value === "number" && !Number.isFinite(value.value)) errors.push(`${path}.value는 유한수여야 합니다.`);
  if (value.availabilityStatus === "EXPLICIT_ZERO" && value.value !== 0) {
    errors.push(`${path}.EXPLICIT_ZERO는 value 0을 보존해야 합니다.`);
  }
  if (value.availabilityStatus === "AVAILABLE" && value.value === null) {
    errors.push(`${path}.AVAILABLE에는 값이 필요합니다.`);
  }
  if (["UNKNOWN", "UNAVAILABLE", "SUPPRESSED", "CONFLICTED"].includes(String(value.availabilityStatus)) && value.value !== null) {
    errors.push(`${path}.${String(value.availabilityStatus)}는 값을 생성할 수 없습니다.`);
  }
  return true;
}

function validateMarket(value: unknown, path: string, errors: string[]): value is MarketIntelligencePresentationV1 {
  if (!isRecord(value)) {
    errors.push(`${path}는 Market Intelligence presentation이어야 합니다.`);
    return false;
  }
  unknownKeys(value, new Set([
    "metricSemantic", "value", "valueType", "providerLabel", "scopeLabel", "referencePeriod",
    "verificationStatus", "limitation", "redistributionStatus",
  ]), path, errors);
  if (!isFranchiseReportStableId(value.metricSemantic)) errors.push(`${path}.metricSemantic이 올바르지 않습니다.`);
  validatePresentationValue(value.value, `${path}.value`, errors);
  if (value.valueType !== null && value.valueType !== "ACTUAL" && value.valueType !== "ESTIMATED") {
    errors.push(`${path}.valueType은 ACTUAL, ESTIMATED 또는 null이어야 합니다.`);
  }
  const hasValue = isRecord(value.value)
    && (value.value.availabilityStatus === "AVAILABLE" || value.value.availabilityStatus === "EXPLICIT_ZERO");
  if (hasValue && value.valueType === null) errors.push(`${path}.값이 있으면 ACTUAL/ESTIMATED 의미가 필요합니다.`);
  if (!hasValue && value.valueType !== null) errors.push(`${path}.값이 없으면 valueType을 추정할 수 없습니다.`);
  for (const key of ["providerLabel", "scopeLabel", "referencePeriod"] as const) {
    if (!isNonEmptyText(value[key], 160)) errors.push(`${path}.${key}가 필요합니다.`);
  }
  if (!VERIFICATION_STATUSES.includes(value.verificationStatus as never)) errors.push(`${path}.verificationStatus가 올바르지 않습니다.`);
  if (!REPORT_REDISTRIBUTION_STATUSES.includes(value.redistributionStatus as never)) errors.push(`${path}.redistributionStatus가 올바르지 않습니다.`);
  if (value.limitation !== null && !isNonEmptyText(value.limitation, 500)) errors.push(`${path}.limitation이 올바르지 않습니다.`);
  if (hasValue && (value.redistributionStatus === "RESTRICTED" || value.redistributionStatus === "UNKNOWN")) {
    errors.push(`${path}는 재배포 권한이 확인되지 않아 값을 embed할 수 없습니다.`);
  }
  return true;
}

function validateSource(value: unknown, path: string, errors: string[]): value is SourceProvenancePresentationV1 {
  if (!isRecord(value)) {
    errors.push(`${path}는 source provenance여야 합니다.`);
    return false;
  }
  unknownKeys(value, new Set([
    "providerLabel", "sourceTypeLabel", "scopeLabel", "referencePeriod",
    "verificationStatus", "redistributionStatus", "limitation",
  ]), path, errors);
  for (const key of ["providerLabel", "sourceTypeLabel", "scopeLabel", "referencePeriod"] as const) {
    if (!isNonEmptyText(value[key], 160)) errors.push(`${path}.${key}가 필요합니다.`);
  }
  if (!VERIFICATION_STATUSES.includes(value.verificationStatus as never)) errors.push(`${path}.verificationStatus가 올바르지 않습니다.`);
  if (!REPORT_REDISTRIBUTION_STATUSES.includes(value.redistributionStatus as never)) errors.push(`${path}.redistributionStatus가 올바르지 않습니다.`);
  if (value.limitation !== null && !isNonEmptyText(value.limitation, 500)) errors.push(`${path}.limitation이 올바르지 않습니다.`);
  return true;
}

export function validateReportThemeV1(value: unknown): FranchiseReportContractValidationResult<ReportThemeV1> {
  const errors: string[] = [];
  if (!isRecord(value)) return failure("INVALID_REPORT_THEME", "Report Theme V1 검증에 실패했습니다.", ["theme은 객체여야 합니다."]);
  unknownKeys(value, THEME_KEYS, "theme", errors);
  if (value.schemaVersion !== REPORT_THEME_SCHEMA_VERSION) errors.push("theme.schemaVersion이 올바르지 않습니다.");
  if (!isFranchiseReportStableId(value.themeId)) errors.push("theme.themeId가 stable identifier 규칙과 다릅니다.");
  if (!isFranchiseReportVersion(value.version)) errors.push("theme.version이 올바르지 않습니다.");
  if (!isNonEmptyText(value.brandDisplayName, 120)) errors.push("theme.brandDisplayName이 필요합니다.");
  if (!isNonEmptyText(value.reportDisplayName, 160)) errors.push("theme.reportDisplayName이 필요합니다.");
  if (!isReportAssetReferenceV1(value.logoAssetRef)) errors.push("theme.logoAssetRef는 opaque asset reference여야 합니다.");
  for (const key of ["referenceStoreImageRef", "coverImageAssetRef"] as const) {
    if (value[key] !== undefined && !isReportAssetReferenceV1(value[key])) errors.push(`theme.${key}는 opaque asset reference여야 합니다.`);
  }
  if (!isRecord(value.colors)) errors.push("theme.colors가 필요합니다.");
  else {
    unknownKeys(value.colors, COLOR_KEYS, "theme.colors", errors);
    for (const key of COLOR_KEYS) if (!COLOR_PATTERN.test(String(value.colors[key] ?? ""))) errors.push(`theme.colors.${key}는 #RRGGBB 형식이어야 합니다.`);
  }
  if (!isNonEmptyText(value.footerText, 240)) errors.push("theme.footerText는 1~240자여야 합니다.");
  if (errors.length > 0) return failure("INVALID_REPORT_THEME", "Report Theme V1 검증에 실패했습니다.", errors);
  return Object.freeze({ ok: true, value: deepFreeze(structuredClone(value as unknown as ReportThemeV1)) as ReportThemeV1 });
}

export function validateHumanContractDecisionV1(
  value: unknown,
): FranchiseReportContractValidationResult<HumanContractDecisionV1> {
  const errors: string[] = [];
  if (!isRecord(value)) return failure("INVALID_HUMAN_CONTRACT_DECISION", "Human Contract Decision V1 검증에 실패했습니다.", ["decision은 객체여야 합니다."]);
  unknownKeys(value, HUMAN_DECISION_KEYS, "decision", errors);
  if (value.schemaVersion !== HUMAN_CONTRACT_DECISION_SCHEMA_VERSION) errors.push("decision.schemaVersion이 올바르지 않습니다.");
  if (typeof value.decisionId !== "string" || !HUMAN_DECISION_ID_PATTERN.test(value.decisionId)) errors.push("decision.decisionId가 stable human decision ID 형식과 다릅니다.");
  if (!isCandidateStoreId(value.candidateStoreId)) errors.push("decision.candidateStoreId가 stable Candidate ID가 아닙니다.");
  if (!HUMAN_CONTRACT_DECISIONS.includes(value.decision as never)) errors.push("decision.decision enum이 올바르지 않습니다.");
  validTextArray(value.reasons, "decision.reasons", errors, 1);
  validTextArray(value.confirmationNeeded, "decision.confirmationNeeded", errors);
  validTextArray(value.nextActions, "decision.nextActions", errors);
  if (value.decision === "CONDITIONAL_RECOMMEND" && Array.isArray(value.confirmationNeeded) && value.confirmationNeeded.length === 0) {
    errors.push("CONDITIONAL_RECOMMEND에는 confirmationNeeded가 최소 1개 필요합니다.");
  }
  if (!isOpaqueReference(value.criteriaEvaluationSetId)) errors.push("decision.criteriaEvaluationSetId가 올바른 opaque reference가 아닙니다.");
  if (!isOpaqueReference(value.riskSnapshotRef)) errors.push("decision.riskSnapshotRef가 올바른 opaque reference가 아닙니다.");
  if (!isIsoTimestamp(value.decidedAt)) errors.push("decision.decidedAt이 올바른 ISO timestamp가 아닙니다.");
  if (!isOpaqueReference(value.decidedBy) || String(value.decidedBy).includes("@")) errors.push("decision.decidedBy는 PII가 아닌 opaque actor reference여야 합니다.");
  if (value.approvedAt !== undefined) {
    if (!isIsoTimestamp(value.approvedAt)) errors.push("decision.approvedAt이 올바른 ISO timestamp가 아닙니다.");
    else if (isIsoTimestamp(value.decidedAt) && Date.parse(value.approvedAt) < Date.parse(value.decidedAt)) errors.push("decision.approvedAt은 decidedAt 이후여야 합니다.");
  }
  if (errors.length > 0) return failure("INVALID_HUMAN_CONTRACT_DECISION", "Human Contract Decision V1 검증에 실패했습니다.", errors);
  return Object.freeze({ ok: true, value: deepFreeze(structuredClone(value as unknown as HumanContractDecisionV1)) as HumanContractDecisionV1 });
}

function validateScope(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`${path}가 올바르지 않습니다.`);
    return;
  }
  const scopeType = value.scopeType;
  const keys = scopeType === "ALL" ? new Set(["scopeType"])
    : scopeType === "REGION" ? new Set(["scopeType", "regionId"])
      : scopeType === "APARTMENT_AREA" ? new Set(["scopeType", "apartmentAreaId"])
        : scopeType === "CANDIDATE" ? new Set(["scopeType", "candidateStoreId"])
          : new Set<string>();
  if (keys.size === 0) errors.push(`${path}.scopeType이 올바르지 않습니다.`);
  else unknownKeys(value, keys, path, errors);
  if (scopeType === "REGION" && !isFranchiseReportStableId(value.regionId)) errors.push(`${path}.regionId가 올바르지 않습니다.`);
  if (scopeType === "APARTMENT_AREA" && !isFranchiseReportStableId(value.apartmentAreaId)) errors.push(`${path}.apartmentAreaId가 올바르지 않습니다.`);
  if (scopeType === "CANDIDATE" && !isCandidateStoreId(value.candidateStoreId)) errors.push(`${path}.candidateStoreId가 올바르지 않습니다.`);
}

function validateBrandCriteria(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`${path}가 올바르지 않습니다.`);
    return;
  }
  unknownKeys(value, new Set(["criteriaProfileRef", "title", "criteria"]), path, errors);
  validateReference(value.criteriaProfileRef, `${path}.criteriaProfileRef`, errors);
  if (!isNonEmptyText(value.title, 160)) errors.push(`${path}.title이 필요합니다.`);
  if (!Array.isArray(value.criteria) || value.criteria.length === 0) errors.push(`${path}.criteria가 최소 1개 필요합니다.`);
  else value.criteria.forEach((item, index) => {
    const itemPath = `${path}.criteria[${index}]`;
    if (!isRecord(item)) return errors.push(`${itemPath}가 올바르지 않습니다.`);
    unknownKeys(item, new Set(["criterionKey", "label", "targetDisplay"]), itemPath, errors);
    if (!isFranchiseReportStableId(item.criterionKey)) errors.push(`${itemPath}.criterionKey가 올바르지 않습니다.`);
    if (!isNonEmptyText(item.label, 160)) errors.push(`${itemPath}.label이 필요합니다.`);
    if (!isNonEmptyText(item.targetDisplay, 160)) errors.push(`${itemPath}.targetDisplay가 필요합니다.`);
  });
}

function validateCandidateCriteria(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`${path}가 올바르지 않습니다.`);
    return;
  }
  unknownKeys(value, new Set(["criteriaProfileRef", "evaluationSetId", "evaluations"]), path, errors);
  validateReference(value.criteriaProfileRef, `${path}.criteriaProfileRef`, errors);
  if (!isOpaqueReference(value.evaluationSetId)) errors.push(`${path}.evaluationSetId가 올바르지 않습니다.`);
  if (!Array.isArray(value.evaluations)) errors.push(`${path}.evaluations는 배열이어야 합니다.`);
  else value.evaluations.forEach((item, index) => {
    const itemPath = `${path}.evaluations[${index}]`;
    if (!isRecord(item)) return errors.push(`${itemPath}가 올바르지 않습니다.`);
    unknownKeys(item, new Set(["criterionKey", "label", "result", "observed", "rationale"]), itemPath, errors);
    if (!isFranchiseReportStableId(item.criterionKey)) errors.push(`${itemPath}.criterionKey가 올바르지 않습니다.`);
    if (!isNonEmptyText(item.label, 160)) errors.push(`${itemPath}.label이 필요합니다.`);
    if (!SITE_CRITERION_EVALUATION_RESULTS.includes(item.result as never)) errors.push(`${itemPath}.result가 올바르지 않습니다.`);
    validatePresentationValue(item.observed, `${itemPath}.observed`, errors);
    if (!isNonEmptyText(item.rationale, 500)) errors.push(`${itemPath}.rationale이 필요합니다.`);
  });
}

function validateCandidate(value: unknown, index: number, errors: string[]) {
  const path = `input.candidates[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path}가 올바르지 않습니다.`);
    return;
  }
  unknownKeys(value, CANDIDATE_KEYS, path, errors);
  if (!isCandidateStoreId(value.candidateStoreId)) errors.push(`${path}.candidateStoreId가 올바르지 않습니다.`);
  for (const key of ["displayCode", "address", "region", "lifecycleLabel"] as const) {
    if (!isNonEmptyText(value[key], 200)) errors.push(`${path}.${key}가 필요합니다.`);
  }
  if (value.siteGrade !== "UNKNOWN" && !SITE_GRADES.includes(value.siteGrade as never)) errors.push(`${path}.siteGrade가 올바르지 않습니다.`);
  if (value.approvedDecisionRef !== undefined && !HUMAN_DECISION_ID_PATTERN.test(String(value.approvedDecisionRef))) errors.push(`${path}.approvedDecisionRef가 올바르지 않습니다.`);

  if (!isRecord(value.lease)) errors.push(`${path}.lease가 올바르지 않습니다.`);
  else {
    unknownKeys(value.lease, new Set(["area", "deposit", "rent", "maintenance", "goodwillOrFacilityFee", "contractConditions"]), `${path}.lease`, errors);
    for (const key of ["area", "deposit", "rent", "maintenance", "goodwillOrFacilityFee"] as const) validatePresentationValue(value.lease[key], `${path}.lease.${key}`, errors);
    validTextArray(value.lease.contractConditions, `${path}.lease.contractConditions`, errors);
  }

  if (!Array.isArray(value.demandAndBackground)) errors.push(`${path}.demandAndBackground는 배열이어야 합니다.`);
  else value.demandAndBackground.forEach((item, itemIndex) => {
    const itemPath = `${path}.demandAndBackground[${itemIndex}]`;
    if (!isRecord(item)) return errors.push(`${itemPath}가 올바르지 않습니다.`);
    unknownKeys(item, new Set(["factKey", "label", "value"]), itemPath, errors);
    if (!isFranchiseReportStableId(item.factKey)) errors.push(`${itemPath}.factKey가 올바르지 않습니다.`);
    if (!isNonEmptyText(item.label, 160)) errors.push(`${itemPath}.label이 필요합니다.`);
    validatePresentationValue(item.value, `${itemPath}.value`, errors);
  });
  validateCandidateCriteria(value.criteriaPresentation, `${path}.criteriaPresentation`, errors);

  if (!isRecord(value.riskPresentation)) errors.push(`${path}.riskPresentation이 올바르지 않습니다.`);
  else {
    unknownKeys(value.riskPresentation, new Set(["hardRiskGateStatus", "summary", "items"]), `${path}.riskPresentation`, errors);
    if (!HARD_RISK_GATE_STATUSES.includes(value.riskPresentation.hardRiskGateStatus as never)) errors.push(`${path}.riskPresentation.hardRiskGateStatus가 올바르지 않습니다.`);
    if (!isNonEmptyText(value.riskPresentation.summary, 500)) errors.push(`${path}.riskPresentation.summary가 필요합니다.`);
    if (!Array.isArray(value.riskPresentation.items)) errors.push(`${path}.riskPresentation.items는 배열이어야 합니다.`);
    else value.riskPresentation.items.forEach((item, itemIndex) => {
      const itemPath = `${path}.riskPresentation.items[${itemIndex}]`;
      if (!isRecord(item)) return errors.push(`${itemPath}가 올바르지 않습니다.`);
      unknownKeys(item, new Set(["title", "severity", "statusLabel", "confirmationNeeded"]), itemPath, errors);
      if (!isNonEmptyText(item.title, 160) || !isNonEmptyText(item.statusLabel, 160)) errors.push(`${itemPath} 고객용 문구가 필요합니다.`);
      if (!["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(String(item.severity))) errors.push(`${itemPath}.severity가 올바르지 않습니다.`);
      if (item.confirmationNeeded !== null && !isNonEmptyText(item.confirmationNeeded, 500)) errors.push(`${itemPath}.confirmationNeeded가 올바르지 않습니다.`);
    });
  }
  validTextArray(value.confirmationNeeded, `${path}.confirmationNeeded`, errors);
  validTextArray(value.nextActions, `${path}.nextActions`, errors);

  if (!isRecord(value.map)) errors.push(`${path}.map이 올바르지 않습니다.`);
  else {
    unknownKeys(value.map, new Set(["available", "assetRef", "sourceLabel", "caption"]), `${path}.map`, errors);
    if (typeof value.map.available !== "boolean") errors.push(`${path}.map.available이 boolean이 아닙니다.`);
    if (value.map.available && !isReportAssetReferenceV1(value.map.assetRef)) errors.push(`${path}.map.assetRef가 필요합니다.`);
    if (!value.map.available && value.map.assetRef !== null) errors.push(`${path}.map unavailable이면 assetRef는 null이어야 합니다.`);
    if (!isNonEmptyText(value.map.sourceLabel, 160) || !isNonEmptyText(value.map.caption, 200)) errors.push(`${path}.map 고객용 설명이 필요합니다.`);
  }

  if (!Array.isArray(value.photos)) errors.push(`${path}.photos는 배열이어야 합니다.`);
  else value.photos.forEach((photo, photoIndex) => {
    const photoPath = `${path}.photos[${photoIndex}]`;
    if (!isRecord(photo)) return errors.push(`${photoPath}가 올바르지 않습니다.`);
    unknownKeys(photo, new Set(["photoId", "category", "assetRef", "caption", "sortOrder", "primary"]), photoPath, errors);
    if (!isOpaqueReference(photo.photoId)) errors.push(`${photoPath}.photoId가 올바르지 않습니다.`);
    if (!isCandidatePhotoCategory(photo.category)) errors.push(`${photoPath}.category가 올바르지 않습니다.`);
    if (!isReportAssetReferenceV1(photo.assetRef)) errors.push(`${photoPath}.assetRef가 올바르지 않습니다.`);
    if (!isNonEmptyText(photo.caption, 300)) errors.push(`${photoPath}.caption이 필요합니다.`);
    if (!Number.isInteger(photo.sortOrder) || (photo.sortOrder as number) < 0) errors.push(`${photoPath}.sortOrder가 올바르지 않습니다.`);
    if (typeof photo.primary !== "boolean") errors.push(`${photoPath}.primary가 boolean이 아닙니다.`);
  });
  if (Array.isArray(value.photos) && value.photos.filter((photo) => isRecord(photo) && photo.primary === true).length > 1) errors.push(`${path}.photos primary는 최대 1개입니다.`);

  if (!Array.isArray(value.marketIntelligence)) errors.push(`${path}.marketIntelligence는 배열이어야 합니다.`);
  else value.marketIntelligence.forEach((item, itemIndex) => validateMarket(item, `${path}.marketIntelligence[${itemIndex}]`, errors));
  if (!Array.isArray(value.sources)) errors.push(`${path}.sources는 배열이어야 합니다.`);
  else value.sources.forEach((item, itemIndex) => validateSource(item, `${path}.sources[${itemIndex}]`, errors));
}

function validateComparisonPages(value: unknown, candidateIds: ReadonlySet<string>, errors: string[]) {
  if (!Array.isArray(value)) return errors.push("input.comparisonPages는 배열이어야 합니다.");
  value.forEach((page, pageIndex) => {
    const path = `input.comparisonPages[${pageIndex}]`;
    if (!isRecord(page)) return errors.push(`${path}가 올바르지 않습니다.`);
    unknownKeys(page, new Set(["comparisonId", "title", "candidates"]), path, errors);
    if (!isFranchiseReportStableId(page.comparisonId)) errors.push(`${path}.comparisonId가 올바르지 않습니다.`);
    if (!isNonEmptyText(page.title, 160)) errors.push(`${path}.title이 필요합니다.`);
    if (!Array.isArray(page.candidates) || page.candidates.length === 0 || page.candidates.length > 4) errors.push(`${path}.candidates는 1~4개여야 합니다.`);
    else {
      const ids: string[] = [];
      page.candidates.forEach((candidate, candidateIndex) => {
        const candidatePath = `${path}.candidates[${candidateIndex}]`;
        if (!isRecord(candidate)) return errors.push(`${candidatePath}가 올바르지 않습니다.`);
        unknownKeys(candidate, new Set(["candidateStoreId", "dimensions"]), candidatePath, errors);
        if (!isCandidateStoreId(candidate.candidateStoreId) || !candidateIds.has(String(candidate.candidateStoreId))) errors.push(`${candidatePath}.candidateStoreId가 보고서 Candidate와 일치하지 않습니다.`);
        else ids.push(candidate.candidateStoreId);
        if (!Array.isArray(candidate.dimensions)) errors.push(`${candidatePath}.dimensions는 배열이어야 합니다.`);
        else candidate.dimensions.forEach((dimension, dimensionIndex) => {
          const dimensionPath = `${candidatePath}.dimensions[${dimensionIndex}]`;
          if (!isRecord(dimension)) return errors.push(`${dimensionPath}가 올바르지 않습니다.`);
          unknownKeys(dimension, new Set(["dimensionId", "label", "displayValue", "evaluation", "evidenceStatus"]), dimensionPath, errors);
          if (!isFranchiseReportStableId(dimension.dimensionId)) errors.push(`${dimensionPath}.dimensionId가 올바르지 않습니다.`);
          if (!isNonEmptyText(dimension.label, 160) || !isNonEmptyText(dimension.displayValue, 160)) errors.push(`${dimensionPath} 고객용 표시값이 필요합니다.`);
          if (!["MATCH", "REVIEW", "GAP", "UNKNOWN"].includes(String(dimension.evaluation))) errors.push(`${dimensionPath}.evaluation이 올바르지 않습니다.`);
          if (!VERIFICATION_STATUSES.includes(dimension.evidenceStatus as never)) errors.push(`${dimensionPath}.evidenceStatus가 올바르지 않습니다.`);
        });
      });
      if (new Set(ids).size !== ids.length) errors.push(`${path}.candidates에 중복 Candidate ID가 있습니다.`);
    }
  });
}

function validateExtensionSections(value: unknown, errors: string[]) {
  if (!Array.isArray(value)) return errors.push("input.extensionSections는 배열이어야 합니다.");
  const ids: string[] = [];
  value.forEach((section, index) => {
    const path = `input.extensionSections[${index}]`;
    if (!isRecord(section)) return errors.push(`${path}가 올바르지 않습니다.`);
    unknownKeys(section, new Set(["sectionId", "industryProfileId", "title", "status", "payloadRef", "limitation"]), path, errors);
    if (!isFranchiseReportStableId(section.sectionId)) errors.push(`${path}.sectionId가 올바르지 않습니다.`); else ids.push(section.sectionId);
    if (!isFranchiseReportStableId(section.industryProfileId)) errors.push(`${path}.industryProfileId가 올바르지 않습니다.`);
    if (!isNonEmptyText(section.title, 160)) errors.push(`${path}.title이 필요합니다.`);
    if (!REPORT_EXTENSION_SECTION_STATUSES.includes(section.status as never)) errors.push(`${path}.status가 올바르지 않습니다.`);
    if (section.status === "READY" && !isOpaqueReference(section.payloadRef)) errors.push(`${path}.READY에는 validated payloadRef가 필요합니다.`);
    if (section.status !== "READY" && section.payloadRef !== null) errors.push(`${path}.${String(section.status)}에서는 payloadRef가 null이어야 합니다.`);
    if (section.status === "GAP" && !isNonEmptyText(section.limitation, 500)) errors.push(`${path}.GAP에는 limitation이 필요합니다.`);
    if (section.limitation !== null && !isNonEmptyText(section.limitation, 500)) errors.push(`${path}.limitation이 올바르지 않습니다.`);
  });
  if (new Set(ids).size !== ids.length) errors.push("input.extensionSections에 중복 sectionId가 있습니다.");
}

function validateApprovedDecisions(value: unknown, candidateIds: ReadonlySet<string>, errors: string[]) {
  if (!Array.isArray(value)) return errors.push("input.approvedDecisions는 배열이어야 합니다.");
  const ids: string[] = [];
  value.forEach((decision, index) => {
    const path = `input.approvedDecisions[${index}]`;
    if (!isRecord(decision)) return errors.push(`${path}가 올바르지 않습니다.`);
    unknownKeys(decision, new Set([
      "decisionId", "candidateStoreId", "decision", "reasons", "confirmationNeeded",
      "nextActions", "decidedAt", "approvedAt",
    ]), path, errors);
    if (typeof decision.decisionId !== "string" || !HUMAN_DECISION_ID_PATTERN.test(decision.decisionId)) errors.push(`${path}.decisionId가 올바르지 않습니다.`); else ids.push(decision.decisionId);
    if (!isCandidateStoreId(decision.candidateStoreId) || !candidateIds.has(String(decision.candidateStoreId))) errors.push(`${path}.candidateStoreId가 보고서 Candidate와 일치하지 않습니다.`);
    if (!HUMAN_CONTRACT_DECISIONS.includes(decision.decision as never)) errors.push(`${path}.decision이 올바르지 않습니다.`);
    validTextArray(decision.reasons, `${path}.reasons`, errors, 1);
    validTextArray(decision.confirmationNeeded, `${path}.confirmationNeeded`, errors);
    validTextArray(decision.nextActions, `${path}.nextActions`, errors);
    if (decision.decision === "CONDITIONAL_RECOMMEND" && Array.isArray(decision.confirmationNeeded) && decision.confirmationNeeded.length === 0) errors.push(`${path}.CONDITIONAL_RECOMMEND에는 confirmationNeeded가 필요합니다.`);
    if (!isIsoTimestamp(decision.decidedAt) || !isIsoTimestamp(decision.approvedAt)) errors.push(`${path}에 decidedAt/approvedAt이 필요합니다.`);
    else if (Date.parse(decision.approvedAt) < Date.parse(decision.decidedAt)) errors.push(`${path}.approvedAt은 decidedAt 이후여야 합니다.`);
  });
  if (new Set(ids).size !== ids.length) errors.push("input.approvedDecisions에 중복 decisionId가 있습니다.");
}

function validateSnapshotRefs(value: unknown, candidateIds: ReadonlySet<string>, productType: unknown, candidates: unknown[], errors: string[]) {
  if (!Array.isArray(value)) return errors.push("input.sourceSnapshotRefs는 배열이어야 합니다.");
  const keys = new Set<string>();
  value.forEach((reference, index) => {
    const path = `input.sourceSnapshotRefs[${index}]`;
    if (!isRecord(reference)) return errors.push(`${path}가 올바르지 않습니다.`);
    unknownKeys(reference, new Set(["candidateStoreId", "domain", "status", "snapshotId", "version", "limitation"]), path, errors);
    if (!isCandidateStoreId(reference.candidateStoreId) || !candidateIds.has(String(reference.candidateStoreId))) errors.push(`${path}.candidateStoreId가 보고서 Candidate와 일치하지 않습니다.`);
    if (!REPORT_SOURCE_SNAPSHOT_DOMAINS.includes(reference.domain as never)) errors.push(`${path}.domain이 올바르지 않습니다.`);
    const key = `${String(reference.candidateStoreId)}:${String(reference.domain)}`;
    if (keys.has(key)) errors.push(`${path} Candidate/domain reference가 중복됩니다.`); else keys.add(key);
    if (reference.status === "RESOLVED") {
      if (!isOpaqueReference(reference.snapshotId)) errors.push(`${path}.RESOLVED에는 snapshotId가 필요합니다.`);
      if (!isFranchiseReportVersion(reference.version)) errors.push(`${path}.RESOLVED에는 version이 필요합니다.`);
    } else if (reference.status === "GAP") {
      if (reference.snapshotId !== null || reference.version !== null) errors.push(`${path}.GAP은 snapshot/version을 만들 수 없습니다.`);
      if (!isNonEmptyText(reference.limitation, 500)) errors.push(`${path}.GAP에는 limitation이 필요합니다.`);
    } else errors.push(`${path}.status가 올바르지 않습니다.`);
    if (reference.limitation !== null && !isNonEmptyText(reference.limitation, 500)) errors.push(`${path}.limitation이 올바르지 않습니다.`);
  });
  const required = productType === "FRANCHISE_CONTRACT_DECISION"
    ? ["CANDIDATE", "CRITERIA", "EVIDENCE", "MARKET", "RISK", "DECISION"]
    : ["CANDIDATE", "CRITERIA", "EVIDENCE", "MARKET"];
  for (const candidateId of candidateIds) {
    for (const domain of required) if (!keys.has(`${candidateId}:${domain}`)) errors.push(`${candidateId}의 ${domain} snapshot reference 또는 explicit GAP이 필요합니다.`);
    const candidate = candidates.find((item) => isRecord(item) && item.candidateStoreId === candidateId);
    if (isRecord(candidate) && Array.isArray(candidate.photos) && candidate.photos.length > 0 && !keys.has(`${candidateId}:PHOTO`)) errors.push(`${candidateId}의 PHOTO snapshot reference 또는 explicit GAP이 필요합니다.`);
  }
}

export function validateFranchiseReportInputV1(
  value: unknown,
): FranchiseReportContractValidationResult<FranchiseReportInputV1> {
  const errors: string[] = [];
  if (!isRecord(value)) return failure("INVALID_FRANCHISE_REPORT_INPUT", "Franchise Report Input V1 검증에 실패했습니다.", ["input은 객체여야 합니다."]);
  unknownKeys(value, INPUT_KEYS, "input", errors);
  if (value.schemaVersion !== FRANCHISE_REPORT_INPUT_SCHEMA_VERSION) errors.push("input.schemaVersion이 올바르지 않습니다.");
  if (!FRANCHISE_REPORT_PRODUCT_TYPES.includes(value.productType as never)) errors.push("input.productType이 올바르지 않습니다.");

  if (!isRecord(value.project)) errors.push("input.project가 올바르지 않습니다.");
  else {
    unknownKeys(value.project, new Set(["projectId", "caseId", "label"]), "input.project", errors);
    if (!isFranchiseReportStableId(value.project.projectId)) errors.push("input.project.projectId가 올바르지 않습니다.");
    if (!isFranchiseReportStableId(value.project.caseId)) errors.push("input.project.caseId가 올바르지 않습니다.");
    if (!isNonEmptyText(value.project.label, 160)) errors.push("input.project.label이 필요합니다.");
  }
  validateScope(value.scope, "input.scope", errors);
  validateReference(value.presetRef, "input.presetRef", errors);
  if (!isRecord(value.brand)) errors.push("input.brand가 올바르지 않습니다.");
  else {
    unknownKeys(value.brand, new Set(["brandProfileRef", "industryProfileRef", "displayName"]), "input.brand", errors);
    validateReference(value.brand.brandProfileRef, "input.brand.brandProfileRef", errors);
    validateReference(value.brand.industryProfileRef, "input.brand.industryProfileRef", errors);
    if (!isNonEmptyText(value.brand.displayName, 120)) errors.push("input.brand.displayName이 필요합니다.");
  }
  const theme = validateReportThemeV1(value.theme);
  if (!theme.ok) errors.push(...theme.errors.map((error) => `input.${error}`));
  validateBrandCriteria(value.criteriaPresentation, "input.criteriaPresentation", errors);

  const candidates = Array.isArray(value.candidates) ? value.candidates : [];
  if (!Array.isArray(value.candidates) || candidates.length === 0) errors.push("input.candidates는 최소 1개 필요합니다.");
  candidates.forEach((candidate, index) => validateCandidate(candidate, index, errors));
  const candidateIds = candidates.flatMap((candidate) => isRecord(candidate) && isCandidateStoreId(candidate.candidateStoreId) ? [candidate.candidateStoreId] : []);
  const candidateIdSet = new Set(candidateIds);
  if (candidateIdSet.size !== candidateIds.length) errors.push("input.candidates에 중복 candidateStoreId가 있습니다.");

  validateComparisonPages(value.comparisonPages, candidateIdSet, errors);
  if (!Array.isArray(value.marketIntelligence)) errors.push("input.marketIntelligence는 배열이어야 합니다.");
  else value.marketIntelligence.forEach((item, index) => validateMarket(item, `input.marketIntelligence[${index}]`, errors));
  validateExtensionSections(value.extensionSections, errors);
  validateApprovedDecisions(value.approvedDecisions, candidateIdSet, errors);
  if (value.productType === "FRANCHISE_CONTRACT_DECISION" && Array.isArray(value.approvedDecisions) && value.approvedDecisions.length === 0) errors.push("FRANCHISE_CONTRACT_DECISION에는 승인된 인간 Decision이 최소 1개 필요합니다.");

  if (Array.isArray(value.approvedDecisions)) {
    const decisions = new Map(value.approvedDecisions.filter(isRecord).map((decision) => [decision.decisionId, decision]));
    candidates.forEach((candidate, index) => {
      if (!isRecord(candidate) || candidate.approvedDecisionRef === undefined) return;
      const decision = decisions.get(candidate.approvedDecisionRef);
      if (!decision || decision.candidateStoreId !== candidate.candidateStoreId) errors.push(`input.candidates[${index}].approvedDecisionRef가 승인 Decision과 일치하지 않습니다.`);
    });
  }

  validateSnapshotRefs(value.sourceSnapshotRefs, candidateIdSet, value.productType, candidates, errors);
  if (!isIsoTimestamp(value.generatedAt)) errors.push("input.generatedAt이 올바른 ISO timestamp가 아닙니다.");

  if (isRecord(value.criteriaPresentation) && isRecord(value.criteriaPresentation.criteriaProfileRef)) {
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (!isRecord(candidate) || !isRecord(candidate.criteriaPresentation) || !isRecord(candidate.criteriaPresentation.criteriaProfileRef)) continue;
      const shared = value.criteriaPresentation.criteriaProfileRef;
      const own = candidate.criteriaPresentation.criteriaProfileRef;
      if (shared.id !== own.id || shared.version !== own.version) errors.push(`input.candidates[${index}] criteria profile이 보고서 criteria profile과 다릅니다.`);
    }
  }

  if (errors.length > 0) return failure("INVALID_FRANCHISE_REPORT_INPUT", "Franchise Report Input V1 검증에 실패했습니다.", errors);
  return Object.freeze({ ok: true, value: deepFreeze(structuredClone(value as unknown as FranchiseReportInputV1)) as FranchiseReportInputV1 });
}
