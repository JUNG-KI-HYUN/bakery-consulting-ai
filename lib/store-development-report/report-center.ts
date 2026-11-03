import { SITE_GRADES } from "../site-grade/types";
import type { Pork33BriefingAssetIndex, Pork33Sbiz365SnapshotV1 } from "../pork33-candidate-shortlist/briefing-report";
import type { Pork33BriefingScope } from "../pork33-candidate-shortlist/briefing-report";
import type { Pork33DecisionScope } from "../pork33-candidate-shortlist/decision-report";
import { getActivePork33Revision } from "../pork33-candidate-shortlist/state";
import type { Pork33ShortlistStateV1 } from "../pork33-candidate-shortlist/types";
import {
  REPORT_GENERATION_REQUEST_SCHEMA_VERSION,
  STORE_DEVELOPMENT_REPORT_TYPES,
  STORE_DEVELOPMENT_SCOPE_TYPES,
  type ReportDataReadinessItemV1,
  type ReportDataReadinessV1,
  type ReportGenerationRequestV1,
  type ReportGenerationScopeV1,
  type StoreDevelopmentCaseSummaryV1,
  type StoreDevelopmentReportType,
} from "./contracts";
import {
  PORK33_CASE_ID,
  PORK33_STORE_DEVELOPMENT_PRESET_ID,
  PORK33_STORE_DEVELOPMENT_PRESET_V1,
  getReportTemplate,
} from "./presets";

export type Pork33ReportGenerationPlan = {
  sourceGenerator: "PORK33_BRIEFING_V1" | "PORK33_DECISION_V2";
  briefingScope: Pork33BriefingScope | null;
  decisionScope: Pork33DecisionScope | null;
  scopeLabel: string;
  scopeFileToken: string;
  previewUrl: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeFilePart(value: string) {
  const normalized = value.normalize("NFKC").replace(/[<>:"/\\|?*\x00-\x1F]/gu, "_").replace(/\s+/gu, "_").replace(/_+/gu, "_").replace(/^_|_$/gu, "");
  if (!normalized) throw new Error("보고서 파일명에 사용할 값이 없습니다.");
  return normalized;
}

function countStatus(available: number, expected: number) {
  if (expected === 0) return "MISSING" as const;
  if (available === expected) return "READY" as const;
  if (available === 0) return "MISSING" as const;
  return "PARTIAL" as const;
}

function makeCountItem(
  key: ReportDataReadinessItemV1["key"],
  label: string,
  availableCount: number,
  expectedCount: number,
  source: string,
  limitation: string | null,
  overrideStatus?: ReportDataReadinessItemV1["status"],
): ReportDataReadinessItemV1 {
  const status = overrideStatus ?? countStatus(availableCount, expectedCount);
  return {
    key,
    label,
    status,
    availableCount,
    expectedCount,
    unknownCount: Math.max(expectedCount - availableCount, 0),
    display: `${availableCount.toLocaleString("ko-KR")} / ${expectedCount.toLocaleString("ko-KR")}`,
    source,
    limitation,
  };
}

export function buildPork33StoreDevelopmentCase(state: Pork33ShortlistStateV1): StoreDevelopmentCaseSummaryV1 {
  const regionCaseIds = new Set(state.regions.map((region) => region.caseId));
  const candidateCaseIds = new Set(state.candidates.map((candidate) => candidate.draft.caseId));
  if (regionCaseIds.size !== 1 || !regionCaseIds.has(PORK33_CASE_ID) || candidateCaseIds.size !== 1 || !candidateCaseIds.has(PORK33_CASE_ID)) {
    throw new Error("PORK33 Case identity가 현재 Candidate/Region 관계와 일치하지 않습니다.");
  }
  return {
    caseId: PORK33_CASE_ID,
    label: "PORK33 2026-10 후보점포 개발",
    brandName: PORK33_STORE_DEVELOPMENT_PRESET_V1.brandName,
    industryLabel: PORK33_STORE_DEVELOPMENT_PRESET_V1.industryLabel,
    brandProfileId: PORK33_STORE_DEVELOPMENT_PRESET_V1.core.brandProfileRef.id,
    industryProfileId: PORK33_STORE_DEVELOPMENT_PRESET_V1.core.industryProfileRef.id,
    industryProfileVersion: PORK33_STORE_DEVELOPMENT_PRESET_V1.core.industryProfileRef.version,
    presetIds: [PORK33_STORE_DEVELOPMENT_PRESET_ID],
    candidateCount: state.candidates.length,
    regionCount: state.regions.length,
    apartmentAreaCount: state.apartmentAreas.length,
    regions: state.regions.map((region) => ({ regionId: region.regionId, label: region.label })),
    apartmentAreas: state.apartmentAreas.map((area) => ({ apartmentAreaId: area.apartmentAreaId, regionId: area.regionId, label: area.label })),
    candidates: state.candidates
      .slice()
      .sort((left, right) => left.source.sourceRowOrder - right.source.sourceRowOrder)
      .map((candidate) => ({
        candidateStoreId: candidate.identity.candidateStoreId,
        displayCode: candidate.identity.displayCode,
        regionId: candidate.linkage.regionId,
        apartmentAreaId: candidate.linkage.apartmentAreaId,
        address: candidate.normalized.addressFull,
      })),
  };
}

export function derivePork33ReportDataReadiness(
  state: Pork33ShortlistStateV1,
  assets: Pork33BriefingAssetIndex,
  sbiz365ByCandidateId: Record<string, Pork33Sbiz365SnapshotV1>,
  reportType: StoreDevelopmentReportType,
  checkedAt: string,
): ReportDataReadinessV1 {
  const candidateIds = new Set(state.candidates.map((candidate) => candidate.identity.displayCode));
  const expectedCandidates = state.sourceAudit.physicalCandidateRowCount;
  const mapCount = Object.keys(assets.mapsByCandidateId).filter((candidateId) => candidateIds.has(candidateId)).length;
  const sbizCount = Object.keys(sbiz365ByCandidateId).filter((candidateId) => candidateIds.has(candidateId)).length;
  const photoCount = Object.entries(assets.photosByCandidateId).filter(([candidateId, photos]) => candidateIds.has(candidateId) && photos.length > 0).length;
  const approvedCount = state.candidates.filter((candidate) => getActivePork33Revision(candidate)?.status === "APPROVED").length;
  const siteGradeCount = state.candidates.filter((candidate) => SITE_GRADES.includes(candidate.normalized.siteGrade as (typeof SITE_GRADES)[number])).length;
  const expectedAreas = state.sourceAudit.proposedApartmentAreaCount;
  const siteGradeRequired = reportType === "DECISION_REPORT" || reportType === "REGION_REPORT";
  const items: ReportDataReadinessItemV1[] = [
    makeCountItem("CANDIDATES", "후보점포", state.candidates.length, expectedCandidates, "PORK33_FIELD_SOURCE / CURRENT_SNAPSHOT", null),
    makeCountItem("MAPS", "지도", mapCount, expectedCandidates, "USER_PROVIDED_LOCATION_MAP", "지도 누락 시 다른 Candidate 지도를 대체 사용하지 않습니다."),
    makeCountItem("SBIZ365", "SBIZ365", sbizCount, expectedCandidates, "사용자 제공 500m 분석 / V1 SNAPSHOT", "UNKNOWN 값은 Complete로 계산하지 않습니다."),
    makeCountItem("FIELD_PHOTOS", "현장사진", photoCount, expectedCandidates, "FIELD_PHOTO_SOURCE", "사진 누락만으로 보고서 전체를 차단하지 않습니다."),
    makeCountItem("APARTMENT_AREAS", "Apartment Area", state.apartmentAreas.length, expectedAreas, "FIELD_SURVEY / USER_INPUT", "Stable Apartment Area ID 관계 기준입니다."),
    makeCountItem("APPROVED_FIELD_SUMMARIES", "Approved Field Summary", approvedCount, expectedCandidates, "APPROVED_DERIVED_CONTENT", "승인되지 않은 Draft는 Complete로 계산하지 않습니다."),
    makeCountItem("SITE_GRADES", "Site Grade", siteGradeCount, expectedCandidates, "AUTHORITATIVE_STORED", "UNKNOWN을 Grade U 또는 Complete로 변환하지 않습니다.", siteGradeRequired ? undefined : "NOT_REQUIRED"),
  ];
  const criticalKeys = new Set<ReportDataReadinessItemV1["key"]>(["CANDIDATES", "APARTMENT_AREAS"]);
  if (reportType === "DECISION_REPORT" || reportType === "REGION_REPORT") criticalKeys.add("SBIZ365");
  const blocked = items.some((item) => criticalKeys.has(item.key) && item.status !== "READY");
  const hasGaps = items.some((item) => item.status === "PARTIAL" || item.status === "MISSING");
  return {
    schemaVersion: "frameone.report-data-readiness.v1",
    caseId: PORK33_CASE_ID,
    presetId: PORK33_STORE_DEVELOPMENT_PRESET_ID,
    reportType,
    overallStatus: blocked ? "BLOCKED" : hasGaps ? "READY_WITH_GAPS" : "READY",
    checkedAt,
    items,
  };
}

function parseScope(value: unknown): ReportGenerationScopeV1 {
  if (!isRecord(value) || !STORE_DEVELOPMENT_SCOPE_TYPES.includes(value.scopeType as (typeof STORE_DEVELOPMENT_SCOPE_TYPES)[number])) {
    throw new Error("Report Scope가 올바르지 않습니다.");
  }
  if (value.scopeType === "ALL") return { scopeType: "ALL" };
  if (value.scopeType === "REGION" && typeof value.regionId === "string" && value.regionId) return { scopeType: "REGION", regionId: value.regionId };
  if (value.scopeType === "APARTMENT_AREA" && typeof value.apartmentAreaId === "string" && value.apartmentAreaId) return { scopeType: "APARTMENT_AREA", apartmentAreaId: value.apartmentAreaId };
  if (value.scopeType === "CANDIDATE" && typeof value.candidateStoreId === "string" && value.candidateStoreId) return { scopeType: "CANDIDATE", candidateStoreId: value.candidateStoreId };
  throw new Error("Report Scope ID가 필요합니다.");
}

export function parseReportGenerationRequest(value: unknown): ReportGenerationRequestV1 {
  if (!isRecord(value)) throw new Error("Report Generation Request는 객체여야 합니다.");
  if (value.schemaVersion !== REPORT_GENERATION_REQUEST_SCHEMA_VERSION) throw new Error("Report Generation Request schemaVersion이 올바르지 않습니다.");
  if (typeof value.caseId !== "string" || typeof value.presetId !== "string") throw new Error("Case와 Preset이 필요합니다.");
  if (!STORE_DEVELOPMENT_REPORT_TYPES.includes(value.reportType as StoreDevelopmentReportType)) throw new Error("Report Type이 올바르지 않습니다.");
  if (value.outputFormat !== "PDF") throw new Error("현재 고객용 출력은 PDF만 지원합니다.");
  return {
    schemaVersion: REPORT_GENERATION_REQUEST_SCHEMA_VERSION,
    caseId: value.caseId,
    presetId: value.presetId,
    reportType: value.reportType as StoreDevelopmentReportType,
    scope: parseScope(value.scope),
    outputFormat: "PDF",
  };
}

export function resolvePork33ReportGenerationPlan(
  request: ReportGenerationRequestV1,
  state: Pork33ShortlistStateV1,
): Pork33ReportGenerationPlan {
  if (request.caseId !== PORK33_CASE_ID || request.presetId !== PORK33_STORE_DEVELOPMENT_PRESET_ID) throw new Error("Case와 Preset 연결이 올바르지 않습니다.");
  const template = getReportTemplate(PORK33_STORE_DEVELOPMENT_PRESET_V1, request.reportType);
  if (!template || !template.supportedScopes.includes(request.scope.scopeType)) throw new Error("선택한 Report Type에서 지원하지 않는 Scope입니다.");

  if (request.scope.scopeType === "ALL") {
    if (request.reportType === "FIELD_BRIEFING") return {
      sourceGenerator: "PORK33_BRIEFING_V1", briefingScope: { scopeType: "ALL" }, decisionScope: null,
      scopeLabel: "전체", scopeFileToken: "ALL", previewUrl: "/tools/pork33-candidate-shortlist/briefing-preview",
    };
    return {
      sourceGenerator: "PORK33_DECISION_V2", briefingScope: null, decisionScope: { scopeType: "ALL" },
      scopeLabel: "전체", scopeFileToken: "ALL", previewUrl: "/tools/pork33-candidate-shortlist/decision-preview",
    };
  }
  if (request.scope.scopeType === "REGION") {
    const regionId = request.scope.regionId;
    const region = state.regions.find((item) => item.regionId === regionId);
    if (!region) throw new Error("선택한 Region을 찾을 수 없습니다.");
    const query = `?scopeType=REGION&regionId=${encodeURIComponent(region.regionId)}`;
    if (request.reportType === "FIELD_BRIEFING") return {
      sourceGenerator: "PORK33_BRIEFING_V1", briefingScope: { scopeType: "REGION", regionId: region.regionId }, decisionScope: null,
      scopeLabel: region.label, scopeFileToken: safeFilePart(region.label).replace(/_/gu, ""), previewUrl: `/tools/pork33-candidate-shortlist/briefing-preview${query}`,
    };
    return {
      sourceGenerator: "PORK33_DECISION_V2", briefingScope: null, decisionScope: { scopeType: "REGION", regionId: region.regionId },
      scopeLabel: region.label, scopeFileToken: safeFilePart(region.label).replace(/_/gu, ""), previewUrl: `/tools/pork33-candidate-shortlist/decision-preview${query}`,
    };
  }
  if (request.scope.scopeType === "CANDIDATE") {
    const candidateStoreId = request.scope.candidateStoreId;
    const candidate = state.candidates.find((item) => item.identity.candidateStoreId === candidateStoreId);
    if (!candidate) throw new Error("선택한 Candidate를 찾을 수 없습니다.");
    const query = `?scopeType=CANDIDATE&candidateStoreId=${encodeURIComponent(candidate.identity.candidateStoreId)}`;
    return {
      sourceGenerator: "PORK33_BRIEFING_V1", briefingScope: { scopeType: "CANDIDATE", candidateStoreId: candidate.identity.candidateStoreId }, decisionScope: null,
      scopeLabel: candidate.identity.displayCode, scopeFileToken: candidate.identity.displayCode, previewUrl: `/tools/pork33-candidate-shortlist/briefing-preview${query}`,
    };
  }
  throw new Error("PORK33 V1 Report Center에서는 Apartment Area 단독 출력을 지원하지 않습니다.");
}

const reportTypeFileTokens: Record<StoreDevelopmentReportType, string> = {
  FIELD_BRIEFING: "FIELD_BRIEFING",
  DECISION_REPORT: "DECISION_REPORT",
  CANDIDATE_SINGLE: "CANDIDATE_SINGLE",
  REGION_REPORT: "REGION_REPORT",
};

export function buildStoreDevelopmentReportFileName(
  request: ReportGenerationRequestV1,
  plan: Pork33ReportGenerationPlan,
  date: Date,
) {
  const ymd = date.toISOString().slice(0, 10).replace(/-/gu, "");
  return `FRAMEONE_${PORK33_STORE_DEVELOPMENT_PRESET_V1.brandFileToken}_${reportTypeFileTokens[request.reportType]}_${safeFilePart(plan.scopeFileToken)}_${ymd}.pdf`;
}
