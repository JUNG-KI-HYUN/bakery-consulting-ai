import type { CandidateCriteriaEvaluationSetV1 } from "./evaluation-types";
import { validateCandidateCriteriaEvaluationSet } from "./evaluation-validation";
import type { SiteCriteriaProfileV1 } from "./types";
import { validateSiteCriteriaProfile } from "./validation";

export interface ProfileEvaluationValidationFailure {
  readonly ok: false;
  readonly code: "INVALID_PROFILE_EVALUATION_LINK";
  readonly message: string;
  readonly errors: readonly string[];
}

export type ProfileEvaluationValidationResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly profile: SiteCriteriaProfileV1;
        readonly evaluationSet: CandidateCriteriaEvaluationSetV1;
      };
    }
  | ProfileEvaluationValidationFailure;

/**
 * Profile과 Evaluation Set의 identity 및 criterion completeness만 검증한다.
 * Criterion을 평가하거나 Grade/Lifecycle/Decision을 생성하지 않는다.
 */
export function validateProfileEvaluationLink(
  profileInput: unknown,
  evaluationSetInput: unknown,
): ProfileEvaluationValidationResult {
  const profileResult = validateSiteCriteriaProfile(profileInput);
  const evaluationSetResult = validateCandidateCriteriaEvaluationSet(evaluationSetInput);
  const errors: string[] = [];
  if (!profileResult.ok) errors.push(...profileResult.errors.map((error) => `profile: ${error}`));
  if (!evaluationSetResult.ok) {
    errors.push(...evaluationSetResult.errors.map((error) => `evaluationSet: ${error}`));
  }
  if (!profileResult.ok || !evaluationSetResult.ok) {
    return {
      ok: false,
      code: "INVALID_PROFILE_EVALUATION_LINK",
      message: "Profile/Evaluation 교차검증에 실패했습니다.",
      errors: Object.freeze(errors),
    };
  }

  const profile = profileResult.value;
  const evaluationSet = evaluationSetResult.value;
  if (evaluationSet.criteriaProfileRef.profileId !== profile.profileId) {
    errors.push("evaluationSet.criteriaProfileRef.profileId가 Profile과 다릅니다.");
  }
  if (evaluationSet.criteriaProfileRef.profileVersion !== profile.profileVersion) {
    errors.push("evaluationSet.criteriaProfileRef.profileVersion이 Profile과 다릅니다.");
  }

  const profileKeys = new Set(profile.criteria.map((criterion) => criterion.key));
  const evaluationKeys = new Set(evaluationSet.evaluations.map((evaluation) => evaluation.criterionKey));
  for (const key of evaluationKeys) {
    if (!profileKeys.has(key)) errors.push(`Evaluation의 criterionKey ${key}가 Profile에 없습니다.`);
  }
  for (const key of profileKeys) {
    if (!evaluationKeys.has(key)) {
      errors.push(`Profile criterionKey ${key}가 Evaluation Set에서 누락되었습니다. UNKNOWN으로 포함해야 합니다.`);
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      code: "INVALID_PROFILE_EVALUATION_LINK",
      message: "Profile/Evaluation 교차검증에 실패했습니다.",
      errors: Object.freeze(errors),
    };
  }
  return {
    ok: true,
    value: Object.freeze({ profile, evaluationSet }),
  };
}
