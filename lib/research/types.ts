export const VERIFICATION_STATUSES = [
  "COLLECTED",
  "REVIEW_REQUIRED",
  "CONFIRMED",
  "EXCLUDED",
] as const;

export const SOURCE_TYPES = [
  "ONLINE_LISTING",
  "BROKER_CONFIRMED",
  "LANDLORD_CONFIRMED",
  "FIELD_CONFIRMED",
  "ACTUAL_CONTRACT",
  "UNKNOWN",
] as const;

export const FRESHNESS_STATUSES = [
  "CURRENT_30D",
  "RECENT_90D",
  "AGED_180D",
  "STALE",
] as const;

export const DUPLICATE_STATUSES = [
  "NO_MATCH",
  "POSSIBLE_DUPLICATE",
  "LIKELY_DUPLICATE",
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export type ResearchSourceType = (typeof SOURCE_TYPES)[number];
export type FreshnessStatus = (typeof FRESHNESS_STATUSES)[number];
export type DuplicateStatus = (typeof DUPLICATE_STATUSES)[number];

export interface ResearchHistoryEvent {
  type: string;
  changedAt: string;
  previousValue?: unknown;
  currentValue?: unknown;
  relatedRecordId?: string | null;
  decision?: string;
  [key: string]: unknown;
}

export interface LeaseResearchRecord {
  schemaVersion: "frameone.lease-research-record.v1.2";
  recordId: string;
  source: {
    sourceUrl: string;
    sourceName: string;
    sourceType: ResearchSourceType;
    collectedAt: string;
    pageTitle: string;
  };
  property: {
    addressRaw: string | null;
    address: string | null;
    floor: string | null;
    contractAreaM2: number | null;
    contractAreaPyeong: number | null;
    exclusiveAreaM2: number | null;
    exclusiveAreaPyeong: number | null;
  };
  lease: {
    depositAmount: number | null;
    rentAmount: number | null;
    managementFeeAmount: number | null;
    managementFeeStatus?: string;
    premiumAmount: number | null;
    premiumStatus: string;
    vatStatus: string;
  };
  optional: {
    parking: string | null;
    moveIn: string | null;
    existingBusinessType: string | null;
    buildingName: string | null;
  };
  quality: {
    verificationStatus: VerificationStatus;
    freshnessStatus: FreshnessStatus;
    duplicateStatus: DuplicateStatus;
    warnings: string[];
    duplicateCandidates?: Array<{
      recordId: string;
      status: DuplicateStatus;
      reasons: string[];
      differences: string[];
    }>;
  };
  evidence: {
    raw: Record<string, unknown>;
    normalized: Record<string, unknown>;
    fieldStatus: Record<string, string>;
    excerpts: Record<string, string | null>;
  };
  history: ResearchHistoryEvent[];
}

export interface RentalMarketFilters {
  floor?: string;
  exclusiveAreaMinPyeong?: number;
  exclusiveAreaMaxPyeong?: number;
  freshness?: FreshnessStatus[];
  sourceTypes?: ResearchSourceType[];
}

export interface NumericSummary {
  sampleCount: number;
  median: number | null;
  min: number | null;
  max: number | null;
}

export interface RentalMarketResult {
  schemaVersion: "frameone.rental-market-analysis.v1";
  filters: RentalMarketFilters;
  sampleCount: number;
  sampleSufficiency: "REFERENCE_ONLY" | "INSUFFICIENT_REFERENCE_ONLY";
  selectedRecordIds: string[];
  sourceComposition: Partial<Record<ResearchSourceType, number>>;
  referenceDate: string;
  deposit: NumericSummary;
  rent: NumericSummary;
  managementFee: NumericSummary;
  rentPerExclusivePyeong: NumericSummary;
  priceHistory: Array<{
    propertyGroupRecordIds: string[];
    previousRecordId: string;
    currentRecordId: string;
    previousCollectedAt: string;
    currentCollectedAt: string;
    changes: Array<{
      field: string;
      previousValue: number | string | null;
      currentValue: number | string | null;
      changeAmount: number | null;
      changeRate: number | null;
    }>;
  }>;
  limitations: string[];
}
