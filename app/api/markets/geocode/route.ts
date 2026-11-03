import {
  geocodeKakaoAddress,
  KakaoGeocodeError,
} from "@/lib/market-data/clients/kakao-geocode";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address")?.trim();
  if (!address) {
    return Response.json({ message: "주소가 필요합니다." }, { status: 400 });
  }

  try {
    const result = await geocodeKakaoAddress(address);

    return Response.json(
      {
        latitude: result.latitude,
        longitude: result.longitude,
        resolvedAddress: result.resolvedAddress,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status =
      error instanceof KakaoGeocodeError && error.code === "MISSING_API_KEY"
        ? 503
        : error instanceof KakaoGeocodeError && error.code === "NOT_FOUND"
          ? 422
          : 502;
    return Response.json(
      {
        message:
          error instanceof KakaoGeocodeError
            ? error.message
            : "주소 위치를 확인하지 못했습니다.",
      },
      { status },
    );
  }
}
