import {
  getCandidateStoreBlockedReasonLabel,
  resolveCandidateStoreReference,
  type CandidateStoreReference,
} from "./candidate-store-ref";
import { isCandidateStoreId } from "./identifiers";
import { getSurveyStage, TABLET_GROUPS, type SurveyStageId, type TabletGroupId } from "./stages";
import { calculateSurveyProgress, type SurveyProgressResult } from "./survey-progress";
import {
  createInitialSurveyStageStates,
  getSiteSurveyStatusLabel,
  getSurveyStageStateLabel,
  type SiteSurvey,
} from "./types";
import type { ConsultationRecord } from "../diagnosis/types";

/**
 * FIELD 태블릿 Shell에 필요한 읽기 전용 view model.
 *
 * 상담 record와 저장된 조사를 해석만 하며 저장·ID 부여·조사회차 생성을 하지 않는다.
 * 진행률은 `calculateSurveyProgress` 결과만 담는다. 화면에서 다시 계산하지 않는다.
 */

export const DEFAULT_TABLET_GROUP_ID: TabletGroupId = TABLET_GROUPS[0].groupId;

export interface FieldTabletStoreSummary {
  readonly floor: string;
  readonly address: string;
}

export interface FieldTabletSurveySummary {
  readonly surveyId: string | null;
  readonly surveySequence: number | null;
  readonly statusLabel: string;
  readonly persisted: boolean;
}

export interface FieldTabletGroupView {
  readonly groupId: TabletGroupId;
  readonly label: string;
  readonly specGroup: string;
  readonly stageIds: readonly SurveyStageId[];
  readonly stageLabels: readonly string[];
  readonly stageStateLabels: readonly string[];
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

export interface BuildFieldTabletViewOptions {
  readonly survey?: SiteSurvey | null;
  readonly linkedCandidateStoreId?: string | null;
}

function resolveViewCandidateStore(
  record: ConsultationRecord,
  linkedCandidateStoreId?: string | null,
): CandidateStoreReference {
  const fromRecord = resolveCandidateStoreReference(record);
  if (fromRecord.resolution === "explicit") return fromRecord;
  if (linkedCandidateStoreId && isCandidateStoreId(linkedCandidateStoreId)) {
    return {
      resolution: "explicit",
      consultationId: record.consultation.id,
      candidateStoreId: linkedCandidateStoreId,
      canAttachFieldData: true,
    };
  }
  return fromRecord;
}

function buildNotices(reference: CandidateStoreReference, hasSurvey: boolean): readonly string[] {
  const notices: string[] = [];
  if (reference.resolution === "legacy_embedded") {
    notices.push(getCandidateStoreBlockedReasonLabel(reference.blockedReason));
  } else if (!hasSurvey) {
    notices.push("현장조사가 아직 시작되지 않았습니다.");
  }
  notices.push("실제 조사 입력은 Phase 4에서 제공합니다.");
  notices.push("조사 수행 진행률은 자료 확인도, 위험, 계약 판정이 아닙니다.");
  return Object.freeze(notices);
}

/**
 * 상담 상세에서 FIELD Shell로 들어갈 때 쓰는 순수 변환.
 * 전달된 record를 수정하지 않고, 없는 ID나 조사 회차를 만들지 않는다.
 */
export function buildFieldTabletView(
  record: ConsultationRecord,
  options: BuildFieldTabletViewOptions = {},
): FieldTabletView {
  const candidateStore = resolveViewCandidateStore(record, options.linkedCandidateStoreId);
  const survey = options.survey ?? null;
  const progress = calculateSurveyProgress(survey?.stageStates ?? createInitialSurveyStageStates());
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
      stageStateLabels: Object.freeze(
        group.stageIds.map((stageId) =>
          getSurveyStageStateLabel(survey?.stageStates[stageId] ?? "NOT_STARTED"),
        ),
      ),
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
      surveyId: survey?.surveyId ?? null,
      surveySequence: survey?.surveySequence ?? null,
      statusLabel: getSiteSurveyStatusLabel(survey?.status ?? "DRAFT"),
      persisted: survey !== null,
    }),
    progress,
    groups: Object.freeze(groups),
    defaultGroupId: DEFAULT_TABLET_GROUP_ID,
    notices: buildNotices(candidateStore, survey !== null),
  });
}
