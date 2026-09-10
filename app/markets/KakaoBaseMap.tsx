"use client";

import Script from "next/script";
import type {
  ExecutedMarketAnalysis,
  KakaoNearbySearchState,
  MarketAnalysisRequestStatus as NearbySearchStatus,
  NearbyCategoryId,
  NearbyCategoryResult,
  NearbyPlace,
  NearbyPlacesResponse,
} from "@/lib/market-data/market-analysis-context";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type KakaoMapStatus = "loading" | "ready" | "error";
type CandidateAddressStatus = "idle" | "loading" | "success" | "error";
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
  setCenter(center: KakaoLatLng): void;
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
type CandidateStore = MapPoint & { address: string };

interface NearbyCategoryDefinition {
  id: NearbyCategoryId;
  label: string;
}

type NearbyPlacesByCategory = Record<NearbyCategoryId, NearbyCategoryResult>;
type EnabledCategories = Record<NearbyCategoryId, boolean>;

interface CandidateGeocodeResponse {
  latitude?: number;
  longitude?: number;
  resolvedAddress?: string;
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
  onAnalysisExecuted,
  onNearbySearchChange,
  view = "briefing",
  marketSelector,
  marketName = "주요상권 미선택",
  analysisSummary,
  analysisConditionsRequest = 0,
  onOpenAnalysisSummary,
}: {
  officialMarketPolygons: readonly KakaoOfficialMarketPolygon[];
  selectedOfficialMarketCode: string | null;
  onSelectOfficialMarket: (featureIndex: number) => void;
  onAnalysisExecuted?: (analysis: ExecutedMarketAnalysis) => void;
  onNearbySearchChange?: (state: KakaoNearbySearchState) => void;
  view?: KakaoBaseMapView;
  marketSelector?: ReactNode;
  marketName?: string;
  analysisSummary?: ReactNode;
  analysisConditionsRequest?: number;
  onOpenAnalysisSummary?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const conditionsRef = useRef<HTMLElement>(null);
  const focusedConditionsRequestRef = useRef(0);
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
  const [uniqueNearbyPlaces, setUniqueNearbyPlaces] = useState<NearbyPlace[]>([]);
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
  const [candidateAddress, setCandidateAddress] = useState("");
  const [candidateStore, setCandidateStore] = useState<CandidateStore | null>(
    null,
  );
  const [candidateAddressStatus, setCandidateAddressStatus] =
    useState<CandidateAddressStatus>("idle");
  const [candidateAddressError, setCandidateAddressError] = useState("");
  const [mapVisible, setMapVisible] = useState(false);
  const [conditionsOpen, setConditionsOpen] = useState(true);
  // 편집 중인 조건과 분리해 실행 시점의 분석 대상을 표시한다.
  const [analysisTarget, setAnalysisTarget] = useState<{ label: string; marketName: string } | null>(null);

  const [lastConditionsRequest, setLastConditionsRequest] = useState(analysisConditionsRequest);
  // An explicit edit request opens the existing form; unrelated context updates do not.
  if (analysisConditionsRequest !== lastConditionsRequest) {
    setLastConditionsRequest(analysisConditionsRequest);
    setConditionsOpen(true);
  }

  useEffect(() => {
    if (!conditionsOpen || analysisConditionsRequest <= focusedConditionsRequestRef.current) return;
    focusedConditionsRequestRef.current = analysisConditionsRequest;
    conditionsRef.current?.scrollIntoView({ block: "start" });
    conditionsRef.current?.focus({ preventScroll: true });
  }, [analysisConditionsRequest, conditionsOpen]);

  const initializeMap = useCallback(() => {
    const kakaoMaps = (window as KakaoWindow).kakao?.maps;
    const container = containerRef.current;

    if (!kakaoMaps || !container) {
      setStatus("error");
      setErrorMessage("Kakao Maps SDK를 초기화할 수 없습니다.");
      return;
    }

    kakaoMaps.load(() => {
      const currentContainer = containerRef.current;
      if (!currentContainer?.isConnected || mapInstanceRef.current) {
        return;
      }

      const center = new kakaoMaps.LatLng(
        SEOUL_CENTER.latitude,
        SEOUL_CENTER.longitude,
      );
      mapInstanceRef.current = new kakaoMaps.Map(currentContainer, {
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
      setConditionsOpen(true);
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
    const kakaoMaps = (window as KakaoWindow).kakao?.maps;
    const map = mapInstanceRef.current;
    if (status !== "ready" || !kakaoMaps || !map || !candidateStore) {
      return;
    }

    const marker = new kakaoMaps.Marker({
      map,
      position: new kakaoMaps.LatLng(
        candidateStore.latitude,
        candidateStore.longitude,
      ),
      title: "후보점포",
    });

    return () => marker.setMap(null);
  }, [candidateStore, status]);

  useEffect(() => {
    if (status !== "ready" || !mapInstanceRef.current || !analysisPoint) {
      return;
    }

    nearbySearchControllerRef.current?.abort();
    const controller = new AbortController();
    nearbySearchControllerRef.current = controller;
    setNearbySearchStatus("loading");
    setNearbySearchError("");
    onNearbySearchChange?.({ status: "loading", response: null, error: null });
    setNearbyPlaces(emptyNearbyPlaces());
    setUniqueNearbyPlaces([]);
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
        setUniqueNearbyPlaces(
          payload.uniquePlaces ??
            (payload.categories ?? []).flatMap((category) => category.places),
        );
        onNearbySearchChange?.({
          status: errors.length > 0 ? "error" : "success",
          response: payload,
          error: errors.length > 0 ? errors.join(" ") : null,
        });
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
        onNearbySearchChange?.({
          status: "error",
          response: null,
          error: error instanceof Error ? error.message : "주변 장소를 불러오지 못했습니다.",
        });
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
  }, [analysisPoint, analysisRadiusM, status, onNearbySearchChange]);

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

    for (const place of uniqueNearbyPlaces) {
      const categoryIds = place.matchedCategoryIds ?? [place.categoryId];
      if (!categoryIds.some((categoryId) => enabledCategories[categoryId])) {
        continue;
      }
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

    return () => {
      infoWindow.close();
      for (const { marker, clickHandler } of markers) {
        kakaoMaps.event.removeListener(marker, "click", clickHandler);
        marker.setMap(null);
      }
    };
  }, [enabledCategories, status, uniqueNearbyPlaces]);

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
    setNearbySearchStatus("loading");
    setAnalysisRadiusM(radiusM);
    onAnalysisExecuted?.({ source: "map", confirmedAddress: null, analysisPoint: { ...selectedPoint }, analysisRadiusMeters: radiusM });
    setAnalysisTarget({ label: `지도 선택 위치 · ${selectedPoint.latitude.toFixed(5)}, ${selectedPoint.longitude.toFixed(5)}`, marketName });
    setConditionsOpen(false);
    setMapVisible(true);
  }

  function analyzeCandidateStore(candidate: CandidateStore) {
    setNearbySearchStatus("loading");
    setAnalysisPoint({
      latitude: candidate.latitude,
      longitude: candidate.longitude,
    });
    setAnalysisRadiusM(radiusM);
    onAnalysisExecuted?.({ source: "address", confirmedAddress: candidate.address, analysisPoint: { latitude: candidate.latitude, longitude: candidate.longitude }, analysisRadiusMeters: radiusM });
    setAnalysisTarget({ label: candidate.address, marketName });
    setSelectedPoint(null);
    setConditionsOpen(false);
    setMapVisible(true);
  }

  async function locateCandidateStore(analyze = false) {
    const address = candidateAddress.trim();
    if (!address || status !== "ready") {
      return;
    }

    setCandidateAddressStatus("loading");
    setCandidateAddressError("");

    try {
      const searchParams = new URLSearchParams({ address });
      const response = await fetch(`/api/markets/geocode?${searchParams}`);
      const payload = (await response.json()) as CandidateGeocodeResponse;
      if (
        !response.ok ||
        typeof payload.latitude !== "number" ||
        typeof payload.longitude !== "number" ||
        !Number.isFinite(payload.latitude) ||
        !Number.isFinite(payload.longitude)
      ) {
        throw new Error("candidate-geocode-failed");
      }

      const nextCandidateStore: CandidateStore = {
        latitude: payload.latitude,
        longitude: payload.longitude,
        address: payload.resolvedAddress?.trim() || address,
      };
      setCandidateStore(nextCandidateStore);
      setCandidateAddressStatus("success");
      setMapVisible(true);
      if (analyze) analyzeCandidateStore(nextCandidateStore);

      const kakaoMaps = (window as KakaoWindow).kakao?.maps;
      const map = mapInstanceRef.current;
      if (kakaoMaps && map) {
        map.setCenter(
          new kakaoMaps.LatLng(
            nextCandidateStore.latitude,
            nextCandidateStore.longitude,
          ),
        );
      }
    } catch {
      setCandidateAddressStatus("error");
      setCandidateAddressError(
        "주소 위치를 확인하지 못했습니다. 주소를 확인한 후 다시 시도해 주세요.",
      );
    }
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
    <div className={view === "hidden" ? "hidden" : ""} aria-hidden={view === "hidden" || undefined}>
      <div className={view === "briefing" ? "" : "hidden"}>
      {analysisTarget && !analysisSummary ? (
        <section aria-label="현재 분석" className="border-b border-slate-200 bg-blue-50 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-950">현재 분석</h3>
              <p className="mt-2 break-words text-sm font-semibold text-slate-900">{analysisTarget.label}</p>
              <p className="mt-1 text-xs text-slate-600">FRAMEONE 주요상권 {analysisTarget.marketName} · {analysisRadiusM}m</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {nearbySearchStatus === "success" ? (
                <>
                  <span role="status" className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800">분석 완료</span>
                  {onOpenAnalysisSummary ? (
                    <button type="button" onClick={onOpenAnalysisSummary} className="min-h-11 rounded-lg bg-slate-900 px-4 text-xs font-bold text-white">종합 진단 보기</button>
                  ) : null}
                </>
              ) : null}
              <button type="button" onClick={() => setConditionsOpen(true)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700">분석조건 변경</button>
            </div>
          </div>
        </section>
      ) : null}
      <section ref={conditionsRef} tabIndex={-1} className={conditionsOpen ? "border-b border-slate-200 bg-white px-4 py-4" : "hidden"} aria-labelledby="candidate-store-title">
        <h3 id="candidate-store-title" className="text-base font-bold text-slate-950">분석 대상</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">주요상권과 후보점포 주소, 분석 반경을 정해 주세요.</p>
        <form onSubmit={(event) => { event.preventDefault(); void locateCandidateStore(true); }}>
          <fieldset disabled={candidateAddressStatus === "loading"} className="mt-4 space-y-4">
            {marketSelector}
            <label htmlFor="candidate-store-address" className="block text-xs font-bold text-slate-700">
              후보점포 주소
              <input id="candidate-store-address" type="text" value={candidateAddress}
                onChange={(event) => {
                  setCandidateAddress(event.target.value);
                  setCandidateStore(null);
                  setCandidateAddressError("");
                  setCandidateAddressStatus("idle");
                }}
                placeholder="후보점포 주소를 입력하세요" className="input mt-2 min-h-11 min-w-0" />
            </label>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="분석 반경">
              <span className="mr-1 text-xs font-bold text-slate-700">분석 반경</span>
              {([300, 500] as const).map((radius) => (
                <button key={radius} type="button" onClick={() => setRadiusM(radius)} aria-pressed={radiusM === radius}
                  className={`min-h-11 rounded-full border px-4 text-xs font-bold ${radiusM === radius ? "border-orange-500 bg-orange-500 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
                  {radius}m
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-5 text-slate-500">300m는 점포 가까운 주변을, 500m는 조금 넓은 주변 상권까지 참고합니다.</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button type="submit" disabled={status !== "ready" || !candidateAddress.trim() || nearbySearchStatus === "loading"}
                className="min-h-11 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                {candidateAddressStatus === "loading" ? "위치 확인 중…" : "후보점포 분석"}
              </button>
              <button type="button" onClick={() => void locateCandidateStore()} disabled={status !== "ready" || !candidateAddress.trim()}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-50">위치 확인</button>
              <button type="button" onClick={() => setMapVisible(true)}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700">지도 보기</button>
            </div>
          </fieldset>
        </form>
        <p className="mt-3 text-xs leading-5 text-slate-500">주소가 없으면 지도를 열어 위치를 선택한 뒤 이 위치 분석을 눌러 주세요. FRAMEONE 주요상권은 서울시 공식상권과 다른 분류입니다.</p>
        {analysisTarget ? <p className="mt-2 text-xs text-slate-500">변경한 조건은 다시 분석할 때 적용됩니다.</p> : null}
        {!mapVisible && status !== "ready" ? <p role="status" className="mt-2 text-xs text-slate-600">{status === "error" ? errorMessage : "주소 분석을 위한 지도를 준비하고 있습니다…"}</p> : null}
        {candidateStore ? <p className="mt-3 break-words text-xs text-slate-700">확인된 주소: {candidateStore.address}</p> : null}
        {candidateAddressError ? <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{candidateAddressError}</p> : null}
      </section>
      {analysisSummary}
      {!mapVisible && !analysisSummary ? (
        <p className="m-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
          분석 대상을 선택한 후 주변 경쟁환경을 확인할 수 있습니다. 주소를 분석하거나 지도 보기를 눌러 주세요.
        </p>
      ) : null}
      <div className={mapVisible ? "" : "hidden"}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="min-w-0 text-xs text-slate-600">
            <p className="font-bold text-slate-900">Kakao 지도 · 선택 반경 {radiusM}m</p>
            <p className="mt-1 break-words">{selectedPoint ? `분석 위치 후보 · ${selectedPoint.latitude.toFixed(5)}, ${selectedPoint.longitude.toFixed(5)}` : "지도를 클릭해 분석할 위치를 선택할 수 있습니다."}</p>
          </div>
          <button type="button" onClick={analyzeSelectedPoint} disabled={status !== "ready" || !selectedPoint || nearbySearchStatus === "loading"}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">이 위치 분석</button>
          <div className="flex flex-wrap gap-2">
            {NEARBY_CATEGORIES.map((category) => (
              <button key={category.id} type="button" onClick={() => toggleCategory(category.id)} aria-pressed={enabledCategories[category.id]}
                className="min-h-11 rounded-full border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700">
                {category.label} {enabledCategories[category.id] ? "ON" : "OFF"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div
        className={mapVisible ? "relative h-[360px] w-full overflow-hidden bg-slate-100 md:h-[410px]" : "relative hidden h-[360px] w-full overflow-hidden bg-slate-100 md:h-[410px]"}
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

      {analysisPoint ? (
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
              : nearbySearchStatus === "success" ? `중복정규화 ${uniqueNearbyPlaces.length}곳` : "조회 상태 확인 필요"}
          </span>
        </div>

        {nearbySearchStatus === "success" ? (
          <p className="mt-2 text-[11px] leading-4 text-slate-500">
            Kakao 검색 결과를 보수적인 규칙으로 중복 제거한 수이며 공식 점포 수나 전체 영업점 수가 아닙니다.
          </p>
        ) : null}

        <p className="mt-2 text-xs font-semibold text-slate-600" role="status">
          현재 분석 위치 기준 {analysisRadiusM}m 주변 장소입니다. 지도 이동이나 새 위치 선택은 다시 분석하기 전까지 이 결과를 바꾸지 않습니다.
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
                    {nearbySearchStatus !== "success" ? (nearbySearchStatus === "loading" ? "조회 중…" : "확인 필요") : view === "briefing"
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
                      : nearbySearchStatus === "success" ? "검색 결과 없음" : "조회 상태 확인 필요"}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
      ) : view === "competition" ? (
        <p className="p-5 text-sm text-slate-600">분석 실행 후 경쟁 환경을 확인할 수 있습니다. 먼저 분석 설정에서 주소 또는 지도 위치를 분석해 주세요.</p>
      ) : null}
    </div>
  );
}
