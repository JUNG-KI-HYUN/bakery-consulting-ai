export const INDUSTRY_PROFILE_SCHEMA_VERSION = "frameone.store-development-industry-profile.v1" as const;
export const BRAND_PROFILE_SCHEMA_VERSION = "frameone.store-development-brand-profile.v1" as const;
export const INDUSTRY_EXTENSION_SCHEMA_VERSION = "frameone.store-development-industry-extension.v1" as const;

export const STORE_DEVELOPMENT_CORE_CONCEPTS = Object.freeze([
  "CASE",
  "BRAND",
  "INDUSTRY_PROFILE",
  "REGION",
  "LOCALITY",
  "COMMERCIAL_AREA",
  "ANALYSIS_AREA",
  "CANDIDATE",
  "LIFECYCLE",
  "SURVEY",
  "MAP",
  "PHOTO",
  "EVIDENCE",
  "RESIDENTIAL_DEMAND",
  "COMPETITION",
  "MARKET_DATA",
  "LEASE",
  "SITE_CRITERIA",
  "EVALUATION",
  "SITE_GRADE",
  "EVIDENCE_CONFIDENCE",
  "HARD_RISK",
  "CANDIDATE_COMPARE",
  "DECISION",
  "REPORT_GENERATION",
] as const);

export const STORE_DEVELOPMENT_CANDIDATE_DIMENSIONS = Object.freeze([
  "LOCATION",
  "ACCESSIBILITY",
  "VISIBILITY",
  "PEDESTRIAN_FLOW",
  "RESIDENTIAL_DEMAND",
  "COMMERCIAL_DEMAND",
  "COMPETITION",
  "VEHICLE_ACCESS",
  "SHORT_STOP",
  "PARKING",
  "LEASE_COST",
  "DEPOSIT",
  "MANAGEMENT_FEE",
  "GOODWILL",
  "AREA_SIZE",
  "FLOOR",
  "FRONTAGE",
  "SIGNAGE",
  "ENTRY_LOCATION",
  "SPACE_CONDITION",
  "CONTRACT_RISK",
  "EVIDENCE_COMPLETENESS",
] as const);

export const STORE_DEVELOPMENT_REPORT_SECTIONS = Object.freeze([
  "REGION_OVERVIEW",
  "REGION_DEMAND",
  "AREA_ANALYSIS",
  "CANDIDATE_COMPARE",
  "CANDIDATE_SUMMARY",
  "FIELD_PHOTO",
  "LEASE_REVIEW",
  "RISK_SUMMARY",
  "FINAL_SHORTLIST",
  "SOURCE",
] as const);

export const CANDIDATE_COMPARISON_EVALUATIONS = Object.freeze([
  "MATCH",
  "REVIEW",
  "GAP",
  "UNKNOWN",
] as const);

export const STORE_DEVELOPMENT_EVIDENCE_STATUSES = Object.freeze([
  "VERIFIED",
  "ESTIMATED",
  "UNKNOWN",
  "CONFLICTED",
  "STALE",
] as const);

export type StoreDevelopmentCandidateDimension = (typeof STORE_DEVELOPMENT_CANDIDATE_DIMENSIONS)[number];
export type StoreDevelopmentReportSection = (typeof STORE_DEVELOPMENT_REPORT_SECTIONS)[number];
export type CandidateComparisonEvaluation = (typeof CANDIDATE_COMPARISON_EVALUATIONS)[number];
export type StoreDevelopmentEvidenceStatus = (typeof STORE_DEVELOPMENT_EVIDENCE_STATUSES)[number];

export interface IndustryProfileV1 {
  readonly schemaVersion: typeof INDUSTRY_PROFILE_SCHEMA_VERSION;
  readonly industryId: string;
  readonly version: string;
  readonly name: string;
  readonly category: string;
  readonly competitorTerminology: string;
  readonly requiredDimensions: readonly StoreDevelopmentCandidateDimension[];
  readonly optionalDimensions: readonly StoreDevelopmentCandidateDimension[];
  readonly reportSections: readonly StoreDevelopmentReportSection[];
  readonly extensionIds: readonly string[];
}

export interface ProfileReferenceV1 {
  readonly id: string;
  readonly version: string;
}

export interface SiteCriteriaProfileReferenceV1 {
  readonly profileId: string;
  readonly profileVersion: string;
}

export interface BrandProfileV1 {
  readonly schemaVersion: typeof BRAND_PROFILE_SCHEMA_VERSION;
  readonly brandId: string;
  readonly version: string;
  readonly name: string;
  readonly industryProfileRef: ProfileReferenceV1;
  readonly criteriaProfileRef: SiteCriteriaProfileReferenceV1;
  readonly terminology: Readonly<Record<string, string>>;
  readonly reportPresetIds: readonly string[];
}

export interface IndustryExtensionV1 {
  readonly schemaVersion: typeof INDUSTRY_EXTENSION_SCHEMA_VERSION;
  readonly extensionId: string;
  readonly version: string;
  readonly industryIds: readonly string[];
  readonly additionalDimensions: readonly string[];
  readonly reportSections: readonly string[];
}

export interface CandidateComparisonDimensionV1 {
  readonly dimensionId: string;
  readonly label: string;
  readonly displayValue: string;
  readonly evaluation: CandidateComparisonEvaluation;
  readonly evidenceStatus: StoreDevelopmentEvidenceStatus;
}

export interface StoreDevelopmentReportCoreBindingV1 {
  readonly brandProfileRef: ProfileReferenceV1;
  readonly industryProfileRef: ProfileReferenceV1;
  readonly criteriaProfileRef: SiteCriteriaProfileReferenceV1;
  readonly terminology: Readonly<Record<string, string>>;
  readonly sections: readonly string[];
  readonly dimensions: readonly string[];
  readonly disclaimer: readonly string[];
  readonly extensionRefs: readonly ProfileReferenceV1[];
}

export const STORE_DEVELOPMENT_READINESS_KEYS = Object.freeze([
  "CANDIDATES",
  "MAPS",
  "MARKET_DATA",
  "FIELD_PHOTOS",
  "AREAS",
  "FIELD_SUMMARIES",
  "SITE_GRADES",
] as const);

export type StoreDevelopmentReadinessKey =
  | (typeof STORE_DEVELOPMENT_READINESS_KEYS)[number]
  | `EXTENSION:${string}`;

export interface StoreDevelopmentReadinessRequirementV1 {
  readonly key: StoreDevelopmentReadinessKey;
  readonly required: boolean;
  readonly blocking: boolean;
}

export interface StoreDevelopmentReadinessCoverageV1 {
  readonly key: StoreDevelopmentReadinessKey;
  readonly availableCount: number;
  readonly expectedCount: number;
  readonly unknownCount: number;
}

export interface StoreDevelopmentCoreReadinessItemV1 extends StoreDevelopmentReadinessCoverageV1 {
  readonly required: boolean;
  readonly blocking: boolean;
  readonly status: "READY" | "PARTIAL" | "MISSING" | "NOT_REQUIRED";
}

export interface StoreDevelopmentCoreReadinessV1 {
  readonly overallStatus: "READY" | "READY_WITH_GAPS" | "BLOCKED";
  readonly items: readonly StoreDevelopmentCoreReadinessItemV1[];
}
