import type { FacilityObservations } from "./facility";
import { parseFacilityObservations } from "./facility";
import type { MeasurementSet } from "./measurement";
import { parseMeasurementSet } from "./measurement";
import { canCompleteFieldStage, isPhase4InputStage } from "./stage-completion";
import type { SurveyStageId } from "./stages";
import { SURVEY_STAGE_IDS, isSurveyStageId } from "./stages";
import {
  type SiteSurvey,
  type SiteSurveyStatus,
  type SurveyStageState,
  type SurveyStageStates,
} from "./types";

export interface FieldSurveyDraftPatchInput {
  readonly expectedDraftVersion: number;
  readonly measurementSet?: MeasurementSet;
  readonly facility?: FacilityObservations;
  readonly stageStates?: Partial<Record<SurveyStageId, SurveyStageState>>;
  /** 저장만 / 저장하고 단계 완료 시 완료할 stage 목록 */
  readonly completeStageIds?: readonly SurveyStageId[];
  /** 입력을 시작했음을 표시할 stage 목록 (IN_PROGRESS) */
  readonly touchStageIds?: readonly SurveyStageId[];
}

export type ApplyDraftPatchResult =
  | { readonly ok: true; readonly survey: SiteSurvey }
  | { readonly ok: false; readonly code: "VERSION_CONFLICT" | "INVALID_DATA"; readonly message: string };

const ALLOWED_STAGE_STATES: readonly SurveyStageState[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
  "SKIPPED",
];

function isSurveyStageState(value: unknown): value is SurveyStageState {
  return typeof value === "string" && ALLOWED_STAGE_STATES.some((item) => item === value);
}

/**
 * Draft PATCH를 현재 Survey에 적용한다. filesystem은 건드리지 않는다.
 * 첫 실제 입력 저장 시 DRAFT → IN_PROGRESS. READY_FOR_REVIEW/COMPLETED로 올리지 않는다.
 */
export function applyFieldSurveyDraftPatch(
  current: SiteSurvey,
  input: FieldSurveyDraftPatchInput,
  nowIso: string,
): ApplyDraftPatchResult {
  if (current.draftVersion !== input.expectedDraftVersion) {
    return {
      ok: false,
      code: "VERSION_CONFLICT",
      message: "SiteSurvey draftVersion does not match the stored draft",
    };
  }

  let measurementSet = current.measurementSet;
  if (input.measurementSet !== undefined) {
    const parsed = parseMeasurementSet(input.measurementSet);
    if (!parsed) {
      return { ok: false, code: "INVALID_DATA", message: "measurementSet is invalid" };
    }
    if (parsed.surveyId !== current.surveyId) {
      return { ok: false, code: "INVALID_DATA", message: "measurementSet.surveyId mismatch" };
    }
    if (parsed.candidateStoreId !== current.candidateStoreId) {
      return {
        ok: false,
        code: "INVALID_DATA",
        message: "measurementSet.candidateStoreId mismatch",
      };
    }
    // measurementId는 첫 생성 후 유지한다.
    if (current.measurementSet && parsed.measurementId !== current.measurementSet.measurementId) {
      return {
        ok: false,
        code: "INVALID_DATA",
        message: "measurementSet.measurementId must remain stable",
      };
    }
    measurementSet = parsed;
  }

  let facility = current.facility;
  if (input.facility !== undefined) {
    const parsed = parseFacilityObservations(input.facility);
    if (!parsed) {
      return { ok: false, code: "INVALID_DATA", message: "facility is invalid" };
    }
    facility = parsed;
  }

  const nextStages: Record<SurveyStageId, SurveyStageState> = { ...current.stageStates };

  if (input.stageStates) {
    for (const [stageId, state] of Object.entries(input.stageStates)) {
      if (!isSurveyStageId(stageId) || !isSurveyStageState(state)) {
        return { ok: false, code: "INVALID_DATA", message: "stageStates contains invalid entries" };
      }
      nextStages[stageId] = state;
    }
  }

  if (input.touchStageIds) {
    for (const stageId of input.touchStageIds) {
      if (!isSurveyStageId(stageId)) {
        return { ok: false, code: "INVALID_DATA", message: "touchStageIds contains invalid stage" };
      }
      if (nextStages[stageId] === "NOT_STARTED") {
        nextStages[stageId] = "IN_PROGRESS";
      }
    }
  }

  if (input.completeStageIds) {
    for (const stageId of input.completeStageIds) {
      if (!isSurveyStageId(stageId) || !isPhase4InputStage(stageId)) {
        return {
          ok: false,
          code: "INVALID_DATA",
          message: "completeStageIds contains unsupported stage",
        };
      }
      const check = canCompleteFieldStage(stageId, { measurementSet, facility });
      if (!check.ok) {
        return {
          ok: false,
          code: "INVALID_DATA",
          message: `Cannot complete ${stageId}: missing ${check.missing.join(", ")}`,
        };
      }
      nextStages[stageId] = "COMPLETED";
    }
  }

  // 정의된 모든 stage가 있어야 한다.
  for (const stageId of SURVEY_STAGE_IDS) {
    if (!nextStages[stageId]) {
      return { ok: false, code: "INVALID_DATA", message: "stageStates incomplete" };
    }
  }

  const hasFieldContent =
    measurementSet !== undefined ||
    (facility !== undefined && Object.keys(facility).length > 0) ||
    Object.values(nextStages).some((state) => state !== "NOT_STARTED");

  let status: SiteSurveyStatus = current.status;
  if (status === "DRAFT" && hasFieldContent) {
    status = "IN_PROGRESS";
  }
  // Phase 4에서는 READY_FOR_REVIEW / COMPLETED로 올리지 않는다.

  return {
    ok: true,
    survey: Object.freeze({
      ...current,
      measurementSet,
      facility,
      stageStates: Object.freeze(nextStages) as SurveyStageStates,
      status,
      draftVersion: current.draftVersion + 1,
      updatedAt: nowIso,
      ...(status === "IN_PROGRESS" && !current.startedAt ? { startedAt: nowIso } : {}),
    }),
  };
}
