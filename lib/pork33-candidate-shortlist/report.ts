import { derivePork33ApartmentContext, groupPork33CandidatesByLocality, parsePork33Locality, type Pork33ApartmentContext, type Pork33LocalityGroup } from "./locality";
import { getActivePork33Revision } from "./state";
import type { Pork33ApartmentArea, Pork33CandidateState, Pork33Region, Pork33ShortlistStateV1 } from "./types";

export type Pork33ReportScope =
  | { scopeType: "ALL" }
  | { scopeType: "REGION"; regionId: string }
  | { scopeType: "LOCALITY"; localityKey: string }
  | { scopeType: "CANDIDATE"; candidateStoreId: string };

export type Pork33ReportCard = {
  candidateStoreId: string; displayCode: string; region: string; locality: string; apartmentArea: string; address: string;
  mapImagePath?: string;
  mapImageProvenance?: "USER_PROVIDED_LOCATION_MAP";
  area: string; deposit: string; rent: string; maintenance: string; premium: string;
  household: string; householdVerification: string; flowVisibility: string; approvedSummary: string; strengths: string[];
  checks: string[]; reviewStatus: string; siteGrade: string; coordinate: string; apartmentContext: Pork33ApartmentContext;
};

export type Pork33ReportPage =
  | { kind: "COVER"; title: string; stats: string[]; statusLines: string[]; mapLines?: string[]; areaLines?: string[] }
  | { kind: "CANDIDATE_BRIEF"; title: string; card: Pork33ReportCard }
  | { kind: "CANDIDATES"; title: string; cards: Pork33ReportCard[] }
  | { kind: "REGION_COMPARE"; title: string; rows: Pork33ReportCard[] }
  | { kind: "FINAL"; title: string; rows: Pork33ReportCard[] }
  | { kind: "SOURCES"; title: string; lines: string[] };

export type Pork33RegionMapPoint = {
  candidateStoreId: string; label: string; lat: number; lng: number; selected: boolean;
  address: string; apartmentArea: string; area: string; rent: string; mainApartment: string;
};

type ReportSelection = {
  scope: Pork33ReportScope;
  region: Pork33Region | null;
  locality: Pork33LocalityGroup | null;
  candidates: Pork33CandidateState[];
  areas: Pork33ApartmentArea[];
};

const ALL_SCOPE: Pork33ReportScope = { scopeType: "ALL" };
function numberText(value: number | null, suffix: string) { return value === null ? "확인 필요" : `${value.toLocaleString("ko-KR")}${suffix}`; }
function chunks<T>(items: T[], size: number) { const result: T[][] = []; for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size)); return result; }
function regionTitle(region: Pork33Region | null) { return region?.label ?? "Region 확인 필요"; }

export function toPork33ReportCard(state: Pork33ShortlistStateV1, candidate: Pork33CandidateState): Pork33ReportCard {
  const revision = getActivePork33Revision(candidate);
  const approved = revision?.status === "APPROVED" ? revision : null;
  const area = state.apartmentAreas.find((item) => item.apartmentAreaId === candidate.linkage.apartmentAreaId);
  const region = state.regions.find((item) => item.regionId === candidate.linkage.regionId);
  const locality = parsePork33Locality(candidate.normalized.addressFull);
  return {
    candidateStoreId: candidate.identity.candidateStoreId,
    displayCode: candidate.identity.displayCode,
    region: region?.label ?? "Region 확인 필요",
    locality: locality.label,
    apartmentArea: area?.label ?? "Apartment Area 확인 필요",
    address: candidate.normalized.addressFull,
    area: numberText(candidate.normalized.exclusiveArea, "평"),
    deposit: numberText(candidate.normalized.deposit, "만원"),
    rent: numberText(candidate.normalized.rent, "만원"),
    maintenance: numberText(candidate.normalized.maintenance, "만원"),
    premium: numberText(candidate.normalized.premium, "만원"),
    household: candidate.normalized.existingHouseholdReference === null ? "기존 조사 기재값 확인 필요" : `기존 조사 기재값 ${candidate.normalized.existingHouseholdReference.toLocaleString("ko-KR")}세대`,
    householdVerification: "공식 공동주택 세대수 검증 전",
    flowVisibility: `${candidate.normalized.fieldFlowRating} / ${candidate.normalized.fieldVisibilityRating}`,
    approvedSummary: approved?.payload.reportSummary || "현장메모 검토 필요",
    strengths: approved ? [...approved.payload.strengths].slice(0, 2) : ["승인 내용 없음"],
    checks: approved ? [...approved.payload.checks].slice(0, 2) : ["현장메모 검토 필요"],
    reviewStatus: candidate.normalized.reviewStatus,
    siteGrade: candidate.normalized.siteGrade ?? "UNAVAILABLE",
    coordinate: candidate.normalized.latitude !== null && candidate.normalized.longitude !== null ? `${candidate.normalized.latitude.toFixed(6)}, ${candidate.normalized.longitude.toFixed(6)} (${candidate.normalized.coordinateSource})` : "지도 위치 확인 필요",
    apartmentContext: derivePork33ApartmentContext(candidate),
  };
}

export function parsePork33ReportScope(values: { scopeType?: string | null; regionId?: string | null; localityKey?: string | null; candidateStoreId?: string | null }): Pork33ReportScope {
  if (!values.scopeType || values.scopeType === "ALL") return ALL_SCOPE;
  if (values.scopeType === "REGION" && values.regionId) return { scopeType: "REGION", regionId: values.regionId };
  if (values.scopeType === "LOCALITY" && values.localityKey) return { scopeType: "LOCALITY", localityKey: values.localityKey };
  if (values.scopeType === "CANDIDATE" && values.candidateStoreId) return { scopeType: "CANDIDATE", candidateStoreId: values.candidateStoreId };
  throw new Error("유효한 PDF 범위가 필요합니다.");
}

export function resolvePork33ReportSelection(state: Pork33ShortlistStateV1, scope: Pork33ReportScope = ALL_SCOPE): ReportSelection {
  if (scope.scopeType === "ALL") return { scope, region: null, locality: null, candidates: [...state.candidates], areas: [...state.apartmentAreas] };
  if (scope.scopeType === "REGION") {
    const region = state.regions.find((item) => item.regionId === scope.regionId);
    if (!region) throw new Error("선택한 Region을 찾을 수 없습니다.");
    return { scope, region, locality: null, candidates: state.candidates.filter((candidate) => candidate.linkage.regionId === region.regionId), areas: state.apartmentAreas.filter((area) => area.regionId === region.regionId) };
  }
  if (scope.scopeType === "LOCALITY") {
    const locality = groupPork33CandidatesByLocality(state).find((item) => item.localityKey === scope.localityKey);
    if (!locality) throw new Error("선택한 동/읍을 찾을 수 없습니다.");
    const areaIds = new Set(locality.apartmentAreaIds);
    const region = state.regions.find((item) => item.regionId === locality.candidates[0]?.linkage.regionId) ?? null;
    return { scope, region, locality, candidates: [...locality.candidates], areas: state.apartmentAreas.filter((area) => areaIds.has(area.apartmentAreaId)) };
  }
  const candidate = state.candidates.find((item) => item.identity.candidateStoreId === scope.candidateStoreId);
  if (!candidate) throw new Error("선택한 Candidate를 찾을 수 없습니다.");
  const region = state.regions.find((item) => item.regionId === candidate.linkage.regionId) ?? null;
  const locality = groupPork33CandidatesByLocality(state).find((item) => item.candidates.some((row) => row.identity.candidateStoreId === candidate.identity.candidateStoreId)) ?? null;
  return { scope, region, locality, candidates: [candidate], areas: state.apartmentAreas.filter((area) => area.apartmentAreaId === candidate.linkage.apartmentAreaId) };
}

function toMapPoint(state: Pork33ShortlistStateV1, candidate: Pork33CandidateState, selectedId: string): Pork33RegionMapPoint {
  return { candidateStoreId: candidate.identity.candidateStoreId, label: candidate.identity.displayCode, lat: candidate.normalized.latitude!, lng: candidate.normalized.longitude!, selected: candidate.identity.candidateStoreId === selectedId, address: candidate.normalized.addressFull, apartmentArea: state.apartmentAreas.find((area) => area.apartmentAreaId === candidate.linkage.apartmentAreaId)?.label ?? "Apartment Area 확인 필요", area: numberText(candidate.normalized.exclusiveArea, "평"), rent: numberText(candidate.normalized.rent, "만원"), mainApartment: candidate.normalized.mainApartmentRaw };
}

export function buildPork33RegionMapPoints(state: Pork33ShortlistStateV1, regionId: string, apartmentAreaId = "", selectedId = ""): Pork33RegionMapPoint[] {
  if (!state.regions.some((region) => region.regionId === regionId)) return [];
  return state.candidates.filter((candidate) => candidate.linkage.regionId === regionId).filter((candidate) => !apartmentAreaId || candidate.linkage.apartmentAreaId === apartmentAreaId).filter((candidate) => candidate.normalized.latitude !== null && candidate.normalized.longitude !== null).sort((a, b) => a.source.sourceRowOrder - b.source.sourceRowOrder).map((candidate) => toMapPoint(state, candidate, selectedId));
}

function mapLines(candidates: Pork33CandidateState[]) { return candidates.map((candidate) => `${candidate.identity.displayCode} · ${candidate.normalized.displayLocation} · ${candidate.normalized.latitude === null || candidate.normalized.longitude === null ? "지도 위치 확인 필요" : `${candidate.normalized.latitude.toFixed(5)}, ${candidate.normalized.longitude.toFixed(5)}`}`); }
function statusLines(candidates: Pork33CandidateState[]) { const counts = new Map<string, number>(); for (const candidate of candidates) counts.set(candidate.normalized.reviewStatus, (counts.get(candidate.normalized.reviewStatus) ?? 0) + 1); return [...counts.entries()].map(([status, count]) => `${status} ${count}`).concat(`SHORTLIST 합계 ${candidates.filter((candidate) => candidate.normalized.reviewStatus === "SHORTLIST").length}`); }
function approvedCount(candidates: Pork33CandidateState[]) { return candidates.filter((candidate) => getActivePork33Revision(candidate)?.status === "APPROVED").length; }
function areaLines(candidates: Pork33CandidateState[], areas: Pork33ApartmentArea[]) { return areas.map((area) => { const rows = candidates.filter((candidate) => candidate.linkage.apartmentAreaId === area.apartmentAreaId); const households = [...new Set(rows.map((candidate) => candidate.normalized.existingHouseholdReference).filter((value): value is number => value !== null))]; const reference = households.length === 0 ? "기존 조사 기재값 확인 필요" : `기존 조사 기재값 ${households.map((value) => value.toLocaleString("ko-KR")).join("/")}세대`; return `${area.label} · Candidate ${rows.length}개 · ${reference} · 공식 검증 전`; }); }
function sourcesPage(): Pork33ReportPage { return { kind: "SOURCES", title: "Sources / Notes", lines: ["현장조사 및 사용자 제공 매물자료 기준", "배후세대는 기존 조사 기재값이며 공식 공동주택 세대수 검증 전입니다.", "승인(APPROVED)된 구조화 현장요약만 고객 출력에 포함했습니다.", "권리금·관리비 등 확인되지 않은 값은 0이 아닌 ‘확인 필요’로 표시했습니다.", "본 자료는 매출·성공·법률·계약·인허가 가능성을 보장하지 않습니다."] }; }

export function buildPork33ReportPages(state: Pork33ShortlistStateV1, scope: Pork33ReportScope = ALL_SCOPE): Pork33ReportPage[] {
  const selection = resolvePork33ReportSelection(state, scope);
  const candidates = selection.candidates.slice().sort((a, b) => a.source.sourceRowOrder - b.source.sourceRowOrder);
  const cards = candidates.map((candidate) => toPork33ReportCard(state, candidate));
  if (scope.scopeType === "CANDIDATE") return [{ kind: "CANDIDATE_BRIEF", title: `${cards[0].displayCode} Candidate Brief`, card: cards[0] }];
  const localityTitle = selection.locality?.label ?? "동/읍 확인 필요";
  const isLocality = scope.scopeType === "LOCALITY";
  const coverTitle = scope.scopeType === "REGION" ? `PORK33 ${regionTitle(selection.region)} 후보점포 1차 검토` : isLocality ? `PORK33 ${localityTitle} 후보점포 브리핑` : "PORK33 출점 후보점포 1차 검토";
  const pages: Pork33ReportPage[] = [{ kind: "COVER", title: coverTitle, stats: [`후보점포 ${cards.length}개`, `조사지역 ${scope.scopeType === "ALL" ? state.regions.length : 1}개`, `Apartment Area ${selection.areas.length}개`, `승인 현장요약 ${approvedCount(candidates)}개`], statusLines: statusLines(candidates), mapLines: scope.scopeType === "ALL" ? undefined : mapLines(candidates), areaLines: isLocality ? areaLines(candidates, selection.areas) : undefined }];
  for (const area of selection.areas) {
    const areaCards = candidates.filter((candidate) => candidate.linkage.apartmentAreaId === area.apartmentAreaId).map((candidate) => toPork33ReportCard(state, candidate));
    chunks(areaCards, 2).forEach((pageCards) => pages.push({ kind: "CANDIDATES", title: area.label, cards: pageCards }));
  }
  if (isLocality) {
    chunks(cards, 6).forEach((rows, index) => pages.push({ kind: "REGION_COMPARE", title: `${localityTitle} Candidate Compare${cards.length > 6 ? ` ${index + 1}` : ""}`, rows }));
  } else {
    const regions = scope.scopeType === "REGION" && selection.region ? [selection.region] : state.regions;
    for (const region of regions) {
      const regionCards = candidates.filter((candidate) => candidate.linkage.regionId === region.regionId).map((candidate) => toPork33ReportCard(state, candidate));
      chunks(regionCards, 6).forEach((rows, index) => pages.push({ kind: "REGION_COMPARE", title: `${region.label} Candidate Compare${regionCards.length > 6 ? ` ${index + 1}` : ""}`, rows }));
    }
  }
  pages.push({ kind: "FINAL", title: `${isLocality ? localityTitle : scope.scopeType === "REGION" ? regionTitle(selection.region) : "Final"} Shortlist Summary`, rows: candidates.filter((candidate) => candidate.normalized.reviewStatus === "SHORTLIST").map((candidate) => toPork33ReportCard(state, candidate)) });
  pages.push(sourcesPage());
  return pages;
}
