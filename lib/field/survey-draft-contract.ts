import type { SiteSurvey } from "./types";

/**
 * FIELD 조사 초안 저장의 service boundary.
 *
 * 구현은 `field-survey-service.server.ts`다.
 * 기존 `data/consultations.json`에 조사 데이터를 넣지 않는다.
 * 런타임 파일은 `data/field-surveys/`에 두고 Git에서 제외한다.
 */

export interface SiteSurveyDraftRef {
  readonly candidateStoreId: string;
  readonly surveyId: string;
  readonly surveySequence: number;
  readonly draftVersion: number;
  readonly updatedAt: string;
}

export interface SiteSurveyDraftStore {
  /** 없으면 null이다. 빈 초안을 대신 만들어 돌려주지 않는다. */
  loadDraft(surveyId: string): Promise<SiteSurvey | null>;
  /**
   * 신규 저장이거나, 같은 `surveyId`의 현재 `draftVersion`과 일치할 때만 저장한다.
   * 불일치하면 덮어쓰지 않는다.
   */
  saveDraft(survey: SiteSurvey): Promise<SiteSurveyDraftRef>;
  /** 한 점포의 회차 목록. 회차 이력을 합치거나 최신 회차만 남기지 않는다. */
  listDrafts(candidateStoreId: string): Promise<readonly SiteSurveyDraftRef[]>;
}

export function toSiteSurveyDraftRef(survey: SiteSurvey): SiteSurveyDraftRef {
  return Object.freeze({
    candidateStoreId: survey.candidateStoreId,
    surveyId: survey.surveyId,
    surveySequence: survey.surveySequence,
    draftVersion: survey.draftVersion,
    updatedAt: survey.updatedAt,
  });
}
