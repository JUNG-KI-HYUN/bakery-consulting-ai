export const SBIZ365_SOURCE_TYPE = "SBIZ365_REPORT_IMPORT" as const;

export type Sbiz365ExtractionStatus =
  | "SUCCESS"
  | "PARTIAL"
  | "EXTRACTION_FAILED"
  | "UNSUPPORTED_SCANNED_PDF"
  | "VALIDATION_FAILED";

export type Sbiz365FactGroup =
  | "SPACE"
  | "DEMAND"
  | "TIME"
  | "COMPETITION";

export type Sbiz365SourceEvidence = {
  sourceType: typeof SBIZ365_SOURCE_TYPE;
  page: number;
  label: string;
  sourceText: string;
};

export type Sbiz365ExtractedFact = {
  key: string;
  label: string;
  value: string;
  group: Sbiz365FactGroup;
  sourceText: string;
  valueKind: "SOURCE_TEXT";
  evidence: Sbiz365SourceEvidence;
};

export type Sbiz365ImportResult = {
  sourceType: typeof SBIZ365_SOURCE_TYPE;
  fileName: string;
  areaName: string | null;
  industry: string | null;
  analysisRadiusMeters: number | null;
  referencePeriod: string | null;
  extractionStatus: Sbiz365ExtractionStatus;
  facts: Record<string, Sbiz365ExtractedFact>;
  unknowns: string[];
  sourceMetadata: {
    importedAt: string;
    textExtractor: string;
    sourceAddress: string | null;
    sourceLocationText: string | null;
    pageCount: number;
    fieldEvidence: Partial<
      Record<
        "areaName" | "industry" | "analysisRadiusMeters" | "referencePeriod" | "sourceAddress",
        Sbiz365SourceEvidence
      >
    >;
    formatSignature: string[];
    errors: string[];
  };
};

export type SimpleReportAreaInput = {
  areaId: string;
  areaName: string | null;
  source: typeof SBIZ365_SOURCE_TYPE;
  industry: string | null;
  radiusMeters: number | null;
  referencePeriod: string | null;
  location: { lat: number | null; lng: number | null };
  p1: Record<string, unknown>;
  p2: Record<string, unknown>;
  p3: Record<string, unknown>;
  p4: Record<string, unknown>;
  p5: Record<string, unknown>;
  p6: Record<string, unknown>;
  p7: Record<string, unknown>;
  unknowns: string[];
  sources: Array<Record<string, unknown>>;
};
