import { generatePork33DecisionBatch, type Pork33DecisionBatchOptions } from "@/lib/pork33-candidate-shortlist/decision-batch.server";
import { loadCurrentPork33State } from "@/lib/pork33-candidate-shortlist/repository.server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as Partial<Pork33DecisionBatchOptions>;
    const options: Pork33DecisionBatchOptions = {
      all: body.all !== false,
      regions: body.regions !== false,
    };
    return Response.json(await generatePork33DecisionBatch(await loadCurrentPork33State(), options));
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "PORK33 의사결정 리포트 V2를 생성하지 못했습니다." }, { status: 500 });
  }
}
