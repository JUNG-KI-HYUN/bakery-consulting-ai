import type { SiteCriteriaProfileV1 } from "../site-criteria/types";
import {
  BRAND_PROFILE_SCHEMA_VERSION,
  INDUSTRY_EXTENSION_SCHEMA_VERSION,
  INDUSTRY_PROFILE_SCHEMA_VERSION,
  STORE_DEVELOPMENT_CANDIDATE_DIMENSIONS,
  STORE_DEVELOPMENT_REPORT_SECTIONS,
  type BrandProfileV1,
  type IndustryExtensionV1,
  type IndustryProfileV1,
  type StoreDevelopmentCoreReadinessV1,
  type StoreDevelopmentReadinessCoverageV1,
  type StoreDevelopmentReadinessKey,
  type StoreDevelopmentReadinessRequirementV1,
} from "./contracts";

function unique<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...new Set(values)]);
}

function requireNonEmpty(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label}가 필요합니다.`);
}

function assertKnownDimensions(values: readonly string[], label: string) {
  const known = new Set<string>(STORE_DEVELOPMENT_CANDIDATE_DIMENSIONS);
  const unknown = values.filter((value) => !known.has(value));
  if (unknown.length > 0) throw new Error(`${label}에 알 수 없는 Dimension이 있습니다: ${unknown.join(", ")}`);
  if (new Set(values).size !== values.length) throw new Error(`${label}에 중복 Dimension이 있습니다.`);
}

function assertKnownSections(values: readonly string[], label: string) {
  const known = new Set<string>(STORE_DEVELOPMENT_REPORT_SECTIONS);
  const unknown = values.filter((value) => !known.has(value));
  if (unknown.length > 0) throw new Error(`${label}에 알 수 없는 Report Section이 있습니다: ${unknown.join(", ")}`);
  if (new Set(values).size !== values.length) throw new Error(`${label}에 중복 Report Section이 있습니다.`);
}

function assertUniqueNonEmpty(values: readonly string[], label: string) {
  if (values.some((value) => !value.trim())) throw new Error(`${label}에 빈 값이 있습니다.`);
  if (new Set(values).size !== values.length) throw new Error(`${label}에 중복 값이 있습니다.`);
}

/** 계약 정합성만 확인한다. 후보 평가, Grade, Risk 또는 Confidence를 계산하지 않는다. */
export function assertIndustryProfileV1(profile: IndustryProfileV1): IndustryProfileV1 {
  if (profile.schemaVersion !== INDUSTRY_PROFILE_SCHEMA_VERSION) throw new Error("IndustryProfile schemaVersion이 올바르지 않습니다.");
  requireNonEmpty(profile.industryId, "industryId");
  requireNonEmpty(profile.version, "IndustryProfile version");
  requireNonEmpty(profile.name, "IndustryProfile name");
  requireNonEmpty(profile.category, "IndustryProfile category");
  requireNonEmpty(profile.competitorTerminology, "competitorTerminology");
  assertKnownDimensions(profile.requiredDimensions, "requiredDimensions");
  assertKnownDimensions(profile.optionalDimensions, "optionalDimensions");
  assertKnownSections(profile.reportSections, "reportSections");
  const overlap = profile.requiredDimensions.filter((dimension) => profile.optionalDimensions.includes(dimension));
  if (overlap.length > 0) throw new Error(`Required/Optional Dimension이 겹칩니다: ${overlap.join(", ")}`);
  if (new Set(profile.extensionIds).size !== profile.extensionIds.length) throw new Error("extensionIds에 중복 값이 있습니다.");
  return profile;
}

export function assertBrandProfileV1(
  brand: BrandProfileV1,
  industry: IndustryProfileV1,
  criteria: SiteCriteriaProfileV1,
): BrandProfileV1 {
  if (brand.schemaVersion !== BRAND_PROFILE_SCHEMA_VERSION) throw new Error("BrandProfile schemaVersion이 올바르지 않습니다.");
  requireNonEmpty(brand.brandId, "brandId");
  requireNonEmpty(brand.version, "BrandProfile version");
  requireNonEmpty(brand.name, "BrandProfile name");
  if (brand.industryProfileRef.id !== industry.industryId || brand.industryProfileRef.version !== industry.version) {
    throw new Error("BrandProfile의 IndustryProfile 참조가 일치하지 않습니다.");
  }
  if (brand.criteriaProfileRef.profileId !== criteria.profileId || brand.criteriaProfileRef.profileVersion !== criteria.profileVersion) {
    throw new Error("BrandProfile의 SiteCriteriaProfile 참조가 일치하지 않습니다.");
  }
  if (criteria.profileScope !== "BRAND_SPECIFIC") throw new Error("BrandProfile은 BRAND_SPECIFIC SiteCriteriaProfile을 참조해야 합니다.");
  if (criteria.brandId && criteria.brandId !== brand.brandId) throw new Error("SiteCriteriaProfile의 brandId가 BrandProfile과 일치하지 않습니다.");
  if (!criteria.brandId && criteria.brandLabel !== brand.brandId && criteria.brandLabel !== brand.name) {
    throw new Error("SiteCriteriaProfile의 brand identity가 BrandProfile과 일치하지 않습니다.");
  }
  return brand;
}

function assertExtension(extension: IndustryExtensionV1, industry: IndustryProfileV1) {
  if (extension.schemaVersion !== INDUSTRY_EXTENSION_SCHEMA_VERSION) throw new Error(`${extension.extensionId} schemaVersion이 올바르지 않습니다.`);
  if (!extension.industryIds.includes(industry.industryId)) throw new Error(`${extension.extensionId} Extension은 ${industry.industryId}에 적용할 수 없습니다.`);
  if (!industry.extensionIds.includes(extension.extensionId)) throw new Error(`${extension.extensionId} Extension은 IndustryProfile에 선언되지 않았습니다.`);
  assertUniqueNonEmpty(extension.additionalDimensions, `${extension.extensionId}.additionalDimensions`);
  assertUniqueNonEmpty(extension.reportSections, `${extension.extensionId}.reportSections`);
}

export function resolveIndustryDimensionsV1(
  industry: IndustryProfileV1,
  extensions: readonly IndustryExtensionV1[] = [],
): readonly string[] {
  assertIndustryProfileV1(industry);
  extensions.forEach((extension) => assertExtension(extension, industry));
  return unique([
    ...industry.requiredDimensions,
    ...industry.optionalDimensions,
    ...extensions.flatMap((extension) => extension.additionalDimensions),
  ]);
}

export function resolveReportSectionsV1(
  industry: IndustryProfileV1,
  extensions: readonly IndustryExtensionV1[] = [],
): readonly string[] {
  assertIndustryProfileV1(industry);
  extensions.forEach((extension) => assertExtension(extension, industry));
  return unique([...industry.reportSections, ...extensions.flatMap((extension) => extension.reportSections)]);
}

export function resolveTerminologyV1(
  industry: IndustryProfileV1,
  brandOverrides: Readonly<Record<string, string>> = {},
): Readonly<Record<string, string>> {
  assertIndustryProfileV1(industry);
  return Object.freeze({
    candidate: "후보점포",
    region: "Region",
    area: "분석권역",
    competitor: industry.competitorTerminology,
    ...brandOverrides,
  });
}

export function resolveReadinessRequirementsV1(
  industry: IndustryProfileV1,
  extensions: readonly IndustryExtensionV1[] = [],
): readonly StoreDevelopmentReadinessRequirementV1[] {
  const dimensions = new Set(resolveIndustryDimensionsV1(industry, extensions));
  const sections = new Set(resolveReportSectionsV1(industry, extensions));
  const requirements: StoreDevelopmentReadinessRequirementV1[] = [
    { key: "CANDIDATES", required: true, blocking: true },
    { key: "MAPS", required: dimensions.has("LOCATION"), blocking: false },
    { key: "MARKET_DATA", required: ["RESIDENTIAL_DEMAND", "COMMERCIAL_DEMAND", "COMPETITION"].some((value) => dimensions.has(value)), blocking: true },
    { key: "FIELD_PHOTOS", required: sections.has("FIELD_PHOTO"), blocking: false },
    { key: "AREAS", required: sections.has("AREA_ANALYSIS") || sections.has("REGION_DEMAND"), blocking: true },
    { key: "FIELD_SUMMARIES", required: sections.has("CANDIDATE_SUMMARY") || sections.has("CANDIDATE_COMPARE"), blocking: false },
    { key: "SITE_GRADES", required: sections.has("CANDIDATE_COMPARE") || sections.has("RISK_SUMMARY") || sections.has("FINAL_SHORTLIST"), blocking: false },
    ...extensions.map((extension) => ({ key: `EXTENSION:${extension.extensionId}` as const, required: true, blocking: false })),
  ];
  return Object.freeze(requirements.map((item) => Object.freeze(item)));
}

export function deriveStoreDevelopmentCoreReadinessV1(
  requirements: readonly StoreDevelopmentReadinessRequirementV1[],
  coverage: readonly StoreDevelopmentReadinessCoverageV1[],
): StoreDevelopmentCoreReadinessV1 {
  const byKey = new Map<StoreDevelopmentReadinessKey, StoreDevelopmentReadinessCoverageV1>();
  for (const item of coverage) {
    if (byKey.has(item.key)) throw new Error(`Readiness coverage에 중복 key ${item.key}가 있습니다.`);
    if (![item.availableCount, item.expectedCount, item.unknownCount].every((value) => Number.isInteger(value) && value >= 0)) {
      throw new Error(`${item.key} Readiness count가 올바르지 않습니다.`);
    }
    if (item.availableCount > item.expectedCount || item.unknownCount > item.expectedCount) throw new Error(`${item.key} Readiness count가 expectedCount를 초과합니다.`);
    byKey.set(item.key, item);
  }
  const items = requirements.map((requirement) => {
    const value = byKey.get(requirement.key) ?? { key: requirement.key, availableCount: 0, expectedCount: 0, unknownCount: 0 };
    const status = !requirement.required
      ? "NOT_REQUIRED" as const
      : value.expectedCount > 0 && value.availableCount === value.expectedCount && value.unknownCount === 0
        ? "READY" as const
        : value.availableCount > 0
          ? "PARTIAL" as const
          : "MISSING" as const;
    return Object.freeze({ ...value, required: requirement.required, blocking: requirement.blocking, status });
  });
  const blocked = items.some((item) => item.required && item.blocking && item.status !== "READY");
  const gaps = items.some((item) => item.required && item.status !== "READY");
  return Object.freeze({
    overallStatus: blocked ? "BLOCKED" : gaps ? "READY_WITH_GAPS" : "READY",
    items: Object.freeze(items),
  });
}
