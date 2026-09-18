import {
  getCandidateStoreBlockedReasonLabel,
  resolveCandidateStoreReference,
  type CandidateStoreReference,
} from "./candidate-store-ref";
import { getSurveyStage, TABLET_GROUPS, type SurveyStageId, type TabletGroupId } from "./stages";
import { calculateSurveyProgress, type SurveyProgressResult } from "./survey-progress";
import { createInitialSurveyStageStates, getSiteSurveyStatusLabel } from "./types";
import type { ConsultationRecord } from "../diagnosis/types";

/**
 * FIELD 태블릿 Shell에 필요한 읽기 전용 view model.
 *
 * 상담 record를 해석만 하며 저장·ID 부여·조사회차 생성을 하지 않는다.
 * 진행률은 `calculateSurveyProgress` 결과만 담는다. 화면에서 다시 계산하지 않는다.
 * Evidence Coverage·Risk·Verdict를 포함하지 않는다.
 */

export const DEFAULT_TABLET_GROUP_ID: TabletGroupId = TABLET_GROUPS[0].groupId;

export interface FieldTabletStoreSummary {
  readonly floor: string;
  readonly address: string;
}

export interface FieldTabletSurveySummary {
  /** 저장된 회차가 없으면 null이다. 화면용 임시 ID를 만들지 않는다. */
  readonly surveyId: null;
  readonly surveySequence: null;
  readonly statusLabel: string;
  readonly persisted: false;
}

export interface FieldTabletGroupView {
  readonly groupId: TabletGroupId;
  readonly label: string;
  readonly specGroup: string;
  readonly stageIds: readonly SurveyStageId[];
  readonly stageLabels: readonly string[];
  readonly inputImplemented: boolean;
  readonly completionPercent: number;
  readonly completedStageCount: number;
  readonly stageCount: number;
}

export interface FieldTabletView {
  readonly consultationId: string;
  readonly consultationTitle: string;
  readonly sampleData: boolean;
  readonly candidateStore: CandidateStoreReference;
  readonly candidateStoreBlockedReasonLabel: string | null;
  readonly store: FieldTabletStoreSummary;
  readonly survey: FieldTabletSurveySummary;
  readonly progress: SurveyProgressResult;
  readonly groups: readonly FieldTabletGroupView[];
  readonly defaultGroupId: TabletGroupId;
  readonly notices: readonly string[];
}

function buildNotices(reference: CandidateStoreReference): readonly string[] {
  const notices: string[] = [];
  if (reference.resolution === "legacy_embedded") {
    notices.push(getCandidateStoreBlockedReasonLabel(reference.blockedReason));
    notices.push(
      "기존 상담 기록은 변경하지 않습니다. 후보점포 ID 부여는 후속 단계에서 직원이 명시적으로 수행합니다.",
    );
  } else {
    notices.push("저장된 조사 회차는 아직 없습니다. 초안 저장은 이후 단계에서 제공합니다.");
  }
  notices.push("실제 조사 입력은 Phase 4에서 제공합니다.");
  notices.push("조사 수행 진행률은 자료 확인도, 위험, 계약 판정이 아닙니다.");
  return Object.freeze(notices);
}

/**
 * 상담 상세에서 FIELD Shell로 들어갈 때 쓰는 순수 변환.
 * 전달된 record를 수정하지 않고, 없는 ID나 조사 회차를 만들지 않는다.
 */
export function buildFieldTabletView(record: ConsultationRecord): FieldTabletView {
  const candidateStore = resolveCandidateStoreReference(record);
  const progress = calculateSurveyProgress(createInitialSurveyStageStates());
  const groups = TABLET_GROUPS.map((group): FieldTabletGroupView => {
    const groupProgress = progress.groups.find((item) => item.groupId === group.groupId);
    if (!groupProgress) {
      throw new RangeError("Survey progress is missing a tablet group tally");
    }
    return Object.freeze({
      groupId: group.groupId,
      label: group.label,
      specGroup: group.specGroup,
      stageIds: group.stageIds,
      stageLabels: Object.freeze(group.stageIds.map((stageId) => getSurveyStage(stageId).label)),
      inputImplemented: group.inputImplemented,
      completionPercent: groupProgress.completionPercent,
      completedStageCount: groupProgress.completedStageCount,
      stageCount: groupProgress.stageCount,
    });
  });

  return Object.freeze({
    consultationId: record.consultation.id,
    consultationTitle: record.consultation.title,
    sampleData: record.consultation.sampleData,
    candidateStore,
    candidateStoreBlockedReasonLabel:
      candidateStore.resolution === "legacy_embedded"
        ? getCandidateStoreBlockedReasonLabel(candidateStore.blockedReason)
        : null,
    store: Object.freeze({
      floor: record.candidateStore.floor,
      address: record.candidateStore.address,
    }),
    survey: Object.freeze({
      surveyId: null,
      surveySequence: null,
      statusLabel: getSiteSurveyStatusLabel("DRAFT"),
      persisted: false,
    }),
    progress,
    groups: Object.freeze(groups),
    defaultGroupId: DEFAULT_TABLET_GROUP_ID,
    notices: buildNotices(candidateStore),
  });
}
