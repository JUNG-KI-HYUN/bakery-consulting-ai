/**
 * Risk predicate registry — RiskEvidenceRequirement.predicateKey를 해석한다.
 *
 * predicate는 typed evidence field만 본다. description / title을 해석하지 않는다.
 * pure: I/O, clock, randomness, mutation 없음.
 * V1 golden rule은 typed selector만으로 충분하므로 V1 registry에는 builtin predicate가 없다.
 */

import type { DecisionEvidenceItem } from "../decision-evidence/types";
import type { SupportedCandidateDecisionEvidenceBundle } from "./candidate-evidence-versions";
import type { RiskEvidenceRequirement, RiskRuleDefinition } from "./types";

export interface RiskPredicateContext {
  readonly bundle: SupportedCandidateDecisionEvidenceBundle;
  readonly rule: RiskRuleDefinition;
  readonly requirement: RiskEvidenceRequirement;
  readonly candidateEvidence: DecisionEvidenceItem;
}

export type RiskPredicate = (context: RiskPredicateContext) => boolean;

export type RiskPredicateRegistry = Readonly<Record<string, RiskPredicate>>;

export function createRiskPredicateRegistry(
  entries: Readonly<Record<string, RiskPredicate>>,
): RiskPredicateRegistry {
  const registry: Record<string, RiskPredicate> = Object.create(null);
  for (const [key, predicate] of Object.entries(entries)) {
    if (!key.trim() || key !== key.trim()) {
      throw new RangeError(`predicateKey가 올바르지 않습니다: "${key}"`);
    }
    if (typeof predicate !== "function") {
      throw new TypeError(`predicate가 함수가 아닙니다: ${key}`);
    }
    registry[key] = predicate;
  }
  return Object.freeze(registry);
}

export function lookupRiskPredicate(
  registry: RiskPredicateRegistry,
  predicateKey: string,
): RiskPredicate | null {
  return Object.prototype.hasOwnProperty.call(registry, predicateKey)
    ? registry[predicateKey]
    : null;
}

export const RISK_PREDICATE_REGISTRY_V1: RiskPredicateRegistry = createRiskPredicateRegistry({});

export const ECONOMIC_BASE_BELOW_BEP_PREDICATE_KEY = "economic.baseBelowBep" as const;

/**
 * Economic engine 수치는 binding이 일치하고 validation error가 없을 때만 읽는다.
 * ECONOMIC INTEGRATION_STATE missing(binding 없음·불일치, 결과 없음, validation errors)이 있으면 false.
 */
function economicNumbersUsable(bundle: SupportedCandidateDecisionEvidenceBundle): boolean {
  const economic = bundle.domainEvidence?.economic;
  if (!economic || economic.referenceValidation.errors.length > 0) return false;
  return !bundle.missingInformation.some(
    (item) => item.sourceDomain === "ECONOMIC" && item.nature === "INTEGRATION_STATE",
  );
}

/** 기존 engine 출력값끼리 비교만 한다. null·비유한수는 판단 불가로 false. 같으면 false. */
function economicBaseBelowBep({ bundle }: RiskPredicateContext): boolean {
  if (!economicNumbersUsable(bundle)) return false;
  const numbers = bundle.domainEvidence.economic.referenceNullableNumbers;
  const baseMonthlySales = numbers["scenarios.base.monthlySales"];
  const monthlyBepSales = numbers["bep.monthlyBepSales"];
  if (typeof baseMonthlySales !== "number" || !Number.isFinite(baseMonthlySales)) return false;
  if (typeof monthlyBepSales !== "number" || !Number.isFinite(monthlyBepSales)) return false;
  return baseMonthlySales < monthlyBepSales;
}

/** V1 registry 의미는 유지한다. V2는 risk-rules-v2 전용이다. */
export const RISK_PREDICATE_REGISTRY_V2: RiskPredicateRegistry = createRiskPredicateRegistry({
  [ECONOMIC_BASE_BELOW_BEP_PREDICATE_KEY]: economicBaseBelowBep,
});

export const ECONOMIC_PLANNED_RENT_ABOVE_BASE_CEILING_PREDICATE_KEY =
  "economic.plannedRentAboveBaseCeiling" as const;

/**
 * Engine relation(referenceRentPlanning.plannedRentToCeiling)만 source-of-truth로 쓴다. 재비교하지 않는다.
 * ABOVE일 때만 true. BELOW_OR_EQUAL / NOT_AVAILABLE / null은 이 rule이 trigger되지 않았다는 뜻일 뿐이다.
 */
function economicPlannedRentAboveBaseCeiling({ bundle }: RiskPredicateContext): boolean {
  if (!economicNumbersUsable(bundle)) return false;
  const planning = bundle.domainEvidence.economic.referenceRentPlanning;
  return planning !== null && planning.plannedRentToCeiling === "ABOVE";
}

/** V3는 risk-rules-v3 전용이다. V2 predicate를 그대로 포함한다. */
export const RISK_PREDICATE_REGISTRY_V3: RiskPredicateRegistry = createRiskPredicateRegistry({
  ...RISK_PREDICATE_REGISTRY_V2,
  [ECONOMIC_PLANNED_RENT_ABOVE_BASE_CEILING_PREDICATE_KEY]: economicPlannedRentAboveBaseCeiling,
});
