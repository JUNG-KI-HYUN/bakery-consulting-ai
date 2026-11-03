import { generatePork33BriefingBatch, type Pork33BriefingBatchOptions } from "@/lib/pork33-candidate-shortlist/briefing-batch.server";
import { loadCurrentPork33State } from "@/lib/pork33-candidate-shortlist/repository.server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as Partial<Pork33BriefingBatchOptions>;
    const options: Pork33BriefingBatchOptions = {
      all: body.all !== false,
      regions: body.regions !== false,
      candidates: body.candidates !== false,
    };
    return Response.json(await generatePork33BriefingBatch(await loadCurrentPork33State(), options));
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "본사 브리핑 PDF를 생성하지 못했습니다." }, { status: 500 });
  }
}
