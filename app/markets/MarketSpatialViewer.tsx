"use client";

import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { BakeryOfficialMarketData } from "@/lib/market-data/services/bakery-official-market";
import type {
  MarketDataMetric,
  MarketDataObservation,
} from "@/lib/market-data/types";
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

interface ViewerFeature {
  type: "Feature";
  id?: string | number;
  geometry: ViewerGeometry;
  properties: Record<string, unknown>;
}

interface ViewerFeatureCollection {
  type: "FeatureCollection";
  features: ViewerFeature[];
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

interface HitTestFeature {
  layerId: SpatialLayerId;
  featureIndex: number;
  feature: ViewerFeature;
  path: Path2D;
  minimumX: number;
  minimumY: number;
  maximumX: number;
  maximumY: number;
}

interface CrosswalkCandidate {
  referenceId: string;
  referenceName: string | null;
  referenceType: string | null;
  relationType: string;
  confidence: string | null;
  sourceId: string | null;
  geometryVersion: string | null;
  sourceDate: string | null;
  matchBasis: string | null;
  spatialOverlapValidated: boolean;
}

interface MarketCrosswalkResponse {
  marketId: string;
  verificationStatus: "candidate";
  manualReviewRequired: true;
  officialMarketCandidates: CrosswalkCandidate[];
  administrativeDongCandidates: CrosswalkCandidate[];
  livingGridCandidates: [];
}

type BakeryDataRequestStatus = "idle" | "loading" | "success" | "error";

interface BakeryMetricDefinition {
  metric: MarketDataMetric;
  label: string;
  suffix: "원" | "건" | "개" | "%";
}

const BAKERY_SALES_METRICS: readonly BakeryMetricDefinition[] = [
  { metric: "monthly_sales_amount", label: "월 추정매출 금액", suffix: "원" },
  { metric: "monthly_sales_count", label: "월 추정매출 건수", suffix: "건" },
];

const BAKERY_STORES_METRICS: readonly BakeryMetricDefinition[] = [
  {
    metric: "similar_industry_store_count",
    label: "유사업종 점포 수",
    suffix: "개",
  },
  { metric: "store_count", label: "점포 수", suffix: "개" },
  { metric: "franchise_store_count", label: "프랜차이즈 점포 수", suffix: "개" },
  { metric: "opening_rate", label: "개업률", suffix: "%" },
  { metric: "opening_store_count", label: "개업 점포 수", suffix: "개" },
  { metric: "closing_rate", label: "폐업률", suffix: "%" },
  { metric: "closing_store_count", label: "폐업 점포 수", suffix: "개" },
];

export interface SelectedMarketSpatialSummary {
  marketId: string;
  marketName: string;
  district: string;
  geometryStatus: string;
  geometryAvailability: string | null;
  verificationStage: string | null;
  reviewStatus: string | null;
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

function propertyText(
  properties: Record<string, unknown>,
  key: string,
): string | null {
  const value = properties[key];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return null;
}

function referenceIdForFeature(
  layerId: SpatialLayerId,
  feature: ViewerFeature,
) {
  const propertyKeys: Partial<Record<SpatialLayerId, string[]>> = {
    "seoul-official-markets": ["official_area_code"],
    "seoul-admin-dongs": ["adm_cd"],
    "seoul-living-grid-250m": ["grid_id", "gid"],
  };
  for (const key of propertyKeys[layerId] ?? []) {
    const value = propertyText(feature.properties, key);
    if (value) {
      return value;
    }
  }
  return feature.id === undefined ? "정보 없음" : String(feature.id);
}

function referenceNameForFeature(
  layerId: SpatialLayerId,
  feature: ViewerFeature,
) {
  if (layerId === "seoul-official-markets") {
    return propertyText(feature.properties, "official_area_name") ?? "정보 없음";
  }
  if (layerId === "seoul-admin-dongs") {
    return propertyText(feature.properties, "adm_nm") ?? "행정동명 확인 필요";
  }
  return "정보 없음";
}

function reviewNoteForLayer(layerId: SpatialLayerId) {
  if (layerId === "seoul-admin-dongs") {
    return "행정동명·자치구명 속성 보강 필요";
  }
  if (layerId === "seoul-living-grid-250m") {
    return "geometry 참조 전용 · 생활인구 수치 미적재";
  }
  return "FRAMEONE 경계가 아닌 공식 참조 geometry · 2024+ 지표 결합 전 버전 확인 필요";
}

function parseMarketCrosswalk(
  value: unknown,
  expectedMarketId: string,
): MarketCrosswalkResponse {
  if (!value || typeof value !== "object") {
    throw new Error("Crosswalk 응답이 객체가 아닙니다.");
  }
  const candidate = value as Partial<MarketCrosswalkResponse>;
  if (
    candidate.marketId !== expectedMarketId ||
    candidate.verificationStatus !== "candidate" ||
    candidate.manualReviewRequired !== true ||
    !Array.isArray(candidate.officialMarketCandidates) ||
    !Array.isArray(candidate.administrativeDongCandidates) ||
    !Array.isArray(candidate.livingGridCandidates)
  ) {
    throw new Error("Crosswalk 후보 응답 형식이 올바르지 않습니다.");
  }
  return candidate as MarketCrosswalkResponse;
}

function parseBakeryDataResponse(
  value: unknown,
  expectedMarketCode: string,
): BakeryOfficialMarketData {
  if (!value || typeof value !== "object") {
    throw new Error("제과점 데이터 응답이 객체가 아닙니다.");
  }

  const candidate = value as Partial<BakeryOfficialMarketData>;
  if (
    candidate.officialMarketCode !== expectedMarketCode ||
    typeof candidate.industryCode !== "string" ||
    typeof candidate.industryName !== "string" ||
    typeof candidate.quarterCode !== "string" ||
    typeof candidate.referencePeriod !== "string" ||
    !Array.isArray(candidate.sales) ||
    !Array.isArray(candidate.stores) ||
    !["available", "partial", "missing"].includes(
      candidate.dataStatus ?? "",
    )
  ) {
    throw new Error("제과점 데이터 응답 형식이 올바르지 않습니다.");
  }

  return candidate as BakeryOfficialMarketData;
}

function formatBakeryMetric(
  observation: MarketDataObservation | undefined,
  suffix: BakeryMetricDefinition["suffix"],
): string {
  if (
    !observation ||
    observation.value === null ||
    observation.dataStatus !== "available"
  ) {
    return "데이터 없음";
  }

  return `${observation.value.toLocaleString("ko-KR")}${suffix}`;
}

function bakeryDataStatusLabel(
  status: BakeryOfficialMarketData["dataStatus"],
): string {
  if (status === "available") {
    return "데이터 있음";
  }
  if (status === "partial") {
    return "일부 데이터 없음";
  }
  return "데이터 없음";
}

function InspectorField({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-100 py-2 last:border-b-0">
      <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-xs leading-5 text-slate-800">
        {value}
      </dd>
    </div>
  );
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
  const [hitTestDurationMs, setHitTestDurationMs] = useState<number | null>(null);
  const [selectedReferences, setSelectedReferences] = useState<HitTestFeature[]>(
    [],
  );
  const [selectedReferenceIndex, setSelectedReferenceIndex] = useState(0);
  const [crosswalk, setCrosswalk] = useState<MarketCrosswalkResponse | null>(null);
  const [crosswalkLoading, setCrosswalkLoading] = useState(false);
  const [crosswalkError, setCrosswalkError] = useState<string | null>(null);
  const [bakeryDataStatus, setBakeryDataStatus] =
    useState<BakeryDataRequestStatus>("idle");
  const [bakeryData, setBakeryData] =
    useState<BakeryOfficialMarketData | null>(null);
  const [bakeryDataError, setBakeryDataError] = useState<string | null>(null);
  const requestedLayerIdsRef = useRef(new Set<SpatialLayerId>());
  const crosswalkCacheRef = useRef(
    new Map<string, MarketCrosswalkResponse>(),
  );
  const hitTestFeaturesRef = useRef<HitTestFeature[]>([]);
  const bakeryDataControllerRef = useRef<AbortController | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const selectedReference =
    selectedReferences[selectedReferenceIndex] ?? null;

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

  const selectedMarketId = selectedMarket?.marketId ?? null;

  useEffect(() => {
    if (!selectedMarketId) {
      setCrosswalk(null);
      setCrosswalkLoading(false);
      setCrosswalkError(null);
      return;
    }

    const marketId = selectedMarketId;
    const cached = crosswalkCacheRef.current.get(marketId);
    if (cached) {
      setCrosswalk(cached);
      setCrosswalkLoading(false);
      setCrosswalkError(null);
      return;
    }

    const controller = new AbortController();
    setCrosswalk(null);
    setCrosswalkLoading(true);
    setCrosswalkError(null);

    void fetch(`/api/markets/crosswalk?marketId=${encodeURIComponent(marketId)}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return parseMarketCrosswalk(await response.json(), marketId);
      })
      .then((result) => {
        crosswalkCacheRef.current.set(marketId, result);
        setCrosswalk(result);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setCrosswalkError(
          error instanceof Error ? error.message : "알 수 없는 Crosswalk 오류",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCrosswalkLoading(false);
        }
      });

    return () => controller.abort();
  }, [selectedMarketId]);

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
    hitTestFeaturesRef.current = [];

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

    const hitTestFeatures: HitTestFeature[] = [];
    for (const { definition, data } of renderableLayers) {
      const layerPath = new Path2D();
      data.collection.features.forEach((feature, featureIndex) => {
        const featurePath = new Path2D();
        let minimumX = Number.POSITIVE_INFINITY;
        let minimumY = Number.POSITIVE_INFINITY;
        let maximumX = Number.NEGATIVE_INFINITY;
        let maximumY = Number.NEGATIVE_INFINITY;

        for (const polygon of polygonsForGeometry(feature.geometry)) {
          for (const ring of polygon) {
            ring.forEach((position, index) => {
              const [x, y] = project(position);
              minimumX = Math.min(minimumX, x);
              minimumY = Math.min(minimumY, y);
              maximumX = Math.max(maximumX, x);
              maximumY = Math.max(maximumY, y);
              if (index === 0) {
                featurePath.moveTo(x, y);
                layerPath.moveTo(x, y);
              } else {
                featurePath.lineTo(x, y);
                layerPath.lineTo(x, y);
              }
            });
            featurePath.closePath();
            layerPath.closePath();
          }
        }

        hitTestFeatures.push({
          layerId: definition.layerId,
          featureIndex,
          feature,
          path: featurePath,
          minimumX,
          minimumY,
          maximumX,
          maximumY,
        });
      });

      context.fillStyle = definition.style.fill;
      context.strokeStyle = definition.style.stroke;
      context.lineWidth = Math.max(
        0.25,
        definition.style.lineWidth / Math.sqrt(zoom),
      );
      context.fill(layerPath, "evenodd");
      context.stroke(layerPath);
    }

    hitTestFeaturesRef.current = hitTestFeatures;
    setRenderDurationMs(performance.now() - startedAt);
  }, [canvasSize, renderableLayers, zoom]);

  useEffect(() => {
    const selectionCanvas = selectionCanvasRef.current;
    if (!selectionCanvas) {
      return;
    }

    const context = selectionCanvas.getContext("2d");
    if (!context) {
      return;
    }

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    selectionCanvas.width = Math.round(canvasSize.width * pixelRatio);
    selectionCanvas.height = Math.round(canvasSize.height * pixelRatio);
    selectionCanvas.style.width = `${canvasSize.width}px`;
    selectionCanvas.style.height = `${canvasSize.height}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, canvasSize.width, canvasSize.height);

    if (!selectedReference) {
      return;
    }

    const cachedFeature = hitTestFeaturesRef.current.find(
      (feature) =>
        feature.layerId === selectedReference.layerId &&
        feature.featureIndex === selectedReference.featureIndex,
    );
    if (!cachedFeature) {
      return;
    }

    context.fillStyle = "rgba(251, 191, 36, 0.28)";
    context.strokeStyle = "#0f172a";
    context.lineWidth = 2.5;
    context.fill(cachedFeature.path, "evenodd");
    context.stroke(cachedFeature.path);
  }, [canvasSize, renderDurationMs, selectedReference]);

  function handleCanvasClick(event: ReactMouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const startedAt = performance.now();
    const rectangle = canvas.getBoundingClientRect();
    const x =
      ((event.clientX - rectangle.left) / rectangle.width) * canvasSize.width;
    const y =
      ((event.clientY - rectangle.top) / rectangle.height) * canvasSize.height;
    const matches = hitTestFeaturesRef.current
      .filter(
        (feature) =>
          x >= feature.minimumX &&
          x <= feature.maximumX &&
          y >= feature.minimumY &&
          y <= feature.maximumY &&
          context.isPointInPath(feature.path, x, y, "evenodd"),
      )
      .reverse();

    setSelectedReferences(matches);
    setSelectedReferenceIndex(0);
    setHitTestDurationMs(performance.now() - startedAt);
  }

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
    } else {
      setSelectedReferences((current) =>
        current.filter((feature) => feature.layerId !== layer.layerId),
      );
      setSelectedReferenceIndex(0);
    }
  }

  const renderedFeatureCount = renderableLayers.reduce(
    (total, layer) => total + layer.data.collection.features.length,
    0,
  );
  const gridData = loadedLayers["seoul-living-grid-250m"];
  const selectedReferenceLayer = selectedReference
    ? getSpatialLayerDefinition(selectedReference.layerId)
    : null;
  const selectedReferenceId = selectedReference
    ? referenceIdForFeature(
        selectedReference.layerId,
        selectedReference.feature,
      )
    : null;
  const isOfficialMarketReference =
    selectedReference?.layerId === "seoul-official-markets";
  const selectedOfficialMarketCode =
    isOfficialMarketReference &&
    selectedReferenceId &&
    /^\d+$/.test(selectedReferenceId)
      ? selectedReferenceId
      : null;

  useEffect(() => {
    bakeryDataControllerRef.current?.abort();
    bakeryDataControllerRef.current = null;
    setBakeryDataStatus("idle");
    setBakeryData(null);
    setBakeryDataError(null);
  }, [selectedOfficialMarketCode]);

  useEffect(
    () => () => {
      bakeryDataControllerRef.current?.abort();
    },
    [],
  );

  async function handleBakeryDataRequest() {
    if (!selectedOfficialMarketCode || bakeryDataStatus === "loading") {
      return;
    }

    bakeryDataControllerRef.current?.abort();
    const controller = new AbortController();
    bakeryDataControllerRef.current = controller;
    setBakeryDataStatus("loading");
    setBakeryData(null);
    setBakeryDataError(null);

    try {
      const response = await fetch(
        `/api/markets/bakery-data?marketCode=${encodeURIComponent(selectedOfficialMarketCode)}`,
        {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        },
      );
      let payload: unknown;

      try {
        payload = await response.json();
      } catch {
        throw new Error("제과점 데이터 서버 응답을 확인할 수 없습니다.");
      }

      if (!response.ok) {
        const message =
          payload &&
          typeof payload === "object" &&
          "message" in payload &&
          typeof payload.message === "string"
            ? payload.message
            : "제과점 실데이터 조회에 실패했습니다.";
        throw new Error(message);
      }

      const result = parseBakeryDataResponse(
        payload,
        selectedOfficialMarketCode,
      );
      if (!controller.signal.aborted) {
        setBakeryData(result);
        setBakeryDataStatus("success");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      if (!controller.signal.aborted) {
        setBakeryDataError(
          error instanceof Error
            ? error.message
            : "제과점 실데이터 조회에 실패했습니다.",
        );
        setBakeryDataStatus("error");
      }
    } finally {
      if (bakeryDataControllerRef.current === controller) {
        bakeryDataControllerRef.current = null;
      }
    }
  }

  const selectedReferenceCrosswalkCandidate =
    selectedReference && selectedReferenceId && crosswalk
      ? selectedReference.layerId === "seoul-official-markets"
        ? crosswalk.officialMarketCandidates.find(
            (candidate) => candidate.referenceId === selectedReferenceId,
          ) ?? null
        : selectedReference.layerId === "seoul-admin-dongs"
          ? crosswalk.administrativeDongCandidates.find(
              (candidate) => candidate.referenceId === selectedReferenceId,
            ) ?? null
          : null
      : null;

  return (
    <section className="panel-card overflow-hidden" aria-labelledby="spatial-viewer-title">
      <div className="border-b border-slate-200 bg-slate-950 px-5 py-5 text-white md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
              Spatial data viewer · STEP 3B
            </p>
            <h2 id="spatial-viewer-title" className="mt-2 text-xl font-bold md:text-2xl">
              공간데이터 Viewer
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              EPSG:4326으로 검증된 서울시 참조 geometry만 Canvas에 표시합니다.
              FRAMEONE 분석체계와 공식 참조레이어는 서로 다른 데이터이며,
              geometry를 클릭하면 원천 속성과 검토 후보관계를 확인할 수 있습니다.
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
              <dl className="mt-3 grid gap-x-4 gap-y-2 border-t border-amber-200 pt-3 text-[10px] sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="font-bold text-amber-700">자치구</dt>
                  <dd className="mt-0.5 text-slate-800">{selectedMarket.district}</dd>
                </div>
                <div>
                  <dt className="font-bold text-amber-700">geometry_availability</dt>
                  <dd className="mt-0.5 font-mono text-slate-800">
                    {selectedMarket.geometryAvailability ?? "확인 필요"}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-amber-700">verification_stage</dt>
                  <dd className="mt-0.5 font-mono text-slate-800">
                    {selectedMarket.verificationStage ?? "확인 필요"}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-amber-700">review_status</dt>
                  <dd className="mt-0.5 font-mono text-slate-800">
                    {selectedMarket.reviewStatus ?? "정보 없음"}
                  </dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold">
                <span className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-amber-800">
                  FRAMEONE 경계 미확정
                </span>
                <span className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-amber-800">
                  공간데이터 없음
                </span>
                {crosswalkLoading ? (
                  <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-slate-600">
                    Crosswalk 후보 로딩 중…
                  </span>
                ) : crosswalk ? (
                  <>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-800">
                      공식상권 검토 후보 {crosswalk.officialMarketCandidates.length}개
                    </span>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">
                      행정동 검토 후보 {crosswalk.administrativeDongCandidates.length}개
                    </span>
                  </>
                ) : null}
              </div>
              {crosswalkError ? (
                <p className="mt-2 text-[10px] font-semibold text-red-700">
                  Crosswalk 후보 로드 실패: {crosswalkError}
                </p>
              ) : null}
            </div>
          ) : null}

          <div
            ref={canvasContainerRef}
            className="relative min-h-80 w-full overflow-hidden rounded-xl border border-slate-300 bg-slate-50"
          >
            <canvas
              ref={canvasRef}
              aria-label={`서울 공간 참조레이어 ${renderedFeatureCount.toLocaleString("ko-KR")}개 geometry 표시`}
              onClick={handleCanvasClick}
              className="block max-w-full cursor-crosshair"
              title="공식 참조 geometry를 클릭해 Inspector에서 확인"
            >
              브라우저가 Canvas를 지원하지 않아 공간 참조레이어를 표시할 수 없습니다.
            </canvas>
            <canvas
              ref={selectionCanvasRef}
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-0 block max-w-full"
            />

            <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-[10px] text-slate-600 shadow-sm">
              <p className="font-bold text-slate-900">공식 참조 geometry</p>
              <p className="mt-0.5">
                {renderedFeatureCount.toLocaleString("ko-KR")}개 · Canvas {formatMilliseconds(renderDurationMs)}
              </p>
              <p className="mt-0.5">geometry 클릭 → Inspector</p>
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

          <section
            aria-label="Reference Inspector"
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  Reference Inspector
                </p>
                <h3 className="mt-1 text-base font-bold text-slate-950">
                  선택 객체 상세정보
                </h3>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px] font-bold text-slate-600">
                <span className="rounded-full bg-slate-100 px-2.5 py-1">
                  후보 {selectedReferences.length}개
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1">
                  hit-test {formatMilliseconds(hitTestDurationMs)}
                </span>
              </div>
            </div>

            {selectedReferences.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center">
                <p className="text-sm font-bold text-slate-700">
                  공식 참조 geometry를 클릭하세요.
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  공식상권·행정동·Grid만 hit-test 대상이며 FRAMEONE 객체는 포함하지 않습니다.
                </p>
              </div>
            ) : (
              <>
                {selectedReferences.length > 1 ? (
                  <div className="mt-4">
                    <p className="text-[10px] font-bold text-slate-500">
                      겹친 geometry 후보 · 확정관계 아님
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedReferences.map((reference, index) => {
                        const layer = getSpatialLayerDefinition(reference.layerId);
                        const referenceId = referenceIdForFeature(
                          reference.layerId,
                          reference.feature,
                        );
                        return (
                          <button
                            key={`${reference.layerId}-${reference.featureIndex}`}
                            type="button"
                            onClick={() => setSelectedReferenceIndex(index)}
                            className={`rounded-lg border px-3 py-2 text-left text-[10px] font-semibold ${
                              index === selectedReferenceIndex
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <span className="block font-bold">
                              {layer?.label ?? reference.layerId}
                            </span>
                            <span className="mt-0.5 block font-mono opacity-75">
                              {referenceId}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {selectedReference && selectedReferenceLayer ? (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <article className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-blue-700">
                            공식 참조
                          </p>
                          <h4 className="mt-1 text-sm font-bold text-slate-950">
                            {referenceNameForFeature(
                              selectedReference.layerId,
                              selectedReference.feature,
                            )}
                          </h4>
                        </div>
                        <span className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[10px] font-bold text-blue-800">
                          {selectedReferenceLayer.status}
                        </span>
                      </div>
                      <dl className="mt-3">
                        <InspectorField
                          label="Layer"
                          value={selectedReferenceLayer.label}
                        />
                        <InspectorField
                          label="Reference ID"
                          value={selectedReferenceId ?? "정보 없음"}
                        />
                        <InspectorField
                          label="Feature name"
                          value={referenceNameForFeature(
                            selectedReference.layerId,
                            selectedReference.feature,
                          )}
                        />
                        <InspectorField
                          label="Source"
                          value={selectedReferenceLayer.source}
                        />
                        <InspectorField
                          label="Source ID"
                          value={
                            propertyText(
                              selectedReference.feature.properties,
                              "source_id",
                            ) ?? "정보 없음"
                          }
                        />
                        <InspectorField
                          label="Geometry version"
                          value={
                            propertyText(
                              selectedReference.feature.properties,
                              "geometry_version",
                            ) ??
                            selectedReferenceLayer.geometryVersion ??
                            "정보 없음"
                          }
                        />
                        <InspectorField
                          label="Source date"
                          value={
                            propertyText(
                              selectedReference.feature.properties,
                              "source_date",
                            ) ?? "정보 없음"
                          }
                        />
                        <InspectorField
                          label="Converted at"
                          value={
                            propertyText(
                              selectedReference.feature.properties,
                              "converted_at",
                            ) ?? "정보 없음"
                          }
                        />
                        <InspectorField
                          label="CRS"
                          value={
                            propertyText(
                              selectedReference.feature.properties,
                              "output_crs",
                            ) ?? "좌표계 확인 필요"
                          }
                        />
                        <InspectorField
                          label="Geometry type"
                          value={selectedReference.feature.geometry.type}
                        />
                        <InspectorField
                          label="Validation / status"
                          value={
                            propertyText(
                              selectedReference.feature.properties,
                              "status",
                            ) ?? "확인 필요"
                          }
                        />
                        <InspectorField
                          label="Confidence"
                          value={
                            propertyText(
                              selectedReference.feature.properties,
                              "confidence",
                            ) ?? "정보 없음"
                          }
                        />
                        <InspectorField
                          label="Stale"
                          value={
                            propertyText(
                              selectedReference.feature.properties,
                              "stale",
                            ) ?? "확인 필요 (원천 속성 없음)"
                          }
                        />
                        <InspectorField
                          label="확인 필요사항"
                          value={reviewNoteForLayer(selectedReference.layerId)}
                        />
                      </dl>
                    </article>

                    <article className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">
                        현재 Market과의 관계
                      </p>
                      <h4 className="mt-1 text-sm font-bold text-slate-950">
                        {selectedMarket?.marketName ?? "선택 Market 없음"}
                      </h4>
                      <p className="mt-0.5 break-all font-mono text-[10px] text-slate-500">
                        {selectedMarket?.marketId ?? "정보 없음"}
                      </p>

                      {selectedReference.layerId ===
                      "seoul-living-grid-250m" ? (
                        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                          <p className="text-xs font-bold text-slate-800">
                            Market-Grid Crosswalk 미구축
                          </p>
                          <p className="mt-1 text-[10px] leading-4 text-slate-500">
                            Grid ID만 확인하며 생활인구 값이나 관계를 계산하지 않습니다.
                          </p>
                        </div>
                      ) : crosswalkLoading ? (
                        <p className="mt-4 text-xs text-slate-500">
                          Crosswalk 후보 확인 중…
                        </p>
                      ) : selectedReferenceCrosswalkCandidate ? (
                        <div className="mt-4 rounded-lg border border-amber-200 bg-white p-3">
                          <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">
                              검토 후보
                            </span>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                              {selectedReferenceCrosswalkCandidate.relationType}
                            </span>
                            <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">
                              공간중첩 미검증
                            </span>
                          </div>
                          <dl className="mt-3">
                            <InspectorField
                              label="Confidence"
                              value={
                                selectedReferenceCrosswalkCandidate.confidence ??
                                "정보 없음"
                              }
                            />
                            <InspectorField
                              label="Match basis"
                              value={
                                selectedReferenceCrosswalkCandidate.matchBasis ??
                                "정보 없음"
                              }
                            />
                            <InspectorField
                              label="Relation source"
                              value={
                                selectedReferenceCrosswalkCandidate.sourceId ??
                                "정보 없음"
                              }
                            />
                          </dl>
                        </div>
                      ) : (
                        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                          <p className="text-xs font-bold text-slate-800">
                            현재 선택 Market과 등록된 후보관계 없음
                          </p>
                          <p className="mt-1 text-[10px] leading-4 text-slate-500">
                            새 Crosswalk를 생성하거나 공간관계를 추정하지 않습니다.
                          </p>
                        </div>
                      )}
                    </article>

                    {isOfficialMarketReference ? (
                      <article
                        aria-label="서울시 공식상권 제과점 실데이터"
                        className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 lg:col-span-2"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                              서울시 공식상권 제과점 통계
                            </p>
                            <h4 className="mt-1 text-sm font-bold text-slate-950">
                              {referenceNameForFeature(
                                selectedReference.layerId,
                                selectedReference.feature,
                              )}
                            </h4>
                            <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                              공식상권 코드 {selectedReferenceId ?? "정보 없음"}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={
                              !selectedOfficialMarketCode ||
                              bakeryDataStatus === "loading"
                            }
                            onClick={() => void handleBakeryDataRequest()}
                            className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {bakeryDataStatus === "loading"
                              ? "제과점 데이터 조회 중..."
                              : "제과점 실데이터 조회"}
                          </button>
                        </div>

                        {!selectedOfficialMarketCode ? (
                          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                            숫자로 된 공식상권 코드를 확인할 수 없습니다.
                          </p>
                        ) : null}

                        {bakeryDataStatus === "idle" &&
                        selectedOfficialMarketCode ? (
                          <p className="mt-4 rounded-lg border border-dashed border-emerald-200 bg-white px-3 py-3 text-xs leading-5 text-slate-600">
                            선택한 공식상권의 제과점 통계는 버튼을 눌렀을 때만 조회합니다.
                          </p>
                        ) : null}

                        {bakeryDataStatus === "loading" ? (
                          <p
                            role="status"
                            className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-xs font-semibold text-blue-800"
                          >
                            제과점 데이터 조회 중...
                          </p>
                        ) : null}

                        {bakeryDataStatus === "error" && bakeryDataError ? (
                          <p
                            role="alert"
                            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-xs text-red-700"
                          >
                            {bakeryDataError}
                          </p>
                        ) : null}

                        {bakeryDataStatus === "success" &&
                        bakeryData &&
                        bakeryData.officialMarketCode ===
                          selectedOfficialMarketCode ? (
                          <div className="mt-4 space-y-4">
                            <dl className="grid gap-3 rounded-xl border border-emerald-100 bg-white p-3 sm:grid-cols-2 lg:grid-cols-5">
                              <div>
                                <dt className="text-[10px] font-bold text-slate-500">
                                  공식상권명
                                </dt>
                                <dd className="mt-1 text-xs font-bold text-slate-900">
                                  {bakeryData.officialMarketName ?? "정보 없음"}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[10px] font-bold text-slate-500">
                                  공식상권코드
                                </dt>
                                <dd className="mt-1 font-mono text-xs text-slate-900">
                                  {bakeryData.officialMarketCode}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[10px] font-bold text-slate-500">
                                  업종명
                                </dt>
                                <dd className="mt-1 text-xs font-bold text-slate-900">
                                  {bakeryData.industryName}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[10px] font-bold text-slate-500">
                                  기준분기
                                </dt>
                                <dd className="mt-1 text-xs text-slate-900">
                                  {bakeryData.referencePeriod} · {bakeryData.quarterCode}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[10px] font-bold text-slate-500">
                                  데이터 상태
                                </dt>
                                <dd className="mt-1 text-xs font-bold text-slate-900">
                                  {bakeryDataStatusLabel(bakeryData.dataStatus)}
                                </dd>
                              </div>
                            </dl>

                            {bakeryData.dataStatus !== "available" ? (
                              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                                {bakeryData.dataStatus === "partial"
                                  ? "일부 데이터 없음"
                                  : "데이터 없음"}
                              </p>
                            ) : null}

                            <div className="grid gap-3 lg:grid-cols-2">
                              <section className="rounded-xl border border-slate-200 bg-white p-3">
                                <h5 className="text-xs font-bold text-slate-900">
                                  매출
                                </h5>
                                <dl className="mt-2">
                                  {BAKERY_SALES_METRICS.map((definition) => {
                                    const observation = bakeryData.sales.find(
                                      (item) => item.metric === definition.metric,
                                    );

                                    return (
                                      <div
                                        key={definition.metric}
                                        className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0"
                                      >
                                        <dt className="text-[11px] text-slate-600">
                                          {definition.label}
                                        </dt>
                                        <dd className="text-right text-xs font-bold text-slate-950">
                                          {formatBakeryMetric(
                                            observation,
                                            definition.suffix,
                                          )}
                                        </dd>
                                      </div>
                                    );
                                  })}
                                </dl>
                              </section>

                              <section className="rounded-xl border border-slate-200 bg-white p-3">
                                <h5 className="text-xs font-bold text-slate-900">
                                  점포
                                </h5>
                                <dl className="mt-2">
                                  {BAKERY_STORES_METRICS.map((definition) => {
                                    const observation = bakeryData.stores.find(
                                      (item) => item.metric === definition.metric,
                                    );

                                    return (
                                      <div
                                        key={definition.metric}
                                        className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0"
                                      >
                                        <dt className="text-[11px] text-slate-600">
                                          {definition.label}
                                        </dt>
                                        <dd className="text-right text-xs font-bold text-slate-950">
                                          {formatBakeryMetric(
                                            observation,
                                            definition.suffix,
                                          )}
                                        </dd>
                                      </div>
                                    );
                                  })}
                                </dl>
                              </section>
                            </div>

                            <p className="border-t border-emerald-100 pt-3 text-[10px] leading-5 text-slate-500">
                              서울시 공식상권 기준 통계이며 실제 후보 점포의 예상매출을 의미하지 않습니다.
                              <br />
                              데이터 기준분기를 확인하여 참고자료로 사용합니다.
                            </p>
                          </div>
                        ) : null}
                      </article>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}

            {selectedMarket && crosswalk ? (
              <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-2">
                <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-blue-700">
                    공식상권 Crosswalk 검토 후보 · {crosswalk.officialMarketCandidates.length}개
                  </p>
                  <ul className="mt-2 max-h-36 space-y-1.5 overflow-auto pr-1 text-[10px]">
                    {crosswalk.officialMarketCandidates.map((candidate) => (
                      <li
                        key={candidate.referenceId}
                        className="rounded-lg border border-blue-100 bg-white px-2.5 py-2"
                      >
                        <span className="font-bold text-slate-800">
                          {candidate.referenceName ?? "정보 없음"}
                        </span>
                        <span className="ml-2 font-mono text-slate-500">
                          {candidate.referenceId}
                        </span>
                        <span className="mt-0.5 block text-amber-700">
                          검토 후보 · {candidate.relationType} · 공간중첩 미검증
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-700">
                    행정동 Crosswalk 검토 후보 · {crosswalk.administrativeDongCandidates.length}개
                  </p>
                  <ul className="mt-2 max-h-36 space-y-1.5 overflow-auto pr-1 text-[10px]">
                    {crosswalk.administrativeDongCandidates.map((candidate) => (
                      <li
                        key={candidate.referenceId}
                        className="rounded-lg border border-emerald-100 bg-white px-2.5 py-2"
                      >
                        <span className="font-bold text-slate-800">
                          {candidate.referenceName ?? "행정동명 확인 필요"}
                        </span>
                        <span className="ml-2 font-mono text-slate-500">
                          {candidate.referenceId}
                        </span>
                        <span className="mt-0.5 block text-amber-700">
                          검토 후보 · {candidate.relationType} · 공간중첩 미검증
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </section>

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
