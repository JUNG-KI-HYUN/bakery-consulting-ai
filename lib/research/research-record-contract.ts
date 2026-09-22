import {
  DUPLICATE_STATUSES,
  FRESHNESS_STATUSES,
  SOURCE_TYPES,
  VERIFICATION_STATUSES,
  type LeaseResearchRecord,
} from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNonNegativeNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (!isObject(value)) throw new TypeError(`${field} must be an object.`);
  return value;
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string") throw new TypeError(`${field} must be a string.`);
}

export function parseLeaseResearchRecord(value: unknown): LeaseResearchRecord {
  const record = requireObject(value, "record");
  if (record.schemaVersion !== "frameone.lease-research-record.v1.2") {
    throw new TypeError("Unsupported research record schemaVersion.");
  }
  requireString(record.recordId, "recordId");
  if (record.recordId === "") throw new TypeError("recordId must not be empty.");

  const source = requireObject(record.source, "source");
  for (const field of ["sourceUrl", "sourceName", "collectedAt", "pageTitle"] as const) {
    requireString(source[field], `source.${field}`);
  }
  if (!SOURCE_TYPES.includes(source.sourceType as never)) throw new TypeError("Unknown sourceType.");
  if (!Number.isFinite(Date.parse(String(source.collectedAt)))) throw new TypeError("Invalid collectedAt.");

  const property = requireObject(record.property, "property");
  for (const field of ["addressRaw", "address", "floor"] as const) {
    if (!isNullableString(property[field])) throw new TypeError(`property.${field} must be string or null.`);
  }
  for (const field of ["contractAreaM2", "contractAreaPyeong", "exclusiveAreaM2", "exclusiveAreaPyeong"] as const) {
    if (!isNullableNonNegativeNumber(property[field])) throw new TypeError(`property.${field} must be a non-negative number or null.`);
  }

  const lease = requireObject(record.lease, "lease");
  for (const field of ["depositAmount", "rentAmount", "managementFeeAmount", "premiumAmount"] as const) {
    if (!isNullableNonNegativeNumber(lease[field])) throw new TypeError(`lease.${field} must be a non-negative number or null.`);
  }
  requireString(lease.premiumStatus, "lease.premiumStatus");
  requireString(lease.vatStatus, "lease.vatStatus");
  if (lease.managementFeeStatus !== undefined) requireString(lease.managementFeeStatus, "lease.managementFeeStatus");

  const optional = requireObject(record.optional, "optional");
  for (const field of ["parking", "moveIn", "existingBusinessType", "buildingName"] as const) {
    if (!isNullableString(optional[field])) throw new TypeError(`optional.${field} must be string or null.`);
  }
  if (optional.parkingAvailable !== undefined && optional.parkingAvailable !== null && typeof optional.parkingAvailable !== "boolean") {
    throw new TypeError("optional.parkingAvailable must be boolean or null.");
  }
  for (const field of ["buildingTotalParkingSpaces", "includedParkingSpaces"] as const) {
    if (optional[field] !== undefined && !isNullableNonNegativeNumber(optional[field])) {
      throw new TypeError(`optional.${field} must be a non-negative number or null.`);
    }
  }
  if (optional.additionalParkingStatus !== undefined && !isNullableString(optional.additionalParkingStatus)) {
    throw new TypeError("optional.additionalParkingStatus must be string or null.");
  }

  const quality = requireObject(record.quality, "quality");
  if (!VERIFICATION_STATUSES.includes(quality.verificationStatus as never)) throw new TypeError("Unknown verificationStatus.");
  if (!FRESHNESS_STATUSES.includes(quality.freshnessStatus as never)) throw new TypeError("Unknown freshnessStatus.");
  if (!DUPLICATE_STATUSES.includes(quality.duplicateStatus as never)) throw new TypeError("Unknown duplicateStatus.");
  if (!Array.isArray(quality.warnings) || quality.warnings.some((warning) => typeof warning !== "string")) {
    throw new TypeError("quality.warnings must be a string array.");
  }

  const evidence = requireObject(record.evidence, "evidence");
  for (const field of ["raw", "normalized", "fieldStatus", "excerpts"] as const) requireObject(evidence[field], `evidence.${field}`);
  if (!Array.isArray(record.history) || record.history.some((event) => !isObject(event))) {
    throw new TypeError("history must be an object array.");
  }
  return structuredClone(record) as unknown as LeaseResearchRecord;
}

export function assertConfirmedForServerSave(record: LeaseResearchRecord) {
  if (record.quality.verificationStatus !== "CONFIRMED") {
    throw new TypeError("Only CONFIRMED research records can be saved to FRAMEONE.");
  }
}
