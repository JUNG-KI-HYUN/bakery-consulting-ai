import { InteriorSketchInput } from "@/lib/diagnosis/types";

function Cell({ title, content }: { title: string; content: string }) {
  return (
    <article className="rounded-lg border border-amber-200 bg-white p-3">
      <p className="text-xs font-semibold text-amber-700">{title}</p>
      <p className="mt-1 text-sm text-slate-700">{content}</p>
    </article>
  );
}

export function InteriorSketchBoard({ sketch }: { sketch: InteriorSketchInput }) {
  return (
    <section className="rounded-xl border border-amber-200 bg-[#FFF7ED] p-4">
      <h3 className="text-base font-semibold text-[#0B1220]">간단 스케치 보드</h3>
      <p className="mt-1 text-xs text-slate-600">
        정식 설계도가 아니라, 계약 전 가능성을 보는 간단 스케치입니다.
      </p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <Cell title="전면 / 입구" content={`운영 방식: ${sketch.operationType}`} />
        <Cell title="쇼케이스 / 판매존" content={sketch.showcasePosition} />
        <Cell title="카운터 / 픽업존" content={sketch.counterPosition} />
        <Cell title="제조공간 / 홀" content={`${sketch.kitchenPosition} · ${sketch.hallUsage}`} />
      </div>
    </section>
  );
}
