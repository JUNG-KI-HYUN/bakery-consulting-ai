import type { Sbiz365ImportResult } from "./types";

export const PORK33_PROFILE = "PORK33_BUTCHER_V1" as const;

export type Pork33Signal = "POSITIVE" | "NEUTRAL" | "CAUTION" | "UNKNOWN";
export type Pork33AnalysisScope =
  | "SELECTION_AREA"
  | "ADMIN_DONG"
  | "SIGUNGU"
  | "SIDO"
  | "NATIONAL"
  | "REPORT_CONFIGURATION"
  | "SYSTEM_CALCULATION";

export type Pork33FieldStatus = "AVAILABLE" | "NOT_AVAILABLE" | "FIELD_REQUIRED";

export type Pork33EvidenceRef = {
  id: string;
  source: "SBIZ365_REPORT_IMPORT" | "SYSTEM_CALCULATION" | "REPORT_CONFIGURATION";
  sourceFile: string;
  sourcePage: number | null;
  sourceLabel: string;
  sourceText: string | null;
  period: string | null;
  geography: string | null;
  analysisScope: Pork33AnalysisScope;
  unit: string | null;
  rawValue: unknown;
  normalizedValue: unknown;
  dataQualityFlags: string[];
};
export type Pork33Field<T> = {
  status: Pork33FieldStatus;
  value: T | null;
  evidenceRef: string | null;
};
export type TrendPoint = { period: string; value: number };

export type Pork33ExcludedFact = {
  field: string;
  status: "EXCLUDED";
  reason:
    | "NON_SELECTION_GEOGRAPHY"
    | "NOT_RELEVANT_TO_PORK33_SITE_SCREENING"
    | "SBIZ365_AUTOMATED_NARRATIVE"
    | "GENERAL_DEMOGRAPHIC_NOT_PURCHASE_PATTERN";
  sourcePage: number;
  sourceLabel: string;
};
export type Pork33RelevantProfile = {
  profile: typeof PORK33_PROFILE;
  sourceFile: string;
  areaName: string | null;
  industry: string | null;
  referencePeriod: string | null;
  industryDemand: {
    storeCount: Pork33Field<number>;
    storeCountTrend: Pork33Field<TrendPoint[]>;
    storeCountYoY: Pork33Field<number>;
    monthlySalesPerStore: Pork33Field<number>;
    salesTrend: Pork33Field<TrendPoint[]>;
    salesYoY: Pork33Field<number>;
    monthlyTransactionsPerStore: Pork33Field<number>;
    transactionTrend: Pork33Field<TrendPoint[]>;
    transactionsYoY: Pork33Field<number>;
    salesScopeFallback: boolean;
    salesScope: "SELECTION_AREA" | "ADMIN_DONG";
  };
  purchasePattern: {
    weekdayShare: Pork33Field<number>;
    weekendShare: Pork33Field<number>;
    dayShares: Pork33Field<Record<string, number>>;
    peakDay: Pork33Field<string>;
    timeShares: Pork33Field<Record<string, number>>;
    peakTimeBand: Pork33Field<string>;
    buyerAgeShares: Pork33Field<Record<string, number>>;
    primaryBuyerAgeBand: Pork33Field<string>;
    buyerGenderShares: Pork33Field<Record<string, number>>;
  };
  residentialBase: {
    households: Pork33Field<number>;
    collectiveHousingUnits: Pork33Field<number>;
    apartmentUnits: Pork33Field<number>;
    complex1000To1500: Pork33Field<number>;
    complex1500To2000: Pork33Field<number>;
    complex2000Plus: Pork33Field<number>;
    largeComplexSignal: Pork33Signal;
  };
  anchors: {
    largeRetailCount: Pork33Field<number>;
    subwayStationCount: Pork33Field<number>;
    busStopCount: Pork33Field<number>;
    stationRidership: Pork33Field<number>;
  };
  footTraffic: {
    dailyAverage: Pork33Field<number>;
    peakTimeBand: Pork33Field<string>;
  };
  fieldRequired: string[];
  excludedFacts: Pork33ExcludedFact[];
  evidenceRefs: Pork33EvidenceRef[];
  rawImport: Pick<Sbiz365ImportResult, "sourceType" | "fileName" | "extractionStatus" | "unknowns">;
};
export type Pork33SearchPriority = {
  rank: number;
  title: string;
  description: string;
  evidenceRefs: string[];
  fieldRequired: string[];
};
export type Pork33MeetingView = {
  areaName: string | null;
  headline: string;
  keyNumbers: Array<{ label: string; value: string; evidenceRef: string | null }>;
  positiveSignals: string[];
  checkRequired: string[];
  p2MapInsights: string[];
  p3ResidentialSummary: string;
  p4PurchaseSummary: string;
  p5CompetitionSummary: string;
  p6SearchPriorities: Pork33SearchPriority[];
  p7MeetingConclusion: string;
};
