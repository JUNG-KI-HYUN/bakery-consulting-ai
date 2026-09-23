/**
 * Economic Feasibility -> Decision Evidence (read-only).
 *
 * calculateEconomicFeasibility()을 재호출·재계산하지 않는다.
 * Risk / Verdict / Score / OBSERVED_CONSTRAINT를 생성하지 않는다.
 * Economic ProvenanceKind를 FIELD VerificationStatus로 변환하지 않는다.
 *
 * null semantics: null != 0, null != 문자열 "null".
 * description 표시는 "확인 필요", 원본 수치는 referenceNullableNumbers에 number | null로 보존한다.
 */

import type { EconomicAnalysisBinding } from "../decision-integration/types";
import type {
  EconomicFeasibilityResult,
  EconomicScenarioKey,
  ProvenanceKind,
} from "../economic-feasibility/types";
import { createDecisionEvidenceItem } from "./helpers";
import type {
  DecisionEvidenceCategory,
  DecisionEvidenceItem,
  DecisionEvidenceNature,
} from "./types";

const SOURCE_DOMAIN = "ECONOMIC" as const;

const SCENARIO_KEYS: readonly EconomicScenarioKey[] = [
  "conservative",
  "base",
  "upside",
];

export type EconomicProvenanceRef = {
  readonly field: string;
  readonly kind: ProvenanceKind;
  readonly basedOn: readonly ProvenanceKind[];
  readonly sourceIds?: readonly string[];
};

export type EconomicDecisionEvidenceResult = {
  readonly observedFacts: readonly DecisionEvidenceItem[];
  readonly missingInformation: readonly DecisionEvidenceItem[];
  readonly expertReviewItems: readonly DecisionEvidenceItem[];
  /** EconomicFeasibilityResult.limitations 원문. 자동 분류하지 않는다. */
  readonly referenceLimitations: readonly string[];
  /** validation.errors / warnings 원문 보존. Verdict/Risk로 변환하지 않는다. */
  readonly referenceValidation: {
    readonly errors: readonly string[];
    readonly warnings: readonly string[];
  };
  /** Economic provenance 원문. FIELD enum으로 변환하지 않는다. */
  readonly referenceProvenance: readonly EconomicProvenanceRef[];
  /**
   * nullable 수치의 원본 null semantics 보존.
   * JSON 문자열 `"null"`로 치환하지 않으며, 값 타입은 number | null 이다.
   */
  readonly referenceNullableNumbers: Readonly<Record<string, number | null>>;
  readonly createsVerdict: false;
  readonly createsScore: false;
  readonly createsRisk: false;
};

/** description 표시용. null을 문자열 "null"이나 0으로 바꾸지 않는다. */
function formatDisplayNumber(value: number | null): string {
  if (value === null) return "확인 필요";
  return String(value);
}

function collectNullableNumbers(
  result: EconomicFeasibilityResult,
): Readonly<Record<string, number | null>> {
  const numbers: Record<string, number | null> = {};
  for (const scenarioKey of SCENARIO_KEYS) {
    const scenario = result.scenarios[scenarioKey];
    numbers[`scenarios.${scenarioKey}.monthlySales`] = scenario.monthlySales;
    numbers[`scenarios.${scenarioKey}.dailySales`] = scenario.dailySales;
    numbers[`scenarios.${scenarioKey}.estimatedOperatingProfit`] =
      scenario.estimatedOperatingProfit;
    numbers[`scenarios.${scenarioKey}.operatingMargin`] = scenario.operatingMargin;
    numbers[`scenarios.${scenarioKey}.rentBurdenRate`] = scenario.rentBurdenRate;
  }
  numbers["bep.variableCostRate"] = result.bep.variableCostRate;
  numbers["bep.contributionMarginRate"] = result.bep.contributionMarginRate;
  numbers["bep.monthlyBepSales"] = result.bep.monthlyBepSales;
  numbers["bep.dailyBepSales"] = result.bep.dailyBepSales;
  numbers["bep.requiredDailyTransactionsForBep"] =
    result.bep.requiredDailyTransactionsForBep;
  numbers["bep.baseBufferAmount"] = result.bep.baseBufferAmount;
  numbers["bep.baseBufferRate"] = result.bep.baseBufferRate;
  numbers["rentCeiling.conservativeRentCeiling"] =
    result.rentCeiling.conservativeRentCeiling;
  numbers["rentCeiling.baseRentCeiling"] = result.rentCeiling.baseRentCeiling;
  numbers["rentCeiling.upsideRentCeiling"] = result.rentCeiling.upsideRentCeiling;
  numbers["officialBenchmark.value"] = result.officialBenchmark.value;
  numbers["officialBenchmark.totalSales"] = result.officialBenchmark.totalSales;
  numbers["officialBenchmark.storeCount"] = result.officialBenchmark.storeCount;
  numbers["rentalMarketReference.medianRent"] = result.rentalMarketReference.medianRent;
  numbers["rentalMarketReference.minRent"] = result.rentalMarketReference.minRent;
  numbers["rentalMarketReference.maxRent"] = result.rentalMarketReference.maxRent;
  numbers["rentalMarketReference.baseRentCeiling"] =
    result.rentalMarketReference.baseRentCeiling;
  for (const test of result.stressTests) {
    numbers[`stressTests.${test.key}.monthlySales`] = test.monthlySales;
    numbers[`stressTests.${test.key}.estimatedOperatingProfit`] =
      test.estimatedOperatingProfit;
    numbers[`stressTests.${test.key}.operatingProfitChange`] =
      test.operatingProfitChange;
    numbers[`stressTests.${test.key}.operatingMargin`] = test.operatingMargin;
    numbers[`stressTests.${test.key}.rentBurdenRate`] = test.rentBurdenRate;
  }
  return Object.freeze(numbers);
}

function economicItem(input: {
  bucket: "OBSERVED_FACT" | "MISSING_INFORMATION";
  category: DecisionEvidenceCategory;
  key: string;
  title: string;
  description: string;
  nature: DecisionEvidenceNature;
  importance?: "CORE" | "SUPPORTING";
  opaqueKey?: string;
  fieldKey?: string;
}): DecisionEvidenceItem {
  return createDecisionEvidenceItem({
    sourceDomain: SOURCE_DOMAIN,
    bucket: input.bucket,
    category: input.category,
    key: input.key,
    title: input.title,
    description: input.description,
    importance: input.importance ?? "SUPPORTING",
    nature: input.nature,
    sourceRef: {
      stageId: "economic-feasibility",
      ...(input.opaqueKey ? { opaqueKey: input.opaqueKey } : {}),
      ...(input.fieldKey ? { fieldKey: input.fieldKey } : {}),
    },
  });
}

function freezeProvenance(
  provenance: EconomicFeasibilityResult["provenance"],
): readonly EconomicProvenanceRef[] {
  return Object.freeze(
    provenance.map((entry) =>
      Object.freeze({
        field: entry.field,
        kind: entry.kind,
        basedOn: Object.freeze([...entry.basedOn]),
        ...(entry.sourceIds
          ? { sourceIds: Object.freeze([...entry.sourceIds]) }
          : {}),
      }),
    ),
  );
}

/**
 * EconomicFeasibilityResult + optional economicBinding -> DecisionEvidence items.
 * 입력 Domain 객체를 mutation하지 않는다.
 */
export function buildEconomicDecisionEvidence(input: {
  economicResult: EconomicFeasibilityResult | null;
  economicBinding: EconomicAnalysisBinding | null;
}): EconomicDecisionEvidenceResult {
  const observedFacts: DecisionEvidenceItem[] = [];
  const missingInformation: DecisionEvidenceItem[] = [];
  const expertReviewItems: DecisionEvidenceItem[] = [];

  const result = input.economicResult;
  const binding = input.economicBinding;

  if (binding === null) {
    missingInformation.push(
      economicItem({
        bucket: "MISSING_INFORMATION",
        category: "ECONOMIC",
        nature: "INTEGRATION_STATE",
        key: "economic-binding-absent",
        title: "경제성 분석 미연결",
        description: "CandidateDecisionContext.economicBinding이 없습니다. Economic Feasibility binding이 아직 연결되지 않았습니다.",
        importance: "CORE",
        opaqueKey: "economicBinding",
        fieldKey: "economicBinding",
      }),
    );
  }

  if (result === null) {
    missingInformation.push(
      economicItem({
        bucket: "MISSING_INFORMATION",
        category: "ECONOMIC",
        nature: "INTEGRATION_STATE",
        key: "economic-result-absent",
        title: "Economic Feasibility 결과 없음",
        description: "EconomicFeasibilityResult가 없습니다. 경제성 분석 결과가 아직 연결되어 있지 않습니다.",
        importance: "CORE",
        opaqueKey: "economicResult",
        fieldKey: "economicResult",
      }),
    );

    return Object.freeze({
      observedFacts: Object.freeze(observedFacts),
      missingInformation: Object.freeze(missingInformation),
      expertReviewItems: Object.freeze(expertReviewItems),
      referenceLimitations: Object.freeze([] as string[]),
      referenceValidation: Object.freeze({
        errors: Object.freeze([] as string[]),
        warnings: Object.freeze([] as string[]),
      }),
      referenceProvenance: Object.freeze([] as EconomicProvenanceRef[]),
      referenceNullableNumbers: Object.freeze({} as Record<string, number | null>),
      createsVerdict: false as const,
      createsScore: false as const,
      createsRisk: false as const,
    });
  }

  if (binding !== null) {
    if (binding.generatedAt !== result.metadata.generatedAt) {
      missingInformation.push(
        economicItem({
          bucket: "MISSING_INFORMATION",
          category: "ECONOMIC",
          nature: "INTEGRATION_STATE",
          key: "generated-at-mismatch",
          title: "경제성 분석 생성시각 연결 불일치",
          description: "economicBinding.generatedAt과 EconomicFeasibilityResult.metadata.generatedAt이 일치하지 않습니다. 저장소 I/O 없이 contract binding만 대조했으며, 판정·점수·Risk로 해석하지 않습니다.",
          importance: "CORE",
          opaqueKey: "generatedAt",
          fieldKey: "generatedAt",
        }),
      );
    }
    if (binding.engineVersion !== result.metadata.engineVersion) {
      missingInformation.push(
        economicItem({
          bucket: "MISSING_INFORMATION",
          category: "ECONOMIC",
          nature: "INTEGRATION_STATE",
          key: "engine-version-mismatch",
          title: "경제성 분석 엔진버전 연결 불일치",
          description: "economicBinding.engineVersion과 EconomicFeasibilityResult.metadata.engineVersion이 일치하지 않습니다. 저장소 I/O 없이 contract binding만 대조했으며, 판정·점수·Risk로 해석하지 않습니다.",
          importance: "CORE",
          opaqueKey: "engineVersion",
          fieldKey: "engineVersion",
        }),
      );
    }
  }

  // Scenario summary nature = ESTIMATE:
  // 사용자 입력 가정에서 출발한 projection summary.
  // operatingProfit/margin 등은 내부 산식 결과이나, 이번 Phase에서 item 세분화하지 않는다.
  // 상세 provenance는 referenceProvenance의 FRAMEONE_ESTIMATE / FRAMEONE_CALCULATION으로 보존한다.
  for (const scenarioKey of SCENARIO_KEYS) {
    const scenario = result.scenarios[scenarioKey];
    observedFacts.push(
      economicItem({
        bucket: "OBSERVED_FACT",
        category: "ECONOMIC",
        nature: "ESTIMATE",
        key: `scenario-${scenarioKey}-projection`,
        title: `${scenarioKey} 시나리오 사업계획 projection`,
        description:
          `scenario=${scenarioKey}; dailyTransactions=${scenario.dailyTransactions}; ` +
          `monthlySales=${formatDisplayNumber(scenario.monthlySales)}; ` +
          `dailySales=${formatDisplayNumber(scenario.dailySales)}; ` +
          `estimatedOperatingProfit=${formatDisplayNumber(scenario.estimatedOperatingProfit)}; ` +
          `operatingMargin=${formatDisplayNumber(scenario.operatingMargin)}; ` +
          `rentBurdenRate=${formatDisplayNumber(scenario.rentBurdenRate)}. ` +
          `사업계획 가정 기반 projection이며 달성 확정이 아닙니다.`,
        importance: scenarioKey === "base" ? "CORE" : "SUPPORTING",
        opaqueKey: `scenarios.${scenarioKey}`,
        fieldKey: `scenarios.${scenarioKey}`,
      }),
    );
  }

  const bep = result.bep;
  observedFacts.push(
    economicItem({
      bucket: "OBSERVED_FACT",
      category: "BEP",
      nature: "DERIVED_CALCULATION",
      key: "bep-summary",
      title: "BEP 산식 결과",
      description:
        `variableCostRate=${formatDisplayNumber(bep.variableCostRate)}; ` +
        `contributionMarginRate=${formatDisplayNumber(bep.contributionMarginRate)}; ` +
        `monthlyBepSales=${formatDisplayNumber(bep.monthlyBepSales)}; ` +
        `dailyBepSales=${formatDisplayNumber(bep.dailyBepSales)}; ` +
        `requiredDailyTransactionsForBep=${formatDisplayNumber(bep.requiredDailyTransactionsForBep)}; ` +
        `baseBufferAmount=${formatDisplayNumber(bep.baseBufferAmount)}; ` +
        `baseBufferRate=${formatDisplayNumber(bep.baseBufferRate)}. ` +
        `Economic engine 산식 결과이며 사업 성패 판정이 아닙니다.`,
      importance: "CORE",
      opaqueKey: "bep",
      fieldKey: "bep",
    }),
  );

  const ceiling = result.rentCeiling;
  observedFacts.push(
    economicItem({
      bucket: "OBSERVED_FACT",
      category: "ECONOMIC",
      nature: "DERIVED_CALCULATION",
      key: "rent-ceiling-summary",
      title: "목표 임대료 부담률 기준 임대료 ceiling",
      description:
        `targetRentBurdenRate=${ceiling.targetRentBurdenRate}; ` +
        `conservativeRentCeiling=${formatDisplayNumber(ceiling.conservativeRentCeiling)}; ` +
        `baseRentCeiling=${formatDisplayNumber(ceiling.baseRentCeiling)}; ` +
        `upsideRentCeiling=${formatDisplayNumber(ceiling.upsideRentCeiling)}. ` +
        `목표 임대료 부담률 기준 계산값이며 임대차 계약 적합성 판정이 아닙니다.`,
      importance: "CORE",
      opaqueKey: "rentCeiling",
      fieldKey: "rentCeiling",
    }),
  );

  const stressParts = result.stressTests.map(
    (test) =>
      `${test.key}: monthlySales=${formatDisplayNumber(test.monthlySales)}, ` +
      `estimatedOperatingProfit=${formatDisplayNumber(test.estimatedOperatingProfit)}, ` +
      `operatingProfitChange=${formatDisplayNumber(test.operatingProfitChange)}`,
  );
  observedFacts.push(
    economicItem({
      bucket: "OBSERVED_FACT",
      category: "ECONOMIC",
      nature: "DERIVED_CALCULATION",
      key: "stress-tests-summary",
      title: "Stress test 산식 결과 요약",
      description:
        `stressTestCount=${result.stressTests.length}. ` +
        (stressParts.length > 0 ? stressParts.join("; ") + ". " : "") +
        `기존 stressTests 결과를 재계산하지 않으며 점수·판정으로 변환하지 않습니다.`,
      importance: "SUPPORTING",
      opaqueKey: "stressTests",
      fieldKey: "stressTests",
    }),
  );

  const benchmark = result.officialBenchmark;
  observedFacts.push(
    economicItem({
      bucket: "OBSERVED_FACT",
      category: "ECONOMIC",
      nature: "REFERENCE_SUMMARY",
      key: "official-benchmark",
      title: "공식상권 제과점 점포당 참고매출",
      description:
        `status=${benchmark.status}; value=${formatDisplayNumber(benchmark.value)}; ` +
        `totalSales=${formatDisplayNumber(benchmark.totalSales)}; ` +
        `storeCount=${formatDisplayNumber(benchmark.storeCount)}; ` +
        `valueType=${benchmark.valueType}; ` +
        `limitation=${benchmark.limitation}. ` +
        `공식 데이터 기반 비교참고값이며 후보점포 예상매출의 실현 여부를 의미하지 않습니다.`,
      importance: "SUPPORTING",
      opaqueKey: "officialBenchmark",
      fieldKey: "officialBenchmark",
    }),
  );

  const rentalRef = result.rentalMarketReference;
  observedFacts.push(
    economicItem({
      bucket: "OBSERVED_FACT",
      category: "ECONOMIC",
      nature: "REFERENCE_SUMMARY",
      key: "rental-market-reference-usage",
      title: "경제성 계산에 사용된 임대 참고 연결",
      description:
        `status=${rentalRef.status}; sampleCount=${rentalRef.sampleCount}; ` +
        `sampleSufficiency=${rentalRef.sampleSufficiency === null ? "확인 필요" : rentalRef.sampleSufficiency}; ` +
        `plannedRent=${rentalRef.plannedRent}; ` +
        `baseRentCeiling=${formatDisplayNumber(rentalRef.baseRentCeiling)}; ` +
        `plannedRentToCeiling=${rentalRef.plannedRentToCeiling} ` +
        `(목표 임대료 부담률 기준 계산값과의 관계; 임대차 적합성 판정 아님); ` +
        `medianRentToCeiling=${rentalRef.medianRentToCeiling}. ` +
        `Lease Adapter의 rent median Evidence를 재생성하지 않으며, 경제성 계산 보조 참고만 표시합니다.`,
      importance: "SUPPORTING",
      opaqueKey: "rentalMarketReference",
      fieldKey: "rentalMarketReference",
    }),
  );

  if (result.validation.errors.length > 0) {
    missingInformation.push(
      economicItem({
        bucket: "MISSING_INFORMATION",
        category: "ECONOMIC",
        nature: "INTEGRATION_STATE",
        key: "validation-errors",
        title: "경제성 입력·계산 validation errors",
        description:
          `validation.errors count=${result.validation.errors.length}. ` +
          `원문은 referenceValidation.errors에 보존합니다. Final Risk·Verdict로 해석하지 않습니다.`,
        importance: "CORE",
        opaqueKey: "validation.errors",
        fieldKey: "validation.errors",
      }),
    );
  }

  const referenceLimitations = Object.freeze([...result.limitations]);
  const referenceValidation = Object.freeze({
    errors: Object.freeze([...result.validation.errors]),
    warnings: Object.freeze([...result.validation.warnings]),
  });
  const referenceProvenance = freezeProvenance(result.provenance);
  const referenceNullableNumbers = collectNullableNumbers(result);

  return Object.freeze({
    observedFacts: Object.freeze(observedFacts),
    missingInformation: Object.freeze(missingInformation),
    expertReviewItems: Object.freeze(expertReviewItems),
    referenceLimitations,
    referenceValidation,
    referenceProvenance,
    referenceNullableNumbers,
    createsVerdict: false as const,
    createsScore: false as const,
    createsRisk: false as const,
  });
}
