import {
  adaptSeoulStoresRecord,
  type SeoulStoresRecord,
} from "../adapters/seoul-stores";
import { parseSeoulQuarterCode } from "../period";
import type { MarketDataObservation } from "../types";
import {
  requestSeoulOpenDataPage,
  SeoulOpenDataClientError,
  type SeoulOpenDataPage,
} from "./seoul-open-data";

const SEOUL_STORES_SERVICE = "VwsmTrdarStorQq";

export interface SeoulStoresRequest {
  start: number;
  end: number;
  quarterCode?: string | number;
  marketCode?: string;
  signal?: AbortSignal;
}

function storeParams(
  quarterCode: string | number | undefined,
  marketCode: string | undefined,
): string[] {
  if (quarterCode === undefined && marketCode === undefined) {
    return [];
  }

  if (quarterCode === undefined) {
    throw new SeoulOpenDataClientError(
      "validation",
      "marketCode 검색조건에는 quarterCode가 필요합니다.",
    );
  }

  const parsed = parseSeoulQuarterCode(quarterCode);

  if (parsed.status === "invalid") {
    throw new SeoulOpenDataClientError("validation", parsed.reason);
  }

  if (marketCode === undefined) {
    return [parsed.rawValue];
  }

  const normalizedMarketCode = marketCode.trim();

  if (!/^\d+$/.test(normalizedMarketCode)) {
    throw new SeoulOpenDataClientError(
      "validation",
      "marketCode는 숫자로 된 공식상권 코드여야 합니다.",
    );
  }

  return [parsed.rawValue, normalizedMarketCode];
}

export async function fetchSeoulStoresPage({
  start,
  end,
  quarterCode,
  marketCode,
  signal,
}: SeoulStoresRequest): Promise<SeoulOpenDataPage> {
  return requestSeoulOpenDataPage({
    service: SEOUL_STORES_SERVICE,
    start,
    end,
    optionalParams: storeParams(quarterCode, marketCode),
    signal,
  });
}

export async function fetchSeoulStoresObservations({
  start,
  end,
  quarterCode,
  marketCode,
  signal,
}: SeoulStoresRequest): Promise<MarketDataObservation[]> {
  const page = await fetchSeoulStoresPage({
    start,
    end,
    quarterCode,
    marketCode,
    signal,
  });

  return page.rows.flatMap((row) =>
    adaptSeoulStoresRecord(row as SeoulStoresRecord),
  );
}
