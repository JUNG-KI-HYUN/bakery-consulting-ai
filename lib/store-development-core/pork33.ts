import {
  BRAND_PROFILE_SCHEMA_VERSION,
  INDUSTRY_PROFILE_SCHEMA_VERSION,
  STORE_DEVELOPMENT_CANDIDATE_DIMENSIONS,
  STORE_DEVELOPMENT_REPORT_SECTIONS,
  type BrandProfileV1,
  type IndustryProfileV1,
  type StoreDevelopmentCandidateDimension,
  type StoreDevelopmentReportCoreBindingV1,
} from "./contracts";
import { resolveIndustryDimensionsV1, resolveTerminologyV1 } from "./resolution";
import { PORK33_SITE_CRITERIA_PROFILE_V1 } from "../site-criteria/pork33";

const PORK33_REQUIRED_DIMENSIONS = Object.freeze([
  "RESIDENTIAL_DEMAND",
  "PEDESTRIAN_FLOW",
  "VISIBILITY",
  "SHORT_STOP",
  "LEASE_COST",
  "COMPETITION",
] as const satisfies readonly StoreDevelopmentCandidateDimension[]);
const pork33RequiredDimensionSet = new Set<StoreDevelopmentCandidateDimension>(PORK33_REQUIRED_DIMENSIONS);

export const PORK33_INDUSTRY_PROFILE_V1: IndustryProfileV1 = Object.freeze({
  schemaVersion: INDUSTRY_PROFILE_SCHEMA_VERSION,
  industryId: "MEAT_RETAIL",
  version: "1",
  name: "정육·신선식품 소매",
  category: "RETAIL",
  competitorTerminology: "정육점",
  requiredDimensions: PORK33_REQUIRED_DIMENSIONS,
  optionalDimensions: Object.freeze(STORE_DEVELOPMENT_CANDIDATE_DIMENSIONS.filter((dimension) => !pork33RequiredDimensionSet.has(dimension))),
  reportSections: STORE_DEVELOPMENT_REPORT_SECTIONS,
  extensionIds: Object.freeze([]),
});

export const PORK33_BRAND_PROFILE_V1: BrandProfileV1 = Object.freeze({
  schemaVersion: BRAND_PROFILE_SCHEMA_VERSION,
  brandId: "PORK33",
  version: "1",
  name: "포크33",
  industryProfileRef: Object.freeze({ id: PORK33_INDUSTRY_PROFILE_V1.industryId, version: PORK33_INDUSTRY_PROFILE_V1.version }),
  criteriaProfileRef: Object.freeze({
    profileId: PORK33_SITE_CRITERIA_PROFILE_V1.profileId,
    profileVersion: PORK33_SITE_CRITERIA_PROFILE_V1.profileVersion,
  }),
  terminology: Object.freeze({ apartmentArea: "Apartment Area" }),
  reportPresetIds: Object.freeze(["PORK33_STORE_DEVELOPMENT_V1"]),
});

export const PORK33_REPORT_CORE_BINDING_V1: StoreDevelopmentReportCoreBindingV1 = Object.freeze({
  brandProfileRef: Object.freeze({ id: PORK33_BRAND_PROFILE_V1.brandId, version: PORK33_BRAND_PROFILE_V1.version }),
  industryProfileRef: PORK33_BRAND_PROFILE_V1.industryProfileRef,
  criteriaProfileRef: PORK33_BRAND_PROFILE_V1.criteriaProfileRef,
  terminology: resolveTerminologyV1(PORK33_INDUSTRY_PROFILE_V1, PORK33_BRAND_PROFILE_V1.terminology),
  sections: PORK33_INDUSTRY_PROFILE_V1.reportSections,
  dimensions: resolveIndustryDimensionsV1(PORK33_INDUSTRY_PROFILE_V1),
  disclaimer: Object.freeze([
    "본 보고서는 현장조사 및 사용자 제공 자료를 기반으로 한 점포개발 검토자료입니다.",
    "Site Grade는 입지 조건 적합도 분류이며 출점 성공확률·계약추천·매출 가능성을 의미하지 않습니다.",
    "매출, 법률, 계약, 시설 가능 여부를 보장하지 않으며 미확인 항목은 별도 확인이 필요합니다.",
  ]),
  extensionRefs: Object.freeze([]),
});
