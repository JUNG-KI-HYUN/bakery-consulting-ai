import { isCandidateStoreId } from "../field/identifiers";
import {
  EVIDENCE_OWNERSHIP_SCHEMA_VERSION,
  EVIDENCE_SCOPE_TYPES,
  EVIDENCE_SNAPSHOT_SCHEMA_VERSION,
  type EvidenceOwnershipBindingV1,
  type EvidenceOwnershipBindingsValidationResult,
  type EvidenceOwnershipSnapshotFailureV1,
  type EvidenceOwnershipV1,
  type EvidenceOwnershipValidationResult,
  type EvidenceScopeType,
  type EvidenceSnapshotReferenceCompatibleV1,
  type EvidenceSnapshotV1,
  type EvidenceSnapshotValidationResult,
} from "./ownership-snapshot-types";

const OWNERSHIP_KEYS = new Set([
  "schemaVersion",
  "scopeType",
  "caseId",
  "analysisClusterId",
  "candidateStoreId",
]);
const BINDING_KEYS = new Set(["evidenceRef", "ownership"]);
const SNAPSHOT_KEYS = new Set([
  "schemaVersion",
  "snapshotId",
  "caseId",
  "ownershipContext",
  "evidenceRefs",
  "capturedAt",
  "snapshotVersion",
  "createdBy",
  "sourceManifestVersion",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value === value.trim();
}

function isScopeType(value: unknown): value is EvidenceScopeType {
  return EVIDENCE_SCOPE_TYPES.some((scope) => scope === value);
}

function unknownKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, path: string): string[] {
  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .map((key) => `${path}.${key}는 허용되지 않습니다.`);
}

function duplicates(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicateValues = new Set<string>();
  values.forEach((value) => {
    if (seen.has(value)) duplicateValues.add(value);
    seen.add(value);
  });
  return [...duplicateValues];
}

function failure(
  code: EvidenceOwnershipSnapshotFailureV1["code"],
  message: string,
  errors: readonly string[],
): EvidenceOwnershipSnapshotFailureV1 {
  return Object.freeze({ ok: false, code, message, errors: Object.freeze([...errors]) });
}

function parseOwnership(
  value: unknown,
  path: string,
): { ownership: EvidenceOwnershipV1 | null; errors: readonly string[] } {
  if (!isRecord(value)) return { ownership: null, errors: [`${path}는 객체여야 합니다.`] };
  const errors = unknownKeys(value, OWNERSHIP_KEYS, path);
  if (value.schemaVersion !== EVIDENCE_OWNERSHIP_SCHEMA_VERSION) {
    errors.push(`${path}.schemaVersion이 올바르지 않습니다.`);
  }
  if (!isScopeType(value.scopeType)) errors.push(`${path}.scopeType이 올바르지 않습니다.`);
  if (!isNonEmpty(value.caseId)) errors.push(`${path}.caseId가 필요합니다.`);
  if (value.analysisClusterId !== undefined && !isNonEmpty(value.analysisClusterId)) {
    errors.push(`${path}.analysisClusterId가 올바르지 않습니다.`);
  }
  if (value.candidateStoreId !== undefined && !isCandidateStoreId(value.candidateStoreId)) {
    errors.push(`${path}.candidateStoreId가 올바르지 않습니다.`);
  }

  if (value.scopeType === "CASE") {
    if (value.analysisClusterId !== undefined) errors.push("CASE ownership에는 analysisClusterId를 지정할 수 없습니다.");
    if (value.candidateStoreId !== undefined) errors.push("CASE ownership에는 candidateStoreId를 지정할 수 없습니다.");
  }
  if (value.scopeType === "ANALYSIS_CLUSTER") {
    if (!isNonEmpty(value.analysisClusterId)) errors.push("ANALYSIS_CLUSTER ownership에는 analysisClusterId가 필요합니다.");
    if (value.candidateStoreId !== undefined) errors.push("ANALYSIS_CLUSTER ownership에는 candidateStoreId를 지정할 수 없습니다.");
  }
  if (value.scopeType === "CANDIDATE" && !isCandidateStoreId(value.candidateStoreId)) {
    errors.push("CANDIDATE ownership에는 candidateStoreId가 필요합니다.");
  }
  if (errors.length > 0 || !isScopeType(value.scopeType) || !isNonEmpty(value.caseId)) {
    return { ownership: null, errors };
  }

  return {
    ownership: Object.freeze({
      schemaVersion: EVIDENCE_OWNERSHIP_SCHEMA_VERSION,
      scopeType: value.scopeType,
      caseId: value.caseId,
      ...(isNonEmpty(value.analysisClusterId) ? { analysisClusterId: value.analysisClusterId } : {}),
      ...(isCandidateStoreId(value.candidateStoreId) ? { candidateStoreId: value.candidateStoreId } : {}),
    }),
    errors: [],
  };
}

export function validateEvidenceOwnershipV1(value: unknown): EvidenceOwnershipValidationResult {
  const parsed = parseOwnership(value, "ownership");
  if (!parsed.ownership) {
    return failure("INVALID_EVIDENCE_OWNERSHIP", "Evidence ownership이 올바르지 않습니다.", parsed.errors);
  }
  return Object.freeze({ ok: true, value: parsed.ownership });
}

export function validateEvidenceOwnershipBindingsV1(
  value: unknown,
): EvidenceOwnershipBindingsValidationResult {
  if (!Array.isArray(value)) {
    return failure(
      "INVALID_EVIDENCE_OWNERSHIP_BINDING",
      "Evidence ownership bindings가 올바르지 않습니다.",
      ["bindings는 배열이어야 합니다."],
    );
  }
  const errors: string[] = [];
  const parsed: EvidenceOwnershipBindingV1[] = [];
  value.forEach((item, index) => {
    const path = `bindings[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${path}는 객체여야 합니다.`);
      return;
    }
    errors.push(...unknownKeys(item, BINDING_KEYS, path));
    if (!isNonEmpty(item.evidenceRef)) errors.push(`${path}.evidenceRef가 필요합니다.`);
    const ownership = parseOwnership(item.ownership, `${path}.ownership`);
    errors.push(...ownership.errors);
    if (isNonEmpty(item.evidenceRef) && ownership.ownership) {
      parsed.push(Object.freeze({ evidenceRef: item.evidenceRef, ownership: ownership.ownership }));
    }
  });
  duplicates(parsed.map((item) => item.evidenceRef)).forEach((reference) => {
    errors.push(`중복 ownership evidenceRef: ${reference}`);
  });
  if (errors.length > 0) {
    return failure(
      "INVALID_EVIDENCE_OWNERSHIP_BINDING",
      "Evidence ownership bindings가 올바르지 않습니다.",
      errors,
    );
  }
  return Object.freeze({ ok: true, value: Object.freeze(parsed) });
}

function scopeFailure(
  snapshotContext: EvidenceOwnershipV1,
  binding: EvidenceOwnershipBindingV1,
): EvidenceOwnershipSnapshotFailureV1 | null {
  const owner = binding.ownership;
  if (owner.caseId !== snapshotContext.caseId) {
    return failure(
      "FOREIGN_CASE_EVIDENCE",
      "다른 Case의 Evidence를 Snapshot에 포함할 수 없습니다.",
      [`foreign Case Evidence: ${binding.evidenceRef}`],
    );
  }
  if (owner.scopeType === "ANALYSIS_CLUSTER") {
    if (
      snapshotContext.scopeType === "CASE"
      || owner.analysisClusterId !== snapshotContext.analysisClusterId
    ) {
      return failure(
        "FOREIGN_CLUSTER_EVIDENCE",
        "Snapshot context와 다른 Cluster Evidence를 포함할 수 없습니다.",
        [`foreign Cluster Evidence: ${binding.evidenceRef}`],
      );
    }
  }
  if (owner.scopeType === "CANDIDATE") {
    if (
      snapshotContext.scopeType !== "CANDIDATE"
      || owner.candidateStoreId !== snapshotContext.candidateStoreId
      || (
        owner.analysisClusterId !== undefined
        && owner.analysisClusterId !== snapshotContext.analysisClusterId
      )
    ) {
      return failure(
        "FOREIGN_CANDIDATE_EVIDENCE",
        "Snapshot context와 다른 Candidate Evidence를 포함할 수 없습니다.",
        [`foreign Candidate Evidence: ${binding.evidenceRef}`],
      );
    }
  }
  return null;
}

/** Ownership sidecar와 독립적으로 Snapshot 자체의 reference-only contract를 먼저 검증한다. */
export function validateEvidenceSnapshotContractV1(
  value: unknown,
): EvidenceSnapshotValidationResult {
  if (!isRecord(value)) {
    return failure("INVALID_EVIDENCE_SNAPSHOT", "Evidence Snapshot이 올바르지 않습니다.", ["snapshot은 객체여야 합니다."]);
  }
  const errors = unknownKeys(value, SNAPSHOT_KEYS, "snapshot");
  if (value.schemaVersion !== EVIDENCE_SNAPSHOT_SCHEMA_VERSION) errors.push("snapshot.schemaVersion이 올바르지 않습니다.");
  if (!isNonEmpty(value.snapshotId)) errors.push("snapshot.snapshotId가 필요합니다.");
  if (!isNonEmpty(value.caseId)) errors.push("snapshot.caseId가 필요합니다.");
  if (!isNonEmpty(value.snapshotVersion)) errors.push("snapshot.snapshotVersion이 필요합니다.");
  if (!isNonEmpty(value.capturedAt)) errors.push("snapshot.capturedAt이 필요합니다.");
  if (value.createdBy !== undefined && !isNonEmpty(value.createdBy)) errors.push("snapshot.createdBy가 올바르지 않습니다.");
  if (value.sourceManifestVersion !== undefined && !isNonEmpty(value.sourceManifestVersion)) errors.push("snapshot.sourceManifestVersion이 올바르지 않습니다.");

  let evidenceRefs: readonly string[] | null = null;
  if (!Array.isArray(value.evidenceRefs)) {
    errors.push("snapshot.evidenceRefs는 배열이어야 합니다.");
  } else {
    const refs = value.evidenceRefs;
    refs.forEach((reference, index) => {
      if (!isNonEmpty(reference)) errors.push(`snapshot.evidenceRefs[${index}]가 올바르지 않습니다.`);
    });
    duplicates(refs.filter(isNonEmpty)).forEach((reference) => {
      errors.push(`중복 snapshot evidenceRef: ${reference}`);
    });
    if (refs.every(isNonEmpty)) evidenceRefs = refs;
  }

  const context = parseOwnership(value.ownershipContext, "snapshot.ownershipContext");
  errors.push(...context.errors);
  if (context.ownership && isNonEmpty(value.caseId) && context.ownership.caseId !== value.caseId) {
    errors.push("snapshot.caseId와 ownershipContext.caseId가 다릅니다.");
  }
  if (
    errors.length > 0
    || !evidenceRefs
    || !context.ownership
    || !isNonEmpty(value.snapshotId)
    || !isNonEmpty(value.caseId)
    || !isNonEmpty(value.snapshotVersion)
    || !isNonEmpty(value.capturedAt)
  ) {
    return failure("INVALID_EVIDENCE_SNAPSHOT", "Evidence Snapshot이 올바르지 않습니다.", errors);
  }

  return Object.freeze({
    ok: true,
    value: Object.freeze({
      schemaVersion: EVIDENCE_SNAPSHOT_SCHEMA_VERSION,
      snapshotId: value.snapshotId,
      caseId: value.caseId,
      ownershipContext: context.ownership,
      evidenceRefs: Object.freeze([...evidenceRefs]),
      capturedAt: value.capturedAt,
      snapshotVersion: value.snapshotVersion,
      ...(isNonEmpty(value.createdBy) ? { createdBy: value.createdBy } : {}),
      ...(isNonEmpty(value.sourceManifestVersion) ? { sourceManifestVersion: value.sourceManifestVersion } : {}),
    }),
  });
}

/** Snapshot과 sidecar ownership을 함께 검증하고 새 immutable snapshot value를 반환한다. */
export function validateEvidenceSnapshotV1(
  value: unknown,
  ownershipBindings: unknown,
): EvidenceSnapshotValidationResult {
  const snapshot = validateEvidenceSnapshotContractV1(value);
  if (!snapshot.ok) return snapshot;
  const bindings = validateEvidenceOwnershipBindingsV1(ownershipBindings);
  if (!bindings.ok) {
    return failure("INVALID_EVIDENCE_SNAPSHOT", "Evidence Snapshot이 올바르지 않습니다.", bindings.errors);
  }

  const ownershipByRef = new Map(bindings.value.map((binding) => [binding.evidenceRef, binding] as const));
  for (const evidenceRef of snapshot.value.evidenceRefs) {
    const binding = ownershipByRef.get(evidenceRef);
    if (!binding) {
      return failure(
        "EVIDENCE_OWNERSHIP_NOT_FOUND",
        "Snapshot Evidence의 ownership을 찾지 못했습니다.",
        [`ownership missing: ${evidenceRef}`],
      );
    }
    const mismatch = scopeFailure(snapshot.value.ownershipContext, binding);
    if (mismatch) return mismatch;
  }
  return snapshot;
}

/** Evidence 객체를 복제하지 않고 Phase 4G/4H resolver용 reference만 만든다. */
export function toEvidenceSnapshotReferenceV1(
  snapshot: EvidenceSnapshotV1,
): EvidenceSnapshotReferenceCompatibleV1 {
  return Object.freeze({
    snapshotId: snapshot.snapshotId,
    snapshotVersion: snapshot.snapshotVersion,
    capturedAt: snapshot.capturedAt,
    evidenceRefs: snapshot.evidenceRefs,
  });
}
