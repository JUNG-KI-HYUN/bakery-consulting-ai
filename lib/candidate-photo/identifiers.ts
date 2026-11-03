const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const CANDIDATE_PHOTO_ID_PATTERN = new RegExp(`^photo_${UUID_PATTERN}$`, "i");

/** Filename, 배열 index, 주소와 무관한 Candidate Photo stable ID를 1회 발급한다. */
export function createCandidatePhotoId(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new RangeError("Candidate Photo identifier creation requires crypto.randomUUID()");
  }
  return `photo_${globalThis.crypto.randomUUID()}`;
}

export function isCandidatePhotoId(value: unknown): value is string {
  return typeof value === "string" && CANDIDATE_PHOTO_ID_PATTERN.test(value);
}
