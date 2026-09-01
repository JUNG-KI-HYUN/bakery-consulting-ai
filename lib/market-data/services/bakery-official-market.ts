import {
  adaptSeoulSalesRecord,
  type SeoulSalesRecord,
} from "../adapters/seoul-sales";
import {
  adaptSeoulStoresRecord,
  type SeoulStoresRecord,
} from "../adapters/seoul-stores";
import { fetchSeoulSalesPage } from "../clients/seoul-sales";
import {
  SeoulOpenDataClientError,
  type SeoulOpenDataPage,
  type SeoulOpenDataRow,
} from "../clients/seoul-open-data";
import { fetchSeoulStoresPage } from "../clients/seoul-stores";
import { parseSeoulQuarterCode } from "../period";
import type { MarketDataObservation } from "../types";
import { optionalText } from "../value";

const BAKERY_INDUSTRY_CODE = "CS100005";
const BAKERY_INDUSTRY_NAME = "제과점";
const SEOUL_API_PAGE_SIZE = 1_000;
const LATEST_QUARTER_LOOKBACK = 8;
const SEOUL_API_NO_DATA_CODE = "INFO-200";

export interface SeoulMarketQuarter {
  quarterCode: string;
  referencePeriod: string;
}

export type BakeryOfficialMarketDataStatus =
  | "available"
  | "partial"
  | "missing";

export interface BakeryOfficialMarketData {
  officialMarketCode: string;
  officialMarketName: string | null;
  industryCode: typeof BAKERY_INDUSTRY_CODE;
  industryName: string;
  quarterCode: string;
  referencePeriod: string;
  sales: MarketDataObservation[];
  stores: MarketDataObservation[];
  dataStatus: BakeryOfficialMarketDataStatus;
}

export interface BakeryOfficialMarketDataRequest {
  marketCode: string;
  quarterCode?: string | number;
  signal?: AbortSignal;
}

function isNoDataError(error: unknown): boolean {
  return (
    error instanceof SeoulOpenDataClientError &&
    error.kind === "api" &&
    error.apiCode === SEOUL_API_NO_DATA_CODE
  );
}

function normalizeOfficialMarketCode(marketCode: string): string {
  const normalized = marketCode.trim();

  if (!/^\d+$/.test(normalized)) {
    throw new SeoulOpenDataClientError(
      "validation",
      "marketCode는 숫자로 된 공식상권 코드여야 합니다.",
    );
  }

  return normalized;
}

function requireQuarter(quarterCode: string | number): SeoulMarketQuarter {
  const parsed = parseSeoulQuarterCode(quarterCode);

  if (parsed.status === "invalid") {
    throw new SeoulOpenDataClientError("validation", parsed.reason);
  }

  return {
    quarterCode: parsed.rawValue,
    referencePeriod: parsed.referencePeriod,
  };
}

function currentSeoulYearAndQuarter(): { year: number; quarter: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);

  return { year, quarter: Math.floor((month - 1) / 3) + 1 };
}

function previousQuarterCode(
  year: number,
  quarter: number,
  offset: number,
): string {
  const quarterIndex = year * 4 + quarter - 1 - offset;
  const targetYear = Math.floor(quarterIndex / 4);
  const targetQuarter = (quarterIndex % 4) + 1;

  return `${targetYear}${targetQuarter}`;
}

async function sourceHasQuarter(
  requestPage: (quarterCode: string) => Promise<SeoulOpenDataPage>,
  quarterCode: string,
): Promise<boolean> {
  try {
    const page = await requestPage(quarterCode);

    if (page.totalCount === null) {
      throw new SeoulOpenDataClientError(
        "response",
        "분기 확인 응답에 전체 건수(list_total_count)가 없습니다.",
      );
    }

    return page.rows.length > 0 || page.totalCount > 0;
  } catch (error) {
    if (isNoDataError(error)) {
      return false;
    }

    throw error;
  }
}

export async function findLatestCommonSeoulMarketQuarter(
  signal?: AbortSignal,
): Promise<SeoulMarketQuarter> {
  const { year, quarter } = currentSeoulYearAndQuarter();

  for (let offset = 0; offset < LATEST_QUARTER_LOOKBACK; offset += 1) {
    const quarterCode = previousQuarterCode(year, quarter, offset);
    const salesExists = await sourceHasQuarter(
      (candidate) =>
        fetchSeoulSalesPage({
          start: 1,
          end: 1,
          quarterCode: candidate,
          signal,
        }),
      quarterCode,
    );

    if (!salesExists) {
      continue;
    }

    const storesExists = await sourceHasQuarter(
      (candidate) =>
        fetchSeoulStoresPage({
          start: 1,
          end: 1,
          quarterCode: candidate,
          signal,
        }),
      quarterCode,
    );

    if (storesExists) {
      return requireQuarter(quarterCode);
    }
  }

  throw new Error("최근 8개 분기에서 SALES/STORES 공통 데이터가 없습니다.");
}

function matchesBakeryMarketRow(
  row: SeoulOpenDataRow,
  marketCode: string,
): boolean {
  return (
    optionalText(row.TRDAR_CD) === marketCode &&
    optionalText(row.SVC_INDUTY_CD) === BAKERY_INDUSTRY_CODE
  );
}

export async function fetchBakerySalesForOfficialMarket(
  marketCode: string,
  quarterCode: string | number,
  signal?: AbortSignal,
): Promise<MarketDataObservation[]> {
  const normalizedMarketCode = normalizeOfficialMarketCode(marketCode);
  const quarter = requireQuarter(quarterCode);
  const firstPage = await fetchSeoulSalesPage({
    start: 1,
    end: SEOUL_API_PAGE_SIZE,
    quarterCode: quarter.quarterCode,
    signal,
  });

  if (firstPage.totalCount === null) {
    throw new SeoulOpenDataClientError(
      "response",
      "SALES 응답에 전체 건수(list_total_count)가 없습니다.",
    );
  }

  const matchedRows = firstPage.rows.filter((row) =>
    matchesBakeryMarketRow(row, normalizedMarketCode),
  );

  for (
    let start = SEOUL_API_PAGE_SIZE + 1;
    start <= firstPage.totalCount;
    start += SEOUL_API_PAGE_SIZE
  ) {
    const page = await fetchSeoulSalesPage({
      start,
      end: Math.min(start + SEOUL_API_PAGE_SIZE - 1, firstPage.totalCount),
      quarterCode: quarter.quarterCode,
      signal,
    });

    matchedRows.push(
      ...page.rows.filter((row) =>
        matchesBakeryMarketRow(row, normalizedMarketCode),
      ),
    );
  }

  return matchedRows.flatMap((row) =>
    adaptSeoulSalesRecord(row as SeoulSalesRecord),
  );
}

export async function fetchBakeryStoresForOfficialMarket(
  marketCode: string,
  quarterCode: string | number,
  signal?: AbortSignal,
): Promise<MarketDataObservation[]> {
  const normalizedMarketCode = normalizeOfficialMarketCode(marketCode);
  const quarter = requireQuarter(quarterCode);
  const page = await fetchSeoulStoresPage({
    start: 1,
    end: SEOUL_API_PAGE_SIZE,
    quarterCode: quarter.quarterCode,
    marketCode: normalizedMarketCode,
    signal,
  });
  const matchedRows = page.rows.filter(
    (row) => optionalText(row.SVC_INDUTY_CD) === BAKERY_INDUSTRY_CODE,
  );

  return matchedRows.flatMap((row) =>
    adaptSeoulStoresRecord(row as SeoulStoresRecord),
  );
}

async function observationsOrMissing(
  load: () => Promise<MarketDataObservation[]>,
): Promise<MarketDataObservation[]> {
  try {
    return await load();
  } catch (error) {
    if (isNoDataError(error)) {
      return [];
    }

    throw error;
  }
}

function combinedDataStatus(
  sales: MarketDataObservation[],
  stores: MarketDataObservation[],
): BakeryOfficialMarketDataStatus {
  if (sales.length > 0 && stores.length > 0) {
    return "available";
  }

  if (sales.length > 0 || stores.length > 0) {
    return "partial";
  }

  return "missing";
}

export async function getBakeryOfficialMarketData({
  marketCode,
  quarterCode,
  signal,
}: BakeryOfficialMarketDataRequest): Promise<BakeryOfficialMarketData> {
  const normalizedMarketCode = normalizeOfficialMarketCode(marketCode);
  const quarter =
    quarterCode === undefined
      ? await findLatestCommonSeoulMarketQuarter(signal)
      : requireQuarter(quarterCode);
  const sales = await observationsOrMissing(() =>
    fetchBakerySalesForOfficialMarket(
      normalizedMarketCode,
      quarter.quarterCode,
      signal,
    ),
  );
  const stores = await observationsOrMissing(() =>
    fetchBakeryStoresForOfficialMarket(
      normalizedMarketCode,
      quarter.quarterCode,
      signal,
    ),
  );
  const observations = [...sales, ...stores];
  const marketName = observations.find(
    (observation) => observation.geographyName,
  )?.geographyName;
  const industryName = observations.find(
    (observation) => observation.industryName,
  )?.industryName;

  return {
    officialMarketCode: normalizedMarketCode,
    officialMarketName: marketName ?? null,
    industryCode: BAKERY_INDUSTRY_CODE,
    industryName: industryName ?? BAKERY_INDUSTRY_NAME,
    quarterCode: quarter.quarterCode,
    referencePeriod: quarter.referencePeriod,
    sales,
    stores,
    dataStatus: combinedDataStatus(sales, stores),
  };
}
