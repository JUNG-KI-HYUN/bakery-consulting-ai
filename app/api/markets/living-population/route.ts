import { analyzeCurrentRadiusLivingPopulation } from "@/lib/market-data/basic-location/radius-living-population-service.server";
import {
  RadiusLivingPopulationRuntimeValidationError,
  parseRadiusLivingPopulationApiRequest,
  toRadiusLivingPopulationApiResponse,
} from "@/lib/market-data/basic-location/radius-living-population-runtime";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  try {
    const input = parseRadiusLivingPopulationApiRequest(await request.json());
    const response = await analyzeCurrentRadiusLivingPopulation(input);
    return Response.json(toRadiusLivingPopulationApiResponse(response), { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof RadiusLivingPopulationRuntimeValidationError) {
      return Response.json(
        { message: "생활인구 분석 요청을 확인해 주세요." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
    console.error("Living population radius analysis failed.", error);
    return Response.json(
      { message: "생활인구 분석을 완료하지 못했습니다." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
