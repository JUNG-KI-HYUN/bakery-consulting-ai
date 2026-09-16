import type {
  BasicLocationAnalysisUnit,
  BasicLocationConfidence,
  BasicLocationConfidenceReason,
  BasicLocationLimitation,
  BasicLocationMissingReason,
  BasicLocationResult,
  BasicLocationResultStatus,
  BasicLocationSource,
  BasicLocationSourceReference,
  BasicLocationResultValue,
  BasicLocationValueType,
} from "./results";
import type {
  BasicLocationAudience,
  DisplayableBasicLocationResult,
} from "./display-policy";
import type {
  BasicLocationInterpretation,
  BasicLocationInterpretationSignal,
} from "./interpretation";

const VIEW_MODEL_SCHEMA_VERSION = "p0-basic-location-view-model-v1" as const;

export interface P0BasicLocationResultViewModel {
  resultId: string;
  analysisLayer: BasicLocationResult["analysisLayer"];
  analysisUnit: BasicLocationAnalysisUnit;
  metricKey: string;
  metricLabel: string;
  value: BasicLocationResultValue;
  unit: string | null;
  valueType: BasicLocationValueType;
  status: BasicLocationResultStatus;
  confidence: BasicLocationConfidence;
  primarySource: BasicLocationSource | null;
  sourceReferences: readonly BasicLocationSourceReference[];
  referenceDate: string | null;
  referencePeriod: string | null;
  confidenceReasons: readonly BasicLocationConfidenceReason[];
  limitations: readonly BasicLocationLimitation[];
  missingReason: BasicLocationMissingReason | null;
  fieldCheckRequired: boolean;
  fieldCheckKeys: readonly string[];
  requiresNote: boolean;
}

export interface P0BasicLocationAnalysisContextViewModel {
  analysisRunId: string;
  target: {
    latitude: number | null;
    longitude: number | null;
    radiusMeters: 300 | 500 | null;
    source: "address" | "map" | null;
    confirmedAddress: string | null;
  };
  frameone: {
    districtId: string | null;
    districtName: string | null;
    marketId: string | null;
    marketName: string | null;
    submarketId: string | null;
    submarketName: string | null;
    nodeId: string | null;
    nodeName: string | null;
  };
}

export interface P0BasicLocationAvailableEvidenceViewModel {
  target: readonly P0BasicLocationResultViewModel[];
  frameone: readonly P0BasicLocationResultViewModel[];
  kakaoObserved: readonly P0BasicLocationResultViewModel[];
  other: readonly P0BasicLocationResultViewModel[];
}

export interface P0BasicLocationOfficialReferenceViewModel {
  relation: readonly P0BasicLocationResultViewModel[];
  sales: readonly P0BasicLocationResultViewModel[];
  stores: readonly P0BasicLocationResultViewModel[];
  trend: readonly P0BasicLocationResultViewModel[];
  other: readonly P0BasicLocationResultViewModel[];
}

export interface P0BasicLocationCurrentInterpretationViewModel {
  summary: BasicLocationInterpretationSignal | null;
  confirmedSignals: readonly BasicLocationInterpretationSignal[];
  referenceSignals: readonly BasicLocationInterpretationSignal[];
  riskSignals: readonly BasicLocationInterpretationSignal[];
}

export interface P0BasicLocationLimitationResultViewModel {
  resultId: string;
  metricKey: string;
  metricLabel: string;
  status: BasicLocationResultStatus;
  valueType: BasicLocationValueType;
  missingReason: BasicLocationMissingReason | null;
  limitations: readonly BasicLocationLimitation[];
  requiresNote: boolean;
}

export interface P0BasicLocationLimitationsViewModel {
  results: readonly P0BasicLocationLimitationResultViewModel[];
  unknowns: readonly BasicLocationInterpretationSignal[];
}

export interface P0BasicLocationFieldHandoffViewModel {
  nextChecks: readonly BasicLocationInterpretationSignal[];
}

export interface P0BasicLocationViewModel {
  schemaVersion: typeof VIEW_MODEL_SCHEMA_VERSION;
  analysisRunId: string;
  audience: BasicLocationAudience;
  analysisContext: P0BasicLocationAnalysisContextViewModel;
  marketIdentity: readonly P0BasicLocationResultViewModel[];
  availableEvidence: P0BasicLocationAvailableEvidenceViewModel;
  officialMarketReference: P0BasicLocationOfficialReferenceViewModel;
  currentInterpretation: P0BasicLocationCurrentInterpretationViewModel;
  limitations: P0BasicLocationLimitationsViewModel;
  fieldHandoff: P0BasicLocationFieldHandoffViewModel;
  dataEvidence: readonly P0BasicLocationResultViewModel[];
}

export interface BuildP0BasicLocationViewModelInput {
  analysisRunId: string;
  audience: BasicLocationAudience;
  displayableResults: readonly DisplayableBasicLocationResult[];
  interpretation: BasicLocationInterpretation;
}

export class P0BasicLocationViewModelValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "P0BasicLocationViewModelValidationError";
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

function cloneSource(source: BasicLocationSource | null): BasicLocationSource | null {
  return source ? { ...source } : null;
}

function cloneSourceReference(
  reference: BasicLocationSourceReference,
): BasicLocationSourceReference {
  return { ...reference };
}

function toResultViewModel(
  displayable: DisplayableBasicLocationResult,
): P0BasicLocationResultViewModel {
  const { result } = displayable;
  return {
    resultId: result.resultId,
    analysisLayer: result.analysisLayer,
    analysisUnit: { ...result.analysisUnit },
    metricKey: result.metricKey,
    metricLabel: result.metricLabel,
    value: Array.isArray(result.value) ? [...result.value] : result.value,
    unit: result.unit,
    valueType: result.valueType,
    status: result.status,
    confidence: result.confidence,
    confidenceReasons: result.confidenceReasons.map((reason) => ({ ...reason })),
    primarySource: cloneSource(result.primarySource),
    sourceReferences: result.sourceReferences.map(cloneSourceReference),
    referenceDate: result.referenceDate,
    referencePeriod: result.referencePeriod,
    limitations: result.limitations.map((limitation) => ({ ...limitation })),
    missingReason: result.missingReason,
    fieldCheckRequired: result.fieldCheckRequired,
    fieldCheckKeys: [...result.fieldCheckKeys],
    requiresNote: displayable.requiresNote,
  };
}

function cloneSignal(
  signal: BasicLocationInterpretationSignal,
): BasicLocationInterpretationSignal {
  return {
    id: signal.id,
    message: signal.message,
    basisResultIds: [...signal.basisResultIds],
  };
}

function isVisibleSignal(
  signal: BasicLocationInterpretationSignal,
  visibleResultIds: ReadonlySet<string>,
): boolean {
  return (
    signal.basisResultIds.length > 0 &&
    signal.basisResultIds.every((resultId) => visibleResultIds.has(resultId))
  );
}

function filterSignals(
  signals: readonly BasicLocationInterpretationSignal[],
  visibleResultIds: ReadonlySet<string>,
): BasicLocationInterpretationSignal[] {
  return signals
    .filter((signal) => isVisibleSignal(signal, visibleResultIds))
    .map(cloneSignal);
}

function findResult(
  results: readonly DisplayableBasicLocationResult[],
  metricKey: string,
): BasicLocationResult | undefined {
  return results.find(({ result }) => result.metricKey === metricKey)?.result;
}

function stringValue(result: BasicLocationResult | undefined): string | null {
  return result && typeof result.value === "string" ? result.value : null;
}

function numberValue(result: BasicLocationResult | undefined): number | null {
  return result && typeof result.value === "number" && Number.isFinite(result.value)
    ? result.value
    : null;
}

function buildAnalysisContext(
  analysisRunId: string,
  results: readonly DisplayableBasicLocationResult[],
): P0BasicLocationAnalysisContextViewModel {
  const radius = numberValue(findResult(results, "analysis.target.radius_meters"));
  const source = stringValue(findResult(results, "analysis.target.source"));

  return {
    analysisRunId,
    target: {
      latitude: numberValue(findResult(results, "analysis.target.latitude")),
      longitude: numberValue(findResult(results, "analysis.target.longitude")),
      radiusMeters: radius === 300 || radius === 500 ? radius : null,
      source: source === "address" || source === "map" ? source : null,
      confirmedAddress: stringValue(
        findResult(results, "analysis.target.confirmed_address"),
      ),
    },
    frameone: {
      districtId: stringValue(findResult(results, "frameone.district.id")),
      districtName:
        stringValue(findResult(results, "frameone.district.name")) ??
        stringValue(findResult(results, "frameone.market.district_name")),
      marketId: stringValue(findResult(results, "frameone.market.id")),
      marketName: stringValue(findResult(results, "frameone.market.name")),
      submarketId: stringValue(findResult(results, "frameone.submarket.id")),
      submarketName: stringValue(findResult(results, "frameone.submarket.name")),
      nodeId: stringValue(findResult(results, "frameone.node.id")),
      nodeName: stringValue(findResult(results, "frameone.node.name")),
    },
  };
}

function isAvailableEvidence(result: BasicLocationResult): boolean {
  return (
    result.status !== "BLOCKED" &&
    result.status !== "NOT_AVAILABLE" &&
    result.valueType !== "UNKNOWN" &&
    result.value !== null
  );
}

function isOfficialReference(result: BasicLocationResult): boolean {
  return result.analysisUnit.type === "OFFICIAL_COMMERCIAL_AREA";
}

function isLimitationResult(
  displayable: DisplayableBasicLocationResult,
): boolean {
  const { result } = displayable;
  return (
    result.status === "BLOCKED" ||
    result.status === "NOT_AVAILABLE" ||
    result.valueType === "UNKNOWN" ||
    result.value === null ||
    result.limitations.length > 0 ||
    displayable.requiresNote
  );
}

function validateInput(input: BuildP0BasicLocationViewModelInput): void {
  if (input.analysisRunId.trim().length === 0) {
    throw new P0BasicLocationViewModelValidationError(
      "analysisRunId must not be empty.",
    );
  }
  if (input.interpretation.analysisRunId !== input.analysisRunId) {
    throw new P0BasicLocationViewModelValidationError(
      "Interpretation analysisRunId does not match the requested analysis run.",
    );
  }

  const resultIds = new Set<string>();
  for (const { result } of input.displayableResults) {
    if (result.analysisRunId !== input.analysisRunId) {
      throw new P0BasicLocationViewModelValidationError(
        `Result ${result.resultId} belongs to a different analysis run.`,
      );
    }
    if (resultIds.has(result.resultId)) {
      throw new P0BasicLocationViewModelValidationError(
        `Duplicate resultId is not allowed: ${result.resultId}`,
      );
    }
    resultIds.add(result.resultId);
  }
}

export function buildP0BasicLocationViewModel(
  input: BuildP0BasicLocationViewModelInput,
): P0BasicLocationViewModel {
  validateInput(input);

  const visibleResultIds = new Set(
    input.displayableResults.map(({ result }) => result.resultId),
  );
  const resultViewModels = input.displayableResults.map(toResultViewModel);
  const marketIdentity = input.displayableResults
    .filter(({ result }) => result.analysisLayer === "MARKET_IDENTITY")
    .map(toResultViewModel);

  const targetEvidence: P0BasicLocationResultViewModel[] = [];
  const frameoneEvidence: P0BasicLocationResultViewModel[] = [];
  const kakaoObservedEvidence: P0BasicLocationResultViewModel[] = [];
  const otherEvidence: P0BasicLocationResultViewModel[] = [];
  const officialRelation: P0BasicLocationResultViewModel[] = [];
  const officialSales: P0BasicLocationResultViewModel[] = [];
  const officialStores: P0BasicLocationResultViewModel[] = [];
  const officialTrend: P0BasicLocationResultViewModel[] = [];
  const otherOfficialReference: P0BasicLocationResultViewModel[] = [];

  for (const displayable of input.displayableResults) {
    const { result } = displayable;
    const viewModel = toResultViewModel(displayable);

    if (isOfficialReference(result)) {
      if (result.metricKey.includes(".sales.")) {
        officialSales.push(viewModel);
      } else if (result.metricKey.includes(".stores.")) {
        officialStores.push(viewModel);
      } else if (result.metricKey.includes(".trend.")) {
        officialTrend.push(viewModel);
      } else if (result.metricKey.startsWith("official_commercial_area.")) {
        officialRelation.push(viewModel);
      } else {
        otherOfficialReference.push(viewModel);
      }
    }

    if (!isAvailableEvidence(result) || isOfficialReference(result)) {
      continue;
    }
    if (result.metricKey.startsWith("analysis.target.")) {
      targetEvidence.push(viewModel);
    } else if (result.analysisLayer === "MARKET_IDENTITY") {
      frameoneEvidence.push(viewModel);
    } else if (result.metricKey.startsWith("kakao.nearby.")) {
      kakaoObservedEvidence.push(viewModel);
    } else {
      otherEvidence.push(viewModel);
    }
  }

  const summary =
    input.interpretation.summary &&
    isVisibleSignal(input.interpretation.summary, visibleResultIds)
      ? cloneSignal(input.interpretation.summary)
      : null;

  const model: P0BasicLocationViewModel = {
    schemaVersion: VIEW_MODEL_SCHEMA_VERSION,
    analysisRunId: input.analysisRunId,
    audience: input.audience,
    analysisContext: buildAnalysisContext(
      input.analysisRunId,
      input.displayableResults,
    ),
    marketIdentity,
    availableEvidence: {
      target: targetEvidence,
      frameone: frameoneEvidence,
      kakaoObserved: kakaoObservedEvidence,
      other: otherEvidence,
    },
    officialMarketReference: {
      relation: officialRelation,
      sales: officialSales,
      stores: officialStores,
      trend: officialTrend,
      other: otherOfficialReference,
    },
    currentInterpretation: {
      summary,
      confirmedSignals: filterSignals(
        input.interpretation.confirmedSignals,
        visibleResultIds,
      ),
      referenceSignals: filterSignals(
        input.interpretation.referenceSignals,
        visibleResultIds,
      ),
      riskSignals: filterSignals(
        input.interpretation.riskSignals,
        visibleResultIds,
      ),
    },
    limitations: {
      results: input.displayableResults.filter(isLimitationResult).map((displayable) => {
        const { result } = displayable;
        return {
          resultId: result.resultId,
          metricKey: result.metricKey,
          metricLabel: result.metricLabel,
          status: result.status,
          valueType: result.valueType,
          missingReason: result.missingReason,
          limitations: result.limitations.map((limitation) => ({ ...limitation })),
          requiresNote: displayable.requiresNote,
        };
      }),
      unknowns: filterSignals(input.interpretation.unknowns, visibleResultIds),
    },
    fieldHandoff: {
      nextChecks: filterSignals(input.interpretation.nextChecks, visibleResultIds),
    },
    dataEvidence: resultViewModels,
  };

  return deepFreeze(model);
}
