import {
  adaptSeoulSalesRecord,
  type SeoulSalesRecord,
} from "../adapters/seoul-sales";
import { parseSeoulQuarterCode } from "../period";
import type { MarketDataObservation } from "../types";
import {
  requestSeoulOpenDataPage,
  SeoulOpenDataClientError,
} from "./seoul-open-data";

const SEOUL_SALES_SERVICE = "VwsmTrdarSelngQq";

export interface SeoulSalesRequest {
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

export async function fetchSeoulSalesObservations({
  start,
  end,
  quarterCode,
  signal,
}: SeoulSalesRequest): Promise<MarketDataObservation[]> {
  const page = await requestSeoulOpenDataPage({
    service: SEOUL_SALES_SERVICE,
    start,
    end,
    optionalParams: quarterParams(quarterCode),
    signal,
  });

  return page.rows.flatMap((row) =>
    adaptSeoulSalesRecord(row as SeoulSalesRecord),
  );
}
