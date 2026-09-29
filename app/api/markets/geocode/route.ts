const KAKAO_ADDRESS_SEARCH_URL =
  "https://dapi.kakao.com/v2/local/search/address.json";
const KAKAO_KEYWORD_SEARCH_URL =
  "https://dapi.kakao.com/v2/local/search/keyword.json";

type KakaoAddressDocument = {
  address_name?: string;
  x?: string;
  y?: string;
  road_address?: {
    address_name?: string;
  };
};

type KakaoAddressResponse = {
  documents?: KakaoAddressDocument[];
};

type KakaoKeywordDocument = {
  id?: string;
  place_name?: string;
  address_name?: string;
  road_address_name?: string;
  x?: string;
  y?: string;
};

type KakaoKeywordResponse = {
  documents?: KakaoKeywordDocument[];
};

type GeocodeResult = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  source: "ADDRESS" | "KEYWORD";
};

function finiteCoordinate(value: string | undefined) {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) ? parsed : null;
}

export const runtime = "nodejs";

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address")?.trim();
  if (!address) {
    return Response.json({ message: "주소가 필요합니다." }, { status: 400 });
  }

  const apiKey = process.env.KAKAO_REST_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      { message: "KAKAO_REST_API_KEY 설정을 확인해 주세요." },
      { status: 503 },
    );
  }

  try {
    const headers = { Authorization: `KakaoAK ${apiKey}` };
    const [addressResponse, keywordResponse] = await Promise.all([
      fetch(`${KAKAO_ADDRESS_SEARCH_URL}?query=${encodeURIComponent(address)}`, {
        headers,
        signal: AbortSignal.timeout(12_000),
      }),
      fetch(
        `${KAKAO_KEYWORD_SEARCH_URL}?query=${encodeURIComponent(address)}&size=5`,
        { headers, signal: AbortSignal.timeout(12_000) },
      ),
    ]);
    if (!addressResponse.ok && !keywordResponse.ok) {
      return Response.json(
        { message: "주소 위치를 확인하지 못했습니다." },
        { status: 502 },
      );
    }

    const addressPayload = addressResponse.ok
      ? ((await addressResponse.json()) as KakaoAddressResponse)
      : { documents: [] };
    const keywordPayload = keywordResponse.ok
      ? ((await keywordResponse.json()) as KakaoKeywordResponse)
      : { documents: [] };
    const results: GeocodeResult[] = [];
    for (const [index, document] of (addressPayload.documents ?? []).slice(0, 5).entries()) {
      const latitude = finiteCoordinate(document.y);
      const longitude = finiteCoordinate(document.x);
      const resolvedAddress =
        document.road_address?.address_name?.trim() ||
        document.address_name?.trim();
      if (latitude === null || longitude === null || !resolvedAddress) continue;
      results.push({
        id: `address:${index}:${longitude}:${latitude}`,
        name: resolvedAddress,
        address: resolvedAddress,
        latitude,
        longitude,
        source: "ADDRESS",
      });
    }
    for (const [index, document] of (keywordPayload.documents ?? []).entries()) {
      const latitude = finiteCoordinate(document.y);
      const longitude = finiteCoordinate(document.x);
      const name = document.place_name?.trim();
      const resolvedAddress =
        document.road_address_name?.trim() || document.address_name?.trim();
      if (latitude === null || longitude === null || !name || !resolvedAddress) continue;
      const duplicate = results.some(
        (result) =>
          result.latitude === latitude && result.longitude === longitude,
      );
      if (duplicate) continue;
      results.push({
        id: document.id?.trim() || `keyword:${index}:${longitude}:${latitude}`,
        name,
        address: resolvedAddress,
        latitude,
        longitude,
        source: "KEYWORD",
      });
    }
    const first = results[0];
    if (!first) {
      return Response.json(
        { message: "주소 위치를 확인하지 못했습니다." },
        { status: 422 },
      );
    }

    return Response.json(
      {
        latitude: first.latitude,
        longitude: first.longitude,
        resolvedAddress: first.address,
        results,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { message: "주소 위치를 확인하지 못했습니다." },
      { status: 502 },
    );
  }
}
