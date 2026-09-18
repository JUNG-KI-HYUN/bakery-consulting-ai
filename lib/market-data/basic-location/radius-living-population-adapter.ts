import type { AnalysisRunSnapshot } from "./run";
import type {
  RadiusLivingPopulationHour,
} from "./radius-living-population";
import type { RadiusLivingPopulationRuntimeAnalysis } from "./radius-living-population-runtime";
import {
  createAvailableResult,
  createPartialResult,
  createUnavailableResult,
  type BasicLocationAnalysisUnit,
  type BasicLocationLimitation,
  type BasicLocationResult,
} from "./results";

const PRIMARY_SOURCE = {
  sourceId: "SRC-SEOUL-LIVING",
  sourceName: "[내국인] 서울 생활인구(250m)",
  sourceType: "PUBLIC_DATA_OFFICIAL",
} as const;

function limitationsFor(
  analysis: RadiusLivingPopulationRuntimeAnalysis,
): BasicLocationLimitation[] {
  return analysis.limitations.map((limitation) => ({
    code: limitation.code,
    message: limitation.message,
    severity: limitation.code === "STATISTICAL_ESTIMATE_NOT_ACTUAL"
      ? "CAUTION"
      : "INFO",
  }));
}

function analysisUnit(
  analysis: RadiusLivingPopulationRuntimeAnalysis,
): BasicLocationAnalysisUnit {
  return {
    type: analysis.analysisUnit,
    id: `${analysis.analysisRunId}:living-population-radius`,
    label: `분석지점 반경 ${analysis.radiusMeters}m`,
  };
}

function sourceReferences(analysis: RadiusLivingPopulationRuntimeAnalysis) {
  return [
    {
      sourceId: analysis.lineage.livingPopulation.sourceId,
      locator: analysis.lineage.livingPopulation.locator,
      sourceVersion: analysis.lineage.livingPopulation.snapshotId,
    },
    {
      sourceId: analysis.lineage.gridGeometry.sourceId,
      locator: analysis.lineage.gridGeometry.locator,
      sourceVersion: analysis.lineage.gridGeometry.geometryVersion,
    },
  ];
}

function methodologyNote(analysis: RadiusLivingPopulationRuntimeAnalysis): string {
  return [
    `inclusionMethod=${analysis.inclusionMethod}`,
    `rowSemantics=${analysis.rowSemantics}`,
    `methodologyVersion=${analysis.lineage.methodology.version}`,
  ].join("; ");
}

function hourlyResult(
  snapshot: AnalysisRunSnapshot,
  analysis: RadiusLivingPopulationRuntimeAnalysis,
  hour: RadiusLivingPopulationHour,
): BasicLocationResult {
  const base = {
    analysisRunId: analysis.analysisRunId,
    analysisLayer: "DEMAND" as const,
    analysisUnit: analysisUnit(analysis),
    metricKey: `living_population.radius.hour.${hour.hour}`,
    metricLabel: `${hour.hour}시 반경 생활인구 추정치`,
    unit: "people",
    primarySource: PRIMARY_SOURCE,
    sourceReferences: sourceReferences(analysis),
    referenceDate: analysis.referenceDate,
    referencePeriod: `${analysis.referenceDate}T${hour.hour}:00`,
    limitations: limitationsFor(analysis),
    fieldCheckRequired: false,
    fieldCheckKeys: [],
    customerDisplayPolicy: "CUSTOMER_WITH_NOTE" as const,
    methodologyNote: methodologyNote(analysis),
    updatedAt: snapshot.createdAt,
  };
  if (hour.population === null) {
    return createUnavailableResult({
      ...base,
      missingReason: "NO_DATA",
    });
  }
  const valueInput = {
    ...base,
    value: hour.population,
    valueType: "CALCULATED_VALUE" as const,
    confidence: hour.status === "AVAILABLE" ? "MEDIUM" as const : "LOW" as const,
    confidenceReasons: [
      {
        code: hour.status === "AVAILABLE" ? "UNIT_MATCHED" : "PARTIAL_COVERAGE",
        message: hour.status === "AVAILABLE"
          ? "250m Grid 관측값을 같은 기준일·시간·반경 규칙으로 합산했습니다."
          : "억제·누락 또는 관측 없는 CELL 때문에 알려진 값의 부분합입니다.",
      },
    ],
  };
  return hour.status === "AVAILABLE"
    ? createAvailableResult(valueInput)
    : createPartialResult(valueInput);
}

export function adaptRadiusLivingPopulationResults(
  snapshot: AnalysisRunSnapshot,
  analysis: RadiusLivingPopulationRuntimeAnalysis,
): readonly BasicLocationResult[] {
  if (
    analysis.analysisRunId !== snapshot.analysisRunId ||
    analysis.radiusMeters !== snapshot.target.radiusMeters
  ) {
    throw new Error("생활인구 분석과 AnalysisRunSnapshot이 일치하지 않습니다.");
  }
  const unit = analysisUnit(analysis);
  const common = {
    analysisRunId: analysis.analysisRunId,
    analysisLayer: "DATA_EVIDENCE" as const,
    analysisUnit: unit,
    unit: "count",
    valueType: "CALCULATED_VALUE" as const,
    primarySource: PRIMARY_SOURCE,
    sourceReferences: sourceReferences(analysis),
    referenceDate: analysis.referenceDate,
    referencePeriod: null,
    confidence: "MEDIUM" as const,
    confidenceReasons: [{
      code: "CALCULATION_ASSUMPTION",
      message: "검증된 Grid bbox 중심점과 명시적 반경 포함 규칙을 사용했습니다.",
    }],
    limitations: limitationsFor(analysis),
    fieldCheckRequired: false,
    fieldCheckKeys: [],
    customerDisplayPolicy: "CUSTOMER_WITH_NOTE" as const,
    methodologyNote: methodologyNote(analysis),
    updatedAt: snapshot.createdAt,
  };
  const metadataResults = [
    createAvailableResult({
      ...common,
      metricKey: "living_population.radius.included_cell_count",
      metricLabel: "반경 포함 Grid CELL 수",
      value: analysis.includedCellCount,
    }),
    createAvailableResult({
      ...common,
      metricKey: "living_population.radius.excluded_metric_only_cell_count",
      metricLabel: "geometry 부재로 제외한 metric CELL 수",
      value: analysis.excludedMetricOnlyCellCount,
    }),
    createAvailableResult({
      ...common,
      metricKey: "living_population.radius.inclusion_method",
      metricLabel: "반경 Grid 포함 방식",
      value: analysis.inclusionMethod,
      unit: null,
    }),
  ];
  return Object.freeze([
    ...metadataResults,
    ...analysis.hourly.map((hour) => hourlyResult(snapshot, analysis, hour)),
  ]);
}
