const KAKAO_ADDRESS_SEARCH_URL =
  "https://dapi.kakao.com/v2/local/search/address.json";

type KakaoAddressDocument = {
  address_name?: string;
  x?: string;
  y?: string;
  road_address?: { address_name?: string };
};

type KakaoAddressResponse = { documents?: KakaoAddressDocument[] };

export type KakaoGeocodeResult = {
  latitude: number;
  longitude: number;
  resolvedAddress: string;
};

export type KakaoGeocodeFailure =
  | "MISSING_API_KEY"
  | "NOT_FOUND"
  | "PROVIDER_ERROR";

export class KakaoGeocodeError extends Error {
  constructor(
    readonly code: KakaoGeocodeFailure,
    message: string,
  ) {
    super(message);
    this.name = "KakaoGeocodeError";
  }
}

export async function geocodeKakaoAddress(
  address: string,
  options: {
    apiKey?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<KakaoGeocodeResult> {
  const normalizedAddress = address.trim();
  const apiKey = options.apiKey?.trim() || process.env.KAKAO_REST_API_KEY?.trim();
  if (!apiKey) {
    throw new KakaoGeocodeError(
      "MISSING_API_KEY",
      "KAKAO_REST_API_KEY 설정을 확인해 주세요.",
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(
      `${KAKAO_ADDRESS_SEARCH_URL}?query=${encodeURIComponent(normalizedAddress)}`,
      {
        headers: { Authorization: `KakaoAK ${apiKey}` },
        signal: AbortSignal.timeout(options.timeoutMs ?? 12_000),
      },
    );
  } catch {
    throw new KakaoGeocodeError(
      "PROVIDER_ERROR",
      "주소 위치를 확인하지 못했습니다.",
    );
  }

  if (!response.ok) {
    throw new KakaoGeocodeError(
      "PROVIDER_ERROR",
      "주소 위치를 확인하지 못했습니다.",
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
    throw new KakaoGeocodeError("NOT_FOUND", "주소 위치를 확인하지 못했습니다.");
  }

  return {
    latitude,
    longitude,
    resolvedAddress:
      document.road_address?.address_name ||
      document.address_name ||
      normalizedAddress,
  };
}
