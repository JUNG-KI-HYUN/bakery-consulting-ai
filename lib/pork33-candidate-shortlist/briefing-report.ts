import { derivePork33ApartmentContext, parsePork33Locality } from "./locality";
import { getActivePork33Revision } from "./state";
import type { Pork33CandidateState, Pork33ShortlistStateV1 } from "./types";
import { PORK33_STORE_DEVELOPMENT_PRESET_V1 } from "../store-development-report/presets";
import {
  formatFieldSummaryForCustomer,
  formatGenderForCustomer,
  formatCountForCustomer,
  formatIndustryMetricForCustomer,
  formatLifecycleForCustomer,
  formatTimeForCustomer,
} from "../store-development-report/presentation";

export type Pork33BriefingScope =
  | { scopeType: "ALL" }
  | { scopeType: "REGION"; regionId: string }
  | { scopeType: "CANDIDATE"; candidateStoreId: string };

export type Pork33BriefingPhotoAsset = {
  assetRef: string;
  sequence: number;
  width: number;
  height: number;
};

export type Pork33BriefingAssetIndex = {
  mapsByCandidateId: Record<string, { assetRef: string; sourceFileName: string }>;
  photosByCandidateId: Record<string, Pork33BriefingPhotoAsset[]>;
};

export type Pork33Sbiz365SnapshotV1 = {
  schemaVersion: "frameone.pork33-sbiz365-candidate-snapshot.v1";
  candidateId: string;
  sourceFileName: string;
  addressVerification: "MATCHED" | "USER_CONFIRMED_OVERRIDE" | "REVIEW_REQUIRED";
  analysisRadiusMeters: number | null;
  radiusSource: "USER_PROVIDED";
  analysisDate: string | null;
  peakFloatingTime: string | null;
  peakGenderAge: string | null;
  meatShopCount: number | null;
  householdCount: number | null;
  residentialPopulation: number | null;
  extractionStatus: string;
};

export type Pork33BriefingCandidate = {
  candidateStoreId: string;
  displayCode: string;
  regionLabel: string;
  regionPosition: string;
  address: string;
  locality: string;
  apartmentArea: string;
  mainApartment: string;
  area: string;
  deposit: string;
  rent: string;
  maintenance: string;
  premium: string;
  household: string;
  householdSource: string;
  apartmentRelationship: string;
  fieldLocation: string[];
  approvedSummary: string;
  strengths: string[];
  checks: string[];
  lifecycleLabel: string;
  competitorMetric: { label: string; value: string };
  sbiz365HouseholdDisplay: string;
  sbiz365ResidentialPopulationDisplay: string;
  mapRef: string | null;
  representativePhotoRef: string | null;
  photos: Pork33BriefingPhotoAsset[];
  sbiz365: Pork33Sbiz365SnapshotV1 | null;
};

export type Pork33BriefingRegion = {
  regionId: string;
  label: string;
  candidateCount: number;
  candidateIdRange: string;
  localities: string[];
  frameoneSummary: string;
  sbiz365Summary: string;
  heroPhotoRef: string | null;
  points: Array<{ candidateId: string; latitude: number; longitude: number }>;
};

export type Pork33BriefingPage =
  | { kind: "REGION_OVERVIEW"; title: string; region: Pork33BriefingRegion }
  | { kind: "CANDIDATE_SUMMARY"; title: string; candidate: Pork33BriefingCandidate }
  | { kind: "FIELD_PHOTO"; title: string; candidate: Pork33BriefingCandidate; photos: Pork33BriefingPhotoAsset[] };

function numberText(value: number | null, suffix: string) {
  return value === null ? "확인 필요" : `${value.toLocaleString("ko-KR")}${suffix}`;
}

function candidateByScope(state: Pork33ShortlistStateV1, scope: Pork33BriefingScope) {
  if (scope.scopeType === "ALL") return state.candidates.slice();
  if (scope.scopeType === "REGION") {
    if (!state.regions.some((region) => region.regionId === scope.regionId)) throw new Error("선택한 Region을 찾을 수 없습니다.");
    return state.candidates.filter((candidate) => candidate.linkage.regionId === scope.regionId);
  }
  const candidate = state.candidates.find((item) => item.identity.candidateStoreId === scope.candidateStoreId);
  if (!candidate) throw new Error("선택한 Candidate를 찾을 수 없습니다.");
  return [candidate];
}

function candidatePosition(state: Pork33ShortlistStateV1, candidate: Pork33CandidateState) {
  const rows = state.candidates
    .filter((item) => item.linkage.regionId === candidate.linkage.regionId)
    .sort((a, b) => a.source.sourceRowOrder - b.source.sourceRowOrder);
  return `${rows.findIndex((item) => item.identity.candidateStoreId === candidate.identity.candidateStoreId) + 1}/${rows.length}`;
}

function toCandidate(
  state: Pork33ShortlistStateV1,
  candidate: Pork33CandidateState,
  assets: Pork33BriefingAssetIndex,
  sbiz365ByCandidateId: Record<string, Pork33Sbiz365SnapshotV1>,
): Pork33BriefingCandidate {
  const code = candidate.identity.displayCode;
  const region = state.regions.find((item) => item.regionId === candidate.linkage.regionId);
  const area = state.apartmentAreas.find((item) => item.apartmentAreaId === candidate.linkage.apartmentAreaId);
  const revision = getActivePork33Revision(candidate);
  const approved = revision?.status === "APPROVED" ? revision : null;
  const context = derivePork33ApartmentContext(candidate);
  const photos = assets.photosByCandidateId[code]?.slice().sort((a, b) => a.sequence - b.sequence) ?? [];
  const sourceSnapshot = sbiz365ByCandidateId[code] ?? null;
  const sbiz365 = sourceSnapshot ? {
    ...sourceSnapshot,
    peakFloatingTime: formatTimeForCustomer(sourceSnapshot.peakFloatingTime),
    peakGenderAge: formatGenderForCustomer(sourceSnapshot.peakGenderAge),
  } : null;
  const competitorMetric = formatIndustryMetricForCustomer(
    sourceSnapshot?.meatShopCount,
    PORK33_STORE_DEVELOPMENT_PRESET_V1.terminology,
    "COMPETITOR_LOCATION_COUNT",
  );
  return {
    candidateStoreId: candidate.identity.candidateStoreId,
    displayCode: code,
    regionLabel: region?.label ?? "Region 확인 필요",
    regionPosition: candidatePosition(state, candidate),
    address: candidate.normalized.addressFull,
    locality: parsePork33Locality(candidate.normalized.addressFull).label,
    apartmentArea: area?.label ?? "Apartment Area 확인 필요",
    mainApartment: candidate.normalized.mainApartmentRaw,
    area: numberText(candidate.normalized.exclusiveArea, "평"),
    deposit: numberText(candidate.normalized.deposit, "만원"),
    rent: numberText(candidate.normalized.rent, "만원"),
    maintenance: numberText(candidate.normalized.maintenance, "만원"),
    premium: numberText(candidate.normalized.premium, "만원"),
    household: numberText(candidate.normalized.existingHouseholdReference, "세대"),
    householdSource: "기존 조사 기재값 · 최종 상세검토 전 참고자료",
    apartmentRelationship: context.storeRelationshipToApartment,
    fieldLocation: context.mainFlowContext.slice(0, 3),
    approvedSummary: formatFieldSummaryForCustomer(revision?.status, approved?.payload.reportSummary),
    strengths: approved?.payload.strengths.slice(0, 2) ?? [],
    checks: approved?.payload.checks.slice(0, 2) ?? [],
    lifecycleLabel: formatLifecycleForCustomer(candidate.normalized.reviewStatus),
    competitorMetric,
    sbiz365HouseholdDisplay: formatCountForCustomer(sourceSnapshot?.householdCount, "세대"),
    sbiz365ResidentialPopulationDisplay: formatCountForCustomer(sourceSnapshot?.residentialPopulation, "명"),
    mapRef: assets.mapsByCandidateId[code]?.assetRef ?? null,
    representativePhotoRef: photos[0]?.assetRef ?? null,
    photos,
    sbiz365,
  };
}

function toRegion(
  state: Pork33ShortlistStateV1,
  regionId: string,
  candidates: Pork33CandidateState[],
  assets: Pork33BriefingAssetIndex,
  sbiz365ByCandidateId: Record<string, Pork33Sbiz365SnapshotV1>,
): Pork33BriefingRegion {
  const region = state.regions.find((item) => item.regionId === regionId);
  if (!region) throw new Error("선택한 Region을 찾을 수 없습니다.");
  const ordered = candidates.slice().sort((a, b) => a.source.sourceRowOrder - b.source.sourceRowOrder);
  const ids = ordered.map((candidate) => candidate.identity.displayCode);
  const localities = [...new Set(ordered.map((candidate) => parsePork33Locality(candidate.normalized.addressFull).localityName))];
  const sbizCount = ids.filter((id) => Boolean(sbiz365ByCandidateId[id])).length;
  const approvedCount = ordered.filter((candidate) => getActivePork33Revision(candidate)?.status === "APPROVED").length;
  const areaCount = new Set(ordered.map((candidate) => candidate.linkage.apartmentAreaId)).size;
  const heroPhotoRef = ordered.map((candidate) => assets.photosByCandidateId[candidate.identity.displayCode]?.[0]?.assetRef).find(Boolean) ?? null;
  return {
    regionId,
    label: region.label,
    candidateCount: ordered.length,
    candidateIdRange: ids.length === 1 ? ids[0] : `${ids[0]} - ${ids.at(-1)}`,
    localities,
    frameoneSummary: `${localities.join("·")}의 아파트 생활권 후보 ${ordered.length}곳과 Apartment Area ${areaCount}개를 현장자료 기준으로 검토했습니다. 승인 현장요약은 ${approvedCount}곳에 연결되어 있습니다.`,
    sbiz365Summary: `사용자 제공 반경 500m 분석자료 ${sbizCount}/${ordered.length}건을 Candidate ID 기준으로 연결했습니다. 지표는 후보별 Summary에서 개별 출처값으로 표시합니다.`,
    heroPhotoRef,
    points: ordered.flatMap((candidate) => candidate.normalized.latitude !== null && candidate.normalized.longitude !== null
      ? [{ candidateId: candidate.identity.displayCode, latitude: candidate.normalized.latitude, longitude: candidate.normalized.longitude }]
      : []),
  };
}

export function buildPork33BriefingPages(
  state: Pork33ShortlistStateV1,
  assets: Pork33BriefingAssetIndex,
  sbiz365ByCandidateId: Record<string, Pork33Sbiz365SnapshotV1>,
  scope: Pork33BriefingScope = { scopeType: "ALL" },
): Pork33BriefingPage[] {
  const selected = candidateByScope(state, scope).sort((a, b) => a.source.sourceRowOrder - b.source.sourceRowOrder);
  const regionIds = scope.scopeType === "CANDIDATE"
    ? []
    : scope.scopeType === "REGION"
      ? [scope.regionId]
      : state.regions.map((region) => region.regionId);
  const pages: Pork33BriefingPage[] = [];
  for (const regionId of regionIds) {
    const regionCandidates = selected.filter((candidate) => candidate.linkage.regionId === regionId);
    const region = toRegion(state, regionId, regionCandidates, assets, sbiz365ByCandidateId);
    pages.push({ kind: "REGION_OVERVIEW", title: `${region.label} 현장조사 개요`, region });
    for (const candidate of regionCandidates) {
      const item = toCandidate(state, candidate, assets, sbiz365ByCandidateId);
      pages.push({ kind: "CANDIDATE_SUMMARY", title: `${item.displayCode} 후보점포 요약`, candidate: item });
      if (item.photos.length > 0) pages.push({ kind: "FIELD_PHOTO", title: `${item.displayCode} 후보점포 현장사진`, candidate: item, photos: item.photos });
    }
  }
  if (scope.scopeType === "CANDIDATE") {
    const item = toCandidate(state, selected[0], assets, sbiz365ByCandidateId);
    pages.push({ kind: "CANDIDATE_SUMMARY", title: `${item.displayCode} 후보점포 요약`, candidate: item });
    if (item.photos.length > 0) pages.push({ kind: "FIELD_PHOTO", title: `${item.displayCode} 후보점포 현장사진`, candidate: item, photos: item.photos });
  }
  return pages;
}

export function projectPork33BriefingPageCount(pages: readonly Pork33BriefingPage[]) {
  return {
    total: pages.length,
    regionOverview: pages.filter((page) => page.kind === "REGION_OVERVIEW").length,
    candidateSummary: pages.filter((page) => page.kind === "CANDIDATE_SUMMARY").length,
    fieldPhoto: pages.filter((page) => page.kind === "FIELD_PHOTO").length,
  };
}
