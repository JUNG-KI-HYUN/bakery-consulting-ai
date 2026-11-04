import type { CandidateComparisonDimensionV1, ProfileReferenceV1 } from "../store-development-core/contracts";
import type { CandidatePhotoCategory } from "../candidate-photo/category";
import type { VerificationStatus } from "../evidence/types";
import type { HardRiskGateStatus } from "../site-grade/hard-risk-gate-types";
import type { SiteGrade } from "../site-grade/types";
import type { SiteCriterionEvaluationResult } from "../site-criteria/evaluation-types";
import type { ReportGenerationScopeV1, StoreDevelopmentReportType } from "./contracts";

export const REPORT_THEME_SCHEMA_VERSION = "frameone.report-theme.v1" as const;
export const HUMAN_CONTRACT_DECISION_SCHEMA_VERSION = "frameone.human-contract-decision.v1" as const;
export const FRANCHISE_REPORT_INPUT_SCHEMA_VERSION = "frameone.franchise-report-input.v1" as const;

export const FRANCHISE_REPORT_PRODUCT_TYPES = Object.freeze([
  "FRANCHISE_CANDIDATE_REVIEW",
  "FRANCHISE_CONTRACT_DECISION",
] as const);

export type FranchiseReportProductType = (typeof FRANCHISE_REPORT_PRODUCT_TYPES)[number];

/** Product purpose is separate from the existing generator/output compatibility type. */
export const LEGACY_REPORT_TYPES_BY_FRANCHISE_PRODUCT: Readonly<
  Record<FranchiseReportProductType, readonly StoreDevelopmentReportType[]>
> = Object.freeze({
  FRANCHISE_CANDIDATE_REVIEW: Object.freeze(["FIELD_BRIEFING", "CANDIDATE_SINGLE", "REGION_REPORT"] as const),
  FRANCHISE_CONTRACT_DECISION: Object.freeze(["DECISION_REPORT", "REGION_REPORT"] as const),
});

export interface ReportThemeV1 {
  readonly schemaVersion: typeof REPORT_THEME_SCHEMA_VERSION;
  readonly themeId: string;
  readonly version: string;
  readonly brandDisplayName: string;
  readonly reportDisplayName: string;
  /** Opaque asset reference only. Filesystem paths, URLs and base64 are forbidden. */
  readonly logoAssetRef: string;
  readonly referenceStoreImageRef?: string;
  readonly coverImageAssetRef?: string;
  readonly colors: Readonly<{
    primary: string;
    accent: string;
    ink: string;
    muted: string;
    surface: string;
    border: string;
  }>;
  readonly footerText: string;
}

export const REPORT_PRESENTATION_AVAILABILITY_STATUSES = Object.freeze([
  "AVAILABLE",
  "UNKNOWN",
  "UNAVAILABLE",
  "SUPPRESSED",
  "CONFLICTED",
  "EXPLICIT_ZERO",
] as const);

export type ReportPresentationAvailabilityStatus =
  (typeof REPORT_PRESENTATION_AVAILABILITY_STATUSES)[number];

/** Customer-safe value. Explicit zero remains a value and is never represented as missing. */
export interface ReportPresentationValueV1 {
  readonly availabilityStatus: ReportPresentationAvailabilityStatus;
  readonly value: string | number | boolean | null;
  readonly displayValue: string;
  readonly unit: string | null;
}

export const REPORT_REDISTRIBUTION_STATUSES = Object.freeze([
  "PUBLIC",
  "CUSTOMER_PROVIDED",
  "INTERNAL_AUTHORIZED",
  "LICENSED_EXTERNAL",
  "RESTRICTED",
  "UNKNOWN",
] as const);

export type ReportRedistributionStatus = (typeof REPORT_REDISTRIBUTION_STATUSES)[number];

export interface SourceProvenancePresentationV1 {
  readonly providerLabel: string;
  readonly sourceTypeLabel: string;
  readonly scopeLabel: string;
  readonly referencePeriod: string;
  readonly verificationStatus: VerificationStatus;
  readonly redistributionStatus: ReportRedistributionStatus;
  readonly limitation: string | null;
}

export interface MarketIntelligencePresentationV1 {
  readonly metricSemantic: string;
  readonly value: ReportPresentationValueV1;
  /** null means no value exists, so actual/estimated semantics cannot be asserted. */
  readonly valueType: "ACTUAL" | "ESTIMATED" | null;
  readonly providerLabel: string;
  readonly scopeLabel: string;
  readonly referencePeriod: string;
  readonly verificationStatus: VerificationStatus;
  readonly limitation: string | null;
  readonly redistributionStatus: ReportRedistributionStatus;
}

export interface BrandCriteriaPresentationV1 {
  readonly criteriaProfileRef: ProfileReferenceV1;
  readonly title: string;
  readonly criteria: readonly Readonly<{
    criterionKey: string;
    label: string;
    targetDisplay: string;
  }>[];
}

export interface CandidateCriteriaPresentationV1 {
  readonly criteriaProfileRef: ProfileReferenceV1;
  readonly evaluationSetId: string;
  readonly evaluations: readonly Readonly<{
    criterionKey: string;
    label: string;
    result: SiteCriterionEvaluationResult;
    observed: ReportPresentationValueV1;
    rationale: string;
  }>[];
}

export interface RiskPresentationV1 {
  readonly hardRiskGateStatus: HardRiskGateStatus;
  readonly summary: string;
  readonly items: readonly Readonly<{
    title: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    statusLabel: string;
    confirmationNeeded: string | null;
  }>[];
}

export interface LeasePresentationV1 {
  readonly area: ReportPresentationValueV1;
  readonly deposit: ReportPresentationValueV1;
  readonly rent: ReportPresentationValueV1;
  readonly maintenance: ReportPresentationValueV1;
  readonly goodwillOrFacilityFee: ReportPresentationValueV1;
  readonly contractConditions: readonly string[];
}

export interface ReportFactPresentationV1 {
  readonly factKey: string;
  readonly label: string;
  readonly value: ReportPresentationValueV1;
}

export interface ReportMapPresentationV1 {
  readonly available: boolean;
  readonly assetRef: string | null;
  readonly sourceLabel: string;
  readonly caption: string;
}

export interface ReportPhotoPresentationV1 {
  readonly photoId: string;
  readonly category: CandidatePhotoCategory;
  readonly assetRef: string;
  readonly caption: string;
  readonly sortOrder: number;
  readonly primary: boolean;
}

export const HUMAN_CONTRACT_DECISIONS = Object.freeze([
  "RECOMMEND",
  "CONDITIONAL_RECOMMEND",
  "HOLD",
  "RISK",
] as const);

export type HumanContractDecisionCode = (typeof HUMAN_CONTRACT_DECISIONS)[number];

/** Authoritative human record. It is never created by Risk, Grade or AI engines. */
export interface HumanContractDecisionV1 {
  readonly schemaVersion: typeof HUMAN_CONTRACT_DECISION_SCHEMA_VERSION;
  readonly decisionId: string;
  readonly candidateStoreId: string;
  readonly decision: HumanContractDecisionCode;
  readonly reasons: readonly string[];
  readonly confirmationNeeded: readonly string[];
  readonly nextActions: readonly string[];
  readonly criteriaEvaluationSetId: string;
  readonly riskSnapshotRef: string;
  readonly decidedAt: string;
  /** Opaque staff actor reference, not a person name or email address. */
  readonly decidedBy: string;
  readonly approvedAt?: string;
}

/** Approved, customer-safe subset of HumanContractDecisionV1. */
export interface HumanContractDecisionPresentationV1 {
  readonly decisionId: string;
  readonly candidateStoreId: string;
  readonly decision: HumanContractDecisionCode;
  readonly reasons: readonly string[];
  readonly confirmationNeeded: readonly string[];
  readonly nextActions: readonly string[];
  readonly decidedAt: string;
  readonly approvedAt: string;
}

export interface CandidateReportProjectionV1 {
  readonly candidateStoreId: string;
  readonly displayCode: string;
  readonly address: string;
  readonly region: string;
  readonly lifecycleLabel: string;
  readonly siteGrade: SiteGrade | "UNKNOWN";
  readonly approvedDecisionRef?: string;
  readonly lease: LeasePresentationV1;
  readonly demandAndBackground: readonly ReportFactPresentationV1[];
  readonly criteriaPresentation: CandidateCriteriaPresentationV1;
  readonly riskPresentation: RiskPresentationV1;
  readonly confirmationNeeded: readonly string[];
  readonly nextActions: readonly string[];
  readonly map: ReportMapPresentationV1;
  readonly photos: readonly ReportPhotoPresentationV1[];
  readonly marketIntelligence: readonly MarketIntelligencePresentationV1[];
  readonly sources: readonly SourceProvenancePresentationV1[];
}

export interface CandidateComparisonProjectionV1 {
  readonly comparisonId: string;
  readonly title: string;
  readonly candidates: readonly Readonly<{
    candidateStoreId: string;
    dimensions: readonly CandidateComparisonDimensionV1[];
  }>[];
}

export const REPORT_EXTENSION_SECTION_STATUSES = Object.freeze([
  "READY",
  "GAP",
  "NOT_APPLICABLE",
] as const);

export type ReportExtensionSectionStatus = (typeof REPORT_EXTENSION_SECTION_STATUSES)[number];

/** V1 passes only a validated payload reference, never unvalidated industry-specific fields. */
export interface ReportExtensionSectionV1 {
  readonly sectionId: string;
  readonly industryProfileId: string;
  readonly title: string;
  readonly status: ReportExtensionSectionStatus;
  readonly payloadRef: string | null;
  readonly limitation: string | null;
}

export const REPORT_SOURCE_SNAPSHOT_DOMAINS = Object.freeze([
  "CANDIDATE",
  "CRITERIA",
  "EVIDENCE",
  "MARKET",
  "PHOTO",
  "RISK",
  "DECISION",
] as const);

export type ReportSourceSnapshotDomain = (typeof REPORT_SOURCE_SNAPSHOT_DOMAINS)[number];

/** RESOLVED requires an exact snapshot and version; GAP makes absence explicit. */
export interface ReportSourceSnapshotReferenceV1 {
  readonly candidateStoreId: string;
  readonly domain: ReportSourceSnapshotDomain;
  readonly status: "RESOLVED" | "GAP";
  readonly snapshotId: string | null;
  readonly version: string | null;
  readonly limitation: string | null;
}

export interface FranchiseReportInputV1 {
  readonly schemaVersion: typeof FRANCHISE_REPORT_INPUT_SCHEMA_VERSION;
  readonly productType: FranchiseReportProductType;
  readonly project: Readonly<{
    projectId: string;
    caseId: string;
    label: string;
  }>;
  readonly scope: ReportGenerationScopeV1;
  readonly presetRef: ProfileReferenceV1;
  readonly brand: Readonly<{
    brandProfileRef: ProfileReferenceV1;
    industryProfileRef: ProfileReferenceV1;
    displayName: string;
  }>;
  readonly theme: ReportThemeV1;
  readonly criteriaPresentation: BrandCriteriaPresentationV1;
  readonly candidates: readonly CandidateReportProjectionV1[];
  readonly comparisonPages: readonly CandidateComparisonProjectionV1[];
  readonly marketIntelligence: readonly MarketIntelligencePresentationV1[];
  readonly extensionSections: readonly ReportExtensionSectionV1[];
  readonly approvedDecisions: readonly HumanContractDecisionPresentationV1[];
  readonly sourceSnapshotRefs: readonly ReportSourceSnapshotReferenceV1[];
  readonly generatedAt: string;
}

/** Contract capability statement: renderer receives projections and performs no domain evaluation. */
export const FRANCHISE_REPORT_ENGINE_RULE_V1 = Object.freeze({
  calculatesValues: false,
  evaluatesCriteria: false,
  evaluatesRisk: false,
  calculatesSiteGrade: false,
  createsFinalDecision: false,
  assemblesPages: true,
  rendersValidatedProjection: true,
} as const);

export type FranchiseReportContractFailureCode =
  | "INVALID_REPORT_THEME"
  | "INVALID_HUMAN_CONTRACT_DECISION"
  | "INVALID_FRANCHISE_REPORT_INPUT";

export interface FranchiseReportContractFailureV1 {
  readonly ok: false;
  readonly code: FranchiseReportContractFailureCode;
  readonly message: string;
  readonly errors: readonly string[];
}

export type FranchiseReportContractValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | FranchiseReportContractFailureV1;
