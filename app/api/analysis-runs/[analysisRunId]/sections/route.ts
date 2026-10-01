import { saveAnalysisRunSection } from "@/lib/analysis-runs/analysis-run-repository";
import { AnalysisRunSnapshotValidationError, type AnalysisRunSectionSaveInput } from "@/lib/analysis-runs/analysis-run-snapshot";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ analysisRunId: string }> },
) {
  try {
    const { analysisRunId } = await params;
    const input = await request.json() as AnalysisRunSectionSaveInput;
    if (input?.target?.analysisRunId !== analysisRunId) {
      return Response.json({ message: "URL과 payload의 analysisRunId가 일치하지 않습니다." }, { status: 400 });
    }
    return Response.json(await saveAnalysisRunSection(input), { status: 200 });
  } catch (error) {
    if (error instanceof AnalysisRunSnapshotValidationError) {
      return Response.json({ message: error.message }, { status: 400 });
    }
    console.error("Analysis Run section save failed", error);
    return Response.json({ message: "분석 결과를 저장하지 못했습니다." }, { status: 500 });
  }
}
