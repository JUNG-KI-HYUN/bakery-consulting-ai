import { DiagnosisResult } from "@/lib/diagnosis/types";

export function InteriorSketchReportSection({
  result,
}: {
  result: DiagnosisResult;
}) {
  return (
    <section className="rounded-xl border border-amber-200 bg-[#FFF7ED] p-4">
      <h2 className="font-semibold">공간 활용 스케치</h2>
      <p className="mt-1 text-sm text-slate-700">
        정식 도면 전, 먼저 보는 매장 구성 아이디어
      </p>
      <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
        <article className="rounded border border-amber-200 bg-white p-3">
          <h3 className="font-semibold">1. 추천 인테리어 톤</h3>
          <p className="mt-1">{result.sections.interiorToneSuggestion}</p>
        </article>
        <article className="rounded border border-amber-200 bg-white p-3">
          <h3 className="font-semibold">2. 제조공간 배치 방향</h3>
          <p className="mt-1">{result.sections.layoutIdea}</p>
        </article>
        <article className="rounded border border-amber-200 bg-white p-3">
          <h3 className="font-semibold">3. 쇼케이스·카운터 위치 아이디어</h3>
          <p className="mt-1">{result.sections.equipmentPlacementIdea}</p>
        </article>
        <article className="rounded border border-amber-200 bg-white p-3">
          <h3 className="font-semibold">4. 홀/대기공간 활용</h3>
          <p className="mt-1">{result.sections.hallUsageIdea}</p>
        </article>
        <article className="rounded border border-amber-200 bg-white p-3">
          <h3 className="font-semibold">5. 고객 동선</h3>
          <p className="mt-1">{result.sections.customerFlowOpinion}</p>
        </article>
        <article className="rounded border border-amber-200 bg-white p-3">
          <h3 className="font-semibold">6. 직원 동선</h3>
          <p className="mt-1">{result.sections.staffFlowOpinion}</p>
        </article>
        <article className="rounded border border-amber-200 bg-white p-3 md:col-span-2">
          <h3 className="font-semibold">7. 저비용 개선 아이디어</h3>
          <p className="mt-1">{result.sections.lowCostInteriorIdeas}</p>
        </article>
        <article className="rounded border border-amber-200 bg-white p-3 md:col-span-2">
          <h3 className="font-semibold">8. 전문가 확인 필요사항</h3>
          <p className="mt-1">{result.sections.interiorCheckRequired}</p>
        </article>
      </div>
      <p className="mt-3 text-xs text-slate-600">
        본 스케치는 정식 설계도면이 아닙니다. 계약 전 공간 활용 가능성을 검토하기
        위한 참고자료이며, 실제 공사 가능 여부는 인테리어 업체, 전기·소방·위생설비
        전문가 확인이 필요합니다.
      </p>
    </section>
  );
}
