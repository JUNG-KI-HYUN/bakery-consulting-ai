/**
 * Basic Location / Competition Structure → Decision Evidence (read-only).
 *
 * 기존 BasicLocationResult·Interpretation·CompetitionStructureResult를 읽기만 한다.
 * geometry·Kakao 검색·생활인구·공식상권 계산을 재실행하지 않는다.
 * Risk / Verdict / Score / OBSERVED_CONSTRAINT / EXPERT_REVIEW를 생성하지 않는다.
 *
 * Interpretation riskSignals는 Result limitation에서 파생된 데이터 해석상 주의사항이며
 * Final Risk가 아니다. referenceLimitations metadata로만 보존한다.
 */

import type { LocationAnalysisBinding } from "../decision-integration/types";
import type { BasicLocationInterpretation } from "../market-data/basic-location/interpretation";
import type {
  BasicLocationAnalysisLayer,
  BasicLocationLimitation,
  BasicLocationMissingReason,
  BasicLocationResult,
} from "../market-data/basic-location/results";
import {
  competitionResultMatchesTarget,
  type CompetitionLocationTarget,
} from "../market-data/competition-location";
import type { CompetitionStructureResult } from "../market-data/competition-structure";
import { createDecisionEvidenceItem } from "./helpers";
import type {
  DecisionEvidenceCategory,
  DecisionEvidenceItem,
  DecisionEvidenceNature,
} from "./types";

const SOURCE_DOMAIN = "LOCATION" as const;

export type LocationReferenceLimitation = {
  readonly origin:
    | "BASIC_LOCATION_RESULT"
    | "BASIC_LOCATION_INTERPRETATION"
    | "COMPETITION_STRUCTURE";
  readonly code: string | null;
  readonly message: string;
  /** BasicLocationLimitation.severity 원값. Risk 등급이 아니다. */
  readonly severity: BasicLocationLimitation["severity"] | null;
  readonly basisIds: readonly string[];
};

export type LocationReferenceNextCheck = {
  readonly id: string;
  readonly message: string;
  readonly basisResultIds: readonly string[];
};

export type LocationCompetitionReference = {
  readonly analysisRunId: string;
  readonly schemaVersion: CompetitionStructureResult["schemaVersion"];
  readonly generatedAt: string;
  readonly radiusM: 300 | 500;
  readonly scope: "SEARCH_OBSERVATION_NOT_CENSUS";
  readonly observedRawDetailCount: number;
  readonly uniqueObservedCandidateCount: number;
  readonly multiChannelCandidateCount: number;
  readonly classification: "UNKNOWN";
  readonly franchiseClassification: "UNKNOWN";
  readonly fieldVerificationStatus: "NOT_CHECKED";
  readonly franchiseShare: null;
  readonly officialAreaReference: {
    readonly status: CompetitionStructureResult["officialAreaReference"]["status"];
    readonly officialMarketCode: string | null;
    readonly quarterCode: string | null;
    readonly storeCount: number | null;
    readonly countCombinationPolicy: "KEEP_SEPARATE_FROM_KAKAO";
  };
};

export type LocationDecisionEvidenceResult = {
  readonly observedFacts: readonly DecisionEvidenceItem[];
  readonly missingInformation: readonly DecisionEvidenceItem[];
  readonly expertReviewItems: readonly DecisionEvidenceItem[];
  /** Result limitation·Interpretation 주의사항·Competition warning 원문. Risk/Expert Review로 분류하지 않는다. */
  readonly referenceLimitations: readonly LocationReferenceLimitation[];
  readonly referenceNextChecks: readonly LocationReferenceNextCheck[];
  readonly referenceCompetition: LocationCompetitionReference | null;
  readonly createsVerdict: false;
  readonly createsScore: false;
  readonly createsRisk: false;
};

export type LocationDecisionEvidenceInput = {
  locationBinding: LocationAnalysisBinding | null;
  results: readonly BasicLocationResult[] | null;
  interpretation: BasicLocationInterpretation | null;
  competitionTarget?: CompetitionLocationTarget | null;
  competitionResult?: CompetitionStructureResult | null;
};

const MISSING_REASON_LABELS: Readonly<Record<BasicLocationMissingReason, string>> = Object.freeze({
  NO_DATA: "자료 없음",
  NOT_CONNECTED: "자료 미연결",
  NOT_CALCULATED: "분석 미실행",
  BLOCKED_BY_GEOMETRY: "검증된 geometry 없음",
  SOURCE_ERROR: "출처 조회 오류",
  UNKNOWN: "확인 필요",
});

function integrationItem(input: {
  key: string;
  category: DecisionEvidenceCategory;
  title: string;
  description: string;
  importance: "CORE" | "SUPPORTING";
  opaqueKey: string;
}): DecisionEvidenceItem {
  return createDecisionEvidenceItem({
    sourceDomain: SOURCE_DOMAIN,
    bucket: "MISSING_INFORMATION",
    category: input.category,
    key: input.key,
    title: input.title,
    description: input.description,
    importance: input.importance,
    nature: "INTEGRATION_STATE",
    sourceRef: { stageId: "location-binding", opaqueKey: input.opaqueKey },
  });
}

function categoryForLayer(layer: BasicLocationAnalysisLayer): DecisionEvidenceCategory {
  if (layer === "DEMAND" || layer === "FLOW_POTENTIAL" || layer === "STAY_POTENTIAL") {
    return "DEMAND";
  }
  if (layer === "COMPETITION") return "COMPETITION";
  return "LOCATION";
}

function isMissingResult(result: BasicLocationResult) {
  return (
    result.status === "BLOCKED" ||
    result.status === "NOT_AVAILABLE" ||
    result.valueType === "UNKNOWN" ||
    result.value === null
  );
}

function natureForResult(result: BasicLocationResult): DecisionEvidenceNature {
  if (result.metricKey.startsWith("official_commercial_area.")) return "REFERENCE_SUMMARY";
  switch (result.valueType) {
    case "OBSERVED_SOURCE_VALUE":
      return result.primarySource?.sourceType === "EXTERNAL_PLATFORM"
        ? "OBSERVATION"
        : "REFERENCE_SUMMARY";
    case "CALCULATED_VALUE":
    case "DERIVED_INDEX":
      return "DERIVED_CALCULATION";
    case "ESTIMATED_VALUE":
      return "ESTIMATE";
    default:
      return "REFERENCE_SUMMARY";
  }
}

function displayValue(result: BasicLocationResult): string {
  if (result.metricKey === "analysis.target.confirmed_address") {
    return "기록됨(원문은 locationReference.value)";
  }
  const value = result.value;
  const text = Array.isArray(value) ? value.join(", ") : String(value);
  return result.unit ? `${text} ${result.unit}` : text;
}

function availableDescription(result: BasicLocationResult, nature: DecisionEvidenceNature) {
  const parts = [
    `${result.analysisUnit.label} 기준 ${result.metricLabel}: ${displayValue(result)}.`,
    `기준시점 ${result.referencePeriod ?? result.referenceDate ?? "미표기"}.`,
  ];
  if (result.primarySource?.sourceType === "ANALYSIS_INPUT") {
    parts.push("분석 실행 입력값이며 현장 관측이나 후보건물 검증 결과가 아닙니다.");
  } else if (nature === "OBSERVATION") {
    parts.push("출처가 반환한 검색 관측값이며 전수조사나 현장확인 결과가 아닙니다.");
  } else if (nature === "DERIVED_CALCULATION") {
    parts.push("기존 분석 코드가 원자료에서 계산한 값입니다.");
  } else if (nature === "REFERENCE_SUMMARY") {
    parts.push("참고자료이며 후보점포 실적이나 현장확인 결과가 아닙니다.");
  }
  if (result.metricKey.startsWith("kakao.nearby.")) {
    parts.push(
      result.value === 0
        ? "검색 반환 0건이며 실제 경쟁점이 0개라는 뜻이 아닙니다."
        : "지정 검색조건의 반환값이며 실제 전체 경쟁점 수가 아닙니다.",
    );
  }
  if (result.metricKey.startsWith("official_commercial_area.")) {
    parts.push("서울시 공식상권 단위 값이며 FRAMEONE Market·분석 반경·후보점포 값이 아닙니다.");
  }
  if (result.valueType === "ESTIMATED_VALUE") {
    parts.push("추정값이며 실제값이 아닙니다.");
  }
  if (result.metricKey.startsWith("living_population.")) {
    parts.push("통계 기반 값이며 실제 방문객·매장 고객 수가 아닙니다.");
  }
  if (result.status === "PARTIAL") {
    parts.push("부분 자료(PARTIAL)이며 완전한 결과가 아닙니다.");
  } else if (result.status === "NEEDS_REVIEW") {
    parts.push("원 Result 상태가 NEEDS_REVIEW입니다.");
  }
  return parts.join(" ");
}

function missingDescription(result: BasicLocationResult) {
  const reason = MISSING_REASON_LABELS[result.missingReason ?? "UNKNOWN"];
  if (result.metricKey.startsWith("kakao.nearby.")) {
    return `${result.metricLabel}: Kakao 검색 결과를 확인할 수 없습니다(${reason}). 검색 반환 0건으로 해석하지 않습니다.`;
  }
  if (result.status === "BLOCKED") {
    return `${result.metricLabel}: ${reason}으로 집계하지 않았습니다(BLOCKED). 0이나 다른 공간단위 값으로 대체하지 않습니다.`;
  }
  if (result.status === "NOT_AVAILABLE") {
    return `${result.metricLabel}: ${reason}(NOT_AVAILABLE). 결측값을 0으로 해석하지 않습니다.`;
  }
  return `${result.metricLabel}: 값이 확인되지 않았습니다(status=${result.status}, valueType=${result.valueType}). 0으로 해석하지 않습니다.`;
}

function resultItem(result: BasicLocationResult): DecisionEvidenceItem {
  const missing = isMissingResult(result);
  const nature = missing ? undefined : natureForResult(result);
  return createDecisionEvidenceItem({
    sourceDomain: SOURCE_DOMAIN,
    bucket: missing ? "MISSING_INFORMATION" : "OBSERVED_FACT",
    category: categoryForLayer(result.analysisLayer),
    key: `result:${result.resultId}`,
    title: missing ? `${result.metricLabel} 확인 불가` : result.metricLabel,
    description: nature ? availableDescription(result, nature) : missingDescription(result),
    importance: "SUPPORTING",
    ...(nature ? { nature } : {}),
    sourceRef: {
      stageId: "location-basic-result",
      opaqueKey: result.resultId,
      fieldKey: result.metricKey,
    },
    locationReference: {
      analysisRunId: result.analysisRunId,
      resultId: result.resultId,
      analysisLayer: result.analysisLayer,
      metricKey: result.metricKey,
      status: result.status,
      valueType: result.valueType,
      confidence: result.confidence,
      value: result.value,
      unit: result.unit,
      primarySourceId: result.primarySource?.sourceId ?? null,
      primarySourceType: result.primarySource?.sourceType ?? null,
      referenceDate: result.referenceDate,
      referencePeriod: result.referencePeriod,
      missingReason: result.missingReason,
      fieldCheckKeys: result.fieldCheckKeys,
    },
  });
}

type MutableLimitation = {
  origin: LocationReferenceLimitation["origin"];
  code: string | null;
  message: string;
  severity: LocationReferenceLimitation["severity"];
  basisIds: string[];
};

function addLimitation(
  limitations: Map<string, MutableLimitation>,
  entry: Omit<MutableLimitation, "basisIds">,
  basisId: string,
) {
  const key = entry.message;
  const existing = limitations.get(key);
  if (existing) {
    if (!existing.basisIds.includes(basisId)) existing.basisIds.push(basisId);
    return;
  }
  limitations.set(key, { ...entry, basisIds: [basisId] });
}

function buildCompetitionEvidence(
  result: CompetitionStructureResult,
  observedFacts: DecisionEvidenceItem[],
  missingInformation: DecisionEvidenceItem[],
  limitations: Map<string, MutableLimitation>,
): LocationCompetitionReference {
  const observation = result.kakaoObservation;
  const candidateCount = observation.uniqueObservedCandidateCount;
  const multiChannelCandidateCount = result.candidates.filter(
    (candidate) => candidate.channelOverlapCount > 1,
  ).length;
  const channelLabels = observation.categories.map((category) => category.label).join("·");
  const competitionRef = { stageId: "location-competition-structure" };

  observedFacts.push(createDecisionEvidenceItem({
    sourceDomain: SOURCE_DOMAIN,
    bucket: "OBSERVED_FACT",
    category: "COMPETITION",
    key: "competition-kakao-observation",
    title: "Kakao 검색 관측 후보(전수조사 아님)",
    description: candidateCount === 0
      ? `반경 ${result.radiusM}m ${channelLabels} 검색에서 관측 후보 0곳. 지정 검색조건에서 반환된 후보가 없다는 뜻이며 실제 경쟁점이 없다는 뜻이 아닙니다. 범위: SEARCH_OBSERVATION_NOT_CENSUS.`
      : `반경 ${result.radiusM}m ${channelLabels} 검색 관측 후보 ${candidateCount}곳(중복 정규화 후, 원 반환 상세 ${observation.observedRawDetailCount}건). 복수 채널에서 함께 관측된 후보 ${multiChannelCandidateCount}곳은 한 곳으로 셉니다. 범위: SEARCH_OBSERVATION_NOT_CENSUS — 지정 검색조건의 관측이며 전수조사나 실제 경쟁점 수가 아닙니다.`,
    importance: "SUPPORTING",
    nature: "OBSERVATION",
    sourceRef: { ...competitionRef, opaqueKey: "kakaoObservation" },
  }));

  for (const category of observation.categories) {
    if (category.status !== "ERROR") continue;
    missingInformation.push(createDecisionEvidenceItem({
      sourceDomain: SOURCE_DOMAIN,
      bucket: "MISSING_INFORMATION",
      category: "COMPETITION",
      key: `competition-channel-error:${category.id}`,
      title: `Kakao ${category.label} 검색채널 조회 실패`,
      description: `Kakao ${category.label} 검색채널 조회가 실패했습니다. 0건으로 해석하지 않으며 관측 결과가 불완전할 수 있습니다.`,
      importance: "SUPPORTING",
      sourceRef: { ...competitionRef, opaqueKey: `kakaoObservation.${category.id}` },
    }));
  }

  if (candidateCount > 0) {
    const bands = result.distanceBands
      .map((band) => `${band.band} ${band.candidateCount}곳`)
      .join(", ");
    const directions = result.directionDistribution
      .filter((entry) => entry.candidateCount > 0)
      .map((entry) => `${entry.direction} ${entry.candidateCount}곳`)
      .join(", ");
    const nearest = result.nearestCandidates[0]?.distanceM ?? null;
    observedFacts.push(createDecisionEvidenceItem({
      sourceDomain: SOURCE_DOMAIN,
      bucket: "OBSERVED_FACT",
      category: "COMPETITION",
      key: "competition-spatial-distribution",
      title: "관측 후보 거리·방향 분포",
      description:
        `거리구간: ${bands}. 방향: ${directions || "확인 필요"}. ` +
        `최근접 관측 후보 거리: ${nearest === null ? "확인 필요" : `${nearest}m`}. ` +
        "Kakao 반환 거리와 좌표에서 파생한 분포이며 접근성이나 경쟁 정도에 대한 판단이 아닙니다.",
      importance: "SUPPORTING",
      nature: "DERIVED_CALCULATION",
      sourceRef: { ...competitionRef, opaqueKey: "distanceBands" },
    }));

    missingInformation.push(createDecisionEvidenceItem({
      sourceDomain: SOURCE_DOMAIN,
      bucket: "MISSING_INFORMATION",
      category: "COMPETITION",
      key: "competition-classification-unverified",
      title: "관측 후보 분류·영업 여부 미확인",
      description:
        `관측 후보 ${candidateCount}곳의 직접·간접 경쟁 분류, 프랜차이즈 여부, 실제 영업 여부는 확인되지 않았습니다 ` +
        "(classification=UNKNOWN, franchiseClassification=UNKNOWN, fieldVerificationStatus=NOT_CHECKED). 현장 확인 대상입니다.",
      importance: "SUPPORTING",
      sourceRef: { ...competitionRef, opaqueKey: "candidates.classification" },
    }));
  }

  const official = result.officialAreaReference;
  const officialLabel = official.officialMarketName ?? official.officialMarketCode ?? "공식상권 미표기";
  if (official.status === "AVAILABLE" || official.status === "PARTIAL") {
    const storeCountKnown = official.storeCount !== null;
    const item = {
      sourceDomain: SOURCE_DOMAIN,
      category: "COMPETITION" as const,
      key: "competition-official-store-reference",
      importance: "SUPPORTING" as const,
      nature: "REFERENCE_SUMMARY" as const,
      sourceRef: { ...competitionRef, opaqueKey: "officialAreaReference" },
    };
    if (storeCountKnown) {
      observedFacts.push(createDecisionEvidenceItem({
        ...item,
        bucket: "OBSERVED_FACT",
        title: "서울시 공식상권 제과점 점포 수(참고)",
        description:
          `서울시 공식상권 ‘${officialLabel}’ ${official.industryName} 점포 수 참고값: ${official.storeCount} ` +
          `(기준 ${official.referencePeriod ?? "미표기"}, 상태 ${official.status}). ` +
          "공식상권 전체 통계이며 Kakao 관측 후보 수와 합산하지 않습니다(KEEP_SEPARATE_FROM_KAKAO).",
      }));
    } else {
      missingInformation.push(createDecisionEvidenceItem({
        ...item,
        bucket: "MISSING_INFORMATION",
        title: "서울시 공식상권 제과점 점포 수 확인 필요",
        description:
          `서울시 공식상권 ‘${officialLabel}’ 점포 수 값이 없습니다(상태 ${official.status}). 0으로 해석하지 않으며 Kakao 관측 후보 수로 대체하지 않습니다.`,
      }));
    }
  } else if (official.status === "MISSING") {
    missingInformation.push(createDecisionEvidenceItem({
      sourceDomain: SOURCE_DOMAIN,
      bucket: "MISSING_INFORMATION",
      category: "COMPETITION",
      key: "competition-official-store-reference",
      title: "서울시 공식상권 점포 수 자료 없음",
      description:
        `서울시 공식상권 ‘${officialLabel}’ 참고자료가 연결되지 않았습니다. 0으로 해석하지 않으며 Kakao 관측 후보 수로 대체하지 않습니다.`,
      importance: "SUPPORTING",
      nature: "REFERENCE_SUMMARY",
      sourceRef: { ...competitionRef, opaqueKey: "officialAreaReference" },
    }));
  }

  for (const warning of result.warnings) {
    addLimitation(
      limitations,
      { origin: "COMPETITION_STRUCTURE", code: null, message: warning, severity: null },
      `competition:${result.analysisRunId}`,
    );
  }

  return Object.freeze({
    analysisRunId: result.analysisRunId,
    schemaVersion: result.schemaVersion,
    generatedAt: result.generatedAt,
    radiusM: result.radiusM,
    scope: observation.scope,
    observedRawDetailCount: observation.observedRawDetailCount,
    uniqueObservedCandidateCount: candidateCount,
    multiChannelCandidateCount,
    classification: "UNKNOWN" as const,
    franchiseClassification: "UNKNOWN" as const,
    fieldVerificationStatus: "NOT_CHECKED" as const,
    franchiseShare: null,
    officialAreaReference: Object.freeze({
      status: official.status,
      officialMarketCode: official.officialMarketCode,
      quarterCode: official.quarterCode,
      storeCount: official.storeCount,
      countCombinationPolicy: official.countCombinationPolicy,
    }),
  });
}

/**
 * locationBinding.analysisRunId 기준으로 현재 실행 결과만 Evidence로 변환한다.
 * 다른 run의 Result·Interpretation·Competition 결과는 사용하지 않는다.
 * 입력 객체를 mutation하지 않는다.
 */
export function buildLocationDecisionEvidence(
  input: LocationDecisionEvidenceInput,
): LocationDecisionEvidenceResult {
  const observedFacts: DecisionEvidenceItem[] = [];
  const missingInformation: DecisionEvidenceItem[] = [];
  const expertReviewItems: DecisionEvidenceItem[] = [];
  const limitations = new Map<string, MutableLimitation>();
  const nextChecks: LocationReferenceNextCheck[] = [];
  let referenceCompetition: LocationCompetitionReference | null = null;

  const finish = (): LocationDecisionEvidenceResult => Object.freeze({
    observedFacts: Object.freeze(observedFacts),
    missingInformation: Object.freeze(missingInformation),
    expertReviewItems: Object.freeze(expertReviewItems),
    referenceLimitations: Object.freeze([...limitations.values()].map((entry) => Object.freeze({
      ...entry,
      basisIds: Object.freeze([...entry.basisIds]),
    }))),
    referenceNextChecks: Object.freeze(nextChecks),
    referenceCompetition,
    createsVerdict: false as const,
    createsScore: false as const,
    createsRisk: false as const,
  });

  const binding = input.locationBinding;
  if (binding === null) {
    missingInformation.push(integrationItem({
      key: "location-binding-absent",
      category: "LOCATION",
      title: "기초입지분석 미연결",
      description:
        "CandidateDecisionContext.locationBinding이 없습니다. 현재 분석 실행을 확인할 수 없어 기초입지 결과를 Evidence로 사용하지 않습니다.",
      importance: "CORE",
      opaqueKey: "locationBinding",
    }));
    return finish();
  }
  if (typeof binding.analysisRunId !== "string" || !binding.analysisRunId.trim()) {
    missingInformation.push(integrationItem({
      key: "location-binding-invalid",
      category: "LOCATION",
      title: "기초입지분석 실행 식별자 없음",
      description:
        "locationBinding.analysisRunId가 비어 있습니다. 현재 분석 실행을 확인할 수 없어 기초입지 결과를 Evidence로 사용하지 않습니다.",
      importance: "CORE",
      opaqueKey: "locationBinding.analysisRunId",
    }));
    return finish();
  }
  const runId = binding.analysisRunId;

  const currentResults: BasicLocationResult[] = [];
  if (input.results === null) {
    missingInformation.push(integrationItem({
      key: "basic-location-results-absent",
      category: "LOCATION",
      title: "기초입지분석 결과 없음",
      description:
        "BasicLocationResult가 연결되지 않았습니다. 분석 미실행 또는 미연결 상태이며 0건 결과와 구분합니다.",
      importance: "CORE",
      opaqueKey: "basicLocationResults",
    }));
  } else if (input.results.length === 0) {
    missingInformation.push(integrationItem({
      key: "basic-location-results-empty",
      category: "LOCATION",
      title: "기초입지분석 결과 항목 없음",
      description: "연결된 BasicLocationResult 목록이 비어 있습니다. 결과값 0으로 해석하지 않습니다.",
      importance: "CORE",
      opaqueKey: "basicLocationResults",
    }));
  } else {
    const seenResultIds = new Set<string>();
    let staleCount = 0;
    let duplicateCount = 0;
    for (const result of input.results) {
      if (result.analysisRunId !== runId) {
        staleCount += 1;
        continue;
      }
      if (seenResultIds.has(result.resultId)) {
        duplicateCount += 1;
        continue;
      }
      seenResultIds.add(result.resultId);
      currentResults.push(result);
    }
    if (staleCount > 0) {
      missingInformation.push(integrationItem({
        key: "basic-location-result-run-mismatch",
        category: "LOCATION",
        title: "다른 분석 실행의 결과 제외",
        description:
          `analysisRunId가 locationBinding과 다른 Result ${staleCount}건을 현재 결과로 사용하지 않았습니다.`,
        importance: "CORE",
        opaqueKey: "basicLocationResults.analysisRunId",
      }));
    }
    if (duplicateCount > 0) {
      missingInformation.push(integrationItem({
        key: "basic-location-result-duplicate",
        category: "LOCATION",
        title: "중복 Result 제외",
        description: `동일 resultId가 반복된 Result ${duplicateCount}건은 한 번만 사용했습니다.`,
        importance: "SUPPORTING",
        opaqueKey: "basicLocationResults.resultId",
      }));
    }
  }

  const fieldCheckBasis = new Map<string, string[]>();
  for (const result of currentResults) {
    const item = resultItem(result);
    (item.bucket === "OBSERVED_FACT" ? observedFacts : missingInformation).push(item);
    for (const limitation of result.limitations) {
      addLimitation(
        limitations,
        {
          origin: "BASIC_LOCATION_RESULT",
          code: limitation.code,
          message: limitation.message,
          severity: limitation.severity,
        },
        result.resultId,
      );
    }
    if (result.fieldCheckRequired) {
      for (const checkKey of result.fieldCheckKeys) {
        const basis = fieldCheckBasis.get(checkKey) ?? [];
        if (!basis.includes(result.resultId)) basis.push(result.resultId);
        fieldCheckBasis.set(checkKey, basis);
      }
    }
  }

  const interpretation = input.interpretation;
  let currentInterpretation: BasicLocationInterpretation | null = null;
  if (interpretation === null) {
    if (currentResults.length > 0) {
      missingInformation.push(integrationItem({
        key: "basic-location-interpretation-absent",
        category: "LOCATION",
        title: "기초입지 해석 정보 미연결",
        description:
          "BasicLocationInterpretation이 연결되지 않았습니다. Result 기반 Evidence는 유지하며, 해석 보조정보(확인 항목 등)는 비어 있습니다.",
        importance: "SUPPORTING",
        opaqueKey: "basicLocationInterpretation",
      }));
    }
  } else if (interpretation.analysisRunId !== runId) {
    missingInformation.push(integrationItem({
      key: "basic-location-interpretation-run-mismatch",
      category: "LOCATION",
      title: "다른 분석 실행의 해석 정보 제외",
      description:
        "BasicLocationInterpretation.analysisRunId가 locationBinding과 다릅니다. 해당 해석 정보를 현재 결과로 사용하지 않았습니다.",
      importance: "SUPPORTING",
      opaqueKey: "basicLocationInterpretation.analysisRunId",
    }));
  } else {
    currentInterpretation = interpretation;
    for (const signal of interpretation.riskSignals) {
      for (const basisId of signal.basisResultIds) {
        addLimitation(
          limitations,
          {
            origin: "BASIC_LOCATION_INTERPRETATION",
            code: null,
            message: signal.message,
            severity: null,
          },
          basisId,
        );
      }
    }
    for (const check of interpretation.nextChecks) {
      nextChecks.push(Object.freeze({
        id: check.id,
        message: check.message,
        basisResultIds: Object.freeze([...check.basisResultIds]),
      }));
    }
  }

  for (const [checkKey, basis] of fieldCheckBasis) {
    const interpreted = currentInterpretation?.nextChecks.find(
      (check) => check.id === `next-check:${checkKey.toLowerCase()}`,
    );
    missingInformation.push(createDecisionEvidenceItem({
      sourceDomain: SOURCE_DOMAIN,
      bucket: "MISSING_INFORMATION",
      category: "LOCATION",
      key: `field-check:${checkKey}`,
      title: `현장 확인 필요: ${checkKey}`,
      description:
        `${interpreted?.message ?? `현장 확인 항목 ${checkKey}이(가) 아직 확인되지 않았습니다.`} ` +
        `근거 Result ${basis.length}건. 추가 현장 확인 항목이며 전문가 검토 항목으로 분류하지 않습니다.`,
      importance: "SUPPORTING",
      sourceRef: { stageId: "location-field-check", fieldKey: checkKey },
    }));
  }

  const competitionResult = input.competitionResult ?? null;
  const competitionTarget = input.competitionTarget ?? null;
  if (competitionResult === null) {
    missingInformation.push(integrationItem({
      key: "competition-structure-absent",
      category: "COMPETITION",
      title: "경쟁구조 분석 결과 미연결",
      description:
        "CompetitionStructureResult가 연결되지 않았습니다. 분석 미실행 또는 미연결 상태이며 관측 후보 0곳과 구분합니다.",
      importance: "SUPPORTING",
      opaqueKey: "competitionResult",
    }));
  } else if (competitionTarget === null) {
    missingInformation.push(integrationItem({
      key: "competition-target-absent",
      category: "COMPETITION",
      title: "경쟁구조 분석 대상 미연결",
      description:
        "CompetitionLocationTarget이 없어 경쟁구조 결과가 현재 분석 실행의 결과인지 확인할 수 없습니다. 해당 결과를 사용하지 않았습니다.",
      importance: "SUPPORTING",
      opaqueKey: "competitionTarget",
    }));
  } else if (competitionTarget.analysisRunId !== runId) {
    missingInformation.push(integrationItem({
      key: "competition-target-run-mismatch",
      category: "COMPETITION",
      title: "경쟁구조 분석 대상 실행 불일치",
      description:
        "CompetitionLocationTarget.analysisRunId가 locationBinding과 다릅니다. 해당 경쟁구조 결과를 사용하지 않았습니다.",
      importance: "SUPPORTING",
      opaqueKey: "competitionTarget.analysisRunId",
    }));
  } else if (!competitionResultMatchesTarget(competitionTarget, competitionResult)) {
    missingInformation.push(integrationItem({
      key: "competition-result-stale",
      category: "COMPETITION",
      title: "경쟁구조 결과 실행 불일치",
      description:
        "CompetitionStructureResult가 현재 분석 대상과 일치하지 않습니다. 좌표가 같더라도 analysisRunId가 다르면 현재 결과로 사용하지 않습니다.",
      importance: "SUPPORTING",
      opaqueKey: "competitionResult.analysisRunId",
    }));
  } else {
    referenceCompetition = buildCompetitionEvidence(
      competitionResult,
      observedFacts,
      missingInformation,
      limitations,
    );
  }

  return finish();
}
