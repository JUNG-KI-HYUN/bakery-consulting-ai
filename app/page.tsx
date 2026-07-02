import Link from "next/link";
import { BentoCard } from "@/components/ui/BentoCard";
import { getConsultations } from "@/lib/diagnosis/diagnosis-service";

const statMeta: Record<string, { label: string; accent?: string }> = {
  "전체 상담 건수": { label: "TOTAL" },
  "진단 진행 중": { label: "IN PROGRESS", accent: "text-[#2563EB]" },
  "리포트 생성 완료": { label: "REPORT", accent: "text-[#10B981]" },
  "조건부 추천 점포 수": { label: "CONDITIONAL", accent: "text-[#F59E0B]" },
  "보류/위험 점포 수": { label: "RISK", accent: "text-[#EF4444]" },
};

export default async function Home() {
  const list = await getConsultations();
  const total = list.length;
  const inProgress = list.length;
  const reportDone = 1;
  const conditional = 1;
  const holdOrRisk = 1;

  const cards = [
    ["전체 상담 건수", total],
    ["진단 진행 중", inProgress],
    ["리포트 생성 완료", reportDone],
    ["조건부 추천 점포 수", conditional],
    ["보류/위험 점포 수", holdOrRisk],
  ] as const;

  return (
    <div className="space-y-8">
      <section className="panel-card grid gap-6 rounded-2xl bg-gradient-to-br from-white to-[#FFF7ED] p-6 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#F59E0B]">
            AI 기반 베이커리 창업 점포진단
          </p>
          <h2 className="mt-2 text-2xl font-bold leading-snug text-[#0B1220] md:text-3xl">
            이 점포, 계약해도 괜찮을까요?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[#334155]">
            입지·월세·시설·손익·브랜드까지 계약 전에 먼저 확인해볼게요.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/consultations/new" className="btn-primary">
              점포 진단 시작
            </Link>
            <Link href="/reports/sample-001" className="btn-outline">
              샘플 리포트 보기
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            브랜드와 오픈 마케팅도 같이 봅니다.
          </p>
        </div>
        <div className="panel-card rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-[#0B1220]">오늘의 진단 흐름</h3>
          <ol className="mt-4 space-y-3 text-sm text-[#334155]">
            {[
              "후보 점포 입력",
              "시설·장비 체크",
              "손익분기점 추정",
              "최종 판단 리포트",
            ].map((step, i) => (
              <li key={step} className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0B1220] text-xs font-bold text-white">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            AI가 먼저 정리하고, 전문가가 최종 확인합니다.
          </p>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        {cards.map(([label, count]) => {
          const meta = statMeta[label];
          return (
            <article key={label} className="panel-card rounded-2xl p-4">
              <p className={`text-[10px] font-bold tracking-wider ${meta.accent ?? "text-slate-400"}`}>
                {meta.label}
              </p>
              <p className="mt-1 text-xs text-slate-500">{label}</p>
              <p className={`mt-2 text-3xl font-bold ${meta.accent ?? "text-[#0B1220]"}`}>
                {count}
              </p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <BentoCard
          title="계약 전 리스크"
          description="상권이 좋아도, 시설이 막히면 보류가 안전합니다."
          accent="risk"
        />
        <BentoCard
          title="손익 생존선"
          description="이 월세, 매달 버틸 수 있을지 먼저 계산합니다."
          accent="finance"
        />
        <BentoCard
          title="브랜드 설계"
          description="손님이 왜 이 빵집을 기억해야 할지 같이 봅니다."
          accent="default"
        />
        <BentoCard
          title="공간 활용"
          description="제조공간, 쇼케이스, 홀 동선을 간단히 그려봅니다."
          accent="marketing"
        />
      </section>
    </div>
  );
}
