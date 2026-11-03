import { isDerivedContentRevisionId } from "./identifiers";
import {
  DERIVED_CONTENT_REVISION_SCHEMA_VERSION,
  type DerivedContentContractFailureV1,
  type DerivedContentRevisionStatus,
  type DerivedContentRevisionValidationResult,
  type DerivedContentTransitionInputV1,
} from "./types";
import { validateDerivedContentRevisionV1 } from "./validation";

function transitionFailure(errors: readonly string[]): DerivedContentContractFailureV1 {
  return Object.freeze({
    ok: false,
    code: "INVALID_STATUS_TRANSITION",
    message: "Derived Content status transition이 올바르지 않습니다.",
    errors: Object.freeze([...errors]),
  });
}

/**
 * 전이는 기존 객체를 수정하지 않고 새 Revision을 만든다.
 * DRAFT→REVIEWED, DRAFT→APPROVED, REVIEWED→APPROVED만 허용한다.
 */
export function transitionDerivedContentRevisionV1(
  existingInput: unknown,
  targetStatus: DerivedContentRevisionStatus,
  input: DerivedContentTransitionInputV1,
): DerivedContentRevisionValidationResult {
  const existingResult = validateDerivedContentRevisionV1(existingInput);
  if (!existingResult.ok) return existingResult;
  const existing = existingResult.value;
  const allowed = existing.status === "DRAFT"
    ? targetStatus === "REVIEWED" || targetStatus === "APPROVED"
    : existing.status === "REVIEWED" && targetStatus === "APPROVED";
  if (!allowed) return transitionFailure([`${existing.status} → ${targetStatus} 전이는 허용되지 않습니다.`]);
  if (!isDerivedContentRevisionId(input.revisionId) || input.revisionId === existing.revisionId) {
    return transitionFailure(["전이에는 기존 Revision과 다른 stable revisionId가 필요합니다."]);
  }
  if (!Number.isInteger(input.revisionSequence) || input.revisionSequence <= existing.revisionSequence) {
    return transitionFailure(["새 revisionSequence은 기존 값보다 큰 정수여야 합니다."]);
  }
  if (typeof input.actor !== "string" || input.actor.trim() === "" || input.actor !== input.actor.trim()) {
    return transitionFailure(["전이 actor가 필요합니다."]);
  }
  if (typeof input.transitionedAt !== "string" || !Number.isFinite(Date.parse(input.transitionedAt))) {
    return transitionFailure(["전이 timestamp가 필요합니다."]);
  }
  if (targetStatus !== "APPROVED" && input.supersedesApprovedRevisionId != null) {
    return transitionFailure(["supersedesApprovedRevisionId는 APPROVED 전이에만 허용됩니다."]);
  }

  const reviewedAt = targetStatus === "REVIEWED"
    ? input.transitionedAt
    : existing.reviewedAt;
  const reviewedBy = targetStatus === "REVIEWED"
    ? input.actor
    : existing.reviewedBy;
  const approvedAt = targetStatus === "APPROVED" ? input.transitionedAt : null;
  const approvedBy = targetStatus === "APPROVED" ? input.actor : null;

  return validateDerivedContentRevisionV1({
    ...existing,
    schemaVersion: DERIVED_CONTENT_REVISION_SCHEMA_VERSION,
    revisionId: input.revisionId,
    revisionSequence: input.revisionSequence,
    parentRevisionId: existing.revisionId,
    supersedesApprovedRevisionId: input.supersedesApprovedRevisionId ?? null,
    status: targetStatus,
    createdAt: input.transitionedAt,
    createdBy: input.actor,
    reviewedAt,
    reviewedBy,
    approvedAt,
    approvedBy,
  });
}
