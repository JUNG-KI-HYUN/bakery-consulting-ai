const KAKAO_LOCAL_API_BASE = "https://dapi.kakao.com";
const MAX_PLACES_PER_CATEGORY = 15;

type NearbyCategoryId = "bakery" | "confectionery" | "cafe";

type KakaoPlaceDocument = {
  id?: string;
  place_name?: string;
  category_name?: string;
  address_name?: string;
  road_address_name?: string;
  x?: string;
  y?: string;
  distance?: string;
};

type KakaoSearchResponse = {
  documents?: KakaoPlaceDocument[];
  meta?: { total_count?: number };
};

type NearbyPlace = {
  id: string;
  name: string;
  categoryId: NearbyCategoryId;
  categoryLabel: string;
  address: string;
  latitude: number;
  longitude: number;
  distanceM: number;
};

type NearbyCategoryResult = {
  id: NearbyCategoryId;
  label: string;
  totalCount: number;
  places: NearbyPlace[];
  error?: string;
};

const NEARBY_CATEGORIES: ReadonlyArray<{
  id: NearbyCategoryId;
  label: string;
  endpoint: "keyword" | "category";
  query: string;
}> = [
  { id: "bakery", label: "베이커리", endpoint: "keyword", query: "베이커리" },
  { id: "confectionery", label: "제과점", endpoint: "keyword", query: "제과점" },
  { id: "cafe", label: "카페", endpoint: "category", query: "CE7" },
];

function parseNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function distanceInMeters(
  center: { latitude: number; longitude: number },
  place: { latitude: number; longitude: number },
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(place.latitude - center.latitude);
  const longitudeDelta = toRadians(place.longitude - center.longitude);
  const centerLatitude = toRadians(center.latitude);
  const placeLatitude = toRadians(place.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(centerLatitude) *
      Math.cos(placeLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return Math.round(
    6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)),
  );
}

function normalizePlace(
  document: KakaoPlaceDocument,
  category: (typeof NEARBY_CATEGORIES)[number],
  center: { latitude: number; longitude: number },
): NearbyPlace | null {
  const name = document.place_name?.trim();
  const latitude = parseNumber(document.y);
  const longitude = parseNumber(document.x);
  if (!name || latitude === null || longitude === null) {
    return null;
  }

  const rawDistance = parseNumber(document.distance);
  return {
    id:
      document.id?.trim() ??
      `${category.id}|${name}|${latitude}|${longitude}`,
    name,
    categoryId: category.id,
    categoryLabel: document.category_name?.trim() || category.label,
    address:
      document.road_address_name?.trim() ||
      document.address_name?.trim() ||
      "주소 정보 없음",
    latitude,
    longitude,
    distanceM:
      rawDistance === null
        ? distanceInMeters(center, { latitude, longitude })
        : Math.round(rawDistance),
  };
}

function kakaoSearchUrl(
  category: (typeof NEARBY_CATEGORIES)[number],
  longitude: number,
  latitude: number,
  radiusM: number,
) {
  const params = new URLSearchParams({
    x: String(longitude),
    y: String(latitude),
    radius: String(radiusM),
    size: String(MAX_PLACES_PER_CATEGORY),
    sort: "distance",
  });

  if (category.endpoint === "category") {
    params.set("category_group_code", category.query);
    return `${KAKAO_LOCAL_API_BASE}/v2/local/search/category.json?${params}`;
  }

  params.set("query", category.query);
  return `${KAKAO_LOCAL_API_BASE}/v2/local/search/keyword.json?${params}`;
}

async function searchNearbyCategory(
  apiKey: string,
  category: (typeof NEARBY_CATEGORIES)[number],
  center: { latitude: number; longitude: number },
  radiusM: number,
): Promise<NearbyCategoryResult> {
  try {
    const response = await fetch(
      kakaoSearchUrl(category, center.longitude, center.latitude, radiusM),
      {
        headers: { Authorization: `KakaoAK ${apiKey}` },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!response.ok) {
      return {
        id: category.id,
        label: category.label,
        totalCount: 0,
        places: [],
        error: `${category.label} 검색을 불러오지 못했습니다.`,
      };
    }

    const payload = (await response.json()) as KakaoSearchResponse;
    const seen = new Set<string>();
    const places: NearbyPlace[] = [];
    for (const document of (payload.documents ?? []).slice(0, MAX_PLACES_PER_CATEGORY)) {
      const place = normalizePlace(document, category, center);
      if (!place || seen.has(place.id)) {
        continue;
      }
      seen.add(place.id);
      places.push(place);
    }

    const totalCount = parseNumber(payload.meta?.total_count);
    return {
      id: category.id,
      label: category.label,
      totalCount: Math.max(totalCount ?? places.length, places.length),
      places,
    };
  } catch {
    return {
      id: category.id,
      label: category.label,
      totalCount: 0,
      places: [],
      error: `${category.label} 검색을 불러오지 못했습니다.`,
    };
  }
}

export const runtime = "nodejs";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const latitude = parseNumber(searchParams.get("lat"));
  const longitude = parseNumber(searchParams.get("lng"));
  const radiusM = parseNumber(searchParams.get("radius"));

  if (latitude === null || longitude === null || (radiusM !== 300 && radiusM !== 500)) {
    return Response.json(
      { message: "유효한 지도 중심 좌표와 300m 또는 500m 반경이 필요합니다." },
      { status: 400 },
    );
  }

  const apiKey = process.env.KAKAO_REST_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      { message: "KAKAO_REST_API_KEY 설정을 확인해 주세요." },
      { status: 503 },
    );
  }

  const center = { latitude, longitude };
  const categories = await Promise.all(
    NEARBY_CATEGORIES.map((category) =>
      searchNearbyCategory(apiKey, category, center, radiusM),
    ),
  );

  return Response.json(
    { center, radiusM, categories },
    { headers: { "Cache-Control": "no-store" } },
  );
}
