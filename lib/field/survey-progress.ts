import { SURVEY_STAGES, TABLET_GROUPS, type SurveyStageId, type TabletGroupId } from "./stages";
import type { SurveyStageState, SurveyStageStates } from "./types";

/**
 * 현장조사 진행률 계산.
 *
 * 이 값은 **직원의 조사 수행 진행상황**이다. 다음과 절대 같지 않고 서로 변환하지 않는다.
 * - Evidence Coverage (`lib/evidence/coverage.ts`): 자료가 얼마나 확인되었는가
 * - Risk: 위험 판단
 * - Verdict: 추천 / 조건부 추천 / 보류 / 위험
 *
 * 진행률 100%여도 배기 전문가 확인 필요·전기 증설 확인 필요가 동시에 남아 있을 수 있다.
 * 그래서 이 모듈은 Evidence·Risk 모듈을 import하지 않으며 결과에 판정 필드를 두지 않는다.
 *
 * 순수함수다. 시계·파일·전역상태를 읽지 않고 같은 입력에 항상 같은 결과를 낸다.
 * 계산식을 UI에 복제하지 않는다.
 */

export const SURVEY_PROGRESS_POLICY_VERSION = "survey-progress-v1";

const SUPPORTED_STAGE_STATES: readonly SurveyStageState[] = Object.freeze([
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
  "SKIPPED",
]);

export interface SurveyStageStateTally {
  readonly stageCount: number;
  readonly completedStageCount: number;
  readonly inProgressStageCount: number;
  readonly skippedStageCount: number;
  readonly notStartedStageCount: number;
  /**
   * 0~100 정수. 완료 단계 수 / 전체 단계 수이며 모든 단계의 가중치는 1이다.
   * 단계별 차등 가중치의 업무 근거가 없어 도입하지 않는다.
   * 분모 0은 0%이며 `stageCount`로 구분한다.
   */
  readonly completionPercent: number;
}

export interface SurveyProgressGroupResult extends SurveyStageStateTally {
  readonly groupId: TabletGroupId;
  readonly label: string;
  readonly specGroup: string;
  readonly stageIds: readonly SurveyStageId[];
}

export interface SurveyProgressResult extends SurveyStageStateTally {
  readonly policyVersion: typeof SURVEY_PROGRESS_POLICY_VERSION;
  readonly groups: readonly SurveyProgressGroupResult[];
  /** 아직 완료되지 않은 단계. `SKIPPED`도 미완료로 포함한다. */
  readonly unfinishedStageIds: readonly SurveyStageId[];
}

function tally(states: readonly SurveyStageState[]): SurveyStageStateTally {
  const stageCount = states.length;
  const completedStageCount = states.filter((state) => state === "COMPLETED").length;
  // 반올림이 미완료 조사를 100%로 보이게 하지 않는다. 100%는 전 단계 완료일 때만 쓴다.
  const rawPercent = stageCount === 0 ? 0 : Math.round((completedStageCount / stageCount) * 100);
  const completionPercent =
    completedStageCount < stageCount ? Math.min(rawPercent, 99) : rawPercent;
  return {
    stageCount,
    completedStageCount,
    inProgressStageCount: states.filter((state) => state === "IN_PROGRESS").length,
    skippedStageCount: states.filter((state) => state === "SKIPPED").length,
    notStartedStageCount: states.filter((state) => state === "NOT_STARTED").length,
    completionPercent,
  };
}

/**
 * 정의된 조사단계 진행률과 8개 태블릿 그룹별 진행률을 계산한다.
 *
 * 누락 단계나 미지원 상태값은 오류로 거부한다. 누락을 `NOT_STARTED`나 `COMPLETED`로
 * 임의 보정하지 않는다(미확인을 문제없음으로 처리하지 않는다).
 */
export function calculateSurveyProgress(stageStates: SurveyStageStates): SurveyProgressResult {
  const resolved = SURVEY_STAGES.map((stage) => {
    const state = stageStates[stage.stageId];
    if (state === undefined) {
      throw new RangeError("Survey progress requires a state for every survey stage");
    }
    if (!SUPPORTED_STAGE_STATES.includes(state)) {
      throw new RangeError("Unsupported survey stage state");
    }
    return { stage, state };
  });

  const groups = TABLET_GROUPS.map((group): SurveyProgressGroupResult => {
    const members = resolved.filter((item) => item.stage.groupId === group.groupId);
    return Object.freeze({
      groupId: group.groupId,
      label: group.label,
      specGroup: group.specGroup,
      stageIds: group.stageIds,
      ...tally(members.map((item) => item.state)),
    });
  });

  return Object.freeze({
    policyVersion: SURVEY_PROGRESS_POLICY_VERSION,
    ...tally(resolved.map((item) => item.state)),
    groups: Object.freeze(groups),
    unfinishedStageIds: Object.freeze(
      resolved.filter((item) => item.state !== "COMPLETED").map((item) => item.stage.stageId),
    ),
  });
}
