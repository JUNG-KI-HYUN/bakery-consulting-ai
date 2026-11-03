import { isCandidateStoreId } from "../field/identifiers";

export const CANDIDATE_SCOPED_PHOTO_REFERENCE_SCHEMA_VERSION =
  "frameone.candidate-scoped-photo-reference.v1" as const;

export interface CandidateScopedPhotoReferenceV1 {
  readonly schemaVersion: typeof CANDIDATE_SCOPED_PHOTO_REFERENCE_SCHEMA_VERSION;
  readonly caseId: string;
  readonly candidateStoreId: string;
  /** Filesystem path가 아닌 Candidate/Case-bound opaque binary reference다. */
  readonly assetRef: string;
}

interface CandidatePhotoAssetPayloadV1 {
  readonly version: 1;
  readonly caseId: string;
  readonly candidateStoreId: string;
  readonly fileName: string;
}

export type CandidatePhotoAssetReferenceFailureCode =
  | "INVALID_CASE_ID"
  | "INVALID_CANDIDATE_ID"
  | "INVALID_STORAGE_REFERENCE"
  | "FOREIGN_CASE_PHOTO"
  | "FOREIGN_CANDIDATE_PHOTO";

export type CandidatePhotoAssetReferenceValidationResult =
  | { readonly ok: true; readonly fileName: string }
  | { readonly ok: false; readonly code: CandidatePhotoAssetReferenceFailureCode };

const SAFE_CASE = /^[a-zA-Z0-9_-]+$/;
const SAFE_FILE_NAME = /^[a-zA-Z0-9_-]+\.(?:jpg|png|webp)$/;
const CANDIDATE_ASSET_PREFIX = "cphoto_v1_";

export function isCandidatePhotoCaseId(value: unknown): value is string {
  return typeof value === "string" && SAFE_CASE.test(value);
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): string {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

function decodeCandidatePhotoAssetRefV1(assetRef: unknown): CandidatePhotoAssetPayloadV1 | null {
  if (
    typeof assetRef !== "string"
    || !assetRef.startsWith(CANDIDATE_ASSET_PREFIX)
    || !/^[a-zA-Z0-9_-]+$/u.test(assetRef.slice(CANDIDATE_ASSET_PREFIX.length))
  ) return null;

  try {
    const parsed: unknown = JSON.parse(decodeBase64Url(assetRef.slice(CANDIDATE_ASSET_PREFIX.length)));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const value = parsed as Record<string, unknown>;
    if (
      Object.keys(value).sort().join("|") !== "candidateStoreId|caseId|fileName|version"
      || value.version !== 1
      || !isCandidatePhotoCaseId(value.caseId)
      || !isCandidateStoreId(value.candidateStoreId)
      || typeof value.fileName !== "string"
      || !SAFE_FILE_NAME.test(value.fileName)
    ) return null;
    return Object.freeze({
      version: 1,
      caseId: value.caseId,
      candidateStoreId: value.candidateStoreId,
      fileName: value.fileName,
    });
  } catch {
    return null;
  }
}

/** 기존 storage adapter와 동일한 opaque reference 포맷을 생성한다. */
export function createCandidatePhotoAssetRefV1(
  caseId: string,
  candidateStoreId: string,
  fileName: string,
): string {
  if (!isCandidatePhotoCaseId(caseId)) throw new RangeError("올바르지 않은 Candidate Photo case ID입니다.");
  if (!isCandidateStoreId(candidateStoreId)) throw new RangeError("올바르지 않은 후보점포 ID입니다.");
  if (!SAFE_FILE_NAME.test(fileName)) throw new RangeError("올바르지 않은 Candidate Photo 파일명입니다.");
  return `${CANDIDATE_ASSET_PREFIX}${encodeBase64Url(JSON.stringify({
    version: 1,
    caseId,
    candidateStoreId,
    fileName,
  }))}`;
}

/** assetRef 내부 ownership과 요청 context를 path 접근 없이 fail-closed로 검증한다. */
export function validateCandidatePhotoAssetRefV1(
  caseId: unknown,
  candidateStoreId: unknown,
  assetRef: unknown,
): CandidatePhotoAssetReferenceValidationResult {
  if (!isCandidatePhotoCaseId(caseId)) return Object.freeze({ ok: false, code: "INVALID_CASE_ID" });
  if (!isCandidateStoreId(candidateStoreId)) return Object.freeze({ ok: false, code: "INVALID_CANDIDATE_ID" });
  const payload = decodeCandidatePhotoAssetRefV1(assetRef);
  if (!payload) return Object.freeze({ ok: false, code: "INVALID_STORAGE_REFERENCE" });
  if (payload.caseId !== caseId) return Object.freeze({ ok: false, code: "FOREIGN_CASE_PHOTO" });
  if (payload.candidateStoreId !== candidateStoreId) {
    return Object.freeze({ ok: false, code: "FOREIGN_CANDIDATE_PHOTO" });
  }
  return Object.freeze({ ok: true, fileName: payload.fileName });
}
