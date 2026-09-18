import { isCandidateStoreId, isSiteSurveyId } from "./identifiers";
import { SURVEY_STAGE_IDS, isSurveyStageId } from "./stages";
import { storageFail, type FieldStorageResult } from "./storage-result";
import {
  SITE_SURVEY_SCHEMA_VERSION,
  type SiteSurvey,
  type SiteSurveyStatus,
  type SurveyStageState,
  type SurveyStageStates,
} from "./types";

const SITE_SURVEY_STATUSES: readonly SiteSurveyStatus[] = Object.freeze([
  "DRAFT",
  "IN_PROGRESS",
  "READY_FOR_REVIEW",
  "COMPLETED",
]);

const SURVEY_STAGE_STATES: readonly SurveyStageState[] = Object.freeze([
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
  "SKIPPED",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSiteSurveyStatus(value: unknown): value is SiteSurveyStatus {
  return typeof value === "string" && SITE_SURVEY_STATUSES.some((status) => status === value);
}

function isSurveyStageState(value: unknown): value is SurveyStageState {
  return typeof value === "string" && SURVEY_STAGE_STATES.some((state) => state === value);
}

function parseStageStates(value: unknown): FieldStorageResult<SurveyStageStates> {
  if (!isRecord(value)) {
    return storageFail("INVALID_DATA", "SiteSurvey.stageStates must be an object");
  }
  const states = {} as Record<string, SurveyStageState>;
  for (const stageId of SURVEY_STAGE_IDS) {
    const state = value[stageId];
    if (!isSurveyStageState(state)) {
      return storageFail("INVALID_DATA", "SiteSurvey.stageStates is missing a supported stage state");
    }
    states[stageId] = state;
  }
  for (const key of Object.keys(value)) {
    if (!isSurveyStageId(key)) {
      return storageFail("INVALID_DATA", "SiteSurvey.stageStates contains an unsupported stage id");
    }
  }
  return { ok: true, value: Object.freeze(states) as SurveyStageStates };
}

export function parseSiteSurvey(value: unknown): FieldStorageResult<SiteSurvey> {
  if (!isRecord(value)) {
    return storageFail("INVALID_DATA", "SiteSurvey JSON must be an object");
  }
  if (value.schemaVersion !== SITE_SURVEY_SCHEMA_VERSION) {
    return storageFail("INVALID_DATA", "Unsupported SiteSurvey schemaVersion");
  }
  if (typeof value.surveyId !== "string" || !isSiteSurveyId(value.surveyId)) {
    return storageFail("INVALID_DATA", "SiteSurvey.surveyId is invalid");
  }
  if (typeof value.candidateStoreId !== "string" || !isCandidateStoreId(value.candidateStoreId)) {
    return storageFail("INVALID_DATA", "SiteSurvey.candidateStoreId is invalid");
  }
  if (value.consultationId !== undefined && typeof value.consultationId !== "string") {
    return storageFail("INVALID_DATA", "SiteSurvey.consultationId is invalid");
  }
  if (typeof value.surveySequence !== "number" || !Number.isInteger(value.surveySequence) || value.surveySequence < 1) {
    return storageFail("INVALID_DATA", "SiteSurvey.surveySequence is invalid");
  }
  if (!isSiteSurveyStatus(value.status)) {
    return storageFail("INVALID_DATA", "SiteSurvey.status is invalid");
  }
  if (typeof value.surveyor !== "string" || value.surveyor.trim() === "") {
    return storageFail("INVALID_DATA", "SiteSurvey.surveyor is missing");
  }
  if (typeof value.createdAt !== "string" || value.createdAt.trim() === "") {
    return storageFail("INVALID_DATA", "SiteSurvey.createdAt is missing");
  }
  if (typeof value.updatedAt !== "string" || value.updatedAt.trim() === "") {
    return storageFail("INVALID_DATA", "SiteSurvey.updatedAt is missing");
  }
  if (typeof value.draftVersion !== "number" || !Number.isInteger(value.draftVersion) || value.draftVersion < 1) {
    return storageFail("INVALID_DATA", "SiteSurvey.draftVersion is invalid");
  }
  const stageStates = parseStageStates(value.stageStates);
  if (!stageStates.ok) return stageStates;

  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: SITE_SURVEY_SCHEMA_VERSION,
      surveyId: value.surveyId,
      candidateStoreId: value.candidateStoreId,
      consultationId: typeof value.consultationId === "string" ? value.consultationId : undefined,
      surveySequence: value.surveySequence,
      status: value.status,
      surveyor: value.surveyor,
      ...(typeof value.startedAt === "string" ? { startedAt: value.startedAt } : {}),
      ...(typeof value.completedAt === "string" ? { completedAt: value.completedAt } : {}),
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      stageStates: stageStates.value,
      draftVersion: value.draftVersion,
    }),
  };
}
