import { DiagnosisResult } from "@/lib/diagnosis/types";

export function InteriorSketchReportSection({
  result,
}: {
  result: DiagnosisResult;
}) {
  return (
    <section className="print-card rounded-xl border border-amber-200 bg-[#FFF7ED] p-4">
      <h2 className="font-semibold">공간 활용 스케치</h2>
      <p className="mt-1 text-sm text-slate-700">
        정식 도면 전, 먼저 보는 매장 구성 아이디어
      </p>
      <div className="mt-3 overflow-hidden rounded-xl border border-amber-300 bg-white">
        <div className="grid grid-cols-6 gap-px bg-amber-200 text-sm">
          <article className="col-span-6 bg-white p-3">
            <h3 className="text-xs font-semibold text-amber-700">전면 / 입구</h3>
            <p className="mt-1">{result.sections.layoutIdea || "확인 필요"}</p>
          </article>
          <article className="col-span-3 bg-white p-3">
            <h3 className="text-xs font-semibold text-amber-700">쇼케이스 / 판매존</h3>
            <p className="mt-1">{result.sections.equipmentPlacementIdea || "확인 필요"}</p>
          </article>
          <article className="col-span-3 bg-white p-3">
            <h3 className="text-xs font-semibold text-amber-700">카운터 / 픽업존</h3>
            <p className="mt-1">{result.sections.layoutIdea || "확인 필요"}</p>
          </article>
          <article className="col-span-3 bg-white p-3">
            <h3 className="text-xs font-semibold text-amber-700">제조공간</h3>
            <p className="mt-1">{result.sections.interiorToneSuggestion || "확인 필요"}</p>
          </article>
          <article className="col-span-3 bg-white p-3">
            <h3 className="text-xs font-semibold text-amber-700">홀 좌석 / 대기공간</h3>
            <p className="mt-1">{result.sections.hallUsageIdea || "확인 필요"}</p>
          </article>
          <article className="col-span-3 bg-white p-3">
            <h3 className="text-xs font-semibold text-amber-700">고객 동선</h3>
            <p className="mt-1">{result.sections.customerFlowOpinion || "확인 필요"}</p>
          </article>
          <article className="col-span-3 bg-white p-3">
            <h3 className="text-xs font-semibold text-amber-700">직원 동선</h3>
            <p className="mt-1">{result.sections.staffFlowOpinion || "확인 필요"}</p>
          </article>
          <article className="col-span-6 bg-white p-3">
            <h3 className="text-xs font-semibold text-amber-700">저비용 개선 아이디어</h3>
            <p className="mt-1">{result.sections.lowCostInteriorIdeas || "확인 필요"}</p>
          </article>
          <article className="col-span-6 bg-white p-3">
            <h3 className="text-xs font-semibold text-amber-700">전문가 확인 필요사항</h3>
            <p className="mt-1">{result.sections.interiorCheckRequired || "확인 필요"}</p>
          </article>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-600">
        본 스케치는 정식 설계도면이 아닙니다. 실제 공사 가능 여부는 현장 실측,
        인테리어 업체, 전기·소방·위생·급배수·배기 전문가 확인이 필요합니다.
      </p>
    </section>
  );
}
