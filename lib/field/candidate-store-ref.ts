import { isCandidateStoreId } from "./identifiers";
import type { CandidateStoreInput, ConsultationRecord } from "../diagnosis/types";

/**
 * 기존 상담 record와 FIELD Domain 사이의 호환 경계.
 *
 * 기존 후보점포는 `ConsultationRecord.candidateStore`에 임베드되어 있고 자체 ID가 없다.
 * FIELD Domain은 `candidateStoreId`를 필수로 요구하므로 그 사이를 해석하는 책임만 여기서 가진다.
 *
 * Phase 0 설계문서 `docs/SHARED_DATA_MODEL.md` §3.4를 따른다.
 * - resolver는 ID를 생성하지 않는다. 현재 상태만 알려준다.
 * - 전달된 record를 수정하지 않는다.
 * - 주소나 주소 hash로 동일 점포를 확정하지 않는다.
 */

export type CandidateStoreResolution = "explicit" | "legacy_embedded";

interface CandidateStoreReferenceBase {
  readonly consultationId: string;
}

export interface ExplicitCandidateStoreReference extends CandidateStoreReferenceBase {
  readonly resolution: "explicit";
  readonly candidateStoreId: string;
  /** FIELD 조사·실측·배치 데이터를 이 점포에 연결할 수 있다. */
  readonly canAttachFieldData: true;
}

export interface LegacyCandidateStoreReference extends CandidateStoreReferenceBase {
  readonly resolution: "legacy_embedded";
  /** 레거시 record에는 안정 식별자가 없다. 임시 ID로 채우지 않는다. */
  readonly candidateStoreId: null;
  readonly canAttachFieldData: false;
  /** 왜 연결할 수 없는지. 화면에서 직원에게 그대로 보여줄 수 있는 사유다. */
  readonly blockedReason: "CANDIDATE_STORE_ID_NOT_ASSIGNED" | "CANDIDATE_STORE_ID_MALFORMED";
}

export type CandidateStoreReference =
  | ExplicitCandidateStoreReference
  | LegacyCandidateStoreReference;

/**
 * 상담 record가 가리키는 후보점포를 해석한다.
 *
 * `candidateStoreId`가 없거나 형식이 다르면 `legacy_embedded`로 남기고 그대로 보고한다.
 * 형식이 다른 값을 정규화하거나 누락값을 생성하지 않는다.
 */
export function resolveCandidateStoreReference(
  record: ConsultationRecord,
): CandidateStoreReference {
  const consultationId = record.consultation.id;
  const stored: CandidateStoreInput["candidateStoreId"] = record.candidateStore.candidateStoreId;

  if (stored === undefined || stored.trim() === "") {
    return {
      resolution: "legacy_embedded",
      consultationId,
      candidateStoreId: null,
      canAttachFieldData: false,
      blockedReason: "CANDIDATE_STORE_ID_NOT_ASSIGNED",
    };
  }

  if (!isCandidateStoreId(stored)) {
    return {
      resolution: "legacy_embedded",
      consultationId,
      candidateStoreId: null,
      canAttachFieldData: false,
      blockedReason: "CANDIDATE_STORE_ID_MALFORMED",
    };
  }

  return {
    resolution: "explicit",
    consultationId,
    candidateStoreId: stored,
    canAttachFieldData: true,
  };
}

const blockedReasonLabels = Object.freeze({
  CANDIDATE_STORE_ID_NOT_ASSIGNED: "후보점포 ID가 아직 부여되지 않았습니다.",
  CANDIDATE_STORE_ID_MALFORMED: "후보점포 ID 형식이 FIELD 규격과 다릅니다.",
} satisfies Record<LegacyCandidateStoreReference["blockedReason"], string>);

export function getCandidateStoreBlockedReasonLabel(
  reason: LegacyCandidateStoreReference["blockedReason"],
): string {
  return blockedReasonLabels[reason];
}
