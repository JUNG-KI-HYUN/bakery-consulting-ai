import type { ReportDataReadinessV1 } from "../store-development-report/contracts";
import type { StoreDevelopmentCoreReadinessV1, StoreDevelopmentReadinessCoverageV1 } from "./contracts";
import { PORK33_INDUSTRY_PROFILE_V1 } from "./pork33";
import { deriveStoreDevelopmentCoreReadinessV1, resolveReadinessRequirementsV1 } from "./resolution";

const PORK33_READINESS_KEY_MAP = Object.freeze({
  CANDIDATES: "CANDIDATES",
  MAPS: "MAPS",
  SBIZ365: "MARKET_DATA",
  FIELD_PHOTOS: "FIELD_PHOTOS",
  APARTMENT_AREAS: "AREAS",
  APPROVED_FIELD_SUMMARIES: "FIELD_SUMMARIES",
  SITE_GRADES: "SITE_GRADES",
} as const);

/** 기존 PORK33 readiness를 읽기 전용으로 Core vocabulary에 투영한다. */
export function adaptPork33ReadinessToCoreV1(readiness: ReportDataReadinessV1): StoreDevelopmentCoreReadinessV1 {
  const coverage: StoreDevelopmentReadinessCoverageV1[] = readiness.items.map((item) => ({
    key: PORK33_READINESS_KEY_MAP[item.key],
    availableCount: item.availableCount,
    expectedCount: item.expectedCount ?? 0,
    unknownCount: item.unknownCount,
  }));
  return deriveStoreDevelopmentCoreReadinessV1(resolveReadinessRequirementsV1(PORK33_INDUSTRY_PROFILE_V1), coverage);
}
