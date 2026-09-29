"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildCompetitionStructure,
  type CompetitionObservedChannel,
  type CompetitionSearchCategory,
  type CompetitionStructureResult,
} from "@/lib/market-data/competition-structure";
import type {
  ExecutedMarketAnalysis,
  KakaoNearbySearchState,
  NearbyCategoryId,
  NearbyPlace,
  NearbyPlacesResponse,
} from "@/lib/market-data/market-analysis-context";
import {
  activeAnalysisTargetSearchParams,
  competitionExecutionMatchesTarget,
  competitionOfficialMarketChoices,
  initialOfficialMarketCode,
  officialMarketSelectionAfterLocationChange,
  type ActiveAnalysisTarget,
  type CompetitionInitialLocation,
} from "@/lib/market-data/competition-location";
import type { OfficialMarketSpatialInput } from "@/lib/market-data/official-market-spatial-relation";
import type { BakeryOfficialMarketData } from "@/lib/market-data/services/bakery-official-market";
import {
  analysisResultStatus,
  createActiveAnalysisTarget,
  type AnalysisResultStatus,
} from "@/lib/market-data/basic-location/run";
import KakaoBaseMap, {
  type KakaoOfficialMarketPolygon,
} from "../KakaoBaseMap";
import {
  ActiveAnalysisTargetCard,
  AnalysisWorkflow,
} from "../AnalysisWorkflow";

const CHANNEL_LABELS: Record<NearbyCategoryId, string> = {
  bakery: "베이커리",
  confectionery: "제과점",
  cafe: "카페",
};

function toObservation(
  place: NearbyPlace,
  channel: CompetitionObservedChannel,
) {
  return {
    kakaoPlaceId: place.kakaoPlaceId ?? null,
    name: place.name,
    phone: place.phone ?? null,
    roadAddress: place.roadAddress ?? null,
    addressName: place.addressName ?? null,
    latitude: place.latitude,
    longitude: place.longitude,
    distanceM: place.distanceM,
    sourceCategoryId: channel,
    sourceCategoryLabel: CHANNEL_LABELS[channel],
  };
}

function normalizeCategories(
  response: NearbyPlacesResponse,
): CompetitionSearchCategory[] {
  return (response.categories ?? []).map((category) => ({
    id: category.id,
    label: category.label ?? CHANNEL_LABELS[category.id],
    totalCount: category.totalCount,
    places: response.competitionObservations
      ? response.competitionObservations
          .filter((place) => place.sourceCategoryId === category.id)
          .map((place) => ({ ...place }))
      : category.places.map((place) => toObservation(place, category.id)),
    error: category.error ?? null,
  }));
}

function formatDistance(value: number | null) {
  return value === null ? "확인 필요" : `${value.toLocaleString("ko-KR")}m`;
}

function channelLabel(channel: CompetitionObservedChannel) {
  return CHANNEL_LABELS[channel];
}

async function responseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { message?: string };
  if (!response.ok) {
    throw new Error(payload.message ?? "자료를 불러오지 못했습니다.");
  }
  return payload;
}

interface OfficialFeature {
  featureIndex: number;
  marketCode: string;
  marketName: string;
  geometry: KakaoOfficialMarketPolygon["geometry"];
}

interface OfficialGeoJson {
  features?: Array<{
    geometry?: KakaoOfficialMarketPolygon["geometry"];
    properties?: {
      official_area_code?: unknown;
      official_area_name?: unknown;
      status?: unknown;
      output_crs?: unknown;
    };
  }>;
}

function parseOfficialFeatures(value: OfficialGeoJson): OfficialFeature[] {
  return (value.features ?? []).flatMap((feature, featureIndex) => {
    const marketCode = feature.properties?.official_area_code;
    const marketName = feature.properties?.official_area_name;
    if (
      typeof marketCode !== "string" ||
      !/^\d+$/.test(marketCode) ||
      typeof marketName !== "string" ||
      !marketName.trim() ||
      feature.properties?.status !== "validated" ||
      feature.properties?.output_crs !== "EPSG:4326" ||
      !feature.geometry ||
      !["Polygon", "MultiPolygon"].includes(feature.geometry.type)
    ) {
      return [];
    }
    return [
      {
        featureIndex,
        marketCode,
        marketName: marketName.trim(),
        geometry: feature.geometry,
      },
    ];
  });
}

export default function CompetitionStructureClient({
  initialTarget,
}: {
  initialTarget: ActiveAnalysisTarget | null;
}) {
  const [draftLocation, setDraftLocation] =
    useState<CompetitionInitialLocation | null>(initialTarget);
  const draftLocationRef = useRef<CompetitionInitialLocation | null>(initialTarget);
  const [executedAnalysis, setExecutedAnalysis] =
    useState<ExecutedMarketAnalysis | null>(null);
  const [activeTarget, setActiveTarget] =
    useState<ActiveAnalysisTarget | null>(initialTarget);
  const [executedTarget, setExecutedTarget] =
    useState<ActiveAnalysisTarget | null>(null);
  const [preservedResult, setPreservedResult] =
    useState<CompetitionStructureResult | null>(null);
  const latestResultRef = useRef<CompetitionStructureResult | null>(null);
  const [nearbySearch, setNearbySearch] = useState<KakaoNearbySearchState>({
    status: "idle",
    response: null,
    error: null,
    analysisRunId: null,
    completedAt: null,
  });
  const [officialFeatures, setOfficialFeatures] = useState<OfficialFeature[]>([]);
  const [officialLayerError, setOfficialLayerError] = useState("");
  const [manualOfficialMarketCode, setManualOfficialMarketCode] =
    useState<string | null>(initialTarget?.officialReference?.marketCode ?? null);
  const [executedOfficialMarketCode, setExecutedOfficialMarketCode] =
    useState<string | null>(null);
  const [officialMarketDataByCode, setOfficialMarketDataByCode] = useState<
    Record<string, BakeryOfficialMarketData>
  >({});
  const [officialWarningsByCode, setOfficialWarningsByCode] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/markets/spatial-layers/seoul-official-markets", {
      signal: controller.signal,
    })
      .then((response) => responseJson<OfficialGeoJson>(response))
      .then((payload) => setOfficialFeatures(parseOfficialFeatures(payload)))
      .catch((layerError: unknown) => {
        if (controller.signal.aborted) return;
        setOfficialLayerError(
          layerError instanceof Error
            ? layerError.message
            : "서울 공식상권 경계를 불러오지 못했습니다.",
        );
      });
    return () => controller.abort();
  }, []);

  const officialInputs = useMemo<OfficialMarketSpatialInput[]>(
    () =>
      officialFeatures.map((feature) => ({
        marketCode: feature.marketCode,
        marketName: feature.marketName,
        geometry: feature.geometry,
      })),
    [officialFeatures],
  );
  const officialChoices = useMemo(
    () =>
      competitionOfficialMarketChoices(
        draftLocation
          ? {
              analysisPoint: {
                latitude: draftLocation.latitude,
                longitude: draftLocation.longitude,
              },
              analysisRadiusMeters: draftLocation.radiusM,
            }
          : null,
        officialInputs,
      ),
    [draftLocation, officialInputs],
  );
  const selectedOfficialMarketCode = officialChoices.some(
    (choice) => choice.marketCode === manualOfficialMarketCode,
  )
    ? manualOfficialMarketCode
    : initialOfficialMarketCode(officialChoices);
  const officialWarning = selectedOfficialMarketCode
    ? officialWarningsByCode[selectedOfficialMarketCode] ?? ""
    : "";

  useEffect(() => {
    if (!activeTarget) return;
    const url = new URL(window.location.href);
    [
      "lat", "lng", "radius", "label", "address", "analysisRunId", "source",
      "createdAt", "updatedAt", "frameoneMarketId", "frameoneMarketName",
      "frameoneSubmarketId", "frameoneSubmarketName", "frameoneNodeId",
      "frameoneNodeName", "officialMarketCode", "officialMarketName",
      "officialRelation", "officialSelectionMethod", "officialSelectedAt",
    ].forEach((key) => url.searchParams.delete(key));
    activeAnalysisTargetSearchParams(activeTarget).forEach((value, key) => {
      url.searchParams.set(key, value);
    });
    window.history.replaceState(window.history.state, "", url);
  }, [activeTarget]);

  useEffect(() => {
    if (!selectedOfficialMarketCode) return;
    const controller = new AbortController();
    void fetch(
      `/api/markets/bakery-data?${new URLSearchParams({
        marketCode: selectedOfficialMarketCode,
        includeTrend: "1",
      })}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then((response) => responseJson<BakeryOfficialMarketData>(response))
      .then((data) => {
        setOfficialMarketDataByCode((current) => ({
          ...current,
          [data.officialMarketCode]: data,
        }));
        setOfficialWarningsByCode((current) => {
          const next = { ...current };
          delete next[data.officialMarketCode];
          return next;
        });
      })
      .catch((officialError: unknown) => {
        if (controller.signal.aborted) return;
        setOfficialWarningsByCode((current) => ({
          ...current,
          [selectedOfficialMarketCode]:
            officialError instanceof Error
              ? officialError.message
              : "서울 공식상권 참고자료를 불러오지 못했습니다.",
        }));
      });
    return () => controller.abort();
  }, [selectedOfficialMarketCode]);

  const handleDraftSelectionChange = useCallback(
    (selection: CompetitionInitialLocation | null) => {
      setManualOfficialMarketCode((current) =>
        officialMarketSelectionAfterLocationChange(
          draftLocationRef.current,
          selection,
          current,
        ),
      );
      draftLocationRef.current = selection;
      setDraftLocation(selection);
    },
    [],
  );
  const handleAnalysisExecuted = useCallback(
    (analysis: ExecutedMarketAnalysis) => {
      setPreservedResult(latestResultRef.current);
      setExecutedAnalysis(analysis);
      setExecutedOfficialMarketCode(selectedOfficialMarketCode);
      const reference = officialChoices.find(
        (choice) => choice.marketCode === selectedOfficialMarketCode,
      );
      const selectedAt = new Date().toISOString();
      const officialReference: ActiveAnalysisTarget["officialReference"] = reference &&
          (reference.relation === "INSIDE" || reference.relation === "RADIUS_OVERLAP")
          ? {
              marketCode: reference.marketCode,
              marketName: reference.marketName,
              spatialRelation: reference.relation,
              selectionMethod: officialChoices.length === 1
                ? "AUTO_SINGLE_CANDIDATE"
                : "MANUAL",
              selectedAt,
            }
          : null;
      const shouldReuseInitialTarget = !executedTarget &&
        competitionExecutionMatchesTarget(initialTarget, analysis);
      const nextTarget = shouldReuseInitialTarget && initialTarget
        ? {
            ...initialTarget,
            officialReference,
            updatedAt: selectedAt,
          }
        : createActiveAnalysisTarget({
            analysis: {
              label: analysis.confirmedAddress,
              address: analysis.confirmedAddress,
              latitude: analysis.analysisPoint.latitude,
              longitude: analysis.analysisPoint.longitude,
              radiusM: analysis.analysisRadiusMeters,
              source: analysis.source,
            },
            explorationSnapshot: initialTarget?.explorationSnapshot,
            officialReference,
          });
      setExecutedTarget(nextTarget);
      setActiveTarget(nextTarget);
      return nextTarget.analysisRunId;
    },
    [executedTarget, initialTarget, officialChoices, selectedOfficialMarketCode],
  );

  const officialPolygons = useMemo<KakaoOfficialMarketPolygon[]>(() => {
    const codes = new Set(officialChoices.map((choice) => choice.marketCode));
    return officialFeatures
      .filter((feature) => codes.has(feature.marketCode))
      .map((feature) => ({
        featureIndex: feature.featureIndex,
        officialMarketCode: feature.marketCode,
        geometry: feature.geometry,
      }));
  }, [officialChoices, officialFeatures]);

  const currentResult = useMemo<CompetitionStructureResult | null>(() => {
    if (
      !executedAnalysis ||
      !executedTarget ||
      nearbySearch.analysisRunId !== executedTarget.analysisRunId ||
      (nearbySearch.status !== "success" && nearbySearch.status !== "error") ||
      !nearbySearch.response
    ) {
      return null;
    }
    const categories = normalizeCategories(nearbySearch.response);
    if (categories.length === 0) return null;
    return buildCompetitionStructure({
      analysisRunId: executedTarget.analysisRunId,
      generatedAt: nearbySearch.completedAt ?? new Date().toISOString(),
      center: executedAnalysis.analysisPoint,
      radiusM: executedAnalysis.analysisRadiusMeters,
      categories,
      officialMarketData: executedOfficialMarketCode
        ? officialMarketDataByCode[executedOfficialMarketCode] ?? null
        : null,
      officialMarketCode: executedOfficialMarketCode,
    });
  }, [
    executedAnalysis,
    executedTarget,
    nearbySearch,
    officialMarketDataByCode,
    executedOfficialMarketCode,
  ]);

  useEffect(() => {
    if (currentResult) latestResultRef.current = currentResult;
  }, [currentResult]);

  const result = currentResult ?? preservedResult;
  const runResultStatus: AnalysisResultStatus = analysisResultStatus(
    activeTarget?.analysisRunId,
    result?.analysisRunId,
  );
  const resultStatus: AnalysisResultStatus = runResultStatus === "CURRENT" &&
    (activeTarget?.officialReference?.marketCode ?? null) !==
      (result?.officialAreaReference.officialMarketCode ?? null)
    ? "STALE"
    : runResultStatus;

  const selectOfficialMarket = useCallback((marketCode: string) => {
    setManualOfficialMarketCode(marketCode);
    if (!executedTarget || !executedAnalysis || !draftLocation) return;
    if (
      draftLocation.latitude !== executedAnalysis.analysisPoint.latitude ||
      draftLocation.longitude !== executedAnalysis.analysisPoint.longitude ||
      draftLocation.radiusM !== executedAnalysis.analysisRadiusMeters
    ) return;
    const choice = officialChoices.find((candidate) => candidate.marketCode === marketCode);
    if (!choice) return;
    setPreservedResult(latestResultRef.current);
    const selectedAt = new Date().toISOString();
    const nextTarget: ActiveAnalysisTarget = {
      ...executedTarget,
      officialReference: {
        marketCode: choice.marketCode,
        marketName: choice.marketName,
        spatialRelation: choice.relation === "INSIDE" ? "INSIDE" : "RADIUS_OVERLAP",
        selectionMethod: officialChoices.length === 1 ? "AUTO_SINGLE_CANDIDATE" : "MANUAL",
        selectedAt,
      },
      updatedAt: selectedAt,
    };
    setExecutedTarget(nextTarget);
    setActiveTarget(nextTarget);
    setExecutedOfficialMarketCode(marketCode);
  }, [draftLocation, executedAnalysis, executedTarget, officialChoices]);

  const selectedOfficialChoice = officialInputs.find(
    (choice) => choice.marketCode === executedOfficialMarketCode,
  );
  const officialSelector = (
    <section aria-label="자동 연결된 서울 공식상권" className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
      <h4 className="text-sm font-bold text-slate-950">자동 연결된 서울 공식상권</h4>
      {!draftLocation ? (
        <p className="mt-2 text-xs text-slate-600">주소 검색 또는 지도에서 분석 위치를 먼저 선택해 주세요.</p>
      ) : officialLayerError ? (
        <p className="mt-2 text-xs font-semibold text-amber-800">공간관계 확인 필요: {officialLayerError}</p>
      ) : officialFeatures.length === 0 ? (
        <p className="mt-2 text-xs text-slate-600">서울 공식상권 경계를 불러오는 중입니다.</p>
      ) : officialChoices.length === 0 ? (
        <p className="mt-2 text-xs text-slate-600">현재 지점과 선택 반경에 직접 겹치는 공식상권이 없습니다.</p>
      ) : officialChoices.length === 1 ? (
        <p className="mt-2 text-sm font-bold text-slate-900">{officialChoices[0].marketName} · {officialChoices[0].relation === "INSIDE" ? "분석지점 포함" : `${draftLocation.radiusM}m 반경 겹침`}</p>
      ) : (
        <fieldset className="mt-3 space-y-2">
          <legend className="text-xs font-semibold text-slate-700">공식통계 참고상권을 이름으로 선택하세요.</legend>
          {officialChoices.map((choice) => (
            <label key={choice.marketCode} className="flex cursor-pointer items-start gap-2 rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs text-slate-800">
              <input type="radio" name="official-market-choice" className="mt-0.5" checked={selectedOfficialMarketCode === choice.marketCode} onChange={() => selectOfficialMarket(choice.marketCode)} />
              <span><strong>{choice.marketName}</strong><span className="ml-1 text-slate-500">· {choice.relation === "INSIDE" ? "분석지점 포함" : `${draftLocation.radiusM}m 반경 겹침`}</span></span>
            </label>
          ))}
        </fieldset>
      )}
      <p className="mt-2 text-[11px] leading-5 text-slate-500">공식상권 공간관계는 검증된 서울시 Polygon과 선택 위치·반경으로 계산합니다. 반경 겹침은 분석지점 포함을 뜻하지 않습니다.</p>
    </section>
  );

  return (
    <div className="space-y-4">
      <AnalysisWorkflow active="competition" target={activeTarget} statuses={{ competition: resultStatus }} />
      <ActiveAnalysisTargetCard target={activeTarget} status={resultStatus} officialReferencePeriod={result?.officialAreaReference.referencePeriod ?? null} />
      <header className="panel-card bg-gradient-to-br from-white to-[#FFF7ED] p-5 md:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-700">
          경쟁환경
        </p>
        <h1 className="mt-2 text-2xl font-black text-slate-950">
          베이커리 경쟁환경 관측
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Kakao 검색에 반환된 상세 후보를 중복 정규화하고 거리·방향·검색채널
          중첩을 확인합니다. 이 결과는 전체 사업체 전수조사나 직접 경쟁 판정이
          아닙니다.
        </p>
      </header>

      <section className="panel-card overflow-hidden" aria-label="경쟁환경 분석 위치 선택">
        <KakaoBaseMap
          officialMarketPolygons={officialPolygons}
          selectedOfficialMarketCode={selectedOfficialMarketCode}
          onSelectOfficialMarket={(featureIndex) => {
            const feature = officialFeatures.find(
              (candidate) => candidate.featureIndex === featureIndex,
            );
            if (feature) selectOfficialMarket(feature.marketCode);
          }}
          onAnalysisExecuted={handleAnalysisExecuted}
          onNearbySearchChange={setNearbySearch}
          onDraftSelectionChange={handleDraftSelectionChange}
          initialSelection={initialTarget}
          analysisActionLabel="경쟁환경 분석"
          addressOrPlaceSearch
          marketName="경쟁환경"
          marketSelector={officialSelector}
          view="briefing"
        />
      </section>
      {nearbySearch.status === "loading" ? (
        <p className="panel-card p-4 text-sm font-semibold text-slate-600" role="status">Kakao 경쟁 후보를 조회하는 중입니다.</p>
      ) : nearbySearch.error ? (
        <p className="panel-card p-4 text-sm font-semibold text-amber-800" role="status">{nearbySearch.error}</p>
      ) : null}

      {resultStatus === "STALE" ? (
        <section className="panel-card border-amber-300 bg-amber-50 p-4" role="status">
          <p className="text-sm font-bold text-amber-950">다시 분석 필요</p>
          <p className="mt-1 text-xs leading-5 text-amber-900">이 결과는 이전 분석대상 또는 이전 조건으로 생성되었습니다. 현재 위치와 반경으로 경쟁환경 분석을 다시 실행해 주세요.</p>
        </section>
      ) : null}

      {result ? (
        <>
          <section className="panel-card p-5 md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-950">Kakao 검색 관측</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {executedAnalysis?.confirmedAddress ?? "지도에서 선택한 위치"} · 반경 {result.radiusM}m
                </p>
              </div>
              <p className="text-xs text-slate-500">생성 {new Date(result.generatedAt).toLocaleString("ko-KR")}</p>
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold text-slate-700">Kakao 검색 노출 참고</p>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold text-slate-900">
                {result.kakaoObservation.categories.map((category) => (
                  <span key={category.id}>{category.label} 검색 {category.totalCount.toLocaleString("ko-KR")}</span>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">검색 API가 보고한 결과규모로 실제 영업점 또는 경쟁점 수가 아닙니다.</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <article className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold text-slate-600">API 상세 관측</p>
                <p className="mt-1 text-lg font-black text-slate-950">{result.kakaoObservation.observedRawDetailCount}건</p>
              </article>
              <article className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                <p className="text-xs font-semibold text-orange-800">중복 정규화 후보</p>
                <p className="mt-1 text-lg font-black text-slate-950">{result.kakaoObservation.uniqueObservedCandidateCount}곳</p>
              </article>
              <article className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-800">현장확인 경쟁점</p>
                <p className="mt-1 text-lg font-black text-slate-950">미확인</p>
              </article>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-slate-600">검색채널별 상세 관측 보기</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {result.kakaoObservation.categories.map((category) => (
                <article key={category.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-600">{category.label} 채널</p>
                  <p className="mt-1 text-lg font-black text-slate-950">
                    상세 {category.observedDetailCount}개
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">검색 노출 참고 {category.totalCount} · {category.status === "ERROR" ? "조회 오류" : "조회 완료"}</p>
                </article>
              ))}
              </div>
            </details>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="panel-card p-5">
              <h2 className="text-sm font-bold text-slate-950">거리구간별 후보 수</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-3">
                {result.distanceBands.map((item) => (
                  <div key={item.band} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">{item.band}</p>
                    <p className="mt-1 text-lg font-black text-slate-950">{item.candidateCount}</p>
                  </div>
                ))}
              </div>
            </article>
            <article className="panel-card p-5">
              <h2 className="text-sm font-bold text-slate-950">방향별 후보 분포</h2>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {result.directionDistribution.map((item) => (
                  <div key={item.direction} className="rounded-lg border border-slate-200 px-3 py-2">
                    <p className="text-xs text-slate-500">{item.direction}</p>
                    <p className="font-black text-slate-950">{item.candidateCount}</p>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="panel-card overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-bold text-slate-950">최근접 후보 5개</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[720px] w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-2">후보</th><th className="px-4 py-2">거리</th><th className="px-4 py-2">방향</th><th className="px-4 py-2">관측 채널</th><th className="px-4 py-2">현장확인</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {result.nearestCandidates.map((candidate) => (
                    <tr key={candidate.competitionCandidateId}><td className="px-4 py-3 font-semibold text-slate-900">{candidate.name}</td><td className="px-4 py-3 tabular-nums">{formatDistance(candidate.distanceM)}</td><td className="px-4 py-3">{candidate.direction}</td><td className="px-4 py-3">{candidate.observedChannels.map(channelLabel).join(" + ")}</td><td className="px-4 py-3">미확인</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel-card overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-bold text-slate-950">전체 상세 관측 후보</h2>
              <p className="mt-1 text-xs text-slate-500">분류·프랜차이즈 여부는 자동 확정하지 않으며 모두 현장 확인 전 상태입니다.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-2">후보명 / ID</th><th className="px-4 py-2">주소</th><th className="px-4 py-2">거리구간</th><th className="px-4 py-2">방향</th><th className="px-4 py-2">검색채널</th><th className="px-4 py-2">분류</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {result.candidates.map((candidate) => (
                    <tr key={candidate.competitionCandidateId}><td className="px-4 py-3"><p className="font-semibold text-slate-900">{candidate.name}</p><p className="mt-1 max-w-64 truncate font-mono text-[10px] text-slate-400" title={candidate.competitionCandidateId}>{candidate.competitionCandidateId}</p></td><td className="px-4 py-3 text-slate-700">{candidate.roadAddress ?? candidate.addressName ?? "주소 확인 필요"}</td><td className="px-4 py-3">{candidate.distanceBand ?? "확인 필요"}<br /><span className="text-slate-400">{formatDistance(candidate.distanceM)}</span></td><td className="px-4 py-3">{candidate.direction}</td><td className="px-4 py-3">{candidate.observedChannels.map(channelLabel).join(" + ")} ({candidate.channelOverlapCount})</td><td className="px-4 py-3">현장확인 전</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel-card p-5 md:p-6">
            <h2 className="text-sm font-bold text-slate-950">서울 공식상권 제과점 참고</h2>
            {officialWarning ? <p className="mt-3 text-sm font-semibold text-amber-700">{officialWarning}</p> : null}
            {officialWarning ? null : result.officialAreaReference.status === "NOT_REQUESTED" ? (
              <p className="mt-3 text-sm text-slate-600">공식통계 참고상권을 선택하지 않아 공식 STORES/Trend는 결과에 포함하지 않았습니다.</p>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3"><p className="text-xs text-slate-500">공식상권</p><p className="mt-1 font-bold text-slate-950">{result.officialAreaReference.officialMarketName ?? selectedOfficialChoice?.marketName ?? "상권명 확인 필요"}</p></div>
                <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3"><p className="text-xs text-slate-500">기준분기 · 업종</p><p className="mt-1 font-bold text-slate-950">{result.officialAreaReference.referencePeriod ?? "자료 없음"} · 제과점</p></div>
                <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3"><p className="text-xs text-slate-500">공식 STORES 점포수</p><p className="mt-1 font-bold text-slate-950">{result.officialAreaReference.storeCount === null ? "자료 없음" : `${result.officialAreaReference.storeCount.toLocaleString("ko-KR")}개`}</p></div>
              </div>
            )}
            <p className="mt-3 text-xs leading-5 text-slate-500">공식상권 점포수와 Kakao 반경 검색 후보 수는 서로 다른 source/scope입니다. 합산하지 않습니다. 점포수 증감은 신규·폐업 수로 해석하지 않습니다.</p>
          </section>

          <section className="panel-card border-amber-200 bg-amber-50/50 p-5">
            <h2 className="text-sm font-bold text-amber-950">현장 확인 필요</h2>
            <p className="mt-2 text-sm leading-6 text-amber-900">{result.fieldHandoff.length}개 후보는 미확인 상태입니다. 실제 영업 여부, 직접·간접 경쟁, 프랜차이즈 여부는 현장조사 또는 검증된 별도 자료로 확인해야 합니다.</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-5 text-amber-900">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
