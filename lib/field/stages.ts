/**
 * FIELD 조사단계와 태블릿 화면 그룹 정의.
 *
 * StageId·한국어 라벨·그룹 배치는 Phase 0 `FIELD_SPEC.md` §3 / §3.1을 기준으로 하고,
 * 제조·판매 공간 현장관찰은 Phase 0 표에 없어 `productionSalesSpace`를 추가한다.
 * StageId는 저장된 조사 record가 참조하는 stable 식별자이므로 기존 이름을 변경하지 않는다.
 * 라벨은 UI 표시용이며 StageId와 분리한다.
 */

export const SURVEY_STAGE_IDS = Object.freeze([
  "siteBasic",
  "buildingExterior",
  "storefront",
  "accessibility",
  "parkingLoading",
  "measurement",
  "electrical",
  "waterSupply",
  "drainage",
  "exhaust",
  "restroom",
  "ceilingStructure",
  "productionSalesSpace",
  "deliveryPath",
  "competitor",
  "streetFlow",
  "ownerStatement",
  "agentStatement",
  "neighborInterview",
  "missingData",
  "surveyComplete",
] as const);

export type SurveyStageId = (typeof SURVEY_STAGE_IDS)[number];

/**
 * 태블릿 화면 그룹. 직원에게 Stage를 한 페이지씩 보여주지 않기 위한 UI 관심사이며,
 * 저장되는 조사 데이터는 SurveyStageId를 그대로 유지한다.
 */
export const TABLET_GROUP_IDS = Object.freeze([
  "BASIC",
  "EXTERIOR_ACCESS",
  "MEASUREMENT_STRUCTURE",
  "FACILITY",
  "SPACE_EQUIPMENT",
  "MARKET_OBSERVATION",
  "CONFIRMATION",
  "FINAL_REVIEW",
] as const);

export type TabletGroupId = (typeof TABLET_GROUP_IDS)[number];

export interface SurveyStageDefinition {
  readonly stageId: SurveyStageId;
  readonly label: string;
  readonly groupId: TabletGroupId;
  /** 조사 순서 추적용이며 진행률 가중치가 아니다. Phase 0 표 번호와 다를 수 있다. */
  readonly specSequence: number;
}

export interface TabletGroupDefinition {
  readonly groupId: TabletGroupId;
  readonly label: string;
  /** `FIELD_SPEC.md` §3.1의 화면 그룹 문자(A~H). 문서 대조용이다. */
  readonly specGroup: string;
  readonly stageIds: readonly SurveyStageId[];
  /**
   * 이 그룹의 실제 조사 입력화면이 구현되어 있는지. Phase 3은 Shell만 제공하므로 전부 false다.
   * false인 그룹을 동작하는 버튼으로 표시하지 않는다.
   */
  readonly inputImplemented: boolean;
}

const stageDefinitions = [
  { stageId: "siteBasic", label: "현장 기본정보", groupId: "BASIC", specSequence: 1 },
  { stageId: "buildingExterior", label: "건물 외부", groupId: "EXTERIOR_ACCESS", specSequence: 2 },
  { stageId: "storefront", label: "전면 / 가시성", groupId: "EXTERIOR_ACCESS", specSequence: 3 },
  { stageId: "accessibility", label: "접근성", groupId: "EXTERIOR_ACCESS", specSequence: 4 },
  { stageId: "parkingLoading", label: "주차 / 하역 / 배달 접근", groupId: "EXTERIOR_ACCESS", specSequence: 5 },
  { stageId: "measurement", label: "실측", groupId: "MEASUREMENT_STRUCTURE", specSequence: 6 },
  { stageId: "electrical", label: "전기", groupId: "FACILITY", specSequence: 7 },
  { stageId: "waterSupply", label: "급수", groupId: "FACILITY", specSequence: 8 },
  { stageId: "drainage", label: "배수", groupId: "FACILITY", specSequence: 9 },
  { stageId: "exhaust", label: "배기", groupId: "FACILITY", specSequence: 10 },
  { stageId: "restroom", label: "화장실", groupId: "FACILITY", specSequence: 11 },
  { stageId: "ceilingStructure", label: "천장고 / 기둥 / 단차", groupId: "MEASUREMENT_STRUCTURE", specSequence: 12 },
  {
    stageId: "productionSalesSpace",
    label: "제조·판매 공간",
    groupId: "SPACE_EQUIPMENT",
    specSequence: 13,
  },
  { stageId: "deliveryPath", label: "장비 반입경로", groupId: "SPACE_EQUIPMENT", specSequence: 14 },
  { stageId: "competitor", label: "경쟁점", groupId: "MARKET_OBSERVATION", specSequence: 15 },
  { stageId: "streetFlow", label: "유동·체류 현장관찰", groupId: "MARKET_OBSERVATION", specSequence: 16 },
  { stageId: "ownerStatement", label: "임대인 확인", groupId: "CONFIRMATION", specSequence: 17 },
  { stageId: "agentStatement", label: "중개사 확인", groupId: "CONFIRMATION", specSequence: 18 },
  { stageId: "neighborInterview", label: "주변 부동산 인터뷰", groupId: "CONFIRMATION", specSequence: 19 },
  { stageId: "missingData", label: "누락자료 확인", groupId: "FINAL_REVIEW", specSequence: 20 },
  { stageId: "surveyComplete", label: "조사완료", groupId: "FINAL_REVIEW", specSequence: 21 },
] as const satisfies readonly SurveyStageDefinition[];

export const SURVEY_STAGES: readonly SurveyStageDefinition[] = Object.freeze(
  stageDefinitions.map((stage) => Object.freeze({ ...stage })),
);

const groupLabels = Object.freeze({
  BASIC: { label: "기본정보", specGroup: "A" },
  EXTERIOR_ACCESS: { label: "외부·접근", specGroup: "B" },
  MEASUREMENT_STRUCTURE: { label: "실측·구조", specGroup: "C" },
  FACILITY: { label: "전기·급수·배수·배기·화장실", specGroup: "D" },
  SPACE_EQUIPMENT: { label: "공간·장비·반입", specGroup: "E" },
  MARKET_OBSERVATION: { label: "경쟁점·유동·현장관찰", specGroup: "F" },
  CONFIRMATION: { label: "임대인·중개사·주변 부동산", specGroup: "G" },
  FINAL_REVIEW: { label: "누락확인·대표검토 준비", specGroup: "H" },
} satisfies Record<TabletGroupId, { label: string; specGroup: string }>);

export const TABLET_GROUPS: readonly TabletGroupDefinition[] = Object.freeze(
  TABLET_GROUP_IDS.map((groupId) =>
    Object.freeze({
      groupId,
      label: groupLabels[groupId].label,
      specGroup: groupLabels[groupId].specGroup,
      stageIds: Object.freeze(
        SURVEY_STAGES.filter((stage) => stage.groupId === groupId).map((stage) => stage.stageId),
      ),
      // Phase 4: 실측·구조 / 시설만 실제 입력 UI를 제공한다.
      inputImplemented: groupId === "MEASUREMENT_STRUCTURE" || groupId === "FACILITY",
    }),
  ),
);

/** 미지원 StageId를 가까운 단계로 추정하지 않는다. */
export function getSurveyStage(stageId: SurveyStageId): SurveyStageDefinition {
  const stage = SURVEY_STAGES.find((candidate) => candidate.stageId === stageId);
  if (!stage) throw new RangeError("Unsupported survey stage id");
  return stage;
}

/** 미지원 groupId를 기본 그룹으로 대체하지 않는다. */
export function getTabletGroup(groupId: TabletGroupId): TabletGroupDefinition {
  const group = TABLET_GROUPS.find((candidate) => candidate.groupId === groupId);
  if (!group) throw new RangeError("Unsupported tablet group id");
  return group;
}

export function isSurveyStageId(value: unknown): value is SurveyStageId {
  return SURVEY_STAGE_IDS.some((stageId) => stageId === value);
}
