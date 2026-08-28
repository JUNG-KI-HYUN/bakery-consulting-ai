"use client";

import { useMemo, useState } from "react";
import MarketSpatialViewer from "./MarketSpatialViewer";

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

  const allMarkets = useMemo(
    () => hierarchy.districts.flatMap((district) => district.markets),
    [hierarchy.districts],
  );

  const totals = useMemo(() => {
    const submarkets = allMarkets.flatMap((market) => market.submarkets);
    const nodes = submarkets.flatMap((submarket) => submarket.nodes);

    return {
      districts: hierarchy.districts.length,
      markets: allMarkets.length,
      submarkets: submarkets.length,
      nodes: nodes.length,
    };
  }, [allMarkets, hierarchy.districts.length]);

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
  const selectedSubmarket = selectedMarket?.submarkets.find(
    (submarket) => submarket.submarketId === selectedSubmarketId,
  );
  const visibleNodes = selectedMarket
    ? selectedSubmarket
      ? selectedSubmarket.nodes
      : selectedMarket.submarkets.flatMap((submarket) => submarket.nodes)
    : [];

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

  return (
    <div className="space-y-6">
      <section className="panel-card overflow-hidden bg-gradient-to-br from-white via-white to-[#FFF7ED]">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.35fr_1fr] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#F59E0B]">
              Seoul market database · v{hierarchy.schemaVersion}
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#0B1220] md:text-3xl">
              서울 상권 구조 탐색
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              상담 전에 자치구부터 주요상권, 세부상권과 현장 확인 Node까지
              한 흐름으로 살펴봅니다. 현재 단계에서는 확인된 계층 정보만
              사용합니다.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              기준일 {hierarchy.checkedAt} · {hierarchy.city}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
            {[
              ["자치구", totals.districts],
              ["주요상권", totals.markets],
              ["Submarket", totals.submarkets],
              ["Node", totals.nodes],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-slate-200 bg-white/85 px-4 py-3"
              >
                <dt className="text-[11px] font-semibold text-slate-500">
                  {label}
                </dt>
                <dd className="mt-1 text-2xl font-bold text-[#0B1220]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.4fr)]">
        <aside className="panel-card overflow-hidden lg:sticky lg:top-6">
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
                      Selected market
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
                    ["Submarket", `${selectedMarket.submarkets.length}개`],
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
                      현재 데이터 상태는 {selectedMarket.geometryStatus}입니다. 확인되지 않은
                      Polygon이나 좌표는 이 화면에서 생성하거나 사용하지 않습니다.
                    </p>
                  </div>
                ) : null}
              </article>

              <article className="panel-card p-5 md:p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                      Submarkets
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
                    Market 전체 Node
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
                            Node {submarket.nodes.length}
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
                      Connected nodes
                    </p>
                    <h3 className="mt-1 text-lg font-bold text-[#0B1220]">
                      {selectedSubmarket
                        ? `${selectedSubmarket.name} Node`
                        : `${selectedMarket.name} 전체 Node`}
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

      <MarketSpatialViewer
        selectedMarket={
          selectedMarket
            ? {
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
            : null
        }
        selectedSubmarket={
          selectedSubmarket
            ? {
                submarketId: selectedSubmarket.submarketId,
                submarketName: selectedSubmarket.name,
                geometryStatus: selectedSubmarket.status,
              }
            : null
        }
      />
    </div>
  );
}
