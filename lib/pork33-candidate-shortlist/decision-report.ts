import { SITE_GRADES, type SiteGrade } from "../site-grade/types";
import { buildPork33BriefingPages, type Pork33BriefingAssetIndex, type Pork33BriefingCandidate, type Pork33BriefingPage, type Pork33Sbiz365SnapshotV1 } from "./briefing-report";
import { derivePork33ApartmentContext } from "./locality";
import { getActivePork33Revision } from "./state";
import type { Pork33CandidateState, Pork33ShortlistStateV1 } from "./types";
import { PORK33_STORE_DEVELOPMENT_PRESET_V1 } from "../store-development-report/presets";
import { formatGenderForCustomer, formatLifecycleForCustomer, formatTimeForCustomer } from "../store-development-report/presentation";

export type Pork33DecisionScope =
  | { scopeType: "ALL" }
  | { scopeType: "REGION"; regionId: string };

export type Pork33DecisionRange = {
  knownCount: number;
  minimum: number | null;
  maximum: number | null;
  display: string;
};

export type Pork33RegionDemandSummary = {
  regionId: string;
  regionLabel: string;
  candidateCount: number;
  apartmentAreaCount: number;
  snapshotCount: number;
  householdRange: Pork33DecisionRange;
  residentialPopulationRange: Pork33DecisionRange;
  meatShopRange: Pork33DecisionRange;
  competitorMetricLabel: string;
  peakTimeDistribution: string;
  peakGenderAgeDistribution: string;
  generalResidentialSummary: string;
  apartmentAreas: Array<{ apartmentAreaId: string; label: string; candidateCount: number }>;
  interpretation: string[];
};

export type Pork33ApartmentAreaAnalysis = {
  apartmentAreaId: string;
  regionId: string;
  regionLabel: string;
  label: string;
  candidateCount: number;
  candidateIds: string[];
  directApartments: string[];
  existingHouseholdDisplay: string;
  householdSource: string;
  generalResidentialLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  generalResidentialDisplay: string;
  officetelDisplay: string;
  competitionDisplay: string;
  competitorMetricLabel: string;
  commonFlow: string[];
  candidateRelations: Array<{ candidateId: string; entrance: string; flow: string[] }>;
  mapThumbnails: Array<{ candidateId: string; mapRef: string | null }>;
  frameoneOpinion: string[];
};

export type Pork33DecisionCompareCandidate = {
  candidateStoreId: string;
  displayCode: string;
  address: string;
  representativePhotoRef: string | null;
  area: string;
  deposit: string;
  rent: string;
  maintenance: string;
  premium: string;
  apartmentAccess: string;
  mainFlow: string;
  competitionEnvironment: string;
  visibility: string;
  shortStop: string;
  strengths: string[];
  checks: string[];
  lifecycle: string;
  lifecycleCode: string;
  siteGrade: SiteGrade | "확인 필요";
  siteGradeSource: "AUTHORITATIVE_STORED" | "UNAVAILABLE";
};

export type Pork33DecisionPage =
  | Pork33BriefingPage
  | { kind: "REGION_DEMAND_SUMMARY"; title: string; demand: Pork33RegionDemandSummary }
  | { kind: "APARTMENT_AREA_ANALYSIS"; title: string; area: Pork33ApartmentAreaAnalysis }
  | {
      kind: "CANDIDATE_COMPARE";
      title: string;
      regionLabel: string;
      apartmentAreaId: string;
      apartmentAreaLabel: string;
      pageNumber: number;
      pageCount: number;
      candidates: Pork33DecisionCompareCandidate[];
    };

const ratingLabels: Record<string, string> = {
  HIGH: "높음",
  MEDIUM: "보통",
  LOW: "낮음",
  UNKNOWN: "확인 필요",
};

function unique(values: Array<string | null | undefined>, limit = Number.POSITIVE_INFINITY) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))].slice(0, limit);
}

function numberRange(values: Array<number | null | undefined>, suffix: string): Pork33DecisionRange {
  const known = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (known.length === 0) return { knownCount: 0, minimum: null, maximum: null, display: "자료 확인 필요" };
  const minimum = Math.min(...known);
  const maximum = Math.max(...known);
  const number = (value: number) => value.toLocaleString("ko-KR");
  return {
    knownCount: known.length,
    minimum,
    maximum,
    display: minimum === maximum
      ? `후보별 ${number(minimum)}${suffix} · ${known.length}곳 확인`
      : `후보별 ${number(minimum)}~${number(maximum)}${suffix} · ${known.length}곳 확인`,
  };
}

function distribution(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  for (const value of values) if (value?.trim()) counts.set(value.trim(), (counts.get(value.trim()) ?? 0) + 1);
  if (counts.size === 0) return "자료 확인 필요";
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ko-KR"))
    .slice(0, 4)
    .map(([value, count]) => `${value} ${count}곳`)
    .join(" · ");
}

function sourceText(candidate: Pork33CandidateState) {
  const active = getActivePork33Revision(candidate);
  const approved = active?.status === "APPROVED" ? active : null;
  return [
    candidate.normalized.fieldNoteRaw,
    approved?.payload.locationSummary,
    ...(approved?.payload.fieldObservations ?? []),
    ...(approved?.payload.vehicleAccessNotes ?? []),
  ].filter(Boolean).join(" ");
}

function generalResidentialDisplay(candidates: Pork33CandidateState[]) {
  const text = candidates.map(sourceText).join(" ");
  if (/다세대|빌라/u.test(text)) return "다세대·빌라 언급 · 현장조사 기준";
  if (/일반\s*주거/u.test(text)) return "일반주거 배후 언급 · 현장조사 기준";
  return "확인 필요";
}

function officetelDisplay(candidates: Pork33CandidateState[]) {
  const values = unique(candidates.flatMap((candidate) => [...sourceText(candidate).matchAll(/([0-9,]+)\s*세대\s*오피스텔/gu)].map((match) => match[1].replace(/,/gu, ""))));
  if (values.length === 1) return `${Number(values[0]).toLocaleString("ko-KR")}세대 기재 · 현장조사 기준`;
  if (values.length > 1) return `${values.map((value) => Number(value).toLocaleString("ko-KR")).join("·")}세대 후보별 기재`;
  if (candidates.some((candidate) => /오피스텔/u.test(sourceText(candidate)))) return "오피스텔 배후 언급 · 세대수 확인 필요";
  return "확인 필요";
}

function householdDisplay(candidates: Pork33CandidateState[]) {
  const values = unique(candidates.map((candidate) => candidate.normalized.existingHouseholdReference === null
    ? null
    : candidate.normalized.existingHouseholdReference.toLocaleString("ko-KR")));
  if (values.length === 0) return "확인 필요";
  if (values.length === 1) return `${values[0]}세대`;
  return `${values.join(" · ")}세대 후보별 기재`;
}

function storedSiteGrade(candidate: Pork33CandidateState): { grade: SiteGrade | "확인 필요"; source: "AUTHORITATIVE_STORED" | "UNAVAILABLE" } {
  if (SITE_GRADES.includes(candidate.normalized.siteGrade as SiteGrade)) {
    return { grade: candidate.normalized.siteGrade as SiteGrade, source: "AUTHORITATIVE_STORED" };
  }
  return { grade: "확인 필요", source: "UNAVAILABLE" };
}

function shortStop(candidate: Pork33CandidateState) {
  const text = sourceText(candidate);
  if (/정차\s*(?:가능|용이)/u.test(text)) return "정차 가능 기재";
  if (/정차/u.test(text)) return "정차 조건 언급";
  if (/주차\s*공간/u.test(text)) return "주차공간 언급";
  return "확인 필요";
}

function toCompareCandidate(candidate: Pork33CandidateState, briefing: Pork33BriefingCandidate): Pork33DecisionCompareCandidate {
  const context = derivePork33ApartmentContext(candidate);
  const grade = storedSiteGrade(candidate);
  const competition = briefing.sbiz365?.meatShopCount;
  return {
    candidateStoreId: candidate.identity.candidateStoreId,
    displayCode: candidate.identity.displayCode,
    address: candidate.normalized.addressFull,
    representativePhotoRef: briefing.representativePhotoRef,
    area: briefing.area,
    deposit: briefing.deposit,
    rent: briefing.rent,
    maintenance: briefing.maintenance,
    premium: briefing.premium,
    apartmentAccess: context.storeRelationshipToApartment,
    mainFlow: context.mainFlowContext.join(" · ") || ratingLabels[candidate.normalized.fieldFlowRating],
    competitionEnvironment: competition === null || competition === undefined ? "확인 필요" : `반경 500m ${PORK33_STORE_DEVELOPMENT_PRESET_V1.terminology.competitor} ${competition.toLocaleString("ko-KR")}곳`,
    visibility: ratingLabels[candidate.normalized.fieldVisibilityRating],
    shortStop: shortStop(candidate),
    strengths: briefing.strengths.slice(0, 2),
    checks: briefing.checks.slice(0, 2),
    lifecycle: formatLifecycleForCustomer(candidate.normalized.reviewStatus),
    lifecycleCode: candidate.normalized.reviewStatus,
    siteGrade: grade.grade,
    siteGradeSource: grade.source,
  };
}

export function paginatePork33CompareCandidates<T>(candidates: readonly T[], pageSize = 4): T[][] {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error("Compare pageSize는 1 이상의 정수여야 합니다.");
  const pages: T[][] = [];
  for (let index = 0; index < candidates.length; index += pageSize) pages.push(candidates.slice(index, index + pageSize));
  return pages;
}

function buildArea(
  state: Pork33ShortlistStateV1,
  regionLabel: string,
  apartmentAreaId: string,
  candidates: Pork33CandidateState[],
  assets: Pork33BriefingAssetIndex,
  sbiz365ByCandidateId: Record<string, Pork33Sbiz365SnapshotV1>,
): Pork33ApartmentAreaAnalysis {
  const area = state.apartmentAreas.find((item) => item.apartmentAreaId === apartmentAreaId);
  if (!area) throw new Error("Apartment Area를 찾을 수 없습니다.");
  const contexts = candidates.map((candidate) => ({ candidate, context: derivePork33ApartmentContext(candidate) }));
  const competition = numberRange(candidates.map((candidate) => sbiz365ByCandidateId[candidate.identity.displayCode]?.meatShopCount), "곳");
  const flow = unique(contexts.flatMap((item) => item.context.mainFlowContext), 4);
  const opinion = [
    `${area.label}에는 현재 관계 기준 후보 ${candidates.length}곳이 연결되어 있습니다.`,
    competition.knownCount > 0 ? `사용자 제공 반경 500m 자료의 ${PORK33_STORE_DEVELOPMENT_PRESET_V1.terminology.competitor} 수는 ${competition.display.replace("후보별 ", "")}입니다.` : "반경 500m 경쟁환경은 자료 확인이 필요합니다.",
    candidates.length > 1 ? "같은 생활권에서는 임대조건과 함께 단지 출입구·생활동선 차이를 비교해야 합니다." : "단일 후보 생활권으로 출입구·생활동선과 임대조건을 개별 확인해야 합니다.",
  ];
  return {
    apartmentAreaId,
    regionId: area.regionId,
    regionLabel,
    label: area.label,
    candidateCount: candidates.length,
    candidateIds: candidates.map((candidate) => candidate.identity.displayCode),
    directApartments: unique(candidates.map((candidate) => candidate.normalized.mainApartmentRaw)),
    existingHouseholdDisplay: householdDisplay(candidates),
    householdSource: "기존 조사 기재값 · 후보별 동일값도 합산하지 않음",
    generalResidentialLevel: "UNKNOWN",
    generalResidentialDisplay: generalResidentialDisplay(candidates),
    officetelDisplay: officetelDisplay(candidates),
    competitionDisplay: competition.display,
    competitorMetricLabel: PORK33_STORE_DEVELOPMENT_PRESET_V1.terminology.competitor,
    commonFlow: flow.length > 0 ? flow : ["확인 필요"],
    candidateRelations: contexts.map(({ candidate, context }) => ({
      candidateId: candidate.identity.displayCode,
      entrance: context.storeRelationshipToApartment,
      flow: context.mainFlowContext.length > 0 ? context.mainFlowContext : ["확인 필요"],
    })),
    mapThumbnails: candidates.map((candidate) => ({
      candidateId: candidate.identity.displayCode,
      mapRef: assets.mapsByCandidateId[candidate.identity.displayCode]?.assetRef ?? null,
    })),
    frameoneOpinion: opinion,
  };
}

function buildRegionDemand(
  state: Pork33ShortlistStateV1,
  regionId: string,
  candidates: Pork33CandidateState[],
  sbiz365ByCandidateId: Record<string, Pork33Sbiz365SnapshotV1>,
): Pork33RegionDemandSummary {
  const region = state.regions.find((item) => item.regionId === regionId);
  if (!region) throw new Error("Region을 찾을 수 없습니다.");
  const snapshots = candidates.map((candidate) => sbiz365ByCandidateId[candidate.identity.displayCode]).filter((value): value is Pork33Sbiz365SnapshotV1 => Boolean(value));
  const areaIds = unique(candidates.map((candidate) => candidate.linkage.apartmentAreaId));
  const areas = areaIds.map((areaId) => {
    const area = state.apartmentAreas.find((item) => item.apartmentAreaId === areaId);
    if (!area) throw new Error("Region에 연결된 Apartment Area를 찾을 수 없습니다.");
    return { apartmentAreaId: areaId, label: area.label, candidateCount: candidates.filter((candidate) => candidate.linkage.apartmentAreaId === areaId).length };
  });
  const households = numberRange(snapshots.map((snapshot) => snapshot.householdCount), "세대");
  const population = numberRange(snapshots.map((snapshot) => snapshot.residentialPopulation), "명");
  const competition = numberRange(snapshots.map((snapshot) => snapshot.meatShopCount), "곳");
  const general = unique(areaIds.map((areaId) => generalResidentialDisplay(candidates.filter((candidate) => candidate.linkage.apartmentAreaId === areaId))).filter((value) => value !== "확인 필요"));
  return {
    regionId,
    regionLabel: region.label,
    candidateCount: candidates.length,
    apartmentAreaCount: areas.length,
    snapshotCount: snapshots.length,
    householdRange: households,
    residentialPopulationRange: population,
    meatShopRange: competition,
    competitorMetricLabel: PORK33_STORE_DEVELOPMENT_PRESET_V1.terminology.competitor,
    peakTimeDistribution: distribution(snapshots.map((snapshot) => formatTimeForCustomer(snapshot.peakFloatingTime))),
    peakGenderAgeDistribution: distribution(snapshots.map((snapshot) => formatGenderForCustomer(snapshot.peakGenderAge))),
    generalResidentialSummary: general.join(" · ") || "확인 필요",
    apartmentAreas: areas,
    interpretation: [
      `${region.label}은 현재 관계 기준 Apartment Area ${areas.length}개와 후보 ${candidates.length}곳을 비교합니다.`,
      competition.knownCount > 0 ? `${PORK33_STORE_DEVELOPMENT_PRESET_V1.terminology.competitor} 수는 ${competition.display.replace("후보별 ", "")}로 후보별 차이가 확인됩니다.` : `${PORK33_STORE_DEVELOPMENT_PRESET_V1.terminology.competitor} 수는 자료 확인이 필요합니다.`,
      "반경 500m 지표는 중첩 가능성이 있어 합계가 아닌 후보별 범위와 분포로 표시했습니다.",
    ],
  };
}

function selectedRegionIds(state: Pork33ShortlistStateV1, scope: Pork33DecisionScope) {
  if (scope.scopeType === "ALL") return state.regions.map((region) => region.regionId);
  if (!state.regions.some((region) => region.regionId === scope.regionId)) throw new Error("선택한 Region을 찾을 수 없습니다.");
  return [scope.regionId];
}

export function buildPork33DecisionPages(
  state: Pork33ShortlistStateV1,
  assets: Pork33BriefingAssetIndex,
  sbiz365ByCandidateId: Record<string, Pork33Sbiz365SnapshotV1>,
  scope: Pork33DecisionScope = { scopeType: "ALL" },
): Pork33DecisionPage[] {
  const pages: Pork33DecisionPage[] = [];
  for (const regionId of selectedRegionIds(state, scope)) {
    const region = state.regions.find((item) => item.regionId === regionId);
    if (!region) throw new Error("Region을 찾을 수 없습니다.");
    const regionCandidates = state.candidates.filter((candidate) => candidate.linkage.regionId === regionId).sort((left, right) => left.source.sourceRowOrder - right.source.sourceRowOrder);
    const regionBriefing = buildPork33BriefingPages(state, assets, sbiz365ByCandidateId, { scopeType: "REGION", regionId });
    const overview = regionBriefing.find((page): page is Extract<Pork33BriefingPage, { kind: "REGION_OVERVIEW" }> => page.kind === "REGION_OVERVIEW");
    if (!overview) throw new Error("V1 Region Overview를 만들 수 없습니다.");
    pages.push(overview);
    const demand = buildRegionDemand(state, regionId, regionCandidates, sbiz365ByCandidateId);
    pages.push({ kind: "REGION_DEMAND_SUMMARY", title: `${region.label} 상권·수요`, demand });

    const areaIds = state.apartmentAreas.filter((area) => area.regionId === regionId).map((area) => area.apartmentAreaId);
    for (const apartmentAreaId of areaIds) {
      const candidates = regionCandidates.filter((candidate) => candidate.linkage.apartmentAreaId === apartmentAreaId);
      if (candidates.length === 0) continue;
      const area = buildArea(state, region.label, apartmentAreaId, candidates, assets, sbiz365ByCandidateId);
      pages.push({ kind: "APARTMENT_AREA_ANALYSIS", title: `${area.label} 분석`, area });
      const briefingCandidates = new Map<string, Pork33BriefingCandidate>();
      for (const candidate of candidates) {
        const candidatePages = buildPork33BriefingPages(state, assets, sbiz365ByCandidateId, { scopeType: "CANDIDATE", candidateStoreId: candidate.identity.candidateStoreId });
        const summary = candidatePages.find((page): page is Extract<Pork33BriefingPage, { kind: "CANDIDATE_SUMMARY" }> => page.kind === "CANDIDATE_SUMMARY");
        if (!summary) throw new Error(`${candidate.identity.displayCode} V1 Candidate Summary를 만들 수 없습니다.`);
        briefingCandidates.set(candidate.identity.candidateStoreId, summary.candidate);
      }
      const compareRows = candidates.map((candidate) => toCompareCandidate(candidate, briefingCandidates.get(candidate.identity.candidateStoreId) as Pork33BriefingCandidate));
      const comparePages = paginatePork33CompareCandidates(compareRows);
      comparePages.forEach((rows, index) => pages.push({
        kind: "CANDIDATE_COMPARE",
        title: `${area.label} 후보점포 비교`,
        regionLabel: region.label,
        apartmentAreaId,
        apartmentAreaLabel: area.label,
        pageNumber: index + 1,
        pageCount: comparePages.length,
        candidates: rows,
      }));
      for (const candidate of candidates) {
        pages.push(...buildPork33BriefingPages(state, assets, sbiz365ByCandidateId, { scopeType: "CANDIDATE", candidateStoreId: candidate.identity.candidateStoreId }));
      }
    }
  }
  return pages;
}

export function projectPork33DecisionPageCount(pages: readonly Pork33DecisionPage[]) {
  return {
    total: pages.length,
    regionOverview: pages.filter((page) => page.kind === "REGION_OVERVIEW").length,
    regionDemand: pages.filter((page) => page.kind === "REGION_DEMAND_SUMMARY").length,
    apartmentArea: pages.filter((page) => page.kind === "APARTMENT_AREA_ANALYSIS").length,
    candidateCompare: pages.filter((page) => page.kind === "CANDIDATE_COMPARE").length,
    candidateSummary: pages.filter((page) => page.kind === "CANDIDATE_SUMMARY").length,
    fieldPhoto: pages.filter((page) => page.kind === "FIELD_PHOTO").length,
  };
}
