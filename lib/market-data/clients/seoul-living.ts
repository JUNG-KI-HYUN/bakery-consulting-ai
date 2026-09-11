import {
  adaptSeoulLivingRecord,
  type SeoulLivingRecord,
} from "../adapters/seoul-living";
import type { MarketDataObservation } from "../types";
import {
  requestSeoulOpenDataPage,
  SeoulOpenDataClientError,
  type SeoulOpenDataPage,
  type SeoulOpenDataRow,
} from "./seoul-open-data";

export const SEOUL_LIVING_SERVICE = "Se250MSpopLocalResd";

export const SEOUL_LIVING_API_FIELDS = [
  "YMD",
  "TT",
  "H_DNG_CD",
  "CELL_ID",
  "SPOP",
  "M00",
  "M10",
  "M15",
  "M20",
  "M25",
  "M30",
  "M35",
  "M40",
  "M45",
  "M50",
  "M55",
  "M60",
  "M65",
  "M70",
  "F00",
  "F10",
  "F15",
  "F20",
  "F25",
  "F30",
  "F35",
  "F40",
  "F45",
  "F50",
  "F55",
  "F60",
  "F65",
  "F70",
] as const;

export type SeoulLivingApiField = (typeof SEOUL_LIVING_API_FIELDS)[number];
export type SeoulLivingApiRecord = Record<SeoulLivingApiField, unknown>;

export interface SeoulLivingRequest {
  start: number;
  end: number;
  signal?: AbortSignal;
}

export type SeoulLivingPage = Omit<SeoulOpenDataPage, "rows"> & {
  fetchedAt: string;
  rows: SeoulLivingApiRecord[];
};

function validateApiRecord(
  row: SeoulOpenDataRow,
  rowIndex: number,
): SeoulLivingApiRecord {
  const actualFields = Object.keys(row);
  const missingFields = SEOUL_LIVING_API_FIELDS.filter(
    (field) => !Object.hasOwn(row, field),
  );
  const unexpectedFields = actualFields.filter(
    (field) =>
      !SEOUL_LIVING_API_FIELDS.includes(field as SeoulLivingApiField),
  );

  if (missingFields.length > 0 || unexpectedFields.length > 0) {
    const details = [
      missingFields.length > 0
        ? `누락 필드: ${missingFields.join(", ")}`
        : null,
      unexpectedFields.length > 0
        ? `예상하지 않은 필드: ${unexpectedFields.join(", ")}`
        : null,
    ].filter(Boolean);

    throw new SeoulOpenDataClientError(
      "response",
      `서울 250m 생활인구 API ${rowIndex + 1}번째 행의 schema가 공식 명세와 다릅니다. ${details.join("; ")}`,
    );
  }

  return row as SeoulLivingApiRecord;
}

export function validateSeoulLivingApiRows(
  rows: SeoulOpenDataRow[],
): SeoulLivingApiRecord[] {
  return rows.map(validateApiRecord);
}

export function toSeoulLivingRecord(
  row: SeoulLivingApiRecord,
): SeoulLivingRecord {
  return {
    일자: row.YMD,
    시간: row.TT,
    행정동코드: row.H_DNG_CD,
    "250M격자": row.CELL_ID,
    생활인구합계: row.SPOP,
  };
}

export async function fetchSeoulLivingPage({
  start,
  end,
  signal,
}: SeoulLivingRequest): Promise<SeoulLivingPage> {
  const page = await requestSeoulOpenDataPage({
    service: SEOUL_LIVING_SERVICE,
    start,
    end,
    signal,
  });

  return {
    ...page,
    fetchedAt: new Date().toISOString(),
    rows: validateSeoulLivingApiRows(page.rows),
  };
}

export async function fetchSeoulLivingObservations({
  start,
  end,
  signal,
}: SeoulLivingRequest): Promise<MarketDataObservation[]> {
  const page = await fetchSeoulLivingPage({ start, end, signal });

  return page.rows.flatMap((row) =>
    adaptSeoulLivingRecord(toSeoulLivingRecord(row)),
  );
}
