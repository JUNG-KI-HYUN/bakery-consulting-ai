import { parseSeoulLivingPeriod } from "../period";
import type { MarketDataObservation } from "../types";
import {
  invalidateMetricValue,
  optionalText,
  parseMetricValue,
} from "../value";

export interface SeoulLivingRecord {
  일자?: unknown;
  시간?: unknown;
  행정동코드?: unknown;
  "250m격자"?: unknown;
  "250M격자"?: unknown;
  생활인구합계?: unknown;
}

export function adaptSeoulLivingRecord(
  record: SeoulLivingRecord,
): MarketDataObservation[] {
  const period = parseSeoulLivingPeriod(record.일자, record.시간);
  const geographyId =
    optionalText(record["250m격자"]) ??
    optionalText(record["250M격자"]) ??
    null;
  const contextIsValid = period.status === "valid" && geographyId !== null;
  const parsed = invalidateMetricValue(
    parseMetricValue(record.생활인구합계, ["*"]),
    contextIsValid,
  );

  return [
    {
      sourceId: "SRC-SEOUL-LIVING",
      referencePeriod: period.referencePeriod,
      geographyType: "living_grid",
      geographyId,
      metric: "living_population_total",
      value: parsed.value,
      unit: "people",
      dataStatus: parsed.dataStatus,
      metadata: {
        rawDate: optionalText(record.일자) ?? null,
        rawHour: optionalText(record.시간) ?? null,
        administrativeDongCode: optionalText(record.행정동코드) ?? null,
      },
    },
  ];
}
