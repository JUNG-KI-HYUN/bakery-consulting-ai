import type { ConfirmationRequirement } from "../evidence/types";

export const SITE_CRITERIA_PROFILE_SCHEMA_VERSION =
  "frameone.site-criteria-profile.v1" as const;

export const SITE_CRITERIA_IMPORTANCE = Object.freeze([
  "REQUIRED",
  "PREFERRED",
  "CONDITIONAL",
] as const);

export type SiteCriteriaImportance =
  (typeof SITE_CRITERIA_IMPORTANCE)[number];

export const SITE_CRITERIA_COMPARISON_TYPES = Object.freeze([
  "EQUALS",
  "MINIMUM",
  "MAXIMUM",
  "RANGE",
  "PRESENCE",
  "QUALITATIVE",
] as const);

export type SiteCriteriaComparisonType =
  (typeof SITE_CRITERIA_COMPARISON_TYPES)[number];

export type SiteCriterionTarget =
  | string
  | number
  | boolean
  | readonly SiteCriterionTarget[]
  | { readonly [key: string]: SiteCriterionTarget };

export interface SiteCriterionV1 {
  readonly key: string;
  readonly label: string;
  readonly importance: SiteCriteriaImportance;
  readonly comparisonType: SiteCriteriaComparisonType;
  readonly target: SiteCriterionTarget;
  readonly unit?: string;
  readonly evidenceRequirement?: ConfirmationRequirement;
  readonly note?: string;
}

export type SiteCriteriaProfileScope = "BRAND_SPECIFIC" | "GENERIC";

export interface SiteCriteriaProfileV1 {
  readonly schemaVersion: typeof SITE_CRITERIA_PROFILE_SCHEMA_VERSION;
  readonly profileId: string;
  readonly profileVersion: string;
  readonly profileScope: SiteCriteriaProfileScope;
  readonly brandId?: string;
  readonly brandLabel?: string;
  readonly industry: string;
  readonly storeFormat: string;
  readonly criteria: readonly SiteCriterionV1[];
  readonly createdAt: string;
}

export interface SiteCriteriaValidationFailure {
  readonly ok: false;
  readonly code: "INVALID_SITE_CRITERIA_PROFILE";
  readonly message: string;
  readonly errors: readonly string[];
}

export type SiteCriteriaValidationResult =
  | { readonly ok: true; readonly value: SiteCriteriaProfileV1 }
  | SiteCriteriaValidationFailure;
