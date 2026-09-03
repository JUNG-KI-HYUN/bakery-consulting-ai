const KAKAO_ADDRESS_SEARCH_URL =
  "https://dapi.kakao.com/v2/local/search/address.json";

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
    const response = await fetch(
      `${KAKAO_ADDRESS_SEARCH_URL}?query=${encodeURIComponent(address)}`,
      {
        headers: { Authorization: `KakaoAK ${apiKey}` },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!response.ok) {
      return Response.json(
        { message: "주소 위치를 확인하지 못했습니다." },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as KakaoAddressResponse;
    const document = payload.documents?.[0];
    const latitude = Number(document?.y);
    const longitude = Number(document?.x);
    if (
      !document?.x ||
      !document.y ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return Response.json(
        { message: "주소 위치를 확인하지 못했습니다." },
        { status: 422 },
      );
    }

    return Response.json(
      {
        latitude,
        longitude,
        resolvedAddress:
          document.road_address?.address_name ||
          document.address_name ||
          address,
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
