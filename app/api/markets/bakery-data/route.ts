import { SeoulOpenDataClientError } from "@/lib/market-data/clients/seoul-open-data";
import { getBakeryOfficialMarketData } from "@/lib/market-data/services/bakery-official-market";

export const runtime = "nodejs";

function clientErrorResponse(error: SeoulOpenDataClientError) {
  if (error.kind === "validation") {
    return Response.json({ message: error.message }, { status: 400 });
  }

  if (error.kind === "configuration") {
    return Response.json(
      { message: "서울시 데이터 API 설정을 확인해 주세요." },
      { status: 503 },
    );
  }

  return Response.json(
    { message: "서울시 제과점 데이터를 불러오지 못했습니다." },
    { status: 502 },
  );
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const marketCode = searchParams.get("marketCode")?.trim();
  const rawQuarterCode = searchParams.get("quarterCode");
  const quarterCode =
    rawQuarterCode === null ? undefined : rawQuarterCode.trim();

  if (!marketCode || !/^\d+$/.test(marketCode)) {
    return Response.json(
      { message: "숫자로 된 공식상권 코드가 필요합니다." },
      { status: 400 },
    );
  }

  try {
    const data = await getBakeryOfficialMarketData({
      marketCode,
      ...(quarterCode === undefined ? {} : { quarterCode }),
      signal: request.signal,
    });

    return Response.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof SeoulOpenDataClientError) {
      return clientErrorResponse(error);
    }

    return Response.json(
      { message: "제과점 실데이터 조회 중 내부 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
