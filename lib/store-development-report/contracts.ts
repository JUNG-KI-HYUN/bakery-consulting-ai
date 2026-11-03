import type { StoreDevelopmentReportCoreBindingV1 } from "../store-development-core/contracts";

export const REPORT_PRESET_SCHEMA_VERSION = "frameone.report-preset.v1" as const;
export const REPORT_GENERATION_REQUEST_SCHEMA_VERSION = "frameone.report-generation-request.v1" as const;
export const REPORT_DATA_READINESS_SCHEMA_VERSION = "frameone.report-data-readiness.v1" as const;
export const REPORT_GENERATION_RESULT_SCHEMA_VERSION = "frameone.report-generation-result.v1" as const;

export const STORE_DEVELOPMENT_REPORT_TYPES = [
  "FIELD_BRIEFING",
  "DECISION_REPORT",
  "CANDIDATE_SINGLE",
  "REGION_REPORT",
] as const;

export const STORE_DEVELOPMENT_SCOPE_TYPES = ["ALL", "REGION", "APARTMENT_AREA", "CANDIDATE"] as const;
export const REPORT_READINESS_STATUSES = ["READY", "PARTIAL", "MISSING", "NOT_REQUIRED"] as const;
export const REPORT_OVERALL_READINESS_STATUSES = ["READY", "READY_WITH_GAPS", "BLOCKED"] as const;

export type StoreDevelopmentReportType = (typeof STORE_DEVELOPMENT_REPORT_TYPES)[number];
export type StoreDevelopmentScopeType = (typeof STORE_DEVELOPMENT_SCOPE_TYPES)[number];
export type ReportReadinessStatus = (typeof REPORT_READINESS_STATUSES)[number];
export type ReportOverallReadinessStatus = (typeof REPORT_OVERALL_READINESS_STATUSES)[number];

export type ReportGenerationScopeV1 =
  | { scopeType: "ALL" }
  | { scopeType: "REGION"; regionId: string }
  | { scopeType: "APARTMENT_AREA"; apartmentAreaId: string }
  | { scopeType: "CANDIDATE"; candidateStoreId: string };

export interface ReportTemplateV1 {
  reportType: StoreDevelopmentReportType;
  label: string;
  description: string;
  supportedScopes: readonly StoreDevelopmentScopeType[];
  generatorVersion: string;
}
export interface ReportPresetV1 {
  schemaVersion: typeof REPORT_PRESET_SCHEMA_VERSION;
  presetId: string;
  presetVersion: string;
  brandName: string;
  brandFileToken: string;
  reportTitle: string;
  industryCode: string;
  industryLabel: string;
  competitorLabel: string;
  candidateCriteriaProfileId: string;
  templates: readonly ReportTemplateV1[];
  sections: readonly string[];
  terminology: Readonly<Record<string, string>>;
  disclaimer: readonly string[];
  core: StoreDevelopmentReportCoreBindingV1;
}
export interface ReportGenerationRequestV1 {
  schemaVersion: typeof REPORT_GENERATION_REQUEST_SCHEMA_VERSION;
  caseId: string;
  presetId: string;
  reportType: StoreDevelopmentReportType;
  scope: ReportGenerationScopeV1;
  outputFormat: "PDF";
}
export interface ReportDataReadinessItemV1 {
  key: "CANDIDATES" | "MAPS" | "SBIZ365" | "FIELD_PHOTOS" | "APARTMENT_AREAS" | "APPROVED_FIELD_SUMMARIES" | "SITE_GRADES";
  label: string;
  status: ReportReadinessStatus;
  availableCount: number;
  expectedCount: number | null;
  unknownCount: number;
  display: string;
  source: string;
  limitation: string | null;
}
export interface ReportDataReadinessV1 {
  schemaVersion: typeof REPORT_DATA_READINESS_SCHEMA_VERSION;
  caseId: string;
  presetId: string;
  reportType: StoreDevelopmentReportType;
  overallStatus: ReportOverallReadinessStatus;
  checkedAt: string;
  items: readonly ReportDataReadinessItemV1[];
}
export interface ReportGenerationResultV1 {
  schemaVersion: typeof REPORT_GENERATION_RESULT_SCHEMA_VERSION;
  generationId: string;
  generatedAt: string;
  caseId: string;
  presetId: string;
  reportType: StoreDevelopmentReportType;
  scope: ReportGenerationScopeV1;
  outputFormat: "PDF";
  status: "COMPLETED";
  fileName: string;
  pageCount: number;
  downloadUrl: string;
  sourceGenerator: "PORK33_BRIEFING_V1" | "PORK33_DECISION_V2";
  sourceStateSnapshotId: string;
  sourceSbizSnapshotBatchId: string;
}
export interface StoreDevelopmentCaseSummaryV1 {
  caseId: string;
  label: string;
  brandName: string;
  industryLabel: string;
  brandProfileId: string;
  industryProfileId: string;
  industryProfileVersion: string;
  presetIds: readonly string[];
  candidateCount: number;
  regionCount: number;
  apartmentAreaCount: number;
  regions: ReadonlyArray<{ regionId: string; label: string }>;
  apartmentAreas: ReadonlyArray<{ apartmentAreaId: string; regionId: string; label: string }>;
  candidates: ReadonlyArray<{ candidateStoreId: string; displayCode: string; regionId: string; apartmentAreaId: string; address: string }>;
}
export interface ReportOutputHistoryItemV1 {
  historyId: string;
  generatedAt: string;
  caseId: string;
  presetId: string;
  reportType: StoreDevelopmentReportType;
  scopeLabel: string;
  pageCount: number;
  fileName: string;
  downloadUrl: string;
  source: "REPORT_CENTER" | "PORK33_EXISTING_OUTPUT";
}
export interface StoreDevelopmentReportCenterWorkspaceV1 {
  schemaVersion: "frameone.store-development-report-center-workspace.v1";
  cases: readonly StoreDevelopmentCaseSummaryV1[];
  presets: readonly ReportPresetV1[];
  readinessByReportType: Readonly<Record<StoreDevelopmentReportType, ReportDataReadinessV1>>;
  history: readonly ReportOutputHistoryItemV1[];
}
