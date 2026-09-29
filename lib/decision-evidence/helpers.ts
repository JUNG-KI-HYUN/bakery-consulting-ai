/**
 * Decision Evidence item helpers + deterministic id / sort.
 */

import type {
  DecisionEvidenceBucket,
  DecisionEvidenceCategory,
  DecisionEvidenceImportance,
  DecisionEvidenceItem,
  DecisionEvidenceLocationReference,
  DecisionEvidenceNature,
  DecisionEvidenceSourceDomain,
  DecisionEvidenceSourceRef,
} from "./types";
import type { EquipmentDataStatus } from "../equipment/types";
import type { FieldEvidenceMeta } from "../field/field-evidence-meta";

export function makeDecisionEvidenceId(parts: {
  sourceDomain: DecisionEvidenceSourceDomain;
  bucket: DecisionEvidenceBucket;
  category: DecisionEvidenceCategory;
  key: string;
}): string {
  return `${parts.sourceDomain}|${parts.bucket}|${parts.category}|${parts.key}`;
}

export function createDecisionEvidenceItem(input: {
  sourceDomain: DecisionEvidenceSourceDomain;
  bucket: DecisionEvidenceBucket;
  category: DecisionEvidenceCategory;
  key: string;
  title: string;
  description: string;
  sourceRef?: DecisionEvidenceSourceRef;
  importance?: DecisionEvidenceImportance;
  nature?: DecisionEvidenceNature;
  fieldEvidence?: FieldEvidenceMeta;
  equipmentDataStatus?: EquipmentDataStatus;
  locationReference?: DecisionEvidenceLocationReference;
}): DecisionEvidenceItem {
  const sourceRef = Object.freeze({ ...(input.sourceRef ?? {}) });
  assertNoPiiInSourceRef(sourceRef);
  return Object.freeze({
    id: makeDecisionEvidenceId({
      sourceDomain: input.sourceDomain,
      bucket: input.bucket,
      category: input.category,
      key: input.key,
    }),
    category: input.category,
    title: input.title,
    description: input.description,
    sourceDomain: input.sourceDomain,
    sourceRef,
    bucket: input.bucket,
    importance: input.importance ?? "SUPPORTING",
    ...(input.nature ? { nature: input.nature } : {}),
    ...(input.fieldEvidence
      ? {
          verificationStatus: input.fieldEvidence.verificationStatus,
          sourceType: input.fieldEvidence.sourceType,
          confirmationRequirement: input.fieldEvidence.confirmationRequirement,
        }
      : {}),
    ...(input.equipmentDataStatus
      ? { equipmentDataStatus: input.equipmentDataStatus }
      : {}),
    ...(input.locationReference
      ? {
          locationReference: Object.freeze({
            ...input.locationReference,
            fieldCheckKeys: Object.freeze([...input.locationReference.fieldCheckKeys]),
            value: Array.isArray(input.locationReference.value)
              ? Object.freeze([...input.locationReference.value])
              : input.locationReference.value,
          }),
        }
      : {}),
  });
}

const PII_KEY_PATTERNS = /^(name|phone|email|address|customerName|ownerName)$/i;
const EMAIL_PATTERN = /@/;

export function assertNoPiiInSourceRef(sourceRef: DecisionEvidenceSourceRef): void {
  for (const [key, value] of Object.entries(sourceRef)) {
    if (PII_KEY_PATTERNS.test(key)) {
      throw new RangeError("DecisionEvidence sourceRef must not contain personal information keys");
    }
    if (typeof value !== "string") continue;
    if (EMAIL_PATTERN.test(value) || PII_KEY_PATTERNS.test(value)) {
      throw new RangeError("DecisionEvidence sourceRef must not contain personal information");
    }
  }
}

export function sourceRefContainsNoPii(sourceRef: DecisionEvidenceSourceRef): boolean {
  try {
    assertNoPiiInSourceRef(sourceRef);
    return true;
  } catch {
    return false;
  }
}

/** CORE missing → constraints → expert → supporting missing → facts → geometry */
export function sortDecisionEvidenceItems(
  items: readonly DecisionEvidenceItem[],
): readonly DecisionEvidenceItem[] {
  const bucketOrder: Record<DecisionEvidenceBucket, number> = {
    MISSING_INFORMATION: 0,
    OBSERVED_CONSTRAINT: 1,
    EXPERT_REVIEW: 2,
    GEOMETRY_ISSUE: 3,
    OBSERVED_FACT: 4,
  };
  return Object.freeze(
    [...items].sort((a, b) => {
      if (a.bucket !== b.bucket) {
        return bucketOrder[a.bucket] - bucketOrder[b.bucket];
      }
      if (a.importance !== b.importance) {
        return a.importance === "CORE" ? -1 : 1;
      }
      return a.id.localeCompare(b.id);
    }),
  );
}

export function dedupeById(
  items: readonly DecisionEvidenceItem[],
): readonly DecisionEvidenceItem[] {
  const seen = new Set<string>();
  const result: DecisionEvidenceItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return Object.freeze(result);
}

export function decisionEvidenceCreatesNoVerdictScoreRisk(
  bundle: {
    createsVerdict: false;
    createsScore: false;
    createsRisk: false;
  },
): boolean {
  return (
    bundle.createsVerdict === false &&
    bundle.createsScore === false &&
    bundle.createsRisk === false
  );
}
