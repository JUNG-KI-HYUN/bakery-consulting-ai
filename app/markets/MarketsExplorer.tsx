"use client";

import { useCallback, useMemo, useState } from "react";
import MarketSpatialViewer from "./MarketSpatialViewer";
import MarketAnalysisSummary from "./MarketAnalysisSummary";
import type {
  KakaoNearbySearchState,
  MarketAnalysisContext,
} from "@/lib/market-data/market-analysis-context";
import { buildMarketSummaryPresentation } from "@/lib/market-data/market-analysis-presentation";
import {
  adaptAnalysisTargetResults,
  adaptFrameoneCanonicalResults,
  buildGeometryDependentBlockedResults,
} from "@/lib/market-data/basic-location/adapters";
import { adaptKakaoNearbyResults } from "@/lib/market-data/basic-location/kakao-nearby-adapter";
import { adaptOfficialCommercialAreaRelationResults } from "@/lib/market-data/basic-location/official-commercial-area-adapter";
import { adaptOfficialMarketStatisticsResults } from "@/lib/market-data/basic-location/official-market-stats-adapter";
import { collectBasicLocationResults } from "@/lib/market-data/basic-location/result-collection";
import { applyBasicLocationDisplayPolicy } from "@/lib/market-data/basic-location/display-policy";
import { buildBasicLocationInterpretation } from "@/lib/market-data/basic-location/interpretation";
import { buildP0BasicLocationViewModel } from "@/lib/market-data/basic-location/view-model";
import { getSpatialLayerDefinition } from "./spatial-layer-registry";

export type MarketsWorkspaceTab =
  | "briefing"
  | "market-map"
  | "competition"
  | "public-data";

export type MarketAnalysisMode = "market-area" | "point-detail";

interface MarketAreaAnalysisSnapshot {
  analysisType: "MARKET_AREA";
  marketId: string;
  marketName: string;
  district: string;
  submarketCount: number;
  nodeCount: number;
  geometryStatus: string;
}

const WORKSPACE_TABS: ReadonlyArray<{
  id: MarketsWorkspaceTab;
  label: string;
}> = [
  { id: "briefing", label: "분석 설정" },
  { id: "market-map", label: "기초입지 분석결과" },
  { id: "competition", label: "경쟁 환경" },
  { id: "public-data", label: "데이터 근거" },
];

export interface MarketNode {
  nodeId: string;
  parentSubmarketId: string;
  type: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceId: string | null;
}

export interface Submarket {
  parentMarketId: string;
  submarketId: string;
  name: string;
  administrativeDong: string[] | null;
  nodes: MarketNode[];
  status: string;
}

export interface Market {
  marketId: string;
  name: string;
  gu: string;
  bakeryMarketImportance: string;
  researchPriority: string;
  geometryStatus: string;
  submarkets: Submarket[];
}

export interface District {
  districtId: string;
  name: string;
  markets: Market[];
}

export interface MarketHierarchy {
  schemaVersion: string;
  checkedAt: string;
  city: string;
  districts: District[];
}

const priorityStyles: Record<string, string> = {
  S: "border-amber-200 bg-amber-50 text-amber-800",
  A: "border-blue-200 bg-blue-50 text-blue-700",
  B: "border-emerald-200 bg-emerald-50 text-emerald-700",
  C: "border-slate-200 bg-slate-100 text-slate-700",
  D: "border-slate-200 bg-white text-slate-500",
};

const nodeTypeLabels: Record<string, string> = {
  anchor: "핵심 거점",
  hospital: "병원",
  intersection: "교차로",
  office: "업무시설",
  park_water_access: "공원·수변 접근",
  shopping: "쇼핑",
  station: "역세권",
  street: "거리",
  tourism_culture: "관광·문화",
  traditional_market: "전통시장",
  university: "대학",
};

function includesQuery(value: string | null, query: string) {
  return value?.toLocaleLowerCase("ko-KR").includes(query) ?? false;
}

function boundaryLabel(status: string) {
  if (status === "validated" || status === "confirmed") {
    return "경계 확인됨";
  }

  if (status === "draft" || status === "estimated") {
    return "추정 경계";
  }

  return "경계 확인 필요";
}

function BoundaryStatus({ status }: { status: string }) {
  const label = boundaryLabel(status);
  const isValidated = label === "경계 확인됨";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
        isValidated
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      <span aria-hidden="true">{isValidated ? "●" : "!"}</span>
      {label}
      <span className="font-mono text-[10px] opacity-65">{status}</span>
    </span>
  );
}

function GradeBadge({ label, value }: { label: string; value: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${
        priorityStyles[value] ?? priorityStyles.D
      }`}
    >
      {label} {value}
    </span>
  );
}

function requestStatusLabel(status: MarketAnalysisContext["kakaoNearby"]["status"]) {
  if (status === "success") return "조회 성공";
  if (status === "error") return "조회 실패 · 재확인 필요";
  if (status === "loading") return "조회 중";
  return "조회 전";
}

function sameAnalysisContext(
  current: MarketAnalysisContext | null,
  next: MarketAnalysisContext,
) {
  if (!current) return false;
  // Context snapshots contain only serializable facts. Compare their values so a
  // new object identity alone cannot feed child effects back into parent state.
  return JSON.stringify(current) === JSON.stringify(next);
}

function CurrentAnalysisEvidence({ context }: { context: MarketAnalysisContext }) {
  const target = context.target;
  if (!target) return null;
  const related = context.officialMarkets.relatedMarkets ?? [];
  const inside = related.filter((market) => market.relation === "INSIDE");
  const overlaps = related.filter((market) => market.relation === "RADIUS_OVERLAP");
  const manual = context.officialMarkets.manuallySelected;
  const statistics = context.publicData.selectedOfficialMarketData;
  const presentation = buildMarketSummaryPresentation(context, "staff");
  const statisticsMarket = statistics?.officialMarketName ?? manual?.marketName ?? "미선택";
  const referencePeriod = statistics?.referencePeriod ?? "미확인";
  const sourceStatus = (name: string) => presentation.status === "ready"
    ? presentation.sources.find((source) => source.name === name)?.status ?? "자료 확인 필요"
    : "자료 확인 필요";

  return (
    <section aria-label="현재 분석 근거" className="panel-card p-5 md:p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">현재 상담 분석 근거</p>
        <h3 className="mt-2 text-xl font-bold text-slate-950">분석 기준 위치 · {target.confirmedAddress ?? "지도에서 선택한 위치"}</h3>
        <p className="mt-1 text-sm text-slate-600">지도 선택 · 반경 {target.executedRadiusMeters}m</p>
      </div>

      <dl className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-xs font-semibold text-slate-500">현재 관련 공식상권</dt>
          <dd className="mt-1 text-sm font-bold text-slate-900">내부 {inside.length}개 · 반경 교차 {overlaps.length}개</dd>
          <dd className="mt-1 text-xs leading-5 text-slate-600">{[...inside, ...overlaps].map((market) => market.marketName).join(" · ") || "확인된 관계 없음"}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-xs font-semibold text-slate-500">실행 FRAMEONE Context</dt>
          <dd className="mt-1 text-sm font-bold text-slate-900">{context.frameone.selectedMarketName ?? "주요상권 미선택"}</dd>
          <dd className="mt-1 text-xs text-slate-600">선택 세부상권 {context.frameone.selectedSubmarketName ?? "전체"}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-xs font-semibold text-slate-500">통계 기준 공식상권</dt>
          <dd className="mt-1 text-sm font-bold text-slate-900">{statisticsMarket}</dd>
          <dd className="mt-1 text-xs text-slate-600">SALES/STORES 기준분기 {referencePeriod}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-xs font-semibold text-slate-500">수동선택 / 공간관계</dt>
          <dd className="mt-1 text-sm font-bold text-slate-900">{manual ? `${manual.marketName} · manual` : "수동선택 없음"}</dd>
          <dd className="mt-1 text-xs text-slate-600">{manual?.spatialRelation?.relation ?? "공간관계 미확인"}</dd>
        </div>
      </dl>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Kakao 장소검색", "Kakao", requestStatusLabel(context.kakaoNearby.status)],
          ["서울시 공식상권", "서울시 경계", requestStatusLabel(context.officialMarkets.status)],
          ["SALES", "SRC-SEOUL-SALES", sourceStatus("서울시 SALES")],
          ["STORES", "SRC-SEOUL-STORES", sourceStatus("서울시 STORES")],
        ].map(([name, source, status]) => (
          <div key={name} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-bold text-slate-900">{name}</p>
            <p className="mt-1 break-all font-mono text-[10px] text-slate-500">{source}</p>
            <p className="mt-1 text-xs font-semibold text-slate-700">{status}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MarketAreaAnalysisSummary({
  snapshot,
  onEditConditions,
}: {
  snapshot: MarketAreaAnalysisSnapshot | null;
  onEditConditions: () => void;
}) {
  if (!snapshot) return (
    <section aria-label="권역 진단" className="panel-card border-dashed p-5">
      <h2 className="text-base font-bold text-slate-900">권역 진단</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">먼저 분석 설정에서 FRAMEONE 주요상권을 선택하고 권역 분석을 실행해 주세요.</p>
    </section>
  );

  return (
    <section aria-label="FRAMEONE 권역 진단" className="panel-card overflow-hidden">
      <header className="border-b border-blue-100 bg-blue-50 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">MARKET_AREA</p>
            <h2 className="mt-2 text-xl font-bold text-slate-950">{snapshot.marketName} 권역 진단</h2>
            <p className="mt-1 text-sm text-slate-600">FRAMEONE 주요상권 · {snapshot.marketName}</p>
          </div>
          <button type="button" onClick={onEditConditions} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700">분석조건 변경</button>
        </div>
      </header>
      <div className="p-5">
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[["FRAMEONE 주요상권", snapshot.marketName], ["자치구", snapshot.district], ["포함 Submarket", `${snapshot.submarketCount}개`], ["포함 Node", `${snapshot.nodeCount}개`]].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm font-bold text-slate-900">{value}</dd></div>
          ))}
        </dl>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">상세 소비·생활인구 분석은 데이터 연결 후 제공</p>
          <p className="mt-1 text-xs leading-5 text-amber-800">서울시 공식상권 통계, Kakao 검색결과 또는 겹치는 공간단위를 FRAMEONE 권역 전체 값으로 합산하지 않습니다.</p>
        </div>
        {snapshot.geometryStatus === "text_only" ? <p className="mt-3 text-xs text-slate-500">FRAMEONE 권역 geometry 미확인 · 지도 Polygon을 생성하거나 서울시 공식상권 경계로 대체하지 않습니다.</p> : null}
      </div>
    </section>
  );
}

export default function MarketsExplorer({
  hierarchy,
}: {
  hierarchy: MarketHierarchy;
}) {
  const initialDistrict = hierarchy.districts[0];
  const initialMarket = initialDistrict?.markets[0];
  const [query, setQuery] = useState("");
  const [openDistrictIds, setOpenDistrictIds] = useState<Set<string>>(
    () => new Set(initialDistrict ? [initialDistrict.districtId] : []),
  );
  const [selectedMarketId, setSelectedMarketId] = useState(
    initialMarket?.marketId ?? "",
  );
  const [selectedSubmarketId, setSelectedSubmarketId] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] =
    useState<MarketsWorkspaceTab>("briefing");
  const [analysisContext, setAnalysisContext] = useState<MarketAnalysisContext | null>(null);
  const [kakaoNearbySource, setKakaoNearbySource] = useState<KakaoNearbySearchState>({
    status: "idle",
    response: null,
    error: null,
    analysisRunId: null,
    completedAt: null,
  });
  const [analysisConditionsRequest, setAnalysisConditionsRequest] = useState(0);
  const [analysisMode, setAnalysisMode] = useState<MarketAnalysisMode>("point-detail");
  const [marketAreaAnalysis, setMarketAreaAnalysis] = useState<MarketAreaAnalysisSnapshot | null>(null);
  const handleAnalysisContextChange = useCallback((nextContext: MarketAnalysisContext) => {
    setAnalysisContext((current) => {
      if (current?.target && !nextContext.target) return current;
      return sameAnalysisContext(current, nextContext) ? current : nextContext;
    });
  }, []);
  const handleKakaoNearbySourceChange = useCallback((nextState: KakaoNearbySearchState) => {
    setKakaoNearbySource((current) =>
      JSON.stringify(current) === JSON.stringify(nextState) ? current : nextState,
    );
  }, []);

  const allMarkets = useMemo(
    () => hierarchy.districts.flatMap((district) => district.markets),
    [hierarchy.districts],
  );

  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");

  const filteredDistricts = useMemo(() => {
    if (!normalizedQuery) {
      return hierarchy.districts;
    }

    return hierarchy.districts
      .map((district) => {
        const districtMatches =
          includesQuery(district.name, normalizedQuery) ||
          includesQuery(district.districtId, normalizedQuery);
        const markets = districtMatches
          ? district.markets
          : district.markets.filter(
              (market) =>
                includesQuery(market.name, normalizedQuery) ||
                includesQuery(market.marketId, normalizedQuery) ||
                includesQuery(market.gu, normalizedQuery),
            );

        return { ...district, markets };
      })
      .filter((district) => district.markets.length > 0);
  }, [hierarchy.districts, normalizedQuery]);

  const matchedMarketCount = filteredDistricts.reduce(
    (count, district) => count + district.markets.length,
    0,
  );

  const selectedMarket = allMarkets.find(
    (market) => market.marketId === selectedMarketId,
  );
  const selectedDistrict = hierarchy.districts.find((district) =>
    district.markets.some((market) => market.marketId === selectedMarketId),
  );
  const selectedSubmarket = selectedMarket?.submarkets.find(
    (submarket) => submarket.submarketId === selectedSubmarketId,
  );
  const visibleNodes = selectedMarket
    ? selectedSubmarket
      ? selectedSubmarket.nodes
      : selectedMarket.submarkets.flatMap((submarket) => submarket.nodes)
    : [];
  const selectedMarketSpatialSummary = selectedMarket
    ? {
        districtId: selectedDistrict?.districtId ?? "",
        marketId: selectedMarket.marketId,
        marketName: selectedMarket.name,
        district: selectedMarket.gu,
        geometryStatus: selectedMarket.geometryStatus,
        geometryAvailability:
          selectedMarket.geometryStatus === "text_only" ? "none" : null,
        verificationStage: selectedMarket.geometryStatus,
        reviewStatus: null,
        submarketCount: selectedMarket.submarkets.length,
        nodeCount: selectedMarket.submarkets.flatMap(
          (submarket) => submarket.nodes,
        ).length,
      }
    : null;
  const selectedSubmarketSpatialSummary = selectedSubmarket
    ? {
        submarketId: selectedSubmarket.submarketId,
        submarketName: selectedSubmarket.name,
        geometryStatus: selectedSubmarket.status,
      }
    : null;

  function toggleDistrict(districtId: string) {
    setOpenDistrictIds((current) => {
      const next = new Set(current);
      if (next.has(districtId)) {
        next.delete(districtId);
      } else {
        next.add(districtId);
      }
      return next;
    });
  }

  function selectMarket(market: Market) {
    setSelectedMarketId(market.marketId);
    setSelectedSubmarketId(null);
  }

  const marketSelector = (
    <label className="block min-w-0 text-xs font-bold text-slate-700">
      FRAMEONE 주요상권
      <select
        value={selectedMarketId}
        onChange={(event) => {
          const market = allMarkets.find((item) => item.marketId === event.target.value);
          if (market) selectMarket(market);
        }}
        className="input mt-2 min-h-11 min-w-0"
      >
        {!selectedMarket ? <option value="">주요상권을 선택하세요</option> : null}
        {hierarchy.districts.map((district) => (
          <optgroup key={district.districtId} label={district.name}>
            {district.markets.map((market) => <option key={market.marketId} value={market.marketId}>{market.name}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );
  const pointContextStale = Boolean(analysisContext?.target && (
    analysisContext.frameone.selectedMarketId !== (selectedMarket?.marketId ?? null) ||
    analysisContext.frameone.selectedSubmarketId !== (selectedSubmarket?.submarketId ?? null)
  ));
  const basicLocationViewModel = useMemo(() => {
    const snapshot = analysisContext?.runSnapshot ?? null;
    if (
      snapshot === null ||
      analysisContext?.analysisRunId !== snapshot.analysisRunId
    ) {
      return null;
    }

    const runDistrict = hierarchy.districts.find((district) =>
      district.districtId === snapshot.frameone.districtId,
    );
    const runMarket = runDistrict?.markets.find((market) =>
      market.marketId === snapshot.frameone.marketId,
    );
    const runSubmarket = snapshot.frameone.submarketId
      ? runMarket?.submarkets.find((submarket) =>
          submarket.submarketId === snapshot.frameone.submarketId,
        )
      : null;
    const runNode = snapshot.frameone.nodeId
      ? runSubmarket?.nodes.find((node) => node.nodeId === snapshot.frameone.nodeId)
      : null;
    const officialLayer = getSpatialLayerDefinition("seoul-official-markets");
    if (
      !runDistrict ||
      !runMarket ||
      (snapshot.frameone.submarketId && !runSubmarket) ||
      (snapshot.frameone.nodeId && !runNode) ||
      !officialLayer?.geometryVersion
    ) {
      return null;
    }

    const targetResults = adaptAnalysisTargetResults(snapshot);
    const frameoneResults = adaptFrameoneCanonicalResults({
      snapshot,
      district: runDistrict,
      market: runMarket,
      submarket: runSubmarket,
      node: runNode,
      hierarchyVersion: hierarchy.schemaVersion,
      hierarchyCheckedAt: hierarchy.checkedAt,
    });
    const blockedResults = buildGeometryDependentBlockedResults(snapshot);
    const currentKakaoSource = kakaoNearbySource.analysisRunId === snapshot.analysisRunId
      ? kakaoNearbySource
      : {
          status: "idle" as const,
          response: null,
          error: null,
          analysisRunId: snapshot.analysisRunId,
          completedAt: null,
        };
    const kakaoResults = adaptKakaoNearbyResults({
      snapshot,
      searchState: currentKakaoSource,
      fetchedAt: currentKakaoSource.completedAt ?? snapshot.createdAt,
    }).results;
    const relationResults = adaptOfficialCommercialAreaRelationResults({
      snapshot,
      status: analysisContext.officialMarkets.status,
      results: analysisContext.officialMarkets.relatedMarkets === null
        ? null
        : [
            ...analysisContext.officialMarkets.relatedMarkets,
            ...(analysisContext.officialMarkets.unknownMarkets ?? []),
          ],
      error: analysisContext.officialMarkets.error,
      geometryVersion: officialLayer.geometryVersion,
      sourceDate: null,
      evaluatedAt:
        analysisContext.sourceCompletion.officialRelationCompletedAt ??
        snapshot.createdAt,
      relationMethodologyVersion: "official-market-spatial-relation-v1",
    });

    const officialData = analysisContext.publicData.selectedOfficialMarketData;
    const officialMarketName = officialData?.officialMarketName ??
      analysisContext.officialMarkets.manuallySelected?.marketName ?? null;
    const officialStatsResults = officialData && officialMarketName
      ? adaptOfficialMarketStatisticsResults({
          snapshot,
          officialMarketCode: officialData.officialMarketCode,
          officialMarketName,
          sales: {
            status: analysisContext.publicData.requestStatus,
            referencePeriod: officialData.referencePeriod,
            observations: officialData.sales,
            error: analysisContext.publicData.error,
            fetchedAt:
              analysisContext.sourceCompletion.officialStatsCompletedAt ??
              snapshot.createdAt,
          },
          stores: {
            status: analysisContext.publicData.requestStatus,
            referencePeriod: officialData.referencePeriod,
            observations: officialData.stores,
            error: analysisContext.publicData.error,
            fetchedAt:
              analysisContext.sourceCompletion.officialStatsCompletedAt ??
              snapshot.createdAt,
          },
          trend: {
            status: analysisContext.publicData.requestStatus,
            trend: officialData.officialTrend
              ? {
                  ...officialData.officialTrend,
                  periods: officialData.officialTrend.periods.map((period) => ({
                    ...period,
                  })),
                }
              : null,
            error: analysisContext.publicData.error,
            fetchedAt:
              analysisContext.sourceCompletion.officialStatsCompletedAt ??
              snapshot.createdAt,
          },
        })
      : [];

    const results = collectBasicLocationResults({
      analysisRunId: snapshot.analysisRunId,
      resultGroups: {
        target: targetResults,
        frameone: frameoneResults,
        blocked: blockedResults,
        kakao: kakaoResults,
        officialRelation: relationResults,
        officialStats: officialStatsResults,
      },
    });
    const displayableResults = applyBasicLocationDisplayPolicy(results, "STAFF");
    const interpretation = buildBasicLocationInterpretation({
      analysisRunId: snapshot.analysisRunId,
      results: displayableResults.map(({ result }) => result),
    });
    return buildP0BasicLocationViewModel({
      analysisRunId: snapshot.analysisRunId,
      audience: "STAFF",
      displayableResults,
      interpretation,
    });
  }, [analysisContext, hierarchy, kakaoNearbySource]);

  return (
    <div className="relative left-1/2 w-[calc(100vw-2rem)] max-w-[1600px] -translate-x-1/2 overflow-x-clip">
      <nav
        aria-label="상권분석 업무 메뉴"
        className="mb-4 flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 lg:hidden"
      >
        {WORKSPACE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            aria-current={activeTab === tab.id ? "page" : undefined}
            className={`min-h-11 shrink-0 rounded-lg px-4 py-2.5 text-sm font-bold ${
              activeTab === tab.id
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="grid items-start gap-5 lg:grid-cols-[190px_minmax(0,1fr)]">
        <aside className="panel-card sticky top-6 hidden overflow-hidden lg:block">
          <p className="border-b border-slate-200 px-4 py-3 text-xs font-bold text-slate-500">
            상권분석 업무
          </p>
          <nav aria-label="상권분석 업무 메뉴" className="space-y-1 p-2">
            {WORKSPACE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={activeTab === tab.id ? "page" : undefined}
                className={`min-h-11 w-full rounded-lg px-3 py-3 text-left text-sm font-bold ${
                  activeTab === tab.id
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 space-y-6">
      {activeTab === "briefing" ? (
        <>
      <section className="panel-card overflow-hidden bg-gradient-to-br from-white via-white to-[#FFF7ED]">
        <div className="p-5 md:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#F59E0B]">
              분석 설정
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#0B1220] md:text-3xl">
              분석 대상
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              FRAMEONE 권역 전체를 확인할지, 한 지점의 300m·500m 주변을 상세분석할지 선택하세요.
            </p>
            <div className="mt-5 inline-flex rounded-xl border border-slate-300 bg-slate-50 p-1" role="group" aria-label="분석 모드">
              {([['market-area', '권역 분석'], ['point-detail', '위치 상세분석']] as const).map(([mode, label]) => (
                <button key={mode} type="button" onClick={() => setAnalysisMode(mode)} aria-pressed={analysisMode === mode}
                  className={`min-h-11 rounded-lg px-4 text-sm font-bold ${analysisMode === mode ? "bg-slate-900 text-white shadow-sm" : "text-slate-600"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section aria-label="FRAMEONE 상권 Context" className="panel-card p-5 md:p-6">
        <div className="max-w-xl">{marketSelector}</div>
        {selectedMarket ? (
          <>
            <div className="mt-4">
              <p className="text-xs font-bold text-slate-700">FRAMEONE 하위상권</p>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="FRAMEONE 하위상권 선택">
                <button type="button" onClick={() => setSelectedSubmarketId(null)} aria-pressed={selectedSubmarketId === null}
                  className={`min-h-11 rounded-full border px-4 text-xs font-bold ${selectedSubmarketId === null ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}>전체</button>
                {selectedMarket.submarkets.map((submarket) => (
                  <button key={submarket.submarketId} type="button" onClick={() => setSelectedSubmarketId(submarket.submarketId)} aria-pressed={selectedSubmarketId === submarket.submarketId}
                    className={`min-h-11 rounded-full border px-4 text-xs font-bold ${selectedSubmarketId === submarket.submarketId ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
                    {submarket.name}
                  </button>
                ))}
              </div>
            </div>
            <article aria-label="선택 상권 기본 브리핑" className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">FRAMEONE 분석 분류</p>
              <h3 className="mt-1 text-lg font-bold text-slate-950">{selectedMarket.name}{selectedSubmarket ? ` > ${selectedSubmarket.name}` : ""} 기본 정보</h3>
              <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                {(selectedSubmarket ? [
                  ["FRAMEONE 주요상권", selectedMarket.name], ["선택 하위상권", selectedSubmarket.name], ["세부 검토단위", `Node ${selectedSubmarket.nodes.length}개`],
                ] : [
                  ["자치구", selectedMarket.gu], ["하위상권", `${selectedMarket.submarkets.length}개`], ["세부 검토단위", `Node ${selectedMarket.submarkets.flatMap((submarket) => submarket.nodes).length}개`],
                ]).map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-white p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm font-bold text-slate-900">{value}</dd></div>
                ))}
              </dl>
              <p className="mt-4 text-xs leading-5 text-slate-600">
                <span className="font-bold text-slate-800">실제 하위상권</span> · {selectedMarket.submarkets.map((submarket) => submarket.name).join(" · ") || "등록된 하위상권 없음"}
              </p>
              <div className="mt-4">
                <p className="text-xs font-bold text-slate-700">현재 사용 가능한 분석</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-blue-100 px-3 py-1.5 text-blue-800">위치 상세분석</span>
                  <span className="rounded-full bg-blue-100 px-3 py-1.5 text-blue-800">Kakao 경쟁환경 · 위치 분석 후</span>
                  <span className="rounded-full bg-blue-100 px-3 py-1.5 text-blue-800">서울 공식상권 통계·Trend · 참고상권 선택 후</span>
                </div>
                <p className="mt-3 text-xs font-bold text-slate-700">아직 연결되지 않은 데이터</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-slate-200 px-3 py-1.5 text-slate-600">생활인구</span>
                  <span className="rounded-full bg-slate-200 px-3 py-1.5 text-slate-600">상세 소비분석</span>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">검증된 FRAMEONE geometry가 없어 지도 경계를 생성하지 않습니다. 아래 파란 경계는 FRAMEONE 하위상권이 아닌 서울시 공식통계 경계입니다.</p>
              {pointContextStale ? <p role="status" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900">상권 Context가 변경되었습니다. 기존 위치 상세분석은 실행 당시 Context로 보존되며, 현재 선택을 반영하려면 같은 위치를 다시 분석해 주세요.</p> : null}
            </article>
          </>
        ) : null}
      </section>

      {analysisMode === "point-detail" ? <nav
        aria-label="상권분석 사용 순서"
        className="panel-card px-4 py-3 md:px-5"
      >
        <ol className="grid gap-2 text-xs font-bold text-slate-700 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
          {[
            ["1", "FRAMEONE 주요상권 선택"],
            ["2", "지도 분석지점 선택"],
            ["3", "기초입지 분석결과 확인"],
          ].map(([step, label], index) => (
            <li key={step} className="contents">
              <span className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] text-white">
                  {step}
                </span>
                {label}
              </span>
              {index < 2 ? (
                <span
                  aria-hidden="true"
                  className="hidden text-center text-slate-300 md:block"
                >
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </nav> : null}
      {analysisMode === "market-area" ? (
        <section aria-label="권역 분석 설정" className="panel-card p-5 md:p-6">
          {marketAreaAnalysis ? (
            <div aria-label="현재 권역 분석" className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-xs font-bold text-blue-700">현재 분석</p>
              <p className="mt-1 text-base font-bold text-slate-950">{marketAreaAnalysis.marketName} 권역 분석</p>
              <p className="mt-1 text-xs text-slate-600">FRAMEONE 주요상권 · {marketAreaAnalysis.marketName}</p>
            </div>
          ) : null}
          <h3 className="text-base font-bold text-slate-950">FRAMEONE 권역 분석</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">선택한 FRAMEONE 주요상권의 전체 특징을 확인합니다.</p>
          {selectedMarket ? (
            <>
              <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                {[["자치구", selectedMarket.gu], ["포함 Submarket", `${selectedMarket.submarkets.length}개`], ["포함 Node", `${selectedMarket.submarkets.flatMap((submarket) => submarket.nodes).length}개`]].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm font-bold text-slate-900">{value}</dd></div>
                ))}
              </dl>
              <p className="mt-3 text-xs leading-5 text-slate-500">FRAMEONE 권역 geometry가 확인되지 않아 지도 Polygon을 표시하지 않습니다.</p>
              <button type="button" onClick={() => {
                setMarketAreaAnalysis({
                  analysisType: "MARKET_AREA",
                  marketId: selectedMarket.marketId,
                  marketName: selectedMarket.name,
                  district: selectedMarket.gu,
                  submarketCount: selectedMarket.submarkets.length,
                  nodeCount: selectedMarket.submarkets.flatMap((submarket) => submarket.nodes).length,
                  geometryStatus: selectedMarket.geometryStatus,
                });
                setActiveTab("market-map");
              }} className="mt-4 min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white">
                기초입지 분석결과 보기
              </button>
            </>
          ) : null}
        </section>
      ) : null}
        </>
      ) : (
        <section className="panel-card px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">상권분석 업무</p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">
            {WORKSPACE_TABS.find((tab) => tab.id === activeTab)?.label}
          </h2>
        </section>
      )}

      {activeTab === "market-map" ? (
        analysisMode === "market-area" ? <MarketAreaAnalysisSummary snapshot={marketAreaAnalysis} onEditConditions={() => setActiveTab("briefing")} /> :
          <MarketAnalysisSummary
            viewModel={basicLocationViewModel}
            contextStale={pointContextStale}
            onEditConditions={() => {
              setActiveTab("briefing");
              setAnalysisConditionsRequest((request) => request + 1);
            }}
          />
      ) : null}

      {activeTab === "public-data" && (analysisMode === "market-area" || !analysisContext?.target) ? (
        <section className="panel-card border-dashed p-5 text-sm leading-6 text-slate-600">
          {analysisMode === "market-area" ? "권역 단위 공식 소비·생활인구 데이터는 연결 전입니다. 현재 권역 분석은 FRAMEONE 계층 메타정보만 사용합니다." : "분석 실행 후 데이터 근거를 확인할 수 있습니다. 먼저 분석 설정에서 지도 분석지점을 선택하고 실행해 주세요."}
        </section>
      ) : null}

      {activeTab === "public-data" && analysisMode === "point-detail" && analysisContext?.target ? (
        <CurrentAnalysisEvidence context={analysisContext} />
      ) : null}

      {activeTab === "competition" && analysisMode === "market-area" ? <section className="panel-card border-dashed p-5 text-sm text-slate-600">Kakao 경쟁환경은 위치 상세분석의 실행 지점과 반경을 기준으로 제공합니다.</section> : null}

      <div className={activeTab === "market-map" || (activeTab === "public-data" && !analysisContext?.target) ? "hidden" : ""}>
      <MarketSpatialViewer
        selectedMarket={selectedMarketSpatialSummary}
        selectedSubmarket={selectedSubmarketSpatialSummary}
        activeTab={activeTab}
        onOpenMarketMap={() => setActiveTab("briefing")}
        onAnalysisContextChange={handleAnalysisContextChange}
        onKakaoNearbySourceChange={handleKakaoNearbySourceChange}
        analysisConditionsRequest={analysisConditionsRequest}
        onOpenAnalysisSummary={() => setActiveTab("market-map")}
        analysisSummary={null}
        pointSelectionEnabled={analysisMode === "point-detail"}
        marketSelector={null}
      />
      </div>

      {activeTab === "public-data" ? (
      <details className="panel-card overflow-hidden">
        <summary className="cursor-pointer px-5 py-4 text-sm font-bold text-slate-800">
          전체 FRAMEONE 상권 계층 · 내부 상세정보
        </summary>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.4fr)]">
        <aside
          id="frameone-market-selector"
          className="panel-card overflow-hidden lg:sticky lg:top-6"
        >
          <div className="border-b border-slate-200 p-4">
            <label
              htmlFor="market-search"
              className="text-xs font-bold text-slate-700"
            >
              상권 검색
            </label>
            <input
              id="market-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="상권명 · 자치구 · Market ID"
              className="input mt-2"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                자치구 {filteredDistricts.length}개 · 주요상권 {matchedMarketCount}개
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setOpenDistrictIds(
                      new Set(hierarchy.districts.map((district) => district.districtId)),
                    )
                  }
                  disabled={Boolean(normalizedQuery)}
                  className="rounded-md px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  전체 열기
                </button>
                <button
                  type="button"
                  onClick={() => setOpenDistrictIds(new Set())}
                  disabled={Boolean(normalizedQuery)}
                  className="rounded-md px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  전체 접기
                </button>
              </div>
            </div>
          </div>

          <div className="max-h-[68vh] overflow-y-auto p-2">
            {filteredDistricts.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm font-semibold text-slate-700">
                  검색 결과가 없습니다.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  상권명, 자치구명 또는 Market ID를 다시 확인해주세요.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredDistricts.map((district) => {
                  const isOpen = normalizedQuery
                    ? true
                    : openDistrictIds.has(district.districtId);
                  const regionId = `district-${district.districtId}`;

                  return (
                    <section
                      key={district.districtId}
                      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                    >
                      <button
                        type="button"
                        onClick={() => toggleDistrict(district.districtId)}
                        aria-expanded={isOpen}
                        aria-controls={regionId}
                        disabled={Boolean(normalizedQuery)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-slate-50 disabled:cursor-default"
                      >
                        <span>
                          <span className="block text-sm font-bold text-[#0B1220]">
                            {district.name}
                          </span>
                          <span className="mt-0.5 block font-mono text-[10px] text-slate-400">
                            {district.districtId}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            {district.markets.length}
                          </span>
                          <span className="w-3 text-center text-sm text-slate-400" aria-hidden="true">
                            {isOpen ? "−" : "+"}
                          </span>
                        </span>
                      </button>

                      {isOpen ? (
                        <div id={regionId} className="border-t border-slate-100 p-1.5">
                          {district.markets.map((market) => {
                            const isSelected = market.marketId === selectedMarketId;

                            return (
                              <button
                                type="button"
                                key={market.marketId}
                                onClick={() => selectMarket(market)}
                                aria-pressed={isSelected}
                                className={`mb-1 w-full rounded-lg border px-3 py-2.5 text-left transition-colors last:mb-0 ${
                                  isSelected
                                    ? "border-[#2563EB] bg-blue-50"
                                    : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                                }`}
                              >
                                <span className="flex items-start justify-between gap-2">
                                  <span className="text-sm font-semibold text-[#0B1220]">
                                    {market.name}
                                  </span>
                                  <span className="flex shrink-0 gap-1">
                                    <GradeBadge
                                      label="조사"
                                      value={market.researchPriority}
                                    />
                                    <GradeBadge
                                      label="베이커리"
                                      value={market.bakeryMarketImportance}
                                    />
                                  </span>
                                </span>
                                <span className="mt-1 block break-all font-mono text-[10px] text-slate-500">
                                  {market.marketId}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <section className="space-y-5" aria-live="polite">
          {selectedMarket ? (
            <>
              <article className="panel-card p-5 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2563EB]">
                      선택한 FRAMEONE 주요상권
                    </p>
                    <h3 className="mt-2 text-2xl font-bold text-[#0B1220]">
                      {selectedMarket.name}
                    </h3>
                    <p className="mt-1 break-all font-mono text-xs text-slate-500">
                      {selectedMarket.marketId}
                    </p>
                  </div>
                  <BoundaryStatus status={selectedMarket.geometryStatus} />
                </div>

                <dl className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["자치구", selectedMarket.gu],
                    ["조사 우선순위", selectedMarket.researchPriority],
                    ["베이커리 중요도", selectedMarket.bakeryMarketImportance],
                    ["세부상권", `${selectedMarket.submarkets.length}개`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-slate-50 p-3">
                      <dt className="text-[11px] font-semibold text-slate-500">
                        {label}
                      </dt>
                      <dd className="mt-1 text-sm font-bold text-[#0B1220]">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>

                {boundaryLabel(selectedMarket.geometryStatus) !== "경계 확인됨" ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-sm font-semibold text-amber-900">
                      경계 확인 필요
                    </p>
                    <p className="mt-1 text-xs leading-5 text-amber-800">
                      현재 지도 경계가 확인되지 않았습니다. 확인되지 않은 지도 경계나
                      좌표는 이 화면에서 생성하거나 사용하지 않습니다.
                    </p>
                  </div>
                ) : null}
              </article>

              <article className="panel-card p-5 md:p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                      세부상권
                    </p>
                    <h3 className="mt-1 text-lg font-bold text-[#0B1220]">
                      세부상권 선택
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSubmarketId(null)}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                      selectedSubmarketId === null
                        ? "border-[#2563EB] bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    주요상권 전체 지점
                  </button>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {selectedMarket.submarkets.map((submarket) => {
                    const isSelected = submarket.submarketId === selectedSubmarketId;

                    return (
                      <button
                        type="button"
                        key={submarket.submarketId}
                        onClick={() => setSelectedSubmarketId(submarket.submarketId)}
                        aria-pressed={isSelected}
                        className={`rounded-xl border p-3 text-left ${
                          isSelected
                            ? "border-[#2563EB] bg-blue-50"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-sm font-bold text-[#0B1220]">
                            {submarket.name}
                          </span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 shadow-sm">
                            지점 {submarket.nodes.length}
                          </span>
                        </span>
                        <span className="mt-1 block break-all font-mono text-[10px] text-slate-500">
                          {submarket.submarketId}
                        </span>
                        <span className="mt-2 inline-flex">
                          <BoundaryStatus status={submarket.status} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </article>

              <article className="panel-card p-5 md:p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                      현장 확인 지점
                    </p>
                    <h3 className="mt-1 text-lg font-bold text-[#0B1220]">
                      {selectedSubmarket
                        ? `${selectedSubmarket.name} 현장 확인 지점`
                        : `${selectedMarket.name} 전체 현장 확인 지점`}
                    </h3>
                  </div>
                  <p className="text-sm font-bold text-slate-700">
                    {visibleNodes.length}개
                  </p>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {visibleNodes.map((node) => {
                    const hasCoordinates =
                      node.latitude !== null && node.longitude !== null;

                    return (
                      <div
                        key={node.nodeId}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-bold text-[#0B1220]">
                            {node.name}
                          </p>
                          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 shadow-sm">
                            {nodeTypeLabels[node.type] ?? node.type}
                          </span>
                        </div>
                        <p className="mt-1 break-all font-mono text-[10px] text-slate-500">
                          {node.nodeId}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                          <span>{node.address ?? "주소 미수집"}</span>
                          <span>
                            {hasCoordinates
                              ? `${node.latitude}, ${node.longitude}`
                              : "좌표 미수집"}
                          </span>
                          <span>{node.sourceId ?? "출처 ID 미수집"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            </>
          ) : (
            <div className="panel-card p-10 text-center text-sm text-slate-500">
              표시할 주요상권이 없습니다.
            </div>
          )}
        </section>
      </div>
      </details>
      ) : null}

        </div>
      </div>
    </div>
  );
}
