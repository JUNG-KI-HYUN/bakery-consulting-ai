export type MarketDataSourceId =
  | "SRC-SEOUL-SALES"
  | "SRC-SEOUL-STORES"
  | "SRC-SEOUL-LIVING";

export type MarketDataGeographyType = "official_market" | "living_grid";

export type MarketDataStatus =
  | "available"
  | "suppressed"
  | "missing"
  | "invalid";

export type MarketDataMetric =
  | "monthly_sales_amount"
  | "monthly_sales_count"
  | "similar_industry_store_count"
  | "store_count"
  | "franchise_store_count"
  | "opening_rate"
  | "opening_store_count"
  | "closing_rate"
  | "closing_store_count"
  | "living_population_total";

export type MarketDataUnit = "KRW" | "count" | "percent" | "people";

export interface MarketDataMetadata {
  rawReferencePeriod?: string | null;
  rawDate?: string | null;
  rawHour?: string | null;
  administrativeDongCode?: string | null;
  officialMarketTypeCode?: string | null;
  officialMarketTypeName?: string | null;
}

export interface MarketDataObservation {
  sourceId: MarketDataSourceId;
  referencePeriod: string | null;
  geographyType: MarketDataGeographyType;
  geographyId: string | null;
  geographyName?: string;
  industryCode?: string;
  industryName?: string;
  metric: MarketDataMetric;
  value: number | null;
  unit: MarketDataUnit;
  dataStatus: MarketDataStatus;
  metadata?: MarketDataMetadata;
}

export interface ParsedMetricValue {
  value: number | null;
  dataStatus: MarketDataStatus;
}
