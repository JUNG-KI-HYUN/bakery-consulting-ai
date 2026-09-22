import { FIELD_STATUS, SOURCE_ADAPTER, toExportRecord } from "./lease-parser.js";

export const RESEARCH_RECORD_SCHEMA_VERSION = "frameone.lease-research-record.v1.2";

export const VERIFICATION_STATUS = Object.freeze({
  COLLECTED: "COLLECTED",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
  CONFIRMED: "CONFIRMED",
  EXCLUDED: "EXCLUDED",
});

export const SOURCE_TYPE = Object.freeze({
  ONLINE_LISTING: "ONLINE_LISTING",
  BROKER_CONFIRMED: "BROKER_CONFIRMED",
  LANDLORD_CONFIRMED: "LANDLORD_CONFIRMED",
  FIELD_CONFIRMED: "FIELD_CONFIRMED",
  ACTUAL_CONTRACT: "ACTUAL_CONTRACT",
  UNKNOWN: "UNKNOWN",
});

export const FRESHNESS_STATUS = Object.freeze({
  CURRENT_30D: "CURRENT_30D",
  RECENT_90D: "RECENT_90D",
  AGED_180D: "AGED_180D",
  STALE: "STALE",
});

export const DUPLICATE_STATUS = Object.freeze({
  NO_MATCH: "NO_MATCH",
  POSSIBLE_DUPLICATE: "POSSIBLE_DUPLICATE",
  LIKELY_DUPLICATE: "LIKELY_DUPLICATE",
});

// 광고마다 ㎡/평 환산과 소수점 반올림이 달라질 수 있어 0.5㎡까지만 같은 면적 후보로 본다.
export const AREA_TOLERANCE_M2 = 0.5;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseTimestamp(value, label) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError(`${label} must be a valid date-time.`);
  return timestamp;
}

export function calculateFreshness(collectedAt, asOf) {
  const collected = parseTimestamp(collectedAt, "collectedAt");
  const reference = parseTimestamp(asOf, "asOf");
  const ageDays = Math.max(0, Math.floor((reference - collected) / DAY_MS));
  if (ageDays <= 30) return FRESHNESS_STATUS.CURRENT_30D;
  if (ageDays <= 90) return FRESHNESS_STATUS.RECENT_90D;
  if (ageDays <= 180) return FRESHNESS_STATUS.AGED_180D;
  return FRESHNESS_STATUS.STALE;
}

function normalizeAddress(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isIncompleteAddress(value) {
  const address = normalizeAddress(value);
  if (!address) return true;
  const hasLotOrRoadNumber = /(?:로|길|동|리)\s*\d+(?:-\d+)?(?:\s|$)/.test(address);
  return !hasLotOrRoadNumber || /(?:동|읍|면|리)$/.test(address);
}

function sameNumber(left, right) {
  return typeof left === "number" && typeof right === "number" && left === right;
}

function areaMatches(left, right) {
  return typeof left === "number" && typeof right === "number" && Math.abs(left - right) <= AREA_TOLERANCE_M2;
}

function comparableRecord(record) {
  return {
    address: record?.property?.address ?? record?.address ?? null,
    floor: record?.property?.floor ?? record?.floor ?? null,
    exclusiveAreaM2: record?.property?.exclusiveAreaM2 ?? record?.exclusiveAreaM2 ?? null,
    contractAreaM2: record?.property?.contractAreaM2 ?? record?.contractAreaM2 ?? null,
    depositAmount: record?.lease?.depositAmount ?? record?.depositAmount ?? null,
    rentAmount: record?.lease?.rentAmount ?? record?.rentAmount ?? null,
  };
}

export function findDuplicateCandidate(leftRecord, rightRecord) {
  const left = comparableRecord(leftRecord);
  const right = comparableRecord(rightRecord);
  const leftAddress = normalizeAddress(left.address);
  const rightAddress = normalizeAddress(right.address);
  const reasons = [];
  const differences = [];
  let corroboratingMatches = 0;

  if (!leftAddress || leftAddress !== rightAddress) {
    return { status: DUPLICATE_STATUS.NO_MATCH, reasons, differences: ["normalized address differs or is missing"] };
  }

  const incompleteAddress = isIncompleteAddress(left.address) || isIncompleteAddress(right.address);
  reasons.push(incompleteAddress ? "same incomplete normalized address" : "same normalized address");

  if (left.floor != null && right.floor != null) {
    if (String(left.floor) === String(right.floor)) {
      reasons.push("same floor");
      corroboratingMatches += 1;
    } else {
      differences.push("different floor");
      return { status: DUPLICATE_STATUS.NO_MATCH, reasons, differences };
    }
  }

  for (const [key, label] of [["exclusiveAreaM2", "exclusive area within tolerance"], ["contractAreaM2", "contract area within tolerance"]]) {
    if (areaMatches(left[key], right[key])) {
      reasons.push(label);
      corroboratingMatches += 1;
    } else if (typeof left[key] === "number" && typeof right[key] === "number") {
      differences.push(`${key} differs`);
    }
  }

  for (const [key, label] of [["depositAmount", "same deposit"], ["rentAmount", "same rent"]]) {
    if (sameNumber(left[key], right[key])) {
      reasons.push(label);
      corroboratingMatches += 1;
    } else if (typeof left[key] === "number" && typeof right[key] === "number") {
      differences.push(`${key} differs`);
    }
  }

  // 동 단위 주소만 같을 때는 다른 점포일 가능성이 높아, 모든 보조 조건이 맞아도 자동 확정하지 않는다.
  if (incompleteAddress) {
    return {
      status: corroboratingMatches >= 4 ? DUPLICATE_STATUS.POSSIBLE_DUPLICATE : DUPLICATE_STATUS.NO_MATCH,
      reasons,
      differences,
    };
  }
  if (corroboratingMatches >= 4 && differences.length === 0) {
    return { status: DUPLICATE_STATUS.LIKELY_DUPLICATE, reasons, differences };
  }
  return {
    status: corroboratingMatches >= 2 ? DUPLICATE_STATUS.POSSIBLE_DUPLICATE : DUPLICATE_STATUS.NO_MATCH,
    reasons,
    differences,
  };
}

function changeRate(previousValue, currentValue) {
  if (typeof previousValue !== "number" || typeof currentValue !== "number" || previousValue === 0) return null;
  return ((currentValue - previousValue) / previousValue) * 100;
}

function addAmountChange(changes, field, previousValue, currentValue) {
  if (previousValue === currentValue) return;
  changes.push({
    field,
    previousValue,
    currentValue,
    changeAmount: typeof previousValue === "number" && typeof currentValue === "number" ? currentValue - previousValue : null,
    changeRate: changeRate(previousValue, currentValue),
  });
}

export function detectLeaseChanges(previousRecord, currentRecord) {
  const previous = previousRecord.lease;
  const current = currentRecord.lease;
  const changes = [];
  addAmountChange(changes, "depositAmount", previous.depositAmount, current.depositAmount);
  addAmountChange(changes, "rentAmount", previous.rentAmount, current.rentAmount);
  addAmountChange(changes, "managementFeeAmount", previous.managementFeeAmount, current.managementFeeAmount);
  addAmountChange(changes, "premiumAmount", previous.premiumAmount, current.premiumAmount);
  if (previous.premiumStatus !== current.premiumStatus) {
    changes.push({
      field: "premiumStatus",
      previousValue: previous.premiumStatus,
      currentValue: current.premiumStatus,
      changeAmount: null,
      changeRate: null,
    });
  }
  return changes;
}

export function detectSourceConflicts(records) {
  const warnings = [];
  const definitions = [
    ["depositAmount", "DEPOSIT_CONFLICT"],
    ["rentAmount", "RENT_CONFLICT"],
    ["managementFeeAmount", "MANAGEMENT_FEE_CONFLICT"],
    ["premiumAmount", "PREMIUM_AMOUNT_CONFLICT"],
    ["premiumStatus", "PREMIUM_STATUS_CONFLICT"],
  ];
  for (const [field, code] of definitions) {
    const values = records.map((record) => record.lease[field]).filter((value) => value !== null && value !== undefined);
    const uniqueValues = [...new Set(values)];
    if (uniqueValues.length > 1) warnings.push({ code, field, values: uniqueValues });
  }
  return warnings;
}

export function isEligibleForRentalMarketAnalysis(record) {
  return record?.quality?.verificationStatus === VERIFICATION_STATUS.CONFIRMED;
}

function stableRecordId(parts) {
  const input = parts.join("|");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `lease-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function sourceNameFor(collection) {
  if (collection.sourceAdapter === SOURCE_ADAPTER.NAVER_PAY_REAL_ESTATE) return "네이버페이 부동산";
  try {
    return new URL(collection.sourceUrl).hostname || "알 수 없는 출처";
  } catch {
    return "알 수 없는 출처";
  }
}

export function fromCollectorExport(collection, options = {}) {
  const legacy = toExportRecord(collection);
  const asOf = options.asOf ?? collection.collectedAt;
  const warnings = [
    ...legacy.validationWarnings.map((warning) => warning.message),
    ...Object.values(collection.fields).flatMap((field) => field.issues ?? []),
  ].filter((value, index, list) => list.indexOf(value) === index);
  const hasReviewField = Object.values(collection.fields).some((field) =>
    field.status === FIELD_STATUS.REVIEW_REQUIRED || field.status === FIELD_STATUS.MISSING);
  const verificationStatus = options.verificationStatus
    ?? (warnings.length > 0 || hasReviewField ? VERIFICATION_STATUS.REVIEW_REQUIRED : VERIFICATION_STATUS.COLLECTED);

  return {
    schemaVersion: RESEARCH_RECORD_SCHEMA_VERSION,
    recordId: options.recordId ?? stableRecordId([legacy.sourceUrl, legacy.collectedAt, legacy.addressRaw, legacy.floorRaw]),
    source: {
      sourceUrl: legacy.sourceUrl,
      sourceName: options.sourceName ?? sourceNameFor(collection),
      sourceType: options.sourceType ?? SOURCE_TYPE.ONLINE_LISTING,
      collectedAt: legacy.collectedAt,
      pageTitle: legacy.pageTitle,
    },
    property: {
      addressRaw: legacy.addressRaw,
      address: legacy.address,
      floor: legacy.floor,
      contractAreaM2: legacy.contractAreaM2,
      contractAreaPyeong: legacy.contractAreaPyeong,
      exclusiveAreaM2: legacy.exclusiveAreaM2,
      exclusiveAreaPyeong: legacy.exclusiveAreaPyeong,
    },
    lease: {
      depositAmount: legacy.depositAmount,
      rentAmount: legacy.rentAmount,
      managementFeeAmount: legacy.managementFeeAmount,
      managementFeeStatus: legacy.managementFeeStatus,
      premiumAmount: legacy.premiumAmount,
      premiumStatus: legacy.premiumStatus,
      vatStatus: legacy.vatStatus,
    },
    optional: {
      parking: legacy.parkingRaw,
      parkingAvailable: legacy.parkingAvailable,
      buildingTotalParkingSpaces: legacy.buildingTotalParkingSpaces,
      includedParkingSpaces: legacy.includedParkingSpaces,
      additionalParkingStatus: legacy.additionalParkingStatus,
      moveIn: legacy.moveInRaw,
      existingBusinessType: legacy.existingBusinessType,
      buildingName: legacy.buildingName,
    },
    quality: {
      verificationStatus,
      freshnessStatus: calculateFreshness(legacy.collectedAt, asOf),
      duplicateStatus: DUPLICATE_STATUS.NO_MATCH,
      warnings,
    },
    evidence: {
      raw: Object.fromEntries(Object.entries(collection.fields).map(([key, field]) => [key, field.raw ?? null])),
      normalized: {
        ...Object.fromEntries(Object.entries(collection.fields).map(([key, field]) => [key, field.value ?? field.m2 ?? null])),
        parking: {
          parkingAvailable: legacy.parkingAvailable,
          buildingTotalParkingSpaces: legacy.buildingTotalParkingSpaces,
          includedParkingSpaces: legacy.includedParkingSpaces,
          additionalParkingStatus: legacy.additionalParkingStatus,
        },
      },
      fieldStatus: legacy.fieldStatus,
      excerpts: legacy.evidence,
    },
    history: [],
  };
}

export function withVerificationStatus(record, verificationStatus, changedAt) {
  if (!Object.values(VERIFICATION_STATUS).includes(verificationStatus)) {
    throw new TypeError("Unknown verification status.");
  }
  return {
    ...record,
    quality: { ...record.quality, verificationStatus },
    history: [
      ...record.history,
      {
        type: "VERIFICATION_STATUS_CHANGED",
        changedAt,
        previousValue: record.quality.verificationStatus,
        currentValue: verificationStatus,
      },
    ],
  };
}
