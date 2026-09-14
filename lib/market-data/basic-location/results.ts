export const BASIC_LOCATION_ANALYSIS_LAYERS = [
  "MARKET_IDENTITY",
  "DEMAND",
  "FLOW_POTENTIAL",
  "STAY_POTENTIAL",
  "SURROUNDING_POI",
  "COMPETITION",
  "MARKET_CHANGE",
  "BAKERY_FIT",
  "PROMISING_SEGMENT",
  "BUILDING_CANDIDATE",
  "DATA_EVIDENCE",
] as const;

export const BASIC_LOCATION_ANALYSIS_UNIT_TYPES = [
  "FRAMEONE_MARKET",
  "FRAMEONE_SUBMARKET",
  "FRAMEONE_NODE",
  "RADIUS_300M",
  "RADIUS_500M",
] as const;

export const BASIC_LOCATION_VALUE_TYPES = [
  "OFFICIAL_VALUE",
  "CANONICAL_VALUE",
  "OBSERVED_SOURCE_VALUE",
  "CALCULATED_VALUE",
  "DERIVED_INDEX",
  "ESTIMATED_VALUE",
  "INTERPRETATION",
  "UNKNOWN",
] as const;

export const BASIC_LOCATION_RESULT_STATUSES = [
  "AVAILABLE",
  "PARTIAL",
  "NEEDS_REVIEW",
  "NOT_AVAILABLE",
  "BLOCKED",
] as const;

export const BASIC_LOCATION_CONFIDENCE_LEVELS = [
  "HIGH",
  "MEDIUM",
  "LOW",
  "UNKNOWN",
] as const;

export const BASIC_LOCATION_CUSTOMER_DISPLAY_POLICIES = [
  "INTERNAL_ONLY",
  "CUSTOMER_WITH_NOTE",
  "CUSTOMER_READY",
  "HIDDEN",
] as const;

export const BASIC_LOCATION_MISSING_REASONS = [
  "NO_DATA",
  "NOT_CONNECTED",
  "NOT_CALCULATED",
  "BLOCKED_BY_GEOMETRY",
  "SOURCE_ERROR",
  "UNKNOWN",
] as const;

export type BasicLocationAnalysisLayer =
  (typeof BASIC_LOCATION_ANALYSIS_LAYERS)[number];
export type BasicLocationAnalysisUnitType =
  (typeof BASIC_LOCATION_ANALYSIS_UNIT_TYPES)[number];
export type BasicLocationValueType =
  (typeof BASIC_LOCATION_VALUE_TYPES)[number];
export type BasicLocationResultStatus =
  (typeof BASIC_LOCATION_RESULT_STATUSES)[number];
export type BasicLocationConfidence =
  (typeof BASIC_LOCATION_CONFIDENCE_LEVELS)[number];
export type BasicLocationCustomerDisplayPolicy =
  (typeof BASIC_LOCATION_CUSTOMER_DISPLAY_POLICIES)[number];
export type BasicLocationMissingReason =
  (typeof BASIC_LOCATION_MISSING_REASONS)[number];

export type BasicLocationResultValue =
  | string
  | number
  | boolean
  | readonly string[]
  | null;

export interface BasicLocationAnalysisUnit {
  type: BasicLocationAnalysisUnitType;
  id: string;
  label: string;
}

export interface BasicLocationSource {
  sourceId: string | null;
  sourceName: string;
  sourceType: "FRAMEONE_CANONICAL" | "EXTERNAL_PLATFORM" | "ANALYSIS_INPUT";
}

export interface BasicLocationSourceReference {
  sourceId: string | null;
  locator: string;
  sourceVersion: string | null;
}

export interface BasicLocationLimitation {
  code: string;
  message: string;
  severity: "INFO" | "CAUTION" | "BLOCKING";
}

export interface BasicLocationConfidenceReason {
  code: string;
  message: string;
}

export interface BasicLocationResult {
  contractVersion: "FRAMEONE_BASIC_LOCATION_RESULT_V1";
  resultId: string;
  analysisRunId: string;
  analysisLayer: BasicLocationAnalysisLayer;
  analysisUnit: BasicLocationAnalysisUnit;
  metricKey: string;
  metricLabel: string;
  value: BasicLocationResultValue;
  unit: string | null;
  valueType: BasicLocationValueType;
  primarySource: BasicLocationSource | null;
  sourceReferences: readonly BasicLocationSourceReference[];
  referenceDate: string | null;
  referencePeriod: string | null;
  status: BasicLocationResultStatus;
  confidence: BasicLocationConfidence;
  confidenceReasons: readonly BasicLocationConfidenceReason[];
  limitations: readonly BasicLocationLimitation[];
  missingReason: BasicLocationMissingReason | null;
  fieldCheckRequired: boolean;
  fieldCheckKeys: readonly string[];
  customerDisplayPolicy: BasicLocationCustomerDisplayPolicy;
  methodologyNote: string | null;
  updatedAt: string;
}

type ResultBaseInput = Omit<
  BasicLocationResult,
  | "contractVersion"
  | "resultId"
  | "value"
  | "status"
  | "confidence"
  | "missingReason"
>;

export type AvailableResultInput = ResultBaseInput & {
  value: Exclude<BasicLocationResultValue, null>;
  confidence: Exclude<BasicLocationConfidence, "UNKNOWN">;
};

export type BlockedResultInput = Omit<
  ResultBaseInput,
  "valueType" | "confidenceReasons"
> & {
  limitations: readonly [BasicLocationLimitation, ...BasicLocationLimitation[]];
};

export class BasicLocationResultValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BasicLocationResultValidationError";
  }
}

function requireNonEmpty(value: string, path: string) {
  if (value.trim().length === 0) {
    throw new BasicLocationResultValidationError(`${path}가 비어 있습니다.`);
  }
}

function resultIdFor(input: Pick<ResultBaseInput, "analysisRunId" | "analysisUnit" | "metricKey">) {
  return [input.analysisRunId, input.analysisUnit.type, input.analysisUnit.id, input.metricKey].join("::");
}

function validateBase(input: Pick<
  ResultBaseInput,
  | "analysisRunId"
  | "analysisUnit"
  | "metricKey"
  | "metricLabel"
  | "updatedAt"
  | "fieldCheckRequired"
  | "fieldCheckKeys"
>) {
  requireNonEmpty(input.analysisRunId, "analysisRunId");
  requireNonEmpty(input.analysisUnit.id, "analysisUnit.id");
  requireNonEmpty(input.analysisUnit.label, "analysisUnit.label");
  requireNonEmpty(input.metricKey, "metricKey");
  requireNonEmpty(input.metricLabel, "metricLabel");
  requireNonEmpty(input.updatedAt, "updatedAt");

  if (input.fieldCheckRequired && input.fieldCheckKeys.length === 0) {
    throw new BasicLocationResultValidationError(
      "현장확인이 필요한 Result에는 fieldCheckKeys가 필요합니다.",
    );
  }
}

function freezeResult(result: BasicLocationResult): BasicLocationResult {
  Object.freeze(result.analysisUnit);
  if (result.primarySource) Object.freeze(result.primarySource);
  for (const reference of result.sourceReferences) Object.freeze(reference);
  for (const reason of result.confidenceReasons) Object.freeze(reason);
  for (const limitation of result.limitations) Object.freeze(limitation);
  Object.freeze(result.sourceReferences);
  Object.freeze(result.confidenceReasons);
  Object.freeze(result.limitations);
  Object.freeze(result.fieldCheckKeys);
  if (Array.isArray(result.value)) Object.freeze(result.value);
  return Object.freeze(result);
}

export function createAvailableResult(input: AvailableResultInput): BasicLocationResult {
  validateBase(input);
  if (typeof input.value === "number" && !Number.isFinite(input.value)) {
    throw new BasicLocationResultValidationError("Result의 숫자 value는 finite여야 합니다.");
  }

  return freezeResult(structuredClone({
    ...input,
    contractVersion: "FRAMEONE_BASIC_LOCATION_RESULT_V1",
    resultId: resultIdFor(input),
    status: "AVAILABLE",
    missingReason: null,
  }));
}

export function createGeometryBlockedResult(input: BlockedResultInput): BasicLocationResult {
  validateBase(input);
  if (!input.limitations.some((limitation) => limitation.severity === "BLOCKING")) {
    throw new BasicLocationResultValidationError(
      "BLOCKED Result에는 BLOCKING limitation이 필요합니다.",
    );
  }

  return freezeResult(structuredClone({
    ...input,
    contractVersion: "FRAMEONE_BASIC_LOCATION_RESULT_V1",
    resultId: resultIdFor(input),
    value: null,
    valueType: "UNKNOWN",
    status: "BLOCKED",
    confidence: "UNKNOWN",
    confidenceReasons: [],
    missingReason: "BLOCKED_BY_GEOMETRY",
  }));
}
