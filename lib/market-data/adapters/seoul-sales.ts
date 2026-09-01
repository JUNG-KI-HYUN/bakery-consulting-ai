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

export interface SeoulSalesRecord {
  STDR_YYQU_CD?: unknown;
  TRDAR_SE_CD?: unknown;
  TRDAR_SE_CD_NM?: unknown;
  TRDAR_CD?: unknown;
  TRDAR_CD_NM?: unknown;
  SVC_INDUTY_CD?: unknown;
  SVC_INDUTY_CD_NM?: unknown;
  THSMON_SELNG_AMT?: unknown;
  THSMON_SELNG_CO?: unknown;
}

const metrics: ReadonlyArray<{
  field: keyof SeoulSalesRecord;
  metric: MarketDataMetric;
  unit: MarketDataUnit;
}> = [
  {
    field: "THSMON_SELNG_AMT",
    metric: "monthly_sales_amount",
    unit: "KRW",
  },
  {
    field: "THSMON_SELNG_CO",
    metric: "monthly_sales_count",
    unit: "count",
  },
];

export function adaptSeoulSalesRecord(
  record: SeoulSalesRecord,
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
      sourceId: "SRC-SEOUL-SALES",
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
        officialMarketTypeCode: optionalText(record.TRDAR_SE_CD) ?? null,
        officialMarketTypeName: optionalText(record.TRDAR_SE_CD_NM) ?? null,
      },
    };
  });
}
