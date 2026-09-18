import type { SiteSurvey } from "./types";

/**
 * FIELD 조사 초안 저장의 service boundary(계약)만 정의한다.
 *
 * Phase 3에서는 구현체가 없다. 실제 저장·offline-first·PWA·동기화는 후속 Phase다.
 * 이 파일의 목적은 Phase 4가 저장 방식을 선택할 때 호출 지점이 흩어지지 않게 하는 것이다.
 *
 * 저장 규칙(Phase 0 `docs/SHARED_DATA_MODEL.md` §11.4):
 * - 기존 `data/consultations.json`에 조사 데이터를 넣지 않는다. 보호 대상 파일의 변경 위험을 늘리지 않는다.
 * - 조사 파일은 점포별·회차별로 분리한다.
 * - 실제 저장 경로는 아직 확정하지 않았다. 후보는
 *   `data/candidate-stores/<candidateStoreId>/surveys/<surveyId>.json` (Phase 0 §11.4)과
 *   `data/field-surveys/` (Phase 3 지시서 §22)다. Phase 4에서 하나를 확정한다.
 * - 제출된 회차를 덮어쓰지 않는다. 수정이 필요하면 새 회차를 만든다.
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
  /** 같은 `surveyId`의 이전 초안을 덮어쓰기 전에 `draftVersion`으로 충돌을 판단한다. */
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
