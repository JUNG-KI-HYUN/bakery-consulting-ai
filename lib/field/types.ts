import { createSiteSurveyId, isCandidateStoreId } from "./identifiers";
import { SURVEY_STAGE_IDS, type SurveyStageId } from "./stages";

import type { FacilityObservations } from "./facility";
import type { MeasurementSet } from "./measurement";
import type {
  DeliveryPathObservation,
  ProductionSalesSpaceObservation,
} from "./space-equipment";

/**
 * FIELD 현장조사 회차(SiteSurvey) Domain.
 *
 * Phase 0 설계문서 `docs/SHARED_DATA_MODEL.md` §6 구조를 기준으로 하고,
 * Phase 3 지시서의 필드 이름과 상태값을 사용한다.
 *
 * 경계 규칙:
 * - `candidateStoreId`는 필수다. 레거시 호환은 `candidate-store-ref.ts`에서만 다룬다.
 * - 재조사는 기존 회차를 수정하지 않고 새 `surveySequence`로 추가한다.
 * - Phase 4부터 optional `measurementSet` / `facility`를 담을 수 있다.
 * - Phase 4.5부터 optional `productionSalesSpace` / `deliveryPath`를 담을 수 있다.
 *   과거 Draft는 이 필드 없이도 읽을 수 있다.
 */

export const SITE_SURVEY_SCHEMA_VERSION = "site-survey-v1";

/**
 * 조사 회차의 업무 진행 상태.
 *
 * `COMPLETED`는 직원의 현장조사 수행이 끝났다는 뜻이다.
 * 추천·안전·계약 가능 같은 FRAMEONE 최종 점포 Verdict를 뜻하지 않는다.
 * Verdict는 Risk 단계와 대표 검토에서 별도로 결정된다.
 *
 * `FIELD_SPEC.md` §2의 `draft / in_progress / submitted / reviewed`와 대응한다
 * (`submitted` = `READY_FOR_REVIEW`, `reviewed` = `COMPLETED`).
 */
export type SiteSurveyStatus = "DRAFT" | "IN_PROGRESS" | "READY_FOR_REVIEW" | "COMPLETED";

/** 새 회차를 만들지 않고 이어서 열 조사 상태. COMPLETED는 포함하지 않는다. */
export const ACTIVE_SITE_SURVEY_STATUSES = Object.freeze([
  "DRAFT",
  "IN_PROGRESS",
  "READY_FOR_REVIEW",
] as const satisfies readonly SiteSurveyStatus[]);

/**
 * 단계별 조사 수행 상태.
 *
 * `SKIPPED`는 `FIELD_SPEC.md` §5.3에 따라 "문제없음"이 아니라 미확인이다.
 * 진행률에서 완료로 집계하지 않는다.
 * Evidence의 `VerificationStatus`와 다른 축이며 서로 변환하지 않는다.
 */
export type SurveyStageState = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";

export type SurveyStageStates = Readonly<Record<SurveyStageId, SurveyStageState>>;

export interface SiteSurvey {
  readonly schemaVersion: typeof SITE_SURVEY_SCHEMA_VERSION;
  /** `survey_<uuid>`. 점포 연결은 candidateStoreId로 한다. */
  readonly surveyId: string;
  readonly candidateStoreId: string;
  /** 이 조사를 시작한 상담 맥락. 누락은 상담과 연결되지 않은 조사를 뜻한다. */
  readonly consultationId?: string;
  /** 조사 회차. 1부터 시작한다. */
  readonly surveySequence: number;
  readonly status: SiteSurveyStatus;
  /** 조사자 식별자. 개인정보 최소화를 위해 실명 대신 직원 식별자를 사용한다. */
  readonly surveyor: string;
  /** 현장조사 시작 시점(ISO 8601). 누락은 아직 시작하지 않았다는 뜻이다. */
  readonly startedAt?: string;
  /** 현장조사 수행 완료 시점(ISO 8601). 계약 판정 시점이 아니다. */
  readonly completedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly stageStates: SurveyStageStates;
  /** 초안 저장 회차. 저장에 성공하면 증가한다. */
  readonly draftVersion: number;
  /** MVP: Survey당 활성 MeasurementSet 1개. 없으면 Phase 3.5 이전 Draft. */
  readonly measurementSet?: MeasurementSet;
  /** 전기·급수·배수·배기·화장실 관찰. 없으면 미입력. */
  readonly facility?: FacilityObservations;
  /** 제조·판매 공간 현장관찰. MeasurementSet을 복제하지 않는다. */
  readonly productionSalesSpace?: ProductionSalesSpaceObservation;
  /** 장비 반입경로 현장관찰. 치수는 MeasurementSet을 참조한다. */
  readonly deliveryPath?: DeliveryPathObservation;
}

/** 정의된 조사단계 전부를 `NOT_STARTED`로 둔다. 누락 단계를 만들지 않는다. */
export function createInitialSurveyStageStates(): SurveyStageStates {
  const states = {} as Record<SurveyStageId, SurveyStageState>;
  for (const stageId of SURVEY_STAGE_IDS) states[stageId] = "NOT_STARTED";
  return Object.freeze(states);
}

export interface CreateSiteSurveyDraftInput {
  readonly candidateStoreId: string;
  readonly consultationId?: string;
  /** 조사 회차. 기존 회차 목록을 소유한 호출자가 부여한다. */
  readonly surveySequence: number;
  readonly surveyor: string;
  /** 생성 시점(ISO 8601). 이 모듈은 시계를 읽지 않으므로 호출자가 넘긴다. */
  readonly createdAt: string;
}

/**
 * 새 조사 회차 초안을 만든다. 저장하지 않으며 기존 회차를 수정하지 않는다.
 * 레거시 점포(ID 미부여)로는 호출할 수 없다.
 */
export function createSiteSurveyDraft(input: CreateSiteSurveyDraftInput): SiteSurvey {
  if (!isCandidateStoreId(input.candidateStoreId)) {
    throw new RangeError("SiteSurvey requires an assigned candidateStoreId");
  }
  if (input.surveyor.trim() === "") {
    throw new RangeError("SiteSurvey requires a surveyor identifier");
  }
  return Object.freeze({
    schemaVersion: SITE_SURVEY_SCHEMA_VERSION,
    surveyId: createSiteSurveyId(),
    candidateStoreId: input.candidateStoreId,
    consultationId: input.consultationId,
    surveySequence: input.surveySequence,
    status: "DRAFT",
    surveyor: input.surveyor,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    stageStates: createInitialSurveyStageStates(),
    draftVersion: 1,
  });
}

const surveyStatusLabels = Object.freeze({
  DRAFT: "초안",
  IN_PROGRESS: "조사 진행중",
  READY_FOR_REVIEW: "검토 대기",
  COMPLETED: "조사 완료",
} satisfies Record<SiteSurveyStatus, string>);

const stageStateLabels = Object.freeze({
  NOT_STARTED: "시작 전",
  IN_PROGRESS: "진행중",
  COMPLETED: "완료",
  SKIPPED: "건너뜀 (미확인)",
} satisfies Record<SurveyStageState, string>);

export function getSiteSurveyStatusLabel(status: SiteSurveyStatus): string {
  return surveyStatusLabels[status];
}

export function getSurveyStageStateLabel(state: SurveyStageState): string {
  return stageStateLabels[state];
}
