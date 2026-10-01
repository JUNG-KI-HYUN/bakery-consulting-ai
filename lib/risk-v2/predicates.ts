/**
 * Risk predicate registry — RiskEvidenceRequirement.predicateKey를 해석한다.
 *
 * predicate는 typed evidence field만 본다. description / title을 해석하지 않는다.
 * pure: I/O, clock, randomness, mutation 없음.
 * V1 golden rule은 typed selector만으로 충분하므로 builtin predicate는 없다.
 */

import type { CandidateDecisionEvidenceBundle } from "../decision-evidence/candidate-bundle";
import type { DecisionEvidenceItem } from "../decision-evidence/types";
import type { RiskEvidenceRequirement, RiskRuleDefinition } from "./types";

export interface RiskPredicateContext {
  readonly bundle: CandidateDecisionEvidenceBundle;
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
