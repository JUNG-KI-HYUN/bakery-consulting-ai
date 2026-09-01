import {
  adaptSeoulStoresRecord,
  type SeoulStoresRecord,
} from "../adapters/seoul-stores";
import { parseSeoulQuarterCode } from "../period";
import type { MarketDataObservation } from "../types";
import {
  requestSeoulOpenDataPage,
  SeoulOpenDataClientError,
} from "./seoul-open-data";

const SEOUL_STORES_SERVICE = "VwsmTrdarStorQq";

export interface SeoulStoresRequest {
  start: number;
  end: number;
  quarterCode?: string | number;
  signal?: AbortSignal;
}

function quarterParams(quarterCode: string | number | undefined): string[] {
  if (quarterCode === undefined) {
    return [];
  }

  const parsed = parseSeoulQuarterCode(quarterCode);

  if (parsed.status === "invalid") {
    throw new SeoulOpenDataClientError("validation", parsed.reason);
  }

  return [parsed.rawValue];
}

export async function fetchSeoulStoresObservations({
  start,
  end,
  quarterCode,
  signal,
}: SeoulStoresRequest): Promise<MarketDataObservation[]> {
  const page = await requestSeoulOpenDataPage({
    service: SEOUL_STORES_SERVICE,
    start,
    end,
    optionalParams: quarterParams(quarterCode),
    signal,
  });

  return page.rows.flatMap((row) =>
    adaptSeoulStoresRecord(row as SeoulStoresRecord),
  );
}
