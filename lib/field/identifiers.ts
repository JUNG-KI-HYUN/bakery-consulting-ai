/**
 * FIELD 식별자 생성·해석.
 *
 * CandidateStore / SiteSurvey의 안정 식별자는 1회 생성 후 저장되는 opaque ID다.
 * 주소·상호·고객명·전화번호·임대조건 등 바뀌는 업무값이나 개인정보로 만들지 않는다.
 *
 * `STORE-<YYYYMMDD>-<seq>` 형식은 쓰지 않는다. 날짜+순번은
 * - 같은 날 같은 순번을 두 점포에 주면 충돌하고
 * - 저장 전에 같은 입력으로 다시 호출하면 다른 점포인데도 같은 ID가 나와
 * 가짜 안정성을 만든다.
 *
 * 새 dependency를 쓰지 않는다. `crypto.randomUUID()`는 Node / 브라우저 / Next.js 기본 API다.
 */

const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const CANDIDATE_STORE_ID_PATTERN = new RegExp(`^store_${UUID_PATTERN}$`, "i");
const SITE_SURVEY_ID_PATTERN = new RegExp(`^survey_${UUID_PATTERN}$`, "i");

function createOpaqueId(prefix: "store" | "survey"): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new RangeError("FIELD identifier creation requires crypto.randomUUID()");
  }
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}

/**
 * 새 후보점포의 stable ID를 1회 발급한다.
 * 호출마다 다른 값을 만든다. 동일 점포의 주소·임대조건이 바뀌어도 이미 저장된 ID는 이 함수를 다시 호출하지 않는다.
 * 읽기 경로나 resolver가 이 함수를 호출하지 않는다.
 */
export function createCandidateStoreId(): string {
  return createOpaqueId("store");
}

export function isCandidateStoreId(value: unknown): value is string {
  return typeof value === "string" && CANDIDATE_STORE_ID_PATTERN.test(value);
}

/**
 * 새 조사 회차의 stable ID를 1회 발급한다.
 * 점포 ID·조사일·회차 번호를 ID에 넣지 않는다. 점포 연결은 SiteSurvey.candidateStoreId가 담당한다.
 */
export function createSiteSurveyId(): string {
  return createOpaqueId("survey");
}

export function isSiteSurveyId(value: unknown): value is string {
  return typeof value === "string" && SITE_SURVEY_ID_PATTERN.test(value);
}
