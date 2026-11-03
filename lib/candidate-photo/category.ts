/**
 * Candidate Photo V1 category taxonomy.
 * 기존 DetailedPhoto token은 rename/migration 없이 모두 유지하고 신규 현장 촬영 token만 추가한다.
 */
export const CANDIDATE_PHOTO_CATEGORIES = Object.freeze([
  "EXTERIOR",
  "ENTRANCE",
  "INTERIOR",
  "CEILING",
  "COLUMN",
  "POWER_PANEL",
  "WATER",
  "DRAINAGE",
  "EXHAUST",
  "OUTDOOR_UNIT",
  "TOILET",
  "FIRE",
  "ACCESS",
  "PARKING",
  "OTHER",
  "FRONT",
  "MAIN_ENTRANCE",
  "MAIN_FLOW",
  "STORE_FROM_APARTMENT",
  "APARTMENT_FROM_STORE",
  "ROAD_ACCESS",
  "PARKING_SHORT_STOP",
  "CROSSWALK",
  "SURROUNDINGS",
  "COMPETITOR",
  "REAR_LOADING",
  "ELECTRIC_PANEL",
  "WATER_DRAIN",
  "SIGNAGE_VISIBILITY",
] as const);

export type CandidatePhotoCategory = (typeof CANDIDATE_PHOTO_CATEGORIES)[number];

const CATEGORY_LABELS: Readonly<Record<CandidatePhotoCategory, string>> = Object.freeze({
  EXTERIOR: "외부 전경",
  ENTRANCE: "출입구",
  INTERIOR: "매장 내부",
  CEILING: "천장",
  COLUMN: "기둥",
  POWER_PANEL: "분전반",
  WATER: "급수",
  DRAINAGE: "배수",
  EXHAUST: "배기",
  OUTDOOR_UNIT: "실외기",
  TOILET: "화장실",
  FIRE: "소방",
  ACCESS: "접근로",
  PARKING: "주차",
  OTHER: "기타",
  FRONT: "매장 정면",
  MAIN_ENTRANCE: "아파트 주출입구",
  MAIN_FLOW: "주요 생활동선",
  STORE_FROM_APARTMENT: "아파트에서 본 후보점포",
  APARTMENT_FROM_STORE: "후보점포에서 본 아파트",
  ROAD_ACCESS: "도로·차량 접근",
  PARKING_SHORT_STOP: "주차·단기정차",
  CROSSWALK: "횡단보도·보행 접근",
  SURROUNDINGS: "주변 상가환경",
  COMPETITOR: "경쟁점 현황",
  REAR_LOADING: "후면·하역공간",
  ELECTRIC_PANEL: "전기·분전반",
  WATER_DRAIN: "급배수",
  SIGNAGE_VISIBILITY: "간판·가시성",
});

export function isCandidatePhotoCategory(value: unknown): value is CandidatePhotoCategory {
  return CANDIDATE_PHOTO_CATEGORIES.some((category) => category === value);
}

/** UI 문구를 저장 contract에 섞지 않는 deterministic Korean label projection. */
export function getCandidatePhotoCategoryLabel(category: CandidatePhotoCategory): string {
  return CATEGORY_LABELS[category];
}
