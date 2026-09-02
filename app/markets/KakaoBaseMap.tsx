"use client";

import Script from "next/script";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type KakaoMapStatus = "loading" | "ready" | "error";
type NearbySearchStatus = "idle" | "loading" | "success" | "error";
type NearbyCategoryId = "bakery" | "confectionery" | "cafe";
type RadiusM = 300 | 500;
export type KakaoBaseMapView = "briefing" | "competition" | "hidden";

export type KakaoPolygonPosition = [number, number];
type KakaoPolygonRing = KakaoPolygonPosition[];
type KakaoPolygonCoordinates = KakaoPolygonRing[];

export type KakaoPolygonGeometry =
  | {
      type: "Polygon";
      coordinates: KakaoPolygonCoordinates;
    }
  | {
      type: "MultiPolygon";
      coordinates: KakaoPolygonCoordinates[];
    };

export interface KakaoOfficialMarketPolygon {
  featureIndex: number;
  officialMarketCode: string;
  geometry: KakaoPolygonGeometry;
}

interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}

interface KakaoMouseEvent {
  latLng: KakaoLatLng;
}

interface KakaoMapInstance {
  relayout(): void;
}

interface KakaoPolygonInstance {
  setMap(map: KakaoMapInstance | null): void;
}

interface KakaoCircleInstance {
  setMap(map: KakaoMapInstance | null): void;
}

interface KakaoMarkerInstance {
  setMap(map: KakaoMapInstance | null): void;
}

interface KakaoInfoWindowInstance {
  close(): void;
  open(map: KakaoMapInstance, marker: KakaoMarkerInstance): void;
  setContent(content: Node | string): void;
}

interface KakaoMapsApi {
  load(callback: () => void): void;
  LatLng: new (latitude: number, longitude: number) => KakaoLatLng;
  Map: new (
    container: HTMLElement,
    options: { center: KakaoLatLng; level: number },
  ) => KakaoMapInstance;
  Polygon: new (options: {
    map: KakaoMapInstance;
    path: KakaoLatLng[] | KakaoLatLng[][];
    strokeWeight: number;
    strokeColor: string;
    strokeOpacity: number;
    fillColor: string;
    fillOpacity: number;
  }) => KakaoPolygonInstance;
  Circle: new (options: {
    map: KakaoMapInstance;
    center: KakaoLatLng;
    radius: number;
    strokeWeight: number;
    strokeColor: string;
    strokeOpacity: number;
    fillColor: string;
    fillOpacity: number;
  }) => KakaoCircleInstance;
  Marker: new (options: {
    map: KakaoMapInstance;
    position: KakaoLatLng;
    title?: string;
  }) => KakaoMarkerInstance;
  InfoWindow: new (options: {
    removable?: boolean;
    zIndex?: number;
  }) => KakaoInfoWindowInstance;
  event: {
    addListener(
      target: object,
      type: string,
      handler: ((event: KakaoMouseEvent) => void) | (() => void),
    ): void;
    removeListener(
      target: object,
      type: string,
      handler: ((event: KakaoMouseEvent) => void) | (() => void),
    ): void;
  };
}

interface KakaoWindow extends Window {
  kakao?: {
    maps?: KakaoMapsApi;
  };
}

const SEOUL_CENTER = {
  latitude: 37.5665,
  longitude: 126.978,
};
type MapPoint = typeof SEOUL_CENTER;

interface NearbyCategoryDefinition {
  id: NearbyCategoryId;
  label: string;
}

interface NearbyPlace {
  id: string;
  name: string;
  categoryId: NearbyCategoryId;
  categoryLabel: string;
  address: string;
  latitude: number;
  longitude: number;
  distanceM: number;
}

interface NearbyCategoryResult {
  totalCount: number;
  places: NearbyPlace[];
  error?: string;
}

type NearbyPlacesByCategory = Record<NearbyCategoryId, NearbyCategoryResult>;
type EnabledCategories = Record<NearbyCategoryId, boolean>;

interface NearbyPlacesResponse {
  categories?: Array<{
    id: NearbyCategoryId;
    totalCount: number;
    places: NearbyPlace[];
    error?: string;
  }>;
  message?: string;
}

const DEFAULT_RADIUS_M: RadiusM = 500;
const MAX_PER_CATEGORY = 15;
const NEARBY_CATEGORIES: readonly NearbyCategoryDefinition[] = [
  {
    id: "bakery",
    label: "베이커리",
  },
  {
    id: "confectionery",
    label: "제과점",
  },
  {
    id: "cafe",
    label: "카페",
  },
];

function emptyNearbyPlaces(): NearbyPlacesByCategory {
  return {
    bakery: { totalCount: 0, places: [] },
    confectionery: { totalCount: 0, places: [] },
    cafe: { totalCount: 0, places: [] },
  };
}

function polygonsForGeometry(geometry: KakaoPolygonGeometry) {
  return geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates;
}

function kakaoPathForPolygon(
  coordinates: KakaoPolygonCoordinates,
  kakaoMaps: KakaoMapsApi,
) {
  const rings = coordinates.map((ring) =>
    ring.map(
      ([longitude, latitude]) =>
        new kakaoMaps.LatLng(latitude, longitude),
    ),
  );

  return rings.length === 1 ? rings[0] : rings;
}

function formatDistance(distanceM: number) {
  return `${distanceM.toLocaleString("ko-KR")}m`;
}

function createPlaceInfoContent(place: NearbyPlace) {
  const container = document.createElement("div");
  container.style.width = "230px";
  container.style.padding = "12px";
  container.style.fontFamily = "sans-serif";
  container.style.lineHeight = "1.45";

  const name = document.createElement("strong");
  name.style.display = "block";
  name.style.fontSize = "14px";
  name.style.color = "#0f172a";
  name.textContent = place.name;

  const meta = document.createElement("span");
  meta.style.display = "block";
  meta.style.marginTop = "4px";
  meta.style.fontSize = "11px";
  meta.style.fontWeight = "700";
  meta.style.color = "#0369a1";
  meta.textContent = `${place.categoryLabel} · ${formatDistance(place.distanceM)}`;

  const address = document.createElement("span");
  address.style.display = "block";
  address.style.marginTop = "5px";
  address.style.fontSize = "11px";
  address.style.color = "#475569";
  address.textContent = place.address;

  container.append(name, meta, address);
  return container;
}

export default function KakaoBaseMap({
  officialMarketPolygons,
  selectedOfficialMarketCode,
  onSelectOfficialMarket,
  view = "briefing",
}: {
  officialMarketPolygons: readonly KakaoOfficialMarketPolygon[];
  selectedOfficialMarketCode: string | null;
  onSelectOfficialMarket: (featureIndex: number) => void;
  view?: KakaoBaseMapView;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<KakaoMapInstance | null>(null);
  const circleRef = useRef<KakaoCircleInstance | null>(null);
  const infoWindowRef = useRef<KakaoInfoWindowInstance | null>(null);
  const nearbySearchControllerRef = useRef<AbortController | null>(null);
  const ignoreNextMapClickRef = useRef(false);
  const mapKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY?.trim() ?? "";
  const [status, setStatus] = useState<KakaoMapStatus>(
    mapKey ? "loading" : "error",
  );
  const [errorMessage, setErrorMessage] = useState(
    mapKey
      ? ""
      : "NEXT_PUBLIC_KAKAO_MAP_KEY가 설정되지 않아 지도를 표시할 수 없습니다.",
  );
  const [radiusM, setRadiusM] = useState<RadiusM>(DEFAULT_RADIUS_M);
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);
  const [analysisPoint, setAnalysisPoint] = useState<MapPoint | null>(null);
  const [analysisRadiusM, setAnalysisRadiusM] =
    useState<RadiusM>(DEFAULT_RADIUS_M);
  const [nearbyPlaces, setNearbyPlaces] =
    useState<NearbyPlacesByCategory>(emptyNearbyPlaces);
  const [enabledCategories, setEnabledCategories] =
    useState<EnabledCategories>({
      bakery: true,
      confectionery: true,
      cafe: true,
    });
  const [nearbySearchStatus, setNearbySearchStatus] =
    useState<NearbySearchStatus>("idle");
  const [nearbySearchError, setNearbySearchError] = useState("");
  const [selectedNearbyPlace, setSelectedNearbyPlace] =
    useState<NearbyPlace | null>(null);

  const enabledPlaceCount = useMemo(
    () =>
      NEARBY_CATEGORIES.reduce(
        (total, category) =>
          total +
          (enabledCategories[category.id]
            ? nearbyPlaces[category.id].places.length
            : 0),
        0,
      ),
    [enabledCategories, nearbyPlaces],
  );

  const initializeMap = useCallback(() => {
    const kakaoMaps = (window as KakaoWindow).kakao?.maps;
    const container = containerRef.current;

    if (!kakaoMaps || !container) {
      setStatus("error");
      setErrorMessage("Kakao Maps SDK를 초기화할 수 없습니다.");
      return;
    }

    kakaoMaps.load(() => {
      if (!containerRef.current || mapInstanceRef.current) {
        return;
      }

      const center = new kakaoMaps.LatLng(
        SEOUL_CENTER.latitude,
        SEOUL_CENTER.longitude,
      );
      mapInstanceRef.current = new kakaoMaps.Map(containerRef.current, {
        center,
        level: 5,
      });
      setStatus("ready");
      setErrorMessage("");
    });
  }, []);

  useEffect(() => {
    const kakaoMaps = (window as KakaoWindow).kakao?.maps;
    const map = mapInstanceRef.current;
    if (status !== "ready" || !kakaoMaps || !map) {
      return;
    }

    const overlays: Array<{
      polygon: KakaoPolygonInstance;
      clickHandler: () => void;
    }> = [];

    for (const feature of officialMarketPolygons) {
      for (const polygonCoordinates of polygonsForGeometry(feature.geometry)) {
        const selected =
          feature.officialMarketCode === selectedOfficialMarketCode;
        const polygon = new kakaoMaps.Polygon({
          map,
          path: kakaoPathForPolygon(polygonCoordinates, kakaoMaps),
          strokeWeight: selected ? 3 : 2,
          strokeColor: selected ? "#0f172a" : "#2563eb",
          strokeOpacity: selected ? 1 : 0.9,
          fillColor: selected ? "#f59e0b" : "#2563eb",
          fillOpacity: selected ? 0.32 : 0.16,
        });
        const clickHandler = () => {
          ignoreNextMapClickRef.current = true;
          onSelectOfficialMarket(feature.featureIndex);
          window.setTimeout(() => {
            ignoreNextMapClickRef.current = false;
          }, 0);
        };
        kakaoMaps.event.addListener(polygon, "click", clickHandler);
        overlays.push({ polygon, clickHandler });
      }
    }

    return () => {
      for (const { polygon, clickHandler } of overlays) {
        kakaoMaps.event.removeListener(polygon, "click", clickHandler);
        polygon.setMap(null);
      }
    };
  }, [
    officialMarketPolygons,
    onSelectOfficialMarket,
    selectedOfficialMarketCode,
    status,
  ]);

  useEffect(() => {
    const kakaoMaps = (window as KakaoWindow).kakao?.maps;
    const map = mapInstanceRef.current;
    if (status !== "ready" || !kakaoMaps || !map || !analysisPoint) {
      return;
    }

    const circle = new kakaoMaps.Circle({
      map,
      center: new kakaoMaps.LatLng(
        analysisPoint.latitude,
        analysisPoint.longitude,
      ),
      radius: analysisRadiusM,
      strokeWeight: 2,
      strokeColor: "#ea580c",
      strokeOpacity: 0.95,
      fillColor: "#fb923c",
      fillOpacity: 0.13,
    });
    circleRef.current = circle;

    return () => {
      circle.setMap(null);
      if (circleRef.current === circle) {
        circleRef.current = null;
      }
    };
  }, [analysisPoint, analysisRadiusM, status]);

  useEffect(() => {
    const kakaoMaps = (window as KakaoWindow).kakao?.maps;
    const map = mapInstanceRef.current;
    if (status !== "ready" || !kakaoMaps || !map) {
      return;
    }

    const handleMapClick = (event: KakaoMouseEvent) => {
      if (ignoreNextMapClickRef.current) {
        ignoreNextMapClickRef.current = false;
        return;
      }

      setSelectedPoint({
        latitude: event.latLng.getLat(),
        longitude: event.latLng.getLng(),
      });
    };
    kakaoMaps.event.addListener(map, "click", handleMapClick);

    return () => {
      kakaoMaps.event.removeListener(map, "click", handleMapClick);
    };
  }, [status]);

  useEffect(() => {
    const kakaoMaps = (window as KakaoWindow).kakao?.maps;
    const map = mapInstanceRef.current;
    if (status !== "ready" || !kakaoMaps || !map || !selectedPoint) {
      return;
    }

    const marker = new kakaoMaps.Marker({
      map,
      position: new kakaoMaps.LatLng(
        selectedPoint.latitude,
        selectedPoint.longitude,
      ),
      title: "분석 위치 후보",
    });

    return () => marker.setMap(null);
  }, [selectedPoint, status]);

  useEffect(() => {
    if (status !== "ready" || !mapInstanceRef.current || !analysisPoint) {
      return;
    }

    nearbySearchControllerRef.current?.abort();
    const controller = new AbortController();
    nearbySearchControllerRef.current = controller;
    setNearbySearchStatus("loading");
    setNearbySearchError("");
    setNearbyPlaces(emptyNearbyPlaces());
    setSelectedNearbyPlace(null);
    infoWindowRef.current?.close();

    const searchParams = new URLSearchParams({
      lat: String(analysisPoint.latitude),
      lng: String(analysisPoint.longitude),
      radius: String(analysisRadiusM),
    });
    void fetch(`/api/markets/nearby-places?${searchParams}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as NearbyPlacesResponse;
        if (!response.ok) {
          throw new Error(payload.message ?? "주변 장소를 불러오지 못했습니다.");
        }
        return payload;
      })
      .then((payload) => {
        if (controller.signal.aborted) {
          return;
        }

        const nextPlaces = emptyNearbyPlaces();
        const errors: string[] = [];
        for (const result of payload.categories ?? []) {
          nextPlaces[result.id] = {
            totalCount: result.totalCount,
            places: result.places,
            ...(result.error ? { error: result.error } : {}),
          };
          if (result.error) {
            errors.push(result.error);
          }
        }

        setNearbyPlaces(nextPlaces);
        if (errors.length > 0) {
          setNearbySearchStatus("error");
          setNearbySearchError(
            `${errors.join(" ")} 지도 이동·확대/축소는 계속 사용할 수 있습니다.`,
          );
        } else {
          setNearbySearchStatus("success");
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setNearbySearchStatus("error");
        setNearbySearchError(
          `${error instanceof Error ? error.message : "주변 장소를 불러오지 못했습니다."} 지도 이동·확대/축소는 계속 사용할 수 있습니다.`,
        );
      });

    return () => {
      controller.abort();
      if (nearbySearchControllerRef.current === controller) {
        nearbySearchControllerRef.current = null;
      }
    };
  }, [analysisPoint, analysisRadiusM, status]);

  useEffect(() => {
    const kakaoMaps = (window as KakaoWindow).kakao?.maps;
    const map = mapInstanceRef.current;
    if (status !== "ready" || !kakaoMaps || !map) {
      return;
    }

    const infoWindow =
      infoWindowRef.current ??
      new kakaoMaps.InfoWindow({ removable: true, zIndex: 10 });
    infoWindowRef.current = infoWindow;
    const markers: Array<{
      marker: KakaoMarkerInstance;
      clickHandler: () => void;
    }> = [];

    for (const category of NEARBY_CATEGORIES) {
      if (!enabledCategories[category.id]) {
        continue;
      }

      for (const place of nearbyPlaces[category.id].places) {
        const marker = new kakaoMaps.Marker({
          map,
          position: new kakaoMaps.LatLng(place.latitude, place.longitude),
          title: `${place.name} · ${place.categoryLabel}`,
        });
        const clickHandler = () => {
          setSelectedNearbyPlace(place);
          infoWindow.setContent(createPlaceInfoContent(place));
          infoWindow.open(map, marker);
        };
        kakaoMaps.event.addListener(marker, "click", clickHandler);
        markers.push({ marker, clickHandler });
      }
    }

    return () => {
      infoWindow.close();
      for (const { marker, clickHandler } of markers) {
        kakaoMaps.event.removeListener(marker, "click", clickHandler);
        marker.setMap(null);
      }
    };
  }, [enabledCategories, nearbyPlaces, status]);

  useEffect(() => {
    const container = containerRef.current;
    const map = mapInstanceRef.current;
    if (status !== "ready" || !container || !map) {
      return;
    }

    const observer = new ResizeObserver(() => map.relayout());
    observer.observe(container);
    return () => observer.disconnect();
  }, [status]);

  function analyzeSelectedPoint() {
    if (!selectedPoint) {
      return;
    }

    setAnalysisPoint({ ...selectedPoint });
    setAnalysisRadiusM(radiusM);
  }

  function toggleCategory(categoryId: NearbyCategoryId) {
    if (
      enabledCategories[categoryId] &&
      selectedNearbyPlace?.categoryId === categoryId
    ) {
      setSelectedNearbyPlace(null);
      infoWindowRef.current?.close();
    }
    setEnabledCategories((current) => ({
      ...current,
      [categoryId]: !current[categoryId],
    }));
  }

  return (
    <div>
      <div className={view === "briefing" ? "" : "hidden"}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-700">
            지도 중심 반경
          </span>
          {([300, 500] as const).map((radius) => (
            <button
              key={radius}
              type="button"
              onClick={() => setRadiusM(radius)}
              aria-pressed={radiusM === radius}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                radiusM === radius
                  ? "border-orange-500 bg-orange-500 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {radius}m
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {NEARBY_CATEGORIES.map((category) => {
            const enabled = enabledCategories[category.id];
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => toggleCategory(category.id)}
                aria-pressed={enabled}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                  enabled
                    ? "border-sky-600 bg-sky-50 text-sky-800"
                    : "border-slate-300 bg-white text-slate-400"
                }`}
              >
                {category.label} {enabled ? "ON" : "OFF"}
              </button>
            );
          })}
          <button
            type="button"
            onClick={analyzeSelectedPoint}
            disabled={
              status !== "ready" ||
              !selectedPoint ||
              nearbySearchStatus === "loading"
            }
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            이 위치 분석
          </button>
        </div>
      </div>

      <div
        className="relative h-[360px] w-full overflow-hidden bg-slate-100 md:h-[410px]"
        aria-busy={status === "loading"}
      >
        <div
          ref={containerRef}
          aria-label="서울 중심 Kakao 기본 지도"
          className="absolute inset-0"
        />

        {status !== "ready" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-100/95 p-6 text-center">
            <p
              className={`max-w-md text-sm font-semibold ${
                status === "error" ? "text-red-700" : "text-slate-500"
              }`}
              role={status === "error" ? "alert" : "status"}
            >
              {status === "error" ? errorMessage : "Kakao 지도 불러오는 중…"}
            </p>
          </div>
        ) : null}

        {mapKey ? (
          <Script
            id="kakao-map-sdk"
            src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(mapKey)}&autoload=false`}
            strategy="afterInteractive"
            onReady={initializeMap}
            onError={() => {
              setStatus("error");
              setErrorMessage("Kakao Maps SDK 스크립트를 불러오지 못했습니다.");
            }}
          />
        ) : null}
      </div>
      </div>

      {view !== "hidden" ? (
      <section
        className="border-t border-slate-200 bg-white px-4 py-4"
        aria-labelledby="nearby-place-title"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 id="nearby-place-title" className="text-sm font-bold text-slate-950">
              {view === "briefing" ? "주변 경쟁환경 요약" : "주변 경쟁점 상세"}
            </h3>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">
              카카오 검색 기준 · 베이커리/제과점 결과 중복 가능 · 지도에는 업종별 최대 {MAX_PER_CATEGORY}개 표시
            </p>
          </div>
          <span
            className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600"
            aria-live="polite"
          >
            {nearbySearchStatus === "loading"
              ? "주변 장소 검색 중…"
              : `지도 표시 ${enabledPlaceCount}곳`}
          </span>
        </div>

        <p className="mt-2 text-xs font-semibold text-slate-600" role="status">
          {selectedPoint
            ? "분석 위치가 선택되었습니다. 이 위치 분석을 눌러 주변 장소를 확인하세요."
            : "지도에서 분석할 위치를 선택하세요."}
        </p>

        {nearbySearchError ? (
          <p
            className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"
            role="status"
          >
            {nearbySearchError}
          </p>
        ) : null}

        {selectedNearbyPlace ? (
          <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5">
            <p className="text-xs font-bold text-slate-950">
              {selectedNearbyPlace.name}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-sky-800">
              {selectedNearbyPlace.categoryLabel} · {formatDistance(selectedNearbyPlace.distanceM)}
            </p>
            <p className="mt-1 text-[11px] text-slate-600">
              {selectedNearbyPlace.address}
            </p>
          </div>
        ) : null}

        <div className={`mt-3 grid gap-3 ${view === "briefing" ? "grid-cols-3" : "lg:grid-cols-3"}`}>
          {NEARBY_CATEGORIES.map((category) => {
            const result = nearbyPlaces[category.id];
            const places = result.places;
            const enabled = enabledCategories[category.id];
            return (
              <article
                key={category.id}
                className={`min-w-0 rounded-lg border ${view === "briefing" ? "px-2 py-3 text-center sm:p-3" : "p-3"} ${
                  enabled
                    ? "border-slate-200 bg-slate-50/70"
                    : "border-slate-200 bg-slate-50 opacity-55"
                }`}
              >
                <div className={view === "briefing" ? "" : "flex items-center justify-between gap-2"}>
                  <h4 className="text-xs font-bold text-slate-900">
                    {category.label}
                  </h4>
                  <span className={view === "briefing" ? "mt-1 block text-xl font-bold tabular-nums text-slate-950" : "text-[10px] font-bold text-slate-500"}>
                    {view === "briefing"
                      ? result.totalCount.toLocaleString("ko-KR")
                      : `검색 결과 ${result.totalCount}곳 / 지도 표시 ${places.length}곳 (최대 ${MAX_PER_CATEGORY}곳)`}
                  </span>
                </div>
                {view === "competition" && places.length > 0 ? (
                  <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1">
                    {places.map((place) => (
                      <li
                        key={place.id}
                        className="rounded-md border border-slate-200 bg-white px-2.5 py-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 truncate text-[11px] font-bold text-slate-800">
                            {place.name}
                          </span>
                          <span className="shrink-0 text-[10px] font-semibold text-sky-700">
                            {formatDistance(place.distanceM)}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-[10px] text-slate-500">
                          {place.address}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : view === "competition" ? (
                  <p className="mt-2 text-[11px] text-slate-500">
                    {nearbySearchStatus === "loading"
                      ? "검색 중…"
                      : "검색 결과 없음"}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
      ) : null}
    </div>
  );
}
