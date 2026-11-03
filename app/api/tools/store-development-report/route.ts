import { generateStoreDevelopmentReport, loadStoreDevelopmentReportCenterWorkspace } from "@/lib/store-development-report/pork33-adapter.server";
import { parseReportGenerationRequest } from "@/lib/store-development-report/report-center";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await loadStoreDevelopmentReportCenterWorkspace(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "보고서 센터 자료를 읽지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    return Response.json(await generateStoreDevelopmentReport(parseReportGenerationRequest(body)));
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "보고서를 생성하지 못했습니다." }, { status: 400 });
  }
}
