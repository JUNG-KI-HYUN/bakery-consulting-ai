import type { BasicLocationResult } from "./results";

export interface BasicLocationInterpretationSignal {
  id: string;
  message: string;
  basisResultIds: readonly string[];
}

export interface BasicLocationInterpretation {
  analysisRunId: string;
  summary: BasicLocationInterpretationSignal | null;
  confirmedSignals: readonly BasicLocationInterpretationSignal[];
  referenceSignals: readonly BasicLocationInterpretationSignal[];
  riskSignals: readonly BasicLocationInterpretationSignal[];
  unknowns: readonly BasicLocationInterpretationSignal[];
  nextChecks: readonly BasicLocationInterpretationSignal[];
}

export interface BuildBasicLocationInterpretationInput {
  analysisRunId: string;
  results: readonly BasicLocationResult[];
}

export class BasicLocationInterpretationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BasicLocationInterpretationError";
  }
}

interface MutableSignal {
  id: string;
  message: string;
  basisResultIds: string[];
}

const CANONICAL_CONFIRMED_METRICS = new Set([
  "frameone.market.name",
  "frameone.market.district_name",
  "frameone.district.name",
  "frameone.submarket.name",
  "frameone.node.name",
]);

const FIELD_CHECK_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  COMPETITOR_OPEN_CHECK: "Kakao 장소의 실제 영업 여부를 현장에서 확인합니다.",
  COMPETITOR_CATEGORY_CHECK: "Kakao 장소의 실제 업종과 상품 구성을 현장에서 확인합니다.",
  COMPETITOR_DIRECTNESS_CHECK: "Kakao 장소가 실제 직접경쟁점에 해당하는지 확인합니다.",
  COMPETITOR_SCALE_CHECK: "Kakao 장소의 실제 점포 규모를 현장에서 확인합니다.",
  COMPETITOR_CUSTOMER_COUNT_CHECK: "Kakao 장소의 실제 고객 이용상황을 현장에서 확인합니다.",
  COMPETITOR_ACCESS_CHECK: "Kakao 장소와 분석지점 사이의 실제 접근성을 현장에서 확인합니다.",
  ENTRANCE_LOCATION_CHECK: "확인주소와 실제 점포 출입구의 위치가 일치하는지 확인합니다.",
  MARKET_IDENTITY_CHECK: "FRAMEONE 상권 설명과 현장의 수요·상업 연속성이 일치하는지 확인합니다.",
});

const LIMITATION_CHECK_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  ANALYSIS_ADDRESS_NOT_BUILDING_VERIFICATION: "확인주소가 실제 후보점포 및 출입구와 일치하는지 확인합니다.",
  FRAMEONE_NODE_LOCATION_UNVERIFIED: "FRAMEONE Node의 실제 공간위치와 보행동선을 현장에서 확인합니다.",
  OPERATING_STATUS_UNVERIFIED: "Kakao 장소의 실제 영업 여부를 현장에서 확인합니다.",
});

function requireNonEmpty(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BasicLocationInterpretationError(`${path}가 비어 있습니다.`);
  }
}

function stableTextHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function addSignal(
  signals: Map<string, MutableSignal>,
  key: string,
  id: string,
  message: string,
  resultId: string,
) {
  const existing = signals.get(key);
  if (existing) {
    if (!existing.basisResultIds.includes(resultId)) existing.basisResultIds.push(resultId);
    return;
  }
  signals.set(key, { id, message, basisResultIds: [resultId] });
}

function freezeSignals(signals: Map<string, MutableSignal>) {
  return Object.freeze([...signals.values()].map((signal) => {
    Object.freeze(signal.basisResultIds);
    return Object.freeze(signal);
  }));
}

function valueLabel(result: BasicLocationResult) {
  const value = Array.isArray(result.value) ? result.value.join(", ") : String(result.value);
  return result.unit ? `${value} ${result.unit}` : value;
}

function periodLabel(result: BasicLocationResult) {
  return result.referencePeriod ?? result.referenceDate ?? "기준시점 미표기";
}

function addAvailableResultSignal(
  result: BasicLocationResult,
  confirmed: Map<string, MutableSignal>,
  reference: Map<string, MutableSignal>,
  unknown: Map<string, MutableSignal>,
) {
  if (result.metricKey === "analysis.target.confirmed_address") {
    addSignal(
      confirmed,
      result.resultId,
      `confirmed:${result.resultId}`,
      `분석 실행 기준 주소로 ‘${String(result.value)}’가 기록되어 있습니다. 후보건물 검증 결과와는 구분합니다.`,
      result.resultId,
    );
    return;
  }

  if (CANONICAL_CONFIRMED_METRICS.has(result.metricKey)) {
    addSignal(
      confirmed,
      result.resultId,
      `confirmed:${result.resultId}`,
      `${result.metricLabel}은 ‘${String(result.value)}’로 기록된 FRAMEONE 내부 canonical 분류입니다.`,
      result.resultId,
    );
    return;
  }

  if (result.metricKey === "official_commercial_area.spatial_relation") {
    if (result.value === "INSIDE") {
      addSignal(
        confirmed,
        result.resultId,
        `confirmed:${result.resultId}`,
        `분석지점은 서울시 공식상권 ‘${result.analysisUnit.label}’ 경계 내부로 계산되었습니다. 이 경계는 FRAMEONE Market과 별개입니다.`,
        result.resultId,
      );
    } else if (result.value === "RADIUS_OVERLAP") {
      addSignal(
        reference,
        result.resultId,
        `reference:${result.resultId}`,
        `분석반경은 서울시 공식상권 ‘${result.analysisUnit.label}’과 교차합니다. 분석지점이 경계 내부라는 의미는 아니며 FRAMEONE Market과도 별개입니다.`,
        result.resultId,
      );
    } else if (result.value === "OUTSIDE") {
      addSignal(
        reference,
        result.resultId,
        `reference:${result.resultId}`,
        `분석지점과 반경은 서울시 공식상권 ‘${result.analysisUnit.label}’ 경계 밖으로 계산되었습니다. FRAMEONE Market의 범위를 뜻하지 않습니다.`,
        result.resultId,
      );
    } else {
      addSignal(
        unknown,
        result.resultId,
        `unknown:${result.resultId}`,
        `서울시 공식상권 ‘${result.analysisUnit.label}’과의 공간관계를 확인할 수 없습니다. OUTSIDE로 해석하지 않습니다.`,
        result.resultId,
      );
    }
    return;
  }

  if (result.metricKey.startsWith("kakao.nearby.") && result.metricKey.endsWith(".returned_count")) {
    const message = result.value === 0
      ? `${result.analysisUnit.label}의 ${result.metricLabel}는 해당 검색조건에서 0건으로 반환되었습니다. 실제 경쟁점이 0개라는 뜻은 아닙니다.`
      : `${result.analysisUnit.label}의 ${result.metricLabel}는 ${valueLabel(result)}입니다. 지정 검색조건의 반환값이며 실제 전체 경쟁점 수가 아닙니다.`;
    addSignal(reference, result.resultId, `reference:${result.resultId}`, message, result.resultId);
    return;
  }

  if (result.metricKey.includes("official_commercial_area.sales.")) {
    addSignal(
      reference,
      result.resultId,
      `reference:${result.resultId}`,
      `서울시 공식상권 ‘${result.analysisUnit.label}’ 전체의 ${periodLabel(result)} 추정매출 통계 ${result.metricLabel}은 ${valueLabel(result)}입니다. 300m/500m 반경 또는 후보점포 매출이 아닙니다.`,
      result.resultId,
    );
    return;
  }

  if (result.metricKey.includes("official_commercial_area.stores.")) {
    addSignal(
      reference,
      result.resultId,
      `reference:${result.resultId}`,
      `서울시 공식상권 ‘${result.analysisUnit.label}’ 전체의 ${periodLabel(result)} 통계 ${result.metricLabel}은 ${valueLabel(result)}입니다. Kakao 검색 반환건수와 합산하지 않습니다.`,
      result.resultId,
    );
    return;
  }

  if (result.metricKey.includes("official_commercial_area.trend.")) {
    addSignal(
      reference,
      result.resultId,
      `reference:${result.resultId}`,
      `서울시 공식상권 ‘${result.analysisUnit.label}’의 ${periodLabel(result)} ${result.metricLabel} 값은 ${valueLabel(result)}입니다. 기록된 값과 증감만 설명하며 상권 평가로 전환하지 않습니다.`,
      result.resultId,
    );
    return;
  }

  if (result.metricKey === "official_commercial_area.related_count") {
    addSignal(
      reference,
      result.resultId,
      `reference:${result.resultId}`,
      `${result.analysisUnit.label}에서 직접 포함 또는 반경 교차로 분류된 서울시 공식상권은 ${valueLabel(result)}입니다. 이는 FRAMEONE Market의 수나 경계를 뜻하지 않습니다.`,
      result.resultId,
    );
  }
}

function addUnknownResultSignal(
  result: BasicLocationResult,
  unknown: Map<string, MutableSignal>,
) {
  let message: string;
  if (result.metricKey.startsWith("kakao.nearby.")) {
    message = `${result.analysisUnit.label}의 Kakao 주변검색 결과를 확인할 수 없습니다. Source 오류나 미실행을 검색 반환 0건으로 해석하지 않습니다.`;
  } else if (result.missingReason === "BLOCKED_BY_GEOMETRY") {
    message = `${result.metricLabel}은 검증된 FRAMEONE geometry가 없어 집계하지 않았습니다. 0으로 바꾸거나 다른 공간단위 값으로 대체하지 않습니다.`;
  } else {
    message = `${result.metricLabel}은 현재 ${result.status} 상태로 확인할 수 없습니다. 결측값을 0으로 해석하지 않습니다.`;
  }
  addSignal(unknown, result.resultId, `unknown:${result.resultId}`, message, result.resultId);
}

function addRiskSignals(
  result: BasicLocationResult,
  risks: Map<string, MutableSignal>,
) {
  for (const limitation of result.limitations) {
    const key = `${limitation.code}\u0000${limitation.message}`;
    addSignal(
      risks,
      key,
      `risk:${limitation.code.toLowerCase()}:${stableTextHash(limitation.message)}`,
      limitation.message,
      result.resultId,
    );
  }
}

function addNextCheckSignals(
  result: BasicLocationResult,
  nextChecks: Map<string, MutableSignal>,
) {
  if (result.fieldCheckRequired) {
    for (const checkKey of result.fieldCheckKeys) {
      const message = FIELD_CHECK_MESSAGES[checkKey] ??
        `${result.metricLabel}의 현장확인 항목(${checkKey})을 확인합니다.`;
      addSignal(nextChecks, `field:${checkKey}`, `next-check:${checkKey.toLowerCase()}`, message, result.resultId);
    }
  }

  for (const limitation of result.limitations) {
    const message = LIMITATION_CHECK_MESSAGES[limitation.code];
    if (!message) continue;
    addSignal(
      nextChecks,
      `limitation:${limitation.code}`,
      `next-check:${limitation.code.toLowerCase()}`,
      message,
      result.resultId,
    );
  }
}

export function buildBasicLocationInterpretation(
  input: BuildBasicLocationInterpretationInput,
): BasicLocationInterpretation {
  requireNonEmpty(input.analysisRunId, "analysisRunId");

  const confirmed = new Map<string, MutableSignal>();
  const reference = new Map<string, MutableSignal>();
  const risks = new Map<string, MutableSignal>();
  const unknown = new Map<string, MutableSignal>();
  const nextChecks = new Map<string, MutableSignal>();
  const seenResultIds = new Set<string>();

  for (const result of input.results) {
    if (result.analysisRunId !== input.analysisRunId) {
      throw new BasicLocationInterpretationError(
        `Result analysisRunId가 Interpretation analysisRunId와 일치하지 않습니다: ${result.resultId}`,
      );
    }
    if (seenResultIds.has(result.resultId)) {
      throw new BasicLocationInterpretationError(`중복된 resultId가 있습니다: ${result.resultId}`);
    }
    seenResultIds.add(result.resultId);

    addRiskSignals(result, risks);
    addNextCheckSignals(result, nextChecks);

    if (
      result.status === "BLOCKED" ||
      result.status === "NOT_AVAILABLE" ||
      result.valueType === "UNKNOWN" ||
      result.value === null
    ) {
      addUnknownResultSignal(result, unknown);
      continue;
    }
    addAvailableResultSignal(result, confirmed, reference, unknown);
  }

  const allBasisResultIds = Object.freeze(input.results.map((result) => result.resultId));
  const summary = allBasisResultIds.length === 0
    ? null
    : Object.freeze({
      id: "summary:p0-evidence-overview",
      message: "현재 분석 실행의 확인된 근거, 참고자료, 데이터 해석상 주의사항과 확인 불가 항목을 구분했습니다.",
      basisResultIds: allBasisResultIds,
    });

  return Object.freeze({
    analysisRunId: input.analysisRunId,
    summary,
    confirmedSignals: freezeSignals(confirmed),
    referenceSignals: freezeSignals(reference),
    riskSignals: freezeSignals(risks),
    unknowns: freezeSignals(unknown),
    nextChecks: freezeSignals(nextChecks),
  });
}
