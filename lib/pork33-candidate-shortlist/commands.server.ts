import "server-only";
import { randomUUID } from "node:crypto";
import { CANDIDATE_LIFECYCLE_STATUSES } from "../candidate-screening/types";
import { transitionDerivedContentRevisionV1 } from "../derived-content/transitions";
import { validateDerivedContentRevisionV1 } from "../derived-content/validation";
import { geocodeKakaoAddress, KakaoGeocodeError, type KakaoGeocodeResult } from "../market-data/clients/kakao-geocode";
import { appendPork33State, createNextPork33Snapshot, loadCurrentPork33State } from "./repository.server";
import { getActivePork33Revision } from "./state";
import type { Pork33CandidateState, Pork33ShortlistCommand, Pork33ShortlistStateV1 } from "./types";

type CommandOptions = {
  now?: () => Date;
  randomId?: () => string;
  repositoryRoot?: string;
  geocode?: (address: string) => Promise<KakaoGeocodeResult>;
};

function actor(value: string) {
  const normalized = value.trim();
  if (!normalized) throw new TypeError("작업자 이름이 필요합니다.");
  return normalized;
}
function findCandidate(state: Pork33ShortlistStateV1, candidateStoreId: string) {
  const candidate = state.candidates.find((item) => item.identity.candidateStoreId === candidateStoreId);
  if (!candidate) throw new RangeError("Candidate를 찾을 수 없습니다.");
  return candidate;
}
function createRevisionId(options: CommandOptions) {
  return `derived_rev_${options.randomId?.() ?? randomUUID()}`;
}
function timestamp(options: CommandOptions) {
  return (options.now?.() ?? new Date()).toISOString();
}
function updateCandidateAudit(candidate: Pork33CandidateState, name: string, at: string) {
  candidate.updatedAt = at;
  candidate.updatedBy = name;
}
async function geocodeCandidate(candidate: Pork33CandidateState, options: CommandOptions) {
  if (!candidate.normalized.addressForGeocode) {
    candidate.normalized.latitude = null;
    candidate.normalized.longitude = null;
    candidate.normalized.coordinateSource = null;
    candidate.normalized.geocodeStatus = "GEOCODE_REVIEW_REQUIRED";
    return;
  }
  const execute = options.geocode ?? geocodeKakaoAddress;
  try {
    const result = await execute(candidate.normalized.addressForGeocode);
    candidate.normalized.latitude = result.latitude;
    candidate.normalized.longitude = result.longitude;
    candidate.normalized.coordinateSource = "KAKAO_GEOCODE";
    candidate.normalized.geocodeStatus = "RESOLVED";
  } catch (error) {
    candidate.normalized.latitude = null;
    candidate.normalized.longitude = null;
    candidate.normalized.coordinateSource = null;
    candidate.normalized.geocodeStatus = error instanceof KakaoGeocodeError && error.code === "NOT_FOUND"
      ? "GEOCODE_REVIEW_REQUIRED"
      : "FAILED";
    if (error instanceof KakaoGeocodeError && error.code === "MISSING_API_KEY") throw error;
  }
}
export async function executePork33ShortlistCommand(
  command: Pork33ShortlistCommand,
  options: CommandOptions = {},
) {
  const name = actor(command.actor);
  const repositoryOptions = { rootDir: options.repositoryRoot, now: options.now, randomId: options.randomId };
  const current = await loadCurrentPork33State(repositoryOptions);
  const next = createNextPork33Snapshot(current, name, repositoryOptions);
  const at = timestamp(options);

  if (command.type === "UPDATE_CANDIDATE") {
    const candidate = findCandidate(next, command.candidateStoreId);
    const patch = command.patch;
    if (patch.reviewStatus !== undefined) {
      if (!CANDIDATE_LIFECYCLE_STATUSES.includes(patch.reviewStatus)) throw new TypeError("올바르지 않은 검토 상태입니다.");
      candidate.normalized.reviewStatus = patch.reviewStatus;
    }
    if (patch.reviewReason !== undefined) {
      const reason = patch.reviewReason?.trim() || null;
      if (reason && Array.from(reason).length > 500) throw new TypeError("검토 사유는 최대 500자입니다.");
      candidate.reviewReason = reason;
    }
    if (patch.maintenance !== undefined || patch.maintenanceStatus !== undefined) {
      if (patch.maintenance === null || patch.maintenanceStatus === "UNKNOWN") {
        candidate.normalized.maintenance = null;
        candidate.normalized.maintenanceStatus = "UNKNOWN";
      } else if (typeof patch.maintenance === "number" && Number.isFinite(patch.maintenance) && patch.maintenance >= 0) {
        candidate.normalized.maintenance = patch.maintenance;
        candidate.normalized.maintenanceStatus = "CONFIRMED";
      } else {
        throw new TypeError("관리비는 0 이상의 확인값 또는 UNKNOWN이어야 합니다.");
      }
    }
    for (const key of ["premium", "exclusiveArea", "deposit", "rent", "existingHouseholdReference"] as const) {
      const value = patch[key];
      if (value !== undefined) {
        if (value !== null && (!Number.isFinite(value) || value < 0)) throw new TypeError(`${key}는 0 이상의 값 또는 UNKNOWN이어야 합니다.`);
        candidate.normalized[key] = value;
      }
    }
    for (const key of ["addressFull", "displayLocation", "mainApartmentRaw"] as const) {
      const value = patch[key];
      if (value !== undefined) {
        const normalized = value.trim();
        if (!normalized) throw new TypeError(`${key}는 비워 둘 수 없습니다.`);
        candidate.normalized[key] = normalized;
      }
    }
    if (patch.addressForGeocode !== undefined) candidate.normalized.addressForGeocode = patch.addressForGeocode?.trim() || null;
    if (patch.addressProvenance !== undefined) candidate.normalized.addressProvenance = patch.addressProvenance;
    if (patch.latitude !== undefined || patch.longitude !== undefined) {
      if (patch.latitude === null || patch.longitude === null) {
        candidate.normalized.latitude = null;
        candidate.normalized.longitude = null;
        candidate.normalized.coordinateSource = null;
        candidate.normalized.geocodeStatus = "GEOCODE_REVIEW_REQUIRED";
      } else if (typeof patch.latitude === "number" && Number.isFinite(patch.latitude)
        && typeof patch.longitude === "number" && Number.isFinite(patch.longitude)) {
        candidate.normalized.latitude = patch.latitude;
        candidate.normalized.longitude = patch.longitude;
        candidate.normalized.coordinateSource = "MANUAL";
        candidate.normalized.geocodeStatus = "RESOLVED";
      } else {
        throw new TypeError("수동 좌표는 위도와 경도를 함께 입력해야 합니다.");
      }
    }
    if (patch.floor !== undefined) candidate.normalized.floor = patch.floor?.trim() || null;
    if (patch.currentOccupancyStatus !== undefined) candidate.normalized.currentOccupancyStatus = patch.currentOccupancyStatus?.trim() || null;
    if (patch.fieldFlowRating !== undefined) candidate.normalized.fieldFlowRating = patch.fieldFlowRating;
    if (patch.fieldVisibilityRating !== undefined) candidate.normalized.fieldVisibilityRating = patch.fieldVisibilityRating;
    updateCandidateAudit(candidate, name, at);
  }

  if (command.type === "SAVE_DRAFT") {
    const candidate = findCandidate(next, command.candidateStoreId);
    const active = getActivePork33Revision(candidate);
    if (!active) throw new Error("기존 Derived Content Revision을 찾을 수 없습니다.");
    const revision = {
      ...active,
      revisionId: createRevisionId(options),
      revisionSequence: active.revisionSequence + 1,
      parentRevisionId: active.revisionId,
      supersedesApprovedRevisionId: null,
      status: "DRAFT" as const,
      origin: "HUMAN_EDIT" as const,
      promptContractVersion: null,
      modelId: null,
      createdAt: at,
      createdBy: name,
      reviewedAt: null,
      reviewedBy: null,
      approvedAt: null,
      approvedBy: null,
      payload: command.payload,
    };
    const validation = validateDerivedContentRevisionV1(revision);
    if (!validation.ok || validation.value.contentKind !== "FIELD_NOTE_STRUCTURE") {
      throw new TypeError(validation.ok ? "Field Note Revision이 아닙니다." : validation.errors.join("\n"));
    }
    candidate.contentRevisions.push(validation.value);
    updateCandidateAudit(candidate, name, at);
  }

  if (command.type === "TRANSITION_DRAFT") {
    const candidate = findCandidate(next, command.candidateStoreId);
    const active = getActivePork33Revision(candidate);
    if (!active) throw new Error("전이할 Derived Content Revision을 찾을 수 없습니다.");
    const previousApproved = [...candidate.contentRevisions].reverse().find((item) => item.status === "APPROVED");
    const transitioned = transitionDerivedContentRevisionV1(active, command.targetStatus, {
      revisionId: createRevisionId(options),
      revisionSequence: active.revisionSequence + 1,
      actor: name,
      transitionedAt: at,
      ...(command.targetStatus === "APPROVED" ? { supersedesApprovedRevisionId: previousApproved?.revisionId ?? null } : {}),
    });
    if (!transitioned.ok || transitioned.value.contentKind !== "FIELD_NOTE_STRUCTURE") {
      throw new TypeError(transitioned.ok ? "Field Note Revision이 아닙니다." : transitioned.errors.join("\n"));
    }
    candidate.contentRevisions.push(transitioned.value);
    updateCandidateAudit(candidate, name, at);
  }

  if (command.type === "GEOCODE_ONE") {
    const candidate = findCandidate(next, command.candidateStoreId);
    await geocodeCandidate(candidate, options);
    updateCandidateAudit(candidate, name, at);
  }

  if (command.type === "GEOCODE_ALL_PENDING") {
    const candidates = next.candidates.filter((candidate) => candidate.normalized.geocodeStatus !== "RESOLVED");
    for (const candidate of candidates) {
      await geocodeCandidate(candidate, options);
      updateCandidateAudit(candidate, name, at);
    }
  }

  return appendPork33State(next, repositoryOptions);
}
