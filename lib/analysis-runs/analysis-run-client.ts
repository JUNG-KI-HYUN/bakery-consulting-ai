import type { AnalysisRunSectionSaveInput, AnalysisRunSnapshot } from "./analysis-run-snapshot";

export async function persistAnalysisRunSection(input: AnalysisRunSectionSaveInput): Promise<AnalysisRunSnapshot> {
  const response = await fetch(`/api/analysis-runs/${encodeURIComponent(input.target.analysisRunId)}/sections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.json() as AnalysisRunSnapshot | { message?: string };
  if (!response.ok) throw new Error("message" in body && body.message ? body.message : "분석 결과를 저장하지 못했습니다.");
  return body as AnalysisRunSnapshot;
}
