const SEOUL_OPEN_DATA_BASE_URL = "http://openapi.seoul.go.kr:8088";
const SEOUL_OPEN_DATA_MAX_PAGE_SIZE = 1_000;
const SEOUL_OPEN_DATA_SUCCESS_CODE = "INFO-000";

export type SeoulOpenDataErrorKind =
  | "configuration"
  | "validation"
  | "http"
  | "api"
  | "response";

export class SeoulOpenDataClientError extends Error {
  readonly kind: SeoulOpenDataErrorKind;
  readonly httpStatus?: number;
  readonly apiCode?: string;

  constructor(
    kind: SeoulOpenDataErrorKind,
    message: string,
    details: { httpStatus?: number; apiCode?: string } = {},
  ) {
    super(message);
    this.name = "SeoulOpenDataClientError";
    this.kind = kind;
    this.httpStatus = details.httpStatus;
    this.apiCode = details.apiCode;
  }
}

export type SeoulOpenDataRow = Record<string, unknown>;

export interface SeoulOpenDataPage {
  service: string;
  start: number;
  end: number;
  totalCount: number | null;
  rows: SeoulOpenDataRow[];
}

export interface SeoulOpenDataRequest {
  service: string;
  start: number;
  end: number;
  optionalParams?: ReadonlyArray<string | number>;
  signal?: AbortSignal;
}

interface SeoulApiResult {
  code: string;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readApiKey(): string {
  const apiKey = process.env.SEOUL_OPEN_DATA_API_KEY?.trim();

  if (!apiKey) {
    throw new SeoulOpenDataClientError(
      "configuration",
      "SEOUL_OPEN_DATA_API_KEY 환경변수가 설정되지 않았습니다.",
    );
  }

  return apiKey;
}

function validateRange(start: number, end: number): void {
  if (!Number.isInteger(start) || start <= 0) {
    throw new SeoulOpenDataClientError(
      "validation",
      "start는 양의 정수여야 합니다.",
    );
  }

  if (!Number.isInteger(end) || end <= 0) {
    throw new SeoulOpenDataClientError(
      "validation",
      "end는 양의 정수여야 합니다.",
    );
  }

  if (end < start) {
    throw new SeoulOpenDataClientError(
      "validation",
      "end는 start보다 크거나 같아야 합니다.",
    );
  }

  if (end - start + 1 > SEOUL_OPEN_DATA_MAX_PAGE_SIZE) {
    throw new SeoulOpenDataClientError(
      "validation",
      `한 요청 범위는 ${SEOUL_OPEN_DATA_MAX_PAGE_SIZE}건을 넘을 수 없습니다.`,
    );
  }
}

function validateService(service: string): string {
  const normalizedService = service.trim();

  if (!/^[A-Za-z0-9_]+$/.test(normalizedService)) {
    throw new SeoulOpenDataClientError(
      "validation",
      "서울 열린데이터 서비스명이 올바르지 않습니다.",
    );
  }

  return normalizedService;
}

function encodeOptionalParams(
  optionalParams: ReadonlyArray<string | number>,
): string[] {
  return optionalParams.map((param) => {
    const text = String(param).trim();

    if (!text) {
      throw new SeoulOpenDataClientError(
        "validation",
        "서울 열린데이터 선택 검색조건은 빈 값일 수 없습니다.",
      );
    }

    return encodeURIComponent(text);
  });
}

function readApiResult(value: unknown): SeoulApiResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const code = typeof value.CODE === "string" ? value.CODE.trim() : "";
  const message =
    typeof value.MESSAGE === "string" ? value.MESSAGE.trim() : "";

  return code ? { code, message } : null;
}

function readTotalCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value);
  }

  return null;
}

export async function requestSeoulOpenDataPage({
  service,
  start,
  end,
  optionalParams = [],
  signal,
}: SeoulOpenDataRequest): Promise<SeoulOpenDataPage> {
  validateRange(start, end);
  const normalizedService = validateService(service);
  const pathSegments = [
    encodeURIComponent(readApiKey()),
    "json",
    normalizedService,
    String(start),
    String(end),
    ...encodeOptionalParams(optionalParams),
  ];
  const requestUrl = `${SEOUL_OPEN_DATA_BASE_URL}/${pathSegments.join("/")}`;

  let response: Response;

  try {
    response = await fetch(requestUrl, { cache: "no-store", signal });
  } catch {
    throw new SeoulOpenDataClientError(
      "http",
      "서울 열린데이터 API HTTP 요청에 실패했습니다.",
    );
  }

  if (!response.ok) {
    throw new SeoulOpenDataClientError(
      "http",
      `서울 열린데이터 API가 HTTP ${response.status} 오류를 반환했습니다.`,
      { httpStatus: response.status },
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new SeoulOpenDataClientError(
      "response",
      "서울 열린데이터 API 응답을 JSON으로 해석할 수 없습니다.",
    );
  }

  if (!isRecord(payload)) {
    throw new SeoulOpenDataClientError(
      "response",
      "서울 열린데이터 API 응답 형식이 올바르지 않습니다.",
    );
  }

  const rawServicePayload = payload[normalizedService];
  const servicePayload = isRecord(rawServicePayload)
    ? rawServicePayload
    : null;
  const apiResult = readApiResult(servicePayload?.RESULT ?? payload.RESULT);

  if (!apiResult) {
    throw new SeoulOpenDataClientError(
      "response",
      "서울 열린데이터 API 응답에 RESULT.CODE가 없습니다.",
    );
  }

  if (apiResult.code !== SEOUL_OPEN_DATA_SUCCESS_CODE) {
    throw new SeoulOpenDataClientError(
      "api",
      `서울 열린데이터 API 오류 (${apiResult.code}): ${apiResult.message || "메시지 없음"}`,
      { apiCode: apiResult.code },
    );
  }

  if (!servicePayload) {
    throw new SeoulOpenDataClientError(
      "response",
      `서울 열린데이터 API 응답에 ${normalizedService} 데이터가 없습니다.`,
    );
  }

  const rawRows = servicePayload.row;

  if (
    rawRows !== undefined &&
    rawRows !== null &&
    (!Array.isArray(rawRows) || !rawRows.every(isRecord))
  ) {
    throw new SeoulOpenDataClientError(
      "response",
      "서울 열린데이터 API row 형식이 올바르지 않습니다.",
    );
  }

  const rows: SeoulOpenDataRow[] = Array.isArray(rawRows) ? rawRows : [];

  return {
    service: normalizedService,
    start,
    end,
    totalCount: readTotalCount(servicePayload.list_total_count),
    rows,
  };
}
