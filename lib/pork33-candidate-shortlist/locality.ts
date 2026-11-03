import { getActivePork33Revision } from "./state";
import type { Pork33CandidateState, Pork33ShortlistStateV1 } from "./types";

export type Pork33LocalityStatus = "CONFIRMED" | "REVIEW_REQUIRED";
export type Pork33EntranceRelationship = "MAIN_ENTRANCE" | "SIDE_ENTRANCE" | "NORTH_ENTRANCE" | "WEST_ENTRANCE" | "OPPOSITE_ENTRANCE" | "IN_COMPLEX" | "NEARBY" | "UNKNOWN";

export type Pork33Locality = {
  provinceName: string;
  cityName: string | null;
  districtName: string | null;
  localityName: string;
  localityKey: string;
  status: Pork33LocalityStatus;
  label: string;
};

export type Pork33ApartmentContext = {
  mainApartmentRaw: string;
  existingHouseholdReference: number | null;
  householdVerificationStatus: string;
  storeRelationshipToApartment: string;
  entranceRelationship: Pork33EntranceRelationship;
  isComplexRetail: boolean | null;
  mainFlowContext: string[];
  apartmentCommercialContext: string[];
  surroundingResidentialContext: string[];
  apartmentCharacteristics: string[];
  checks: string[];
};

export type Pork33LocalityGroup = Pork33Locality & {
  candidates: Pork33CandidateState[];
  apartmentAreaIds: string[];
};

function normalizeProvince(address: string) {
  if (/^대전(?:광역시|시)?\s/u.test(address)) return { provinceName: "대전광역시", cityName: null };
  if (/^서울(?:특별시|시)?\s/u.test(address)) return { provinceName: "서울특별시", cityName: null };
  const city = address.match(/^(화성시|용인시)\s/u)?.[1] ?? null;
  if (city) return { provinceName: "경기도", cityName: city };
  return { provinceName: "UNKNOWN", cityName: null };
}

export function parsePork33Locality(address: string): Pork33Locality {
  const normalized = address.trim().replace(/\s+/gu, " ");
  const tokens = normalized.split(" ");
  const province = normalizeProvince(normalized);
  const districtName = tokens.find((token) => /구$/u.test(token)) ?? null;
  const localityName = tokens.find((token) => /(?:읍|면)$/u.test(token))
    ?? tokens.find((token) => /동$/u.test(token))
    ?? "REVIEW_REQUIRED";
  const status: Pork33LocalityStatus = province.provinceName === "UNKNOWN" || localityName === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : "CONFIRMED";
  const parts = [province.provinceName, province.cityName, districtName, localityName].filter(Boolean) as string[];
  return {
    ...province,
    districtName,
    localityName,
    localityKey: parts.join("__").replace(/[^0-9A-Za-z가-힣_-]/gu, "_"),
    status,
    label: parts.join(" "),
  };
}

export function groupPork33CandidatesByLocality(state: Pork33ShortlistStateV1): Pork33LocalityGroup[] {
  const groups = new Map<string, Pork33LocalityGroup>();
  for (const candidate of state.candidates.slice().sort((a, b) => a.source.sourceRowOrder - b.source.sourceRowOrder)) {
    const locality = parsePork33Locality(candidate.normalized.addressFull);
    const current = groups.get(locality.localityKey) ?? { ...locality, candidates: [], apartmentAreaIds: [] };
    current.candidates.push(candidate);
    if (!current.apartmentAreaIds.includes(candidate.linkage.apartmentAreaId)) current.apartmentAreaIds.push(candidate.linkage.apartmentAreaId);
    groups.set(locality.localityKey, current);
  }
  return [...groups.values()];
}

function unique(items: Array<string | null | undefined>, limit: number) {
  return [...new Set(items.filter((item): item is string => Boolean(item?.trim())).map((item) => item.trim()))].slice(0, limit);
}

function entranceFromSource(source: string): { code: Pork33EntranceRelationship; label: string } {
  if (/정문[^,.]*(?:맞은편|건너편)/u.test(source)) return { code: "OPPOSITE_ENTRANCE", label: "정문 맞은편" };
  if (/북문[^,.]*(?:맞은편|건너편)/u.test(source)) return { code: "OPPOSITE_ENTRANCE", label: "북문 맞은편" };
  if (/정문/u.test(source)) return { code: "MAIN_ENTRANCE", label: "정문 인근" };
  if (/서문/u.test(source)) return { code: "WEST_ENTRANCE", label: "서문 인근" };
  if (/북문/u.test(source)) return { code: "NORTH_ENTRANCE", label: "북문 인근" };
  if (/단지내\s*상가/u.test(source)) return { code: "IN_COMPLEX", label: "단지내상가" };
  if (/(?:인접|인근)/u.test(source)) return { code: "NEARBY", label: "인접 상권" };
  return { code: "UNKNOWN", label: "확인 필요" };
}

export function derivePork33ApartmentContext(candidate: Pork33CandidateState): Pork33ApartmentContext {
  const approved = getActivePork33Revision(candidate)?.status === "APPROVED" ? getActivePork33Revision(candidate) : null;
  const source = [candidate.normalized.addressFull, candidate.normalized.fieldNoteRaw, approved?.payload.locationSummary, ...(approved?.payload.fieldObservations ?? []), ...(approved?.payload.vehicleAccessNotes ?? [])].filter(Boolean).join(" ");
  const entrance = entranceFromSource(source);
  const flow = unique([
    /버스\s*정류장/u.test(source) ? "버스정류장 인접 동선" : null,
    /출퇴근/u.test(source) ? "출퇴근 이동동선" : null,
    /횡단보도\s*2개/u.test(source) ? "횡단보도 2개와 접하는 보행동선" : /횡단보도/u.test(source) ? "횡단보도와 접하는 보행동선" : null,
    /(?:생활동선|주요\s*동선)/u.test(source) ? "주요 생활동선" : null,
    /길목/u.test(source) ? "인접 생활상권 이동 길목" : null,
  ], 3);
  const commercial = unique([
    /메가커피/u.test(source) ? "메가커피 인접" : null,
    /(?:CU|씨유)\s*편의점|CU/u.test(source) ? "CU편의점 인접" : null,
    /사거리/u.test(source) ? "메인상권 사거리 연결" : null,
    /인접\s*상권/u.test(source) ? "인접 생활상권 연결" : null,
  ], 3);
  const residential = unique([
    candidate.normalized.mainApartmentRaw ? `${candidate.normalized.mainApartmentRaw} 주거권역` : null,
    entrance.label !== "확인 필요" ? entrance.label : null,
  ], 2);
  const approvedChecks = approved?.payload.checks ?? [];
  const checks = unique([
    ...approvedChecks,
    /노후/u.test(source) ? "건물 노후도 현장 확인" : null,
    /(?:평수가\s*작|면적이\s*작)/u.test(source) ? "면적 적합성 확인" : null,
    entrance.code === "UNKNOWN" ? "아파트 출입구와 후보점포 관계 확인" : null,
  ], 2);
  return {
    mainApartmentRaw: candidate.normalized.mainApartmentRaw,
    existingHouseholdReference: candidate.normalized.existingHouseholdReference,
    householdVerificationStatus: candidate.normalized.householdReferenceStatus,
    storeRelationshipToApartment: entrance.label,
    entranceRelationship: entrance.code,
    isComplexRetail: /단지내\s*상가/u.test(source) ? true : null,
    mainFlowContext: flow,
    apartmentCommercialContext: commercial,
    surroundingResidentialContext: residential,
    apartmentCharacteristics: unique([entrance.label !== "확인 필요" ? entrance.label : null, ...flow, ...commercial], 4),
    checks: checks.length > 0 ? checks : ["현장메모 검토 필요"],
  };
}

export function buildPork33LocalityMapPoints(state: Pork33ShortlistStateV1, localityKey: string, selectedId = "") {
  const group = groupPork33CandidatesByLocality(state).find((item) => item.localityKey === localityKey);
  if (!group) return [];
  return group.candidates.flatMap((candidate) => candidate.normalized.latitude !== null && candidate.normalized.longitude !== null ? [{
    candidateStoreId: candidate.identity.candidateStoreId,
    label: candidate.identity.displayCode,
    lat: candidate.normalized.latitude,
    lng: candidate.normalized.longitude,
    selected: candidate.identity.candidateStoreId === selectedId,
    address: candidate.normalized.addressFull,
    apartmentArea: state.apartmentAreas.find((area) => area.apartmentAreaId === candidate.linkage.apartmentAreaId)?.label ?? "Apartment Area 확인 필요",
    area: candidate.normalized.exclusiveArea === null ? "확인 필요" : `${candidate.normalized.exclusiveArea.toLocaleString("ko-KR")}평`,
    rent: candidate.normalized.rent === null ? "확인 필요" : `${candidate.normalized.rent.toLocaleString("ko-KR")}만원`,
    mainApartment: candidate.normalized.mainApartmentRaw,
  }] : []);
}
