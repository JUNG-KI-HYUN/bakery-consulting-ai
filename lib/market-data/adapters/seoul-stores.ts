import { parseSeoulQuarterCode } from "../period";
import type {
  MarketDataMetric,
  MarketDataObservation,
  MarketDataUnit,
} from "../types";
import {
  invalidateMetricValue,
  optionalText,
  parseMetricValue,
} from "../value";

export interface SeoulStoresRecord {
  STDR_YYQU_CD?: unknown;
  TRDAR_CD?: unknown;
  TRDAR_CD_NM?: unknown;
  SVC_INDUTY_CD?: unknown;
  SVC_INDUTY_CD_NM?: unknown;
  SIMILR_INDUTY_STOR_CO?: unknown;
  STOR_CO?: unknown;
  FRC_STOR_CO?: unknown;
  OPBIZ_RT?: unknown;
  OPBIZ_STOR_CO?: unknown;
  CLSBIZ_RT?: unknown;
  CLSBIZ_STOR_CO?: unknown;
}

const metrics: ReadonlyArray<{
  field: keyof SeoulStoresRecord;
  metric: MarketDataMetric;
  unit: MarketDataUnit;
}> = [
  {
    field: "SIMILR_INDUTY_STOR_CO",
    metric: "similar_industry_store_count",
    unit: "count",
  },
  { field: "STOR_CO", metric: "store_count", unit: "count" },
  {
    field: "FRC_STOR_CO",
    metric: "franchise_store_count",
    unit: "count",
  },
  { field: "OPBIZ_RT", metric: "opening_rate", unit: "percent" },
  {
    field: "OPBIZ_STOR_CO",
    metric: "opening_store_count",
    unit: "count",
  },
  { field: "CLSBIZ_RT", metric: "closing_rate", unit: "percent" },
  {
    field: "CLSBIZ_STOR_CO",
    metric: "closing_store_count",
    unit: "count",
  },
];

export function adaptSeoulStoresRecord(
  record: SeoulStoresRecord,
): MarketDataObservation[] {
  const period = parseSeoulQuarterCode(record.STDR_YYQU_CD);
  const geographyId = optionalText(record.TRDAR_CD) ?? null;
  const contextIsValid = period.status === "valid" && geographyId !== null;
  const geographyName = optionalText(record.TRDAR_CD_NM);
  const industryCode = optionalText(record.SVC_INDUTY_CD);
  const industryName = optionalText(record.SVC_INDUTY_CD_NM);

  return metrics.map(({ field, metric, unit }) => {
    const parsed = invalidateMetricValue(
      parseMetricValue(record[field]),
      contextIsValid,
    );

    return {
      sourceId: "SRC-SEOUL-STORES",
      referencePeriod: period.referencePeriod,
      geographyType: "official_market",
      geographyId,
      ...(geographyName ? { geographyName } : {}),
      ...(industryCode ? { industryCode } : {}),
      ...(industryName ? { industryName } : {}),
      metric,
      value: parsed.value,
      unit,
      dataStatus: parsed.dataStatus,
      metadata: {
        rawReferencePeriod: period.rawValue,
      },
    };
  });
}
