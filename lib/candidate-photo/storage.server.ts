import "server-only";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isCandidateStoreId } from "../field/identifiers";
import {
  CANDIDATE_SCOPED_PHOTO_REFERENCE_SCHEMA_VERSION,
  createCandidatePhotoAssetRefV1,
  isCandidatePhotoCaseId,
  validateCandidatePhotoAssetRefV1,
  type CandidateScopedPhotoReferenceV1,
} from "./asset-reference";

export {
  CANDIDATE_SCOPED_PHOTO_REFERENCE_SCHEMA_VERSION,
  type CandidateScopedPhotoReferenceV1,
} from "./asset-reference";

const MAX_BYTES = 10 * 1024 * 1024;
const SAFE_BINARY_ID = /^[a-zA-Z0-9_-]+$/;
const SAFE_FILE_NAME = /^[a-zA-Z0-9_-]+\.(?:jpg|png|webp)$/;
const MIME: Record<string, { extension: string; signature: (buffer: Buffer) => boolean }> = {
  "image/jpeg": { extension: ".jpg", signature: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  "image/png": { extension: ".png", signature: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  "image/webp": { extension: ".webp", signature: (buffer) => buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP" },
};

export type CandidatePhotoStorageOptions = {
  readonly rootDir?: string;
  readonly randomId?: () => string;
};

export type CandidatePhotoStorageErrorCode =
  | "INVALID_CASE_ID"
  | "INVALID_CANDIDATE_ID"
  | "FOREIGN_CANDIDATE_PHOTO"
  | "FOREIGN_CASE_PHOTO"
  | "PHOTO_PATH_MISMATCH"
  | "PHOTO_NOT_FOUND"
  | "INVALID_STORAGE_REFERENCE";

export class CandidatePhotoStorageError extends Error {
  readonly code: CandidatePhotoStorageErrorCode;

  constructor(code: CandidatePhotoStorageErrorCode, message: string) {
    super(message);
    this.name = "CandidatePhotoStorageError";
    this.code = code;
  }
}

/** Existing binaries remain in place; only their access boundary becomes shared. */
export function resolveCandidatePhotoStorageRoot(options: CandidatePhotoStorageOptions = {}) {
  return options.rootDir ?? path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "detailed-report-photos",
  );
}

function assertCandidateContext(caseId: string, candidateStoreId: string): void {
  if (!isCandidatePhotoCaseId(caseId)) {
    throw new CandidatePhotoStorageError("INVALID_CASE_ID", "올바르지 않은 Candidate Photo case ID입니다.");
  }
  if (!isCandidateStoreId(candidateStoreId)) {
    throw new CandidatePhotoStorageError("INVALID_CANDIDATE_ID", "올바르지 않은 후보점포 ID입니다.");
  }
}

function contentTypeForFileName(fileName: string): string | null {
  const extension = path.extname(fileName).toLowerCase();
  return extension === ".png"
    ? "image/png"
    : extension === ".webp"
      ? "image/webp"
      : extension === ".jpg"
        ? "image/jpeg"
        : null;
}

function candidateFilePath(
  caseId: string,
  candidateStoreId: string,
  fileName: string,
  options: CandidatePhotoStorageOptions,
): string {
  const rootDir = path.resolve(resolveCandidatePhotoStorageRoot(options));
  const candidateDir = path.resolve(rootDir, caseId, candidateStoreId);
  const target = path.resolve(candidateDir, fileName);
  if (path.dirname(target) !== candidateDir || !target.startsWith(`${rootDir}${path.sep}`)) {
    throw new CandidatePhotoStorageError("INVALID_STORAGE_REFERENCE", "Candidate Photo reference가 저장 범위를 벗어났습니다.");
  }
  return target;
}

function hasOwnershipSegments(fileRef: string, caseId: string, candidateStoreId: string): boolean {
  const segments = fileRef.replaceAll("\\", "/").split("/").filter(Boolean);
  return segments.some((segment, index) => segment === caseId && segments[index + 1] === candidateStoreId);
}

export function createCandidateScopedPhotoReferenceV1(
  caseId: string,
  candidateStoreId: string,
  storageReference: string,
  options: CandidatePhotoStorageOptions = {},
): CandidateScopedPhotoReferenceV1 {
  assertCandidateContext(caseId, candidateStoreId);
  if (typeof storageReference !== "string" || storageReference.trim() === "" || path.isAbsolute(storageReference)) {
    throw new CandidatePhotoStorageError("INVALID_STORAGE_REFERENCE", "Candidate Photo storage reference가 올바르지 않습니다.");
  }

  const rootDir = path.resolve(resolveCandidatePhotoStorageRoot(options));
  const absolutePath = path.resolve(process.cwd(), storageReference.replaceAll("/", path.sep));
  const relative = path.relative(rootDir, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new CandidatePhotoStorageError("INVALID_STORAGE_REFERENCE", "Candidate Photo storage reference가 저장 범위를 벗어났습니다.");
  }
  const segments = relative.split(path.sep).filter(Boolean);
  if (segments.length !== 3) {
    throw new CandidatePhotoStorageError("PHOTO_PATH_MISMATCH", "Candidate Photo storage 구조가 올바르지 않습니다.");
  }
  const [storedCaseId, storedCandidateStoreId, fileName] = segments;
  if (storedCaseId !== caseId) {
    throw new CandidatePhotoStorageError("FOREIGN_CASE_PHOTO", "다른 Case의 Candidate Photo입니다.");
  }
  if (storedCandidateStoreId !== candidateStoreId) {
    throw new CandidatePhotoStorageError("FOREIGN_CANDIDATE_PHOTO", "다른 Candidate의 Photo입니다.");
  }
  if (!SAFE_FILE_NAME.test(fileName) || !contentTypeForFileName(fileName)) {
    throw new CandidatePhotoStorageError("INVALID_STORAGE_REFERENCE", "Candidate Photo 파일 reference가 올바르지 않습니다.");
  }
  if (!hasOwnershipSegments(storageReference, caseId, candidateStoreId)) {
    throw new CandidatePhotoStorageError("PHOTO_PATH_MISMATCH", "Candidate Photo ownership path가 일치하지 않습니다.");
  }

  return Object.freeze({
    schemaVersion: CANDIDATE_SCOPED_PHOTO_REFERENCE_SCHEMA_VERSION,
    caseId,
    candidateStoreId,
    assetRef: createCandidatePhotoAssetRefV1(caseId, candidateStoreId, fileName),
  });
}

export async function saveCandidateScopedPhotoV1(
  caseId: string,
  candidateStoreId: string,
  file: File,
  options: CandidatePhotoStorageOptions = {},
) {
  assertCandidateContext(caseId, candidateStoreId);
  const mime = MIME[file.type];
  if (!mime) throw new TypeError("JPG, PNG, WEBP 사진만 등록할 수 있습니다.");
  if (file.size <= 0 || file.size > MAX_BYTES) throw new RangeError("사진은 10MB 이하의 유효한 파일이어야 합니다.");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!mime.signature(bytes)) throw new TypeError("사진 파일 내용과 형식이 일치하지 않습니다.");

  const id = options.randomId?.() ?? randomUUID();
  if (!SAFE_BINARY_ID.test(id)) throw new RangeError("올바르지 않은 사진 binary ID입니다.");
  const absolutePath = path.join(
    resolveCandidatePhotoStorageRoot(options),
    caseId,
    candidateStoreId,
    `${id}${mime.extension}`,
  );
  const candidateDir = path.dirname(absolutePath);
  await fs.mkdir(candidateDir, { recursive: true });
  await fs.writeFile(absolutePath, bytes, { flag: "wx" });
  const storageReference = path.relative(process.cwd(), absolutePath).split(path.sep).join("/");
  const reference = createCandidateScopedPhotoReferenceV1(caseId, candidateStoreId, storageReference, options);
  return Object.freeze({ reference, contentType: file.type, size: file.size });
}

export async function readCandidateScopedPhotoV1(
  reference: CandidateScopedPhotoReferenceV1,
  options: CandidatePhotoStorageOptions = {},
) {
  if (!reference || typeof reference !== "object") {
    throw new CandidatePhotoStorageError("INVALID_STORAGE_REFERENCE", "Candidate Photo reference가 올바르지 않습니다.");
  }
  assertCandidateContext(reference.caseId, reference.candidateStoreId);
  if (reference.schemaVersion !== CANDIDATE_SCOPED_PHOTO_REFERENCE_SCHEMA_VERSION) {
    throw new CandidatePhotoStorageError("INVALID_STORAGE_REFERENCE", "Candidate Photo reference version이 올바르지 않습니다.");
  }
  const validatedAsset = validateCandidatePhotoAssetRefV1(
    reference.caseId,
    reference.candidateStoreId,
    reference.assetRef,
  );
  if (!validatedAsset.ok) {
    const message = validatedAsset.code === "FOREIGN_CASE_PHOTO"
      ? "다른 Case의 Candidate Photo입니다."
      : validatedAsset.code === "FOREIGN_CANDIDATE_PHOTO"
        ? "다른 Candidate의 Photo입니다."
        : "Candidate Photo reference가 올바르지 않습니다.";
    throw new CandidatePhotoStorageError(validatedAsset.code, message);
  }

  const absolutePath = candidateFilePath(
    reference.caseId,
    reference.candidateStoreId,
    validatedAsset.fileName,
    options,
  );
  const contentType = contentTypeForFileName(validatedAsset.fileName);
  if (!contentType) {
    throw new CandidatePhotoStorageError("INVALID_STORAGE_REFERENCE", "지원하지 않는 Candidate Photo reference입니다.");
  }
  try {
    return Object.freeze({ bytes: await fs.readFile(absolutePath), contentType });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CandidatePhotoStorageError("PHOTO_NOT_FOUND", "Candidate Photo를 찾을 수 없습니다.");
    }
    throw error;
  }
}
