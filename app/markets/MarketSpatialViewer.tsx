"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getSpatialLayerDefinition,
  SPATIAL_LAYER_REGISTRY,
  type SpatialLayerDefinition,
  type SpatialLayerId,
} from "./spatial-layer-registry";

type Position = [number, number];
type LinearRing = Position[];
type PolygonCoordinates = LinearRing[];

interface PolygonGeometry {
  type: "Polygon";
  coordinates: PolygonCoordinates;
}

interface MultiPolygonGeometry {
  type: "MultiPolygon";
  coordinates: PolygonCoordinates[];
}

type ViewerGeometry = PolygonGeometry | MultiPolygonGeometry;

interface ViewerFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: ViewerGeometry;
    properties: Record<string, unknown>;
  }>;
}

interface Bounds {
  minimumLongitude: number;
  minimumLatitude: number;
  maximumLongitude: number;
  maximumLatitude: number;
}

interface LoadedSpatialLayer {
  collection: ViewerFeatureCollection;
  bounds: Bounds;
  loadedInMs: number;
}

type LoadedLayerMap = Partial<Record<SpatialLayerId, LoadedSpatialLayer>>;

export interface SelectedMarketSpatialSummary {
  marketId: string;
  marketName: string;
  geometryStatus: string;
  submarketCount: number;
  nodeCount: number;
}

export interface SelectedSubmarketSpatialSummary {
  submarketId: string;
  submarketName: string;
  geometryStatus: string;
}

function isPosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

function isLinearRing(value: unknown): value is LinearRing {
  return Array.isArray(value) && value.length >= 4 && value.every(isPosition);
}

function isPolygonCoordinates(value: unknown): value is PolygonCoordinates {
  return Array.isArray(value) && value.length > 0 && value.every(isLinearRing);
}

function isViewerGeometry(value: unknown): value is ViewerGeometry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const geometry = value as { type?: unknown; coordinates?: unknown };
  if (geometry.type === "Polygon") {
    return isPolygonCoordinates(geometry.coordinates);
  }

  return (
    geometry.type === "MultiPolygon" &&
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length > 0 &&
    geometry.coordinates.every(isPolygonCoordinates)
  );
}

function parseFeatureCollection(value: unknown): ViewerFeatureCollection {
  if (!value || typeof value !== "object") {
    throw new Error("GeoJSON 응답이 객체가 아닙니다.");
  }

  const collection = value as {
    type?: unknown;
    features?: unknown;
  };
  if (
    collection.type !== "FeatureCollection" ||
    !Array.isArray(collection.features) ||
    !collection.features.every((feature) => {
      if (!feature || typeof feature !== "object") {
        return false;
      }
      const candidate = feature as {
        type?: unknown;
        geometry?: unknown;
        properties?: unknown;
      };
      return (
        candidate.type === "Feature" &&
        isViewerGeometry(candidate.geometry) &&
        Boolean(candidate.properties) &&
        typeof candidate.properties === "object"
      );
    })
  ) {
    throw new Error("렌더링 가능한 Polygon GeoJSON 형식이 아닙니다.");
  }

  return collection as ViewerFeatureCollection;
}

function polygonsForGeometry(geometry: ViewerGeometry) {
  return geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates;
}

function calculateBounds(collection: ViewerFeatureCollection): Bounds {
  const bounds: Bounds = {
    minimumLongitude: Number.POSITIVE_INFINITY,
    minimumLatitude: Number.POSITIVE_INFINITY,
    maximumLongitude: Number.NEGATIVE_INFINITY,
    maximumLatitude: Number.NEGATIVE_INFINITY,
  };

  for (const feature of collection.features) {
    for (const polygon of polygonsForGeometry(feature.geometry)) {
      for (const ring of polygon) {
        for (const [longitude, latitude] of ring) {
          bounds.minimumLongitude = Math.min(bounds.minimumLongitude, longitude);
          bounds.minimumLatitude = Math.min(bounds.minimumLatitude, latitude);
          bounds.maximumLongitude = Math.max(bounds.maximumLongitude, longitude);
          bounds.maximumLatitude = Math.max(bounds.maximumLatitude, latitude);
        }
      }
    }
  }

  if (!Number.isFinite(bounds.minimumLongitude)) {
    throw new Error("GeoJSON에서 유효한 EPSG:4326 좌표를 찾지 못했습니다.");
  }

  return bounds;
}

function mergeBounds(layers: LoadedSpatialLayer[]): Bounds | null {
  if (layers.length === 0) {
    return null;
  }

  return layers.reduce<Bounds>(
    (merged, layer) => ({
      minimumLongitude: Math.min(
        merged.minimumLongitude,
        layer.bounds.minimumLongitude,
      ),
      minimumLatitude: Math.min(
        merged.minimumLatitude,
        layer.bounds.minimumLatitude,
      ),
      maximumLongitude: Math.max(
        merged.maximumLongitude,
        layer.bounds.maximumLongitude,
      ),
      maximumLatitude: Math.max(
        merged.maximumLatitude,
        layer.bounds.maximumLatitude,
      ),
    }),
    { ...layers[0].bounds },
  );
}

function layerStatusLabel(layer: SpatialLayerDefinition) {
  return layer.geometryAvailable
    ? `${layer.status} · 공식 참조 geometry`
    : `${layer.status} · 공간데이터 없음`;
}

function formatMilliseconds(value: number | null) {
  if (value === null) {
    return "-";
  }
  return value >= 1000 ? `${(value / 1000).toFixed(2)}초` : `${value.toFixed(1)}ms`;
}

export default function MarketSpatialViewer({
  selectedMarket,
  selectedSubmarket,
}: {
  selectedMarket: SelectedMarketSpatialSummary | null;
  selectedSubmarket: SelectedSubmarketSpatialSummary | null;
}) {
  const defaultVisibleLayerIds = useMemo(
    () =>
      new Set<SpatialLayerId>(
        SPATIAL_LAYER_REGISTRY.filter((layer) => layer.defaultVisible).map(
          (layer) => layer.layerId,
        ),
      ),
    [],
  );
  const [visibleLayerIds, setVisibleLayerIds] = useState(
    defaultVisibleLayerIds,
  );
  const [loadedLayers, setLoadedLayers] = useState<LoadedLayerMap>({});
  const [loadingLayerIds, setLoadingLayerIds] = useState<Set<SpatialLayerId>>(
    new Set(),
  );
  const [layerErrors, setLayerErrors] = useState<
    Partial<Record<SpatialLayerId, string>>
  >({});
  const [canvasSize, setCanvasSize] = useState({ width: 720, height: 440 });
  const [zoom, setZoom] = useState(1);
  const [renderDurationMs, setRenderDurationMs] = useState<number | null>(null);
  const requestedLayerIdsRef = useRef(new Set<SpatialLayerId>());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const loadLayer = useCallback(async (layerId: SpatialLayerId) => {
    const layer = getSpatialLayerDefinition(layerId);
    if (
      !layer?.geometryAvailable ||
      !layer.dataUrl ||
      requestedLayerIdsRef.current.has(layerId)
    ) {
      return;
    }

    requestedLayerIdsRef.current.add(layerId);
    setLoadingLayerIds((current) => new Set(current).add(layerId));
    setLayerErrors((current) => ({ ...current, [layerId]: undefined }));
    const startedAt = performance.now();

    try {
      const response = await fetch(layer.dataUrl, {
        headers: { Accept: "application/geo+json" },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const collection = parseFeatureCollection(await response.json());
      if (collection.features.length !== layer.featureCount) {
        throw new Error(
          `feature 개수 불일치: ${collection.features.length}/${layer.featureCount}`,
        );
      }

      setLoadedLayers((current) => ({
        ...current,
        [layerId]: {
          collection,
          bounds: calculateBounds(collection),
          loadedInMs: performance.now() - startedAt,
        },
      }));
    } catch (error) {
      requestedLayerIdsRef.current.delete(layerId);
      setLayerErrors((current) => ({
        ...current,
        [layerId]:
          error instanceof Error ? error.message : "알 수 없는 로딩 오류",
      }));
    } finally {
      setLoadingLayerIds((current) => {
        const next = new Set(current);
        next.delete(layerId);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    for (const layerId of defaultVisibleLayerIds) {
      void loadLayer(layerId);
    }
  }, [defaultVisibleLayerIds, loadLayer]);

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) {
      return;
    }

    const updateSize = () => {
      const width = Math.max(280, Math.floor(container.clientWidth));
      const height = Math.max(320, Math.min(560, Math.round(width * 0.6)));
      setCanvasSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const renderableLayers = useMemo(
    () =>
      SPATIAL_LAYER_REGISTRY.filter(
        (layer) =>
          layer.geometryAvailable &&
          visibleLayerIds.has(layer.layerId) &&
          loadedLayers[layer.layerId],
      )
        .map((definition) => ({
          definition,
          data: loadedLayers[definition.layerId] as LoadedSpatialLayer,
        }))
        .sort((left, right) => {
          const order: Record<SpatialLayerId, number> = {
            "frameone-markets": 0,
            "frameone-submarkets": 0,
            "frameone-nodes": 0,
            "seoul-living-grid-250m": 10,
            "seoul-admin-dongs": 20,
            "seoul-official-markets": 30,
          };
          return order[left.definition.layerId] - order[right.definition.layerId];
        }),
    [loadedLayers, visibleLayerIds],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const startedAt = performance.now();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvasSize.width * pixelRatio);
    canvas.height = Math.round(canvasSize.height * pixelRatio);
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, canvasSize.width, canvasSize.height);
    context.fillStyle = "#f8fafc";
    context.fillRect(0, 0, canvasSize.width, canvasSize.height);

    context.strokeStyle = "rgba(148, 163, 184, 0.14)";
    context.lineWidth = 1;
    for (let x = 32; x < canvasSize.width; x += 64) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, canvasSize.height);
      context.stroke();
    }
    for (let y = 32; y < canvasSize.height; y += 64) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(canvasSize.width, y);
      context.stroke();
    }

    const bounds = mergeBounds(renderableLayers.map((layer) => layer.data));
    if (!bounds) {
      setRenderDurationMs(performance.now() - startedAt);
      return;
    }

    const centerLongitude =
      (bounds.minimumLongitude + bounds.maximumLongitude) / 2;
    const centerLatitude = (bounds.minimumLatitude + bounds.maximumLatitude) / 2;
    const longitudeCorrection = Math.cos((centerLatitude * Math.PI) / 180);
    const geographicWidth =
      (bounds.maximumLongitude - bounds.minimumLongitude) * longitudeCorrection;
    const geographicHeight = bounds.maximumLatitude - bounds.minimumLatitude;
    const padding = 24;
    const scale =
      Math.min(
        (canvasSize.width - padding * 2) / geographicWidth,
        (canvasSize.height - padding * 2) / geographicHeight,
      ) * zoom;
    const project = ([longitude, latitude]: Position) =>
      [
        canvasSize.width / 2 +
          (longitude - centerLongitude) * longitudeCorrection * scale,
        canvasSize.height / 2 - (latitude - centerLatitude) * scale,
      ] as const;

    for (const { definition, data } of renderableLayers) {
      context.beginPath();
      for (const feature of data.collection.features) {
        for (const polygon of polygonsForGeometry(feature.geometry)) {
          for (const ring of polygon) {
            ring.forEach((position, index) => {
              const [x, y] = project(position);
              if (index === 0) {
                context.moveTo(x, y);
              } else {
                context.lineTo(x, y);
              }
            });
            context.closePath();
          }
        }
      }

      context.fillStyle = definition.style.fill;
      context.strokeStyle = definition.style.stroke;
      context.lineWidth = Math.max(
        0.25,
        definition.style.lineWidth / Math.sqrt(zoom),
      );
      context.fill("evenodd");
      context.stroke();
    }

    setRenderDurationMs(performance.now() - startedAt);
  }, [canvasSize, renderableLayers, zoom]);

  function toggleLayer(layer: SpatialLayerDefinition) {
    if (!layer.geometryAvailable) {
      return;
    }

    const nextVisible = !visibleLayerIds.has(layer.layerId);
    setVisibleLayerIds((current) => {
      const next = new Set(current);
      if (nextVisible) {
        next.add(layer.layerId);
      } else {
        next.delete(layer.layerId);
      }
      return next;
    });

    if (nextVisible) {
      void loadLayer(layer.layerId);
    }
  }

  const renderedFeatureCount = renderableLayers.reduce(
    (total, layer) => total + layer.data.collection.features.length,
    0,
  );
  const gridData = loadedLayers["seoul-living-grid-250m"];

  return (
    <section className="panel-card overflow-hidden" aria-labelledby="spatial-viewer-title">
      <div className="border-b border-slate-200 bg-slate-950 px-5 py-5 text-white md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
              Spatial data viewer · STEP 3A
            </p>
            <h2 id="spatial-viewer-title" className="mt-2 text-xl font-bold md:text-2xl">
              공간데이터 Viewer
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              EPSG:4326으로 검증된 서울시 참조 geometry만 Canvas에 표시합니다.
              FRAMEONE 분석체계와 공식 참조레이어는 서로 다른 데이터이며,
              확인되지 않은 좌표나 경계는 생성하지 않습니다.
            </p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs text-slate-300">
            <p className="font-bold text-white">외부 지도 API 없음</p>
            <p className="mt-1">Base map 없음 · API Key 없음 · 좌표변환 없음</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-4 md:p-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside aria-label="공간 레이어 목록">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                Layer registry
              </p>
              <h3 className="mt-1 text-base font-bold text-slate-950">6개 레이어</h3>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
              표시 {renderableLayers.length}개
            </span>
          </div>

          <ul className="space-y-2">
            {SPATIAL_LAYER_REGISTRY.map((layer) => {
              const isVisible = visibleLayerIds.has(layer.layerId);
              const isLoading = loadingLayerIds.has(layer.layerId);
              const loaded = loadedLayers[layer.layerId];
              const error = layerErrors[layer.layerId];

              return (
                <li
                  key={layer.layerId}
                  className={`rounded-xl border p-3 ${
                    layer.category === "frameone"
                      ? "border-amber-200 bg-amber-50/60"
                      : "border-blue-200 bg-blue-50/40"
                  }`}
                >
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isVisible}
                      disabled={!layer.geometryAvailable}
                      onChange={() => toggleLayer(layer)}
                      className="mt-1 size-4 accent-blue-600 disabled:cursor-not-allowed"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-sm font-bold text-slate-950">
                          {layer.label}
                        </span>
                        <span
                          aria-hidden="true"
                          className="mt-1 block h-2.5 w-7 shrink-0 rounded-full border"
                          style={{
                            backgroundColor: layer.geometryAvailable
                              ? layer.style.fill
                              : "transparent",
                            borderColor: layer.style.stroke,
                          }}
                        />
                      </span>
                      <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">
                        {layer.categoryLabel} · {layer.featureCount.toLocaleString("ko-KR")}개
                      </span>
                    </span>
                  </label>

                  <dl className="mt-2 space-y-1 border-t border-slate-200/70 pt-2 text-[10px] leading-4 text-slate-600">
                    <div>
                      <dt className="inline font-bold">상태 </dt>
                      <dd className="inline">{layerStatusLabel(layer)}</dd>
                    </div>
                    <div>
                      <dt className="inline font-bold">원천 </dt>
                      <dd className="inline">{layer.source}</dd>
                    </div>
                    <div>
                      <dt className="inline font-bold">CRS </dt>
                      <dd className="inline">
                        {layer.outputCrs ?? "geometry 없음"}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-bold">버전 </dt>
                      <dd className="inline">{layer.geometryVersion ?? "미확정"}</dd>
                    </div>
                  </dl>

                  {!layer.geometryAvailable ? (
                    <p className="mt-2 rounded-lg bg-white/80 px-2.5 py-2 text-[10px] font-semibold text-amber-800">
                      경계 확인 필요 · 지도 렌더링 비활성
                    </p>
                  ) : null}
                  {layer.performanceNote ? (
                    <p className="mt-2 text-[10px] leading-4 text-slate-500">
                      {layer.performanceNote}
                    </p>
                  ) : null}
                  {isLoading ? (
                    <p className="mt-2 text-[10px] font-semibold text-blue-700">
                      GeoJSON 검증·로딩 중…
                    </p>
                  ) : null}
                  {loaded ? (
                    <p className="mt-2 text-[10px] font-semibold text-emerald-700">
                      {loaded.collection.features.length.toLocaleString("ko-KR")}개 로드 · {formatMilliseconds(loaded.loadedInMs)}
                    </p>
                  ) : null}
                  {error ? (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-red-50 px-2.5 py-2 text-[10px] text-red-700">
                      <span>로드 실패: {error}</span>
                      <button
                        type="button"
                        onClick={() => void loadLayer(layer.layerId)}
                        className="shrink-0 font-bold underline"
                      >
                        재시도
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="min-w-0 space-y-3">
          {selectedMarket ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">
                    선택한 FRAMEONE 분석상권
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-950">
                    {selectedMarket.marketName}
                  </p>
                  <p className="mt-0.5 break-all font-mono text-[10px] text-slate-500">
                    {selectedMarket.marketId}
                  </p>
                </div>
                <span className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-[10px] font-bold text-amber-800">
                  {selectedMarket.geometryStatus} · 경계 확인 필요
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-amber-900">
                Submarket {selectedMarket.submarketCount}개 · Node {selectedMarket.nodeCount}개
                {selectedSubmarket
                  ? ` · 선택 Submarket: ${selectedSubmarket.submarketName} (${selectedSubmarket.geometryStatus})`
                  : ""}
                . geometry가 없어 지도에는 표시하지 않습니다.
              </p>
            </div>
          ) : null}

          <div
            ref={canvasContainerRef}
            className="relative min-h-80 w-full overflow-hidden rounded-xl border border-slate-300 bg-slate-50"
          >
            <canvas
              ref={canvasRef}
              aria-label={`서울 공간 참조레이어 ${renderedFeatureCount.toLocaleString("ko-KR")}개 geometry 표시`}
              className="block max-w-full"
            >
              브라우저가 Canvas를 지원하지 않아 공간 참조레이어를 표시할 수 없습니다.
            </canvas>

            <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-[10px] text-slate-600 shadow-sm">
              <p className="font-bold text-slate-900">공식 참조 geometry</p>
              <p className="mt-0.5">
                {renderedFeatureCount.toLocaleString("ko-KR")}개 · Canvas {formatMilliseconds(renderDurationMs)}
              </p>
            </div>

            <div className="absolute right-3 top-3 flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setZoom((current) => Math.min(4, current + 0.5))}
                className="border-r border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                aria-label="공간 Viewer 확대"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="border-r border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
              >
                {zoom.toFixed(1)}×
              </button>
              <button
                type="button"
                onClick={() => setZoom((current) => Math.max(1, current - 0.5))}
                disabled={zoom === 1}
                className="px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="공간 Viewer 축소"
              >
                −
              </button>
            </div>

            {renderableLayers.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                <div className="rounded-xl border border-slate-200 bg-white/95 px-5 py-4 shadow-sm">
                  <p className="text-sm font-bold text-slate-800">
                    표시 중인 공식 geometry가 없습니다.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    공식 참조레이어를 켜면 검증 후 표시합니다.
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-blue-700">
                서울시 공식 참조상권
              </p>
              <p className="mt-1 text-xs leading-5 text-blue-950">
                공식 Polygon 참조레이어이며 FRAMEONE Market 경계가 아닙니다.
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">
                FRAMEONE 분석체계
              </p>
              <p className="mt-1 text-xs leading-5 text-amber-950">
                현재 text_only이며 검증점·Polygon을 임의 생성하지 않습니다.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">
                Crosswalk
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-700">
                manual_review/candidate이며 확정 연결이나 overlap 계산에 사용하지 않습니다.
              </p>
            </div>
          </div>

          {gridData ? (
            <p className="text-right text-[10px] text-slate-500">
              Grid 10,125개 지연 로딩 {formatMilliseconds(gridData.loadedInMs)} · 최근 Canvas 렌더 {formatMilliseconds(renderDurationMs)}
            </p>
          ) : (
            <p className="text-right text-[10px] text-slate-500">
              Grid는 기본 OFF이며 초기 요청과 렌더링에서 제외됩니다.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
