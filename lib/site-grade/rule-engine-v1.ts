import type { CandidateCriteriaEvaluationSetV1 } from "../site-criteria/evaluation-types";
import { validateProfileEvaluationLink } from "../site-criteria/profile-evaluation-validation";
import type {
  SiteCriteriaImportance,
  SiteCriteriaProfileV1,
} from "../site-criteria/types";
import {
  SITE_GRADE_RESULT_SCHEMA_VERSION,
  type SiteGrade,
  type SiteGradeResultV1,
} from "./types";
import { validateSiteGradeResult } from "./validation";
import type { SiteGradeReasonCode } from "./reason-codes";

export const SITE_GRADE_RULE_V1 = "SITE_GRADE_RULE_V1" as const;

export interface DeriveSiteGradeV1Input {
  readonly profile: SiteCriteriaProfileV1;
  readonly evaluationSet: CandidateCriteriaEvaluationSetV1;
  readonly ruleSetVersion: string;
  /** 호출자가 명시하는 결과 생성시점. 엔진은 현재시간을 읽지 않는다. */
  readonly generatedAt: string;
  readonly generatedBy?: string;
}

export interface SiteGradeRuleEngineFailure {
  readonly ok: false;
  readonly code: "INVALID_SITE_GRADE_ENGINE_INPUT" | "INVALID_SITE_GRADE_ENGINE_RESULT";
  readonly message: string;
  readonly errors: readonly string[];
}

export type SiteGradeRuleEngineResult =
  | { readonly ok: true; readonly value: SiteGradeResultV1 }
  | SiteGradeRuleEngineFailure;

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value === value.trim();
}

/** 같은 세 입력에는 같은 ID를 반환한다. random/time/network를 사용하지 않는다. */
export function createSiteGradeResultIdV1(
  evaluationSetId: string,
  ruleSetVersion: string,
  generatedAt: string,
): string {
  return [
    "site-grade-v1",
    encodeURIComponent(evaluationSetId),
    encodeURIComponent(ruleSetVersion),
    encodeURIComponent(generatedAt),
  ].join(":");
}

type EvaluationResult = CandidateCriteriaEvaluationSetV1["evaluations"][number]["result"];

const RESULT_GROUP_FIELD = Object.freeze({
  MATCH: "matchedCriteriaKeys",
  CONDITIONAL_MATCH: "conditionalCriteriaKeys",
  GAP: "gapCriteriaKeys",
  HARD_GAP: "hardGapCriteriaKeys",
  UNKNOWN: "unknownCriteriaKeys",
} as const);

interface CriterionEvaluationPair {
  readonly criterionKey: string;
  readonly importance: SiteCriteriaImportance;
  readonly result: EvaluationResult;
}

function countResult(
  pairs: readonly CriterionEvaluationPair[],
  result: EvaluationResult,
): number {
  return pairs.filter((pair) => pair.result === result).length;
}

function summarize(label: string, pairs: readonly CriterionEvaluationPair[]): string {
  return `${label} ${pairs.length}개: MATCH ${countResult(pairs, "MATCH")}개, `
    + `CONDITIONAL_MATCH ${countResult(pairs, "CONDITIONAL_MATCH")}개, `
    + `GAP ${countResult(pairs, "GAP")}개, HARD_GAP ${countResult(pairs, "HARD_GAP")}개, `
    + `UNKNOWN ${countResult(pairs, "UNKNOWN")}개.`;
}

function reason(code: SiteGradeReasonCode, explanation: string): string {
  return `${code}: ${explanation}`;
}

function applyRuleLadder(pairs: readonly CriterionEvaluationPair[]): {
  readonly grade: SiteGrade;
  readonly reasons: readonly string[];
} {
  const required = pairs.filter((pair) => pair.importance === "REQUIRED");
  const preferred = pairs.filter((pair) => pair.importance === "PREFERRED");
  const conditional = pairs.filter((pair) => pair.importance === "CONDITIONAL");
  const requiredHardGap = countResult(required, "HARD_GAP");
  const requiredUnknown = countResult(required, "UNKNOWN");
  const requiredGap = countResult(required, "GAP");
  const requiredConditional = countResult(required, "CONDITIONAL_MATCH");
  const preferredGap = countResult(preferred, "GAP");
  const preferredHardGap = countResult(preferred, "HARD_GAP");

  const reasons: string[] = [];
  let grade: SiteGrade;
  if (requiredHardGap > 0) {
    grade = "D";
    reasons.push(reason(
      "REQUIRED_HARD_GAP",
      `REQUIRED criterion 중 HARD_GAP ${requiredHardGap}개가 확인되어 Grade D를 적용했습니다.`,
    ));
  } else if (requiredUnknown > 0) {
    grade = "U";
    reasons.push(reason(
      "REQUIRED_UNKNOWN",
      `REQUIRED criterion 중 UNKNOWN ${requiredUnknown}개가 있어 Grade 확정을 보류했습니다.`,
    ));
  } else if (requiredGap > 0) {
    grade = "C";
    reasons.push(reason(
      "REQUIRED_GAP",
      `REQUIRED criterion 중 GAP ${requiredGap}개가 확인되어 Grade C를 적용했습니다.`,
    ));
  } else if (required.length > 0 && (
    requiredConditional > 0
    || preferredGap > 0
    || preferredHardGap > 0
  )) {
    grade = "B";
    if (requiredConditional > 0) {
      reasons.push(reason(
        "REQUIRED_CONDITIONAL",
        `REQUIRED criterion 중 CONDITIONAL_MATCH ${requiredConditional}개가 있습니다.`,
      ));
    }
    if (preferredGap > 0) {
      reasons.push(reason("PREFERRED_GAP", `PREFERRED criterion 중 GAP ${preferredGap}개가 있습니다.`));
    }
    if (preferredHardGap > 0) {
      reasons.push(reason(
        "PREFERRED_HARD_GAP",
        `PREFERRED criterion 중 HARD_GAP ${preferredHardGap}개가 있습니다.`,
      ));
    }
  } else if (
    required.length > 0
    && required.every((pair) => pair.result === "MATCH")
    && preferredGap === 0
    && preferredHardGap === 0
  ) {
    grade = "A";
    reasons.push(reason(
      "FULL_REQUIRED_MATCH",
      `REQUIRED criterion ${required.length}개가 모두 MATCH이고 PREFERRED GAP/HARD_GAP이 없습니다.`,
    ));
  } else {
    grade = "U";
    reasons.push(reason(
      "FALLBACK_UNGRADED",
      "V1 Rule Ladder로 안전하게 해석할 수 없어 Grade U를 적용했습니다.",
    ));
  }

  reasons.push(summarize("REQUIRED", required));
  reasons.push(summarize("PREFERRED", preferred));
  reasons.push(
    `${summarize("CONDITIONAL", conditional)} CONDITIONAL importance는 V1 Grade 직접 강등에 사용하지 않았습니다.`,
  );
  return Object.freeze({ grade, reasons: Object.freeze(reasons) });
}

/**
 * Grade 판정은 Profile importance와 Evaluation result만 소비한다.
 * Risk, Confidence, Lifecycle, Human Decision, 숫자 score를 생성하거나 읽지 않는다.
 */
export function deriveSiteGradeV1(input: DeriveSiteGradeV1Input): SiteGradeRuleEngineResult {
  const errors: string[] = [];
  if (!isNonEmpty(input.ruleSetVersion)) errors.push("ruleSetVersion은 비어 있지 않은 문자열이어야 합니다.");
  if (!isNonEmpty(input.generatedAt)) errors.push("generatedAt은 비어 있지 않은 문자열이어야 합니다.");
  if (input.generatedBy !== undefined && !isNonEmpty(input.generatedBy)) {
    errors.push("generatedBy는 제공하는 경우 비어 있지 않은 문자열이어야 합니다.");
  }
  const linked = validateProfileEvaluationLink(input.profile, input.evaluationSet);
  if (!linked.ok) errors.push(...linked.errors);
  if (errors.length > 0 || !linked.ok) {
    return Object.freeze({
      ok: false,
      code: "INVALID_SITE_GRADE_ENGINE_INPUT",
      message: "Site Grade Rule Engine V1 입력 검증에 실패했습니다.",
      errors: Object.freeze(errors),
    });
  }

  const profile = linked.value.profile;
  const evaluationSet = linked.value.evaluationSet;
  const importanceByKey = new Map(
    profile.criteria.map((criterion) => [criterion.key, criterion.importance] as const),
  );
  const pairs: CriterionEvaluationPair[] = evaluationSet.evaluations.map((evaluation) => ({
    criterionKey: evaluation.criterionKey,
    importance: importanceByKey.get(evaluation.criterionKey) as SiteCriteriaImportance,
    result: evaluation.result,
  }));
  const grouped = {
    matchedCriteriaKeys: [] as string[],
    conditionalCriteriaKeys: [] as string[],
    gapCriteriaKeys: [] as string[],
    hardGapCriteriaKeys: [] as string[],
    unknownCriteriaKeys: [] as string[],
  };
  for (const pair of pairs) grouped[RESULT_GROUP_FIELD[pair.result]].push(pair.criterionKey);

  const ladder = applyRuleLadder(pairs);
  const result: SiteGradeResultV1 = {
    schemaVersion: SITE_GRADE_RESULT_SCHEMA_VERSION,
    siteGradeResultId: createSiteGradeResultIdV1(
      evaluationSet.evaluationSetId,
      input.ruleSetVersion,
      input.generatedAt,
    ),
    candidateStoreId: evaluationSet.candidateStoreId,
    analysisClusterId: evaluationSet.analysisClusterId,
    criteriaProfileRef: evaluationSet.criteriaProfileRef,
    evaluationSetId: evaluationSet.evaluationSetId,
    ruleSetVersion: input.ruleSetVersion,
    grade: ladder.grade,
    matchedCriteriaKeys: Object.freeze(grouped.matchedCriteriaKeys),
    conditionalCriteriaKeys: Object.freeze(grouped.conditionalCriteriaKeys),
    gapCriteriaKeys: Object.freeze(grouped.gapCriteriaKeys),
    hardGapCriteriaKeys: Object.freeze(grouped.hardGapCriteriaKeys),
    unknownCriteriaKeys: Object.freeze(grouped.unknownCriteriaKeys),
    rationale: ladder.reasons,
    generatedAt: input.generatedAt,
    ...(input.generatedBy ? { generatedBy: input.generatedBy } : {}),
  };
  const validated = validateSiteGradeResult(result);
  if (!validated.ok) {
    return Object.freeze({
      ok: false,
      code: "INVALID_SITE_GRADE_ENGINE_RESULT",
      message: "Site Grade Rule Engine V1 결과 검증에 실패했습니다.",
      errors: validated.errors,
    });
  }
  return Object.freeze({ ok: true, value: validated.value });
}
