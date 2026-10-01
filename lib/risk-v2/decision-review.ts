/**
 * Decision Review Completeness — 사람이 최종 의사결정을 검토할 자료가 갖춰졌는지만 나타낸다.
 *
 * readyForHumanDecisionReview는 진행 가능·blocker 없음을 뜻하지 않는다.
 * HARD_BLOCKER / CONDITIONAL_BLOCKER / ECONOMIC_STRESS는 검토 대상 내용이므로 준비도에 반영하지 않고
 * open 목록으로만 전달한다. Evidence gap과 필수 전문가 검토 미완료만 준비 부족이다.
 * ACCEPTED_BY_HUMAN은 해소가 아니므로 open으로 유지한다.
 */

import { validateRiskRegister, type RiskRegister, type RiskRegisterOutcome } from "./risk-register";
import type { RiskClass } from "./types";

export const DECISION_REVIEW_COMPLETENESS_SCHEMA_VERSION =
  "risk-v2-decision-review-completeness-v1" as const;

export interface DecisionReviewCompleteness {
  readonly schemaVersion: typeof DECISION_REVIEW_COMPLETENESS_SCHEMA_VERSION;
  readonly candidateStoreId: string;
  readonly ruleSetVersion: string;
  readonly evidenceReady: boolean;
  readonly expertReviewReady: boolean;
  readonly readyForHumanDecisionReview: boolean;
  readonly unresolvedEvidenceGapFindingIds: readonly string[];
  readonly unresolvedHumanReviewFindingIds: readonly string[];
  readonly openHardBlockerFindingIds: readonly string[];
  readonly openConditionalBlockerFindingIds: readonly string[];
  readonly openEconomicStressFindingIds: readonly string[];
  readonly requiresHumanDecision: true;
  readonly createsVerdict: false;
  readonly createsScore: false;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function buildDecisionReviewCompleteness(
  register: RiskRegister,
): RiskRegisterOutcome<DecisionReviewCompleteness> {
  const checked = validateRiskRegister(register);
  if (!checked.ok) return checked;
  const { entries, candidateStoreId, ruleSetVersion } = checked.value;

  const openIds = (riskClass: RiskClass): readonly string[] =>
    Object.freeze(
      entries
        .filter((entry) => entry.riskClass === riskClass && entry.resolutionStatus !== "RESOLVED")
        .map((entry) => entry.findingId)
        .sort(compareText),
    );

  const unresolvedEvidenceGapFindingIds = openIds("EVIDENCE_GAP");
  const unresolvedHumanReviewFindingIds = openIds("HUMAN_REVIEW_REQUIRED");
  const evidenceReady = unresolvedEvidenceGapFindingIds.length === 0;
  const expertReviewReady = unresolvedHumanReviewFindingIds.length === 0;

  return Object.freeze({
    ok: true as const,
    value: Object.freeze({
      schemaVersion: DECISION_REVIEW_COMPLETENESS_SCHEMA_VERSION,
      candidateStoreId,
      ruleSetVersion,
      evidenceReady,
      expertReviewReady,
      readyForHumanDecisionReview: evidenceReady && expertReviewReady,
      unresolvedEvidenceGapFindingIds,
      unresolvedHumanReviewFindingIds,
      openHardBlockerFindingIds: openIds("HARD_BLOCKER"),
      openConditionalBlockerFindingIds: openIds("CONDITIONAL_BLOCKER"),
      openEconomicStressFindingIds: openIds("ECONOMIC_STRESS"),
      requiresHumanDecision: true as const,
      createsVerdict: false as const,
      createsScore: false as const,
    }),
  });
}
