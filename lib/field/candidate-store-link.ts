import { isCandidateStoreId } from "./identifiers";
import { storageFail, type FieldStorageResult } from "./storage-result";

/**
 * Legacy Consultation ↔ CandidateStore 연결 adapter.
 *
 * 현재 상담 JSON은 후보점포를 상담 record 안에 임베드하고 자체 ID가 없을 수 있다.
 * 이 Link는 consultations.json을 수정하지 않고, 상담 1건의 embedded 점포 하나에
 * `store_<uuid>`를 붙이는 호환 계층이다. Consultation 1:N CandidateStore의 최종 Domain이 아니다.
 */

export const CANDIDATE_STORE_LINK_SCHEMA_VERSION = "candidate-store-link-v1";

export interface CandidateStoreLink {
  readonly schemaVersion: typeof CANDIDATE_STORE_LINK_SCHEMA_VERSION;
  readonly consultationId: string;
  readonly candidateStoreId: string;
  readonly createdAt: string;
  readonly linkVersion: number;
}

export function createCandidateStoreLink(input: {
  consultationId: string;
  candidateStoreId: string;
  createdAt: string;
}): CandidateStoreLink {
  if (input.consultationId.trim() === "") {
    throw new RangeError("CandidateStoreLink requires a consultationId");
  }
  if (!isCandidateStoreId(input.candidateStoreId)) {
    throw new RangeError("CandidateStoreLink requires a candidateStoreId");
  }
  return Object.freeze({
    schemaVersion: CANDIDATE_STORE_LINK_SCHEMA_VERSION,
    consultationId: input.consultationId,
    candidateStoreId: input.candidateStoreId,
    createdAt: input.createdAt,
    linkVersion: 1,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseCandidateStoreLink(value: unknown): FieldStorageResult<CandidateStoreLink> {
  if (!isRecord(value)) {
    return storageFail("INVALID_DATA", "CandidateStoreLink JSON must be an object");
  }
  if (value.schemaVersion !== CANDIDATE_STORE_LINK_SCHEMA_VERSION) {
    return storageFail("INVALID_DATA", "Unsupported CandidateStoreLink schemaVersion");
  }
  if (typeof value.consultationId !== "string" || value.consultationId.trim() === "") {
    return storageFail("INVALID_DATA", "CandidateStoreLink.consultationId is missing");
  }
  if (typeof value.candidateStoreId !== "string" || !isCandidateStoreId(value.candidateStoreId)) {
    return storageFail("INVALID_DATA", "CandidateStoreLink.candidateStoreId is invalid");
  }
  if (typeof value.createdAt !== "string" || value.createdAt.trim() === "") {
    return storageFail("INVALID_DATA", "CandidateStoreLink.createdAt is missing");
  }
  if (typeof value.linkVersion !== "number" || !Number.isInteger(value.linkVersion) || value.linkVersion < 1) {
    return storageFail("INVALID_DATA", "CandidateStoreLink.linkVersion is invalid");
  }
  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: CANDIDATE_STORE_LINK_SCHEMA_VERSION,
      consultationId: value.consultationId,
      candidateStoreId: value.candidateStoreId,
      createdAt: value.createdAt,
      linkVersion: value.linkVersion,
    }),
  };
}
