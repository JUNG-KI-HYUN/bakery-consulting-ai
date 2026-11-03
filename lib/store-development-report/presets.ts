import type { ReportPresetV1, StoreDevelopmentReportType } from "./contracts";
import { PORK33_REPORT_CORE_BINDING_V1 } from "../store-development-core/pork33";

export const PORK33_CASE_ID = "case_pork33_field_2026_10" as const;
export const PORK33_STORE_DEVELOPMENT_PRESET_ID = "PORK33_STORE_DEVELOPMENT_V1" as const;

export const PORK33_STORE_DEVELOPMENT_PRESET_V1: ReportPresetV1 = Object.freeze({
  schemaVersion: "frameone.report-preset.v1",
  presetId: PORK33_STORE_DEVELOPMENT_PRESET_ID,
  presetVersion: "1",
  brandName: "포크33",
  brandFileToken: "PORK33",
  reportTitle: "포크33 점포개발 후보점포 보고서",
  industryCode: "PORK33_MEAT_FRESH_RETAIL",
  industryLabel: "정육·신선식품 소매",
  competitorLabel: "정육점",
  candidateCriteriaProfileId: "pork33-site-criteria",
  templates: [
    {
      reportType: "FIELD_BRIEFING",
      label: "후보점포 브리핑",
      description: "지역개요 + 후보상세 + 확보된 현장사진",
      supportedScopes: ["ALL", "REGION"],
      generatorVersion: "PORK33_AUTOMATED_BRIEFING_REPORT_V1",
    },
    {
      reportType: "DECISION_REPORT",
      label: "의사결정 리포트",
      description: "Region Demand + Apartment Area + Candidate Compare + 후보상세",
      supportedScopes: ["ALL", "REGION"],
      generatorVersion: "PORK33_DECISION_REPORT_V2",
    },
    {
      reportType: "CANDIDATE_SINGLE",
      label: "후보 단독 리포트",
      description: "선택 Candidate 상세 + 확보된 현장사진",
      supportedScopes: ["CANDIDATE"],
      generatorVersion: "PORK33_AUTOMATED_BRIEFING_REPORT_V1",
    },
    {
      reportType: "REGION_REPORT",
      label: "지역 의사결정 리포트",
      description: "선택 Region의 수요·Apartment Area·후보비교·후보상세",
      supportedScopes: ["REGION"],
      generatorVersion: "PORK33_DECISION_REPORT_V2",
    },
  ],
  sections: [
    "regionOverview",
    "regionDemand",
    "apartmentArea",
    "candidateCompare",
    "candidateDetail",
    "fieldPhoto",
  ],
  terminology: {
    candidate: "후보점포",
    region: "Region",
    apartmentArea: "Apartment Area",
    competitor: "정육점",
  },
  disclaimer: [
    "본 보고서는 현장조사 및 사용자 제공 자료를 기반으로 한 점포개발 검토자료입니다.",
    "Site Grade는 입지 조건 적합도 분류이며 출점 성공확률·계약추천·매출 가능성을 의미하지 않습니다.",
    "매출, 법률, 계약, 시설 가능 여부를 보장하지 않으며 미확인 항목은 별도 확인이 필요합니다.",
  ],
  core: PORK33_REPORT_CORE_BINDING_V1,
} as const satisfies ReportPresetV1);

export const STORE_DEVELOPMENT_REPORT_PRESETS_V1 = [PORK33_STORE_DEVELOPMENT_PRESET_V1] as const;

export function getStoreDevelopmentReportPreset(presetId: string) {
  return STORE_DEVELOPMENT_REPORT_PRESETS_V1.find((preset) => preset.presetId === presetId) ?? null;
}

export function getReportTemplate(preset: ReportPresetV1, reportType: StoreDevelopmentReportType) {
  return preset.templates.find((template) => template.reportType === reportType) ?? null;
}
