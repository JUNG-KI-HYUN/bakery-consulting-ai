import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isCandidateStoreId } from "../field/identifiers";
import {
  isCandidatePhotoCaseId,
} from "../candidate-photo/asset-reference";
import {
  readCandidateScopedPhotoV1,
  resolveCandidatePhotoStorageRoot,
  saveCandidateScopedPhotoV1,
  type CandidatePhotoStorageOptions,
  type CandidateScopedPhotoReferenceV1,
} from "../candidate-photo/storage.server";

export {
  CANDIDATE_SCOPED_PHOTO_REFERENCE_SCHEMA_VERSION,
  CandidatePhotoStorageError,
  createCandidateScopedPhotoReferenceV1,
  type CandidatePhotoStorageErrorCode,
  type CandidateScopedPhotoReferenceV1,
} from "../candidate-photo/storage.server";

const MAX_BYTES = 10 * 1024 * 1024;
const SAFE_BINARY_ID = /^[a-zA-Z0-9_-]+$/;
const MIME: Record<string, { extension: string; signature: (buffer: Buffer) => boolean }> = {
  "image/jpeg": { extension: ".jpg", signature: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  "image/png": { extension: ".png", signature: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  "image/webp": { extension: ".webp", signature: (buffer) => buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP" },
};

type Options = CandidatePhotoStorageOptions;

function root(options: Options = {}) {
  return resolveCandidatePhotoStorageRoot(options);
}

async function savePhoto(caseId: string, candidateStoreId: string | null, file: File, options: Options = {}) {
  if (!isCandidatePhotoCaseId(caseId)) throw new RangeError("올바르지 않은 상세리포트 case ID입니다.");
  if (candidateStoreId !== null && !isCandidateStoreId(candidateStoreId)) throw new RangeError("올바르지 않은 후보점포 ID입니다.");
  const mime = MIME[file.type];
  if (!mime) throw new TypeError("JPG, PNG, WEBP 사진만 등록할 수 있습니다.");
  if (file.size <= 0 || file.size > MAX_BYTES) throw new RangeError("사진은 10MB 이하의 유효한 파일이어야 합니다.");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!mime.signature(bytes)) throw new TypeError("사진 파일 내용과 형식이 일치하지 않습니다.");

  const id = options.randomId?.() ?? randomUUID();
  if (!SAFE_BINARY_ID.test(id)) throw new RangeError("올바르지 않은 사진 binary ID입니다.");
  const caseDir = candidateStoreId === null
    ? path.join(root(options), caseId)
    : path.join(root(options), caseId, candidateStoreId);
  const absolutePath = path.join(caseDir, `${id}${mime.extension}`);
  await fs.mkdir(caseDir, { recursive: true });
  await fs.writeFile(absolutePath, bytes, { flag: "wx" });
  const relativePath = path.relative(process.cwd(), absolutePath).split(path.sep).join("/");
  return {
    fileRef: relativePath,
    contentType: file.type,
    size: file.size,
    ...(candidateStoreId === null ? {} : { candidateStoreId }),
  };
}

/** Legacy v1 upload path. New Apartment Reports must use saveCandidateDetailedReportPhoto. */
export async function saveDetailedReportPhoto(caseId: string, file: File, options: Options = {}) {
  return savePhoto(caseId, null, file, options);
}

export async function saveCandidateDetailedReportPhoto(
  caseId: string,
  candidateStoreId: string,
  file: File,
  options: Options = {},
) {
  return savePhoto(caseId, candidateStoreId, file, options);
}

/** 신규 Candidate Photo V1 write boundary. Legacy fileRef를 외부 반환하지 않는다. */
export async function saveCandidateScopedDetailedReportPhotoV1(
  caseId: string,
  candidateStoreId: string,
  file: File,
  options: Options = {},
) {
  return saveCandidateScopedPhotoV1(caseId, candidateStoreId, file, options);
}

/** 신규 Candidate Photo V1 read boundary. Case/Candidate와 opaque reference가 모두 일치해야 한다. */
export async function readCandidateScopedDetailedReportPhotoV1(
  reference: CandidateScopedPhotoReferenceV1,
  options: Options = {},
) {
  return readCandidateScopedPhotoV1(reference, options);
}

export async function readDetailedReportPhoto(fileRef: string, options: Options = {}) {
  const rootDir = path.resolve(root(options));
  const normalized = fileRef.replaceAll("/", path.sep);
  const absolutePath = path.resolve(process.cwd(), normalized);
  if (absolutePath !== rootDir && !absolutePath.startsWith(`${rootDir}${path.sep}`)) throw new RangeError("허용되지 않은 사진 경로입니다.");
  const extension = path.extname(absolutePath).toLowerCase();
  const contentType = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : extension === ".jpg" ? "image/jpeg" : null;
  if (!contentType) throw new RangeError("지원하지 않는 사진 경로입니다.");
  try {
    return { bytes: await fs.readFile(absolutePath), contentType };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
