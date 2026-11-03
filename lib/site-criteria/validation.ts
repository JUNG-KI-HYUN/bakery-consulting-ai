import {
  SITE_CRITERIA_COMPARISON_TYPES,
  SITE_CRITERIA_IMPORTANCE,
  SITE_CRITERIA_PROFILE_SCHEMA_VERSION,
  type SiteCriteriaComparisonType,
  type SiteCriteriaImportance,
  type SiteCriteriaProfileScope,
  type SiteCriteriaProfileV1,
  type SiteCriteriaValidationResult,
  type SiteCriterionTarget,
  type SiteCriterionV1,
} from "./types";
import type { ConfirmationRequirement } from "../evidence/types";

const PROFILE_KEYS = new Set([
  "schemaVersion",
  "profileId",
  "profileVersion",
  "profileScope",
  "brandId",
  "brandLabel",
  "industry",
  "storeFormat",
  "criteria",
  "createdAt",
]);

const CRITERION_KEYS = new Set([
  "key",
  "label",
  "importance",
  "comparisonType",
  "target",
  "unit",
  "evidenceRequirement",
  "note",
]);

const CONFIRMATION_REQUIREMENTS = new Set<ConfirmationRequirement>([
  "NONE",
  "FIELD_CHECK_REQUIRED",
  "OWNER_CONFIRMATION_REQUIRED",
  "AGENT_CONFIRMATION_REQUIRED",
  "EXPERT_CONFIRMATION_REQUIRED",
  "AUTHORITY_CONFIRMATION_REQUIRED",
  "DOCUMENT_REQUIRED",
  "NO_SOURCE_AVAILABLE",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value === value.trim();
}

function reportUnknownKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  errors: string[],
) {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) errors.push(`${path}.${key}는 Site Criteria Profile V1 필드가 아닙니다.`);
  }
}

function isImportance(value: unknown): value is SiteCriteriaImportance {
  return typeof value === "string"
    && (SITE_CRITERIA_IMPORTANCE as readonly string[]).includes(value);
}

function isComparisonType(value: unknown): value is SiteCriteriaComparisonType {
  return typeof value === "string"
    && (SITE_CRITERIA_COMPARISON_TYPES as readonly string[]).includes(value);
}

function isTarget(value: unknown): value is SiteCriterionTarget {
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0 && value.every(isTarget);
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([key, child]) => key.trim() !== "" && isTarget(child));
}

function freezeTarget(value: SiteCriterionTarget): SiteCriterionTarget {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeTarget));
  if (isRecord(value)) {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, freezeTarget(child as SiteCriterionTarget)]),
    ));
  }
  return value;
}

function optionalText(value: unknown, path: string, errors: string[]) {
  if (value === undefined) return undefined;
  if (!isNonEmpty(value)) {
    errors.push(`${path}는 제공하는 경우 비어 있지 않은 문자열이어야 합니다.`);
    return undefined;
  }
  return value;
}

function parseCriterion(
  value: unknown,
  index: number,
  errors: string[],
): SiteCriterionV1 | null {
  const path = `criteria[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path}는 객체여야 합니다.`);
    return null;
  }
  reportUnknownKeys(value, CRITERION_KEYS, path, errors);
  if (!isNonEmpty(value.key)) errors.push(`${path}.key가 필요합니다.`);
  if (!isNonEmpty(value.label)) errors.push(`${path}.label이 필요합니다.`);
  if (!isImportance(value.importance)) errors.push(`${path}.importance가 올바르지 않습니다.`);
  if (!isComparisonType(value.comparisonType)) {
    errors.push(`${path}.comparisonType이 올바르지 않습니다.`);
  }
  if (!("target" in value) || !isTarget(value.target)) {
    errors.push(`${path}.target이 필요하며 비어 있지 않은 JSON 값이어야 합니다.`);
  }
  const unit = optionalText(value.unit, `${path}.unit`, errors);
  const note = optionalText(value.note, `${path}.note`, errors);
  let evidenceRequirement: ConfirmationRequirement | undefined;
  if (value.evidenceRequirement !== undefined) {
    if (!CONFIRMATION_REQUIREMENTS.has(value.evidenceRequirement as ConfirmationRequirement)) {
      errors.push(`${path}.evidenceRequirement가 올바르지 않습니다.`);
    } else {
      evidenceRequirement = value.evidenceRequirement as ConfirmationRequirement;
    }
  }
  if (
    !isNonEmpty(value.key)
    || !isNonEmpty(value.label)
    || !isImportance(value.importance)
    || !isComparisonType(value.comparisonType)
    || !isTarget(value.target)
  ) return null;

  return Object.freeze({
    key: value.key,
    label: value.label,
    importance: value.importance,
    comparisonType: value.comparisonType,
    target: freezeTarget(value.target),
    ...(unit ? { unit } : {}),
    ...(evidenceRequirement ? { evidenceRequirement } : {}),
    ...(note ? { note } : {}),
  });
}

/** Profile shape만 검증하며 criterion을 평가하거나 Grade/Decision을 생성하지 않는다. */
export function validateSiteCriteriaProfile(value: unknown): SiteCriteriaValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      code: "INVALID_SITE_CRITERIA_PROFILE",
      message: "Site Criteria Profile V1 검증에 실패했습니다.",
      errors: Object.freeze(["Site Criteria Profile은 객체여야 합니다."]),
    };
  }

  reportUnknownKeys(value, PROFILE_KEYS, "siteCriteriaProfile", errors);
  if (value.schemaVersion !== SITE_CRITERIA_PROFILE_SCHEMA_VERSION) {
    errors.push(`schemaVersion은 ${SITE_CRITERIA_PROFILE_SCHEMA_VERSION}이어야 합니다.`);
  }
  for (const key of ["profileId", "profileVersion", "industry", "storeFormat", "createdAt"] as const) {
    if (!isNonEmpty(value[key])) errors.push(`${key}는 비어 있지 않은 문자열이어야 합니다.`);
  }
  if (value.profileScope !== "BRAND_SPECIFIC" && value.profileScope !== "GENERIC") {
    errors.push("profileScope는 BRAND_SPECIFIC 또는 GENERIC이어야 합니다.");
  }
  const profileScope = value.profileScope as SiteCriteriaProfileScope;
  const brandId = optionalText(value.brandId, "brandId", errors);
  const brandLabel = optionalText(value.brandLabel, "brandLabel", errors);
  if (profileScope === "BRAND_SPECIFIC" && !brandId && !brandLabel) {
    errors.push("BRAND_SPECIFIC profile에는 brandId 또는 brandLabel이 필요합니다.");
  }
  if (profileScope === "GENERIC" && (brandId || brandLabel)) {
    errors.push("GENERIC profile에는 특정 brandId 또는 brandLabel을 넣을 수 없습니다.");
  }

  const criteria: SiteCriterionV1[] = [];
  const seenKeys = new Set<string>();
  if (!Array.isArray(value.criteria)) {
    errors.push("criteria는 배열이어야 합니다.");
  } else {
    for (let index = 0; index < value.criteria.length; index += 1) {
      const criterion = parseCriterion(value.criteria[index], index, errors);
      if (!criterion) continue;
      if (seenKeys.has(criterion.key)) {
        errors.push(`criteria에 중복 key ${criterion.key}가 있습니다.`);
        continue;
      }
      seenKeys.add(criterion.key);
      criteria.push(criterion);
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      code: "INVALID_SITE_CRITERIA_PROFILE",
      message: "Site Criteria Profile V1 검증에 실패했습니다.",
      errors: Object.freeze(errors),
    };
  }

  const profile: SiteCriteriaProfileV1 = {
    schemaVersion: SITE_CRITERIA_PROFILE_SCHEMA_VERSION,
    profileId: value.profileId as string,
    profileVersion: value.profileVersion as string,
    profileScope,
    ...(brandId ? { brandId } : {}),
    ...(brandLabel ? { brandLabel } : {}),
    industry: value.industry as string,
    storeFormat: value.storeFormat as string,
    criteria: Object.freeze(criteria),
    createdAt: value.createdAt as string,
  };
  return { ok: true, value: Object.freeze(profile) };
}
