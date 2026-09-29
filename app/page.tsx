import Link from "next/link";
import { CASE_LIFECYCLE_LABELS, type CaseRecord } from "@/lib/cases/case-contract";
import { listCases } from "@/lib/cases/case-repository";

export const dynamic = "force-dynamic";

function CaseRow({ record }: { record: CaseRecord }) {
  return (
    <Link href={`/cases/${encodeURIComponent(record.caseId)}`} className="grid gap-3 border-b border-stone-200 px-4 py-4 transition-colors last:border-b-0 hover:bg-[#fbfaf7] sm:grid-cols-[minmax(0,1fr)_10rem_8rem] sm:items-center sm:px-5">
      <div className="min-w-0">
        <strong className="block truncate text-sm text-stone-950 sm:text-base">{record.name}</strong>
        <span className="mt-1 block truncate text-xs text-stone-500">{record.clientName}{record.preferredArea ? ` · ${record.preferredArea}` : ""}</span>
      </div>
      <span className="text-xs font-semibold text-stone-500">{record.targetOpeningDate ? `목표 ${record.targetOpeningDate}` : "목표일 미입력"}</span>
      <span className="w-fit rounded-full border border-[#d8c59b] bg-[#f8f2e6] px-2.5 py-1 text-[11px] font-bold text-[#725823]">{CASE_LIFECYCLE_LABELS[record.lifecycleStage]}</span>
    </Link>
  );
}

export default async function Home() {
  const cases = (await listCases()).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const activeCases = cases.filter((record) => record.status === "ACTIVE");
  const closedCases = cases.filter((record) => record.status === "CLOSED");

  return (
    <div className="mx-auto max-w-5xl py-4 sm:py-8 lg:py-12">
      <section className="flex flex-wrap items-end justify-between gap-5 border-b border-stone-300 pb-7 sm:pb-9">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-[#8b6f38]">FRAMEONE</p>
          <h2 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-stone-950 sm:text-4xl">진행 중 Case</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">고객별 베이커리 창업 프로젝트를 확인하고 다음 업무로 이어갑니다.</p>
        </div>
        <Link href="/cases/new" className="btn-primary">+ 새 Case</Link>
      </section>

      <section className="py-7 sm:py-9" aria-label="Case Inbox">
        {!cases.length ? (
          <div className="rounded-xl border border-dashed border-stone-300 bg-white px-5 py-12 text-center sm:py-16">
            <h3 className="text-lg font-bold text-stone-950">아직 생성된 Case가 없습니다.</h3>
            <p className="mt-2 text-sm text-stone-500">첫 베이커리 창업 프로젝트를 만들어보세요.</p>
            <Link href="/cases/new" className="btn-primary mt-6">새 Case 만들기</Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            {activeCases.length ? activeCases.map((record) => <CaseRow key={record.caseId} record={record} />) : (
              <p className="px-5 py-8 text-center text-sm text-stone-500">현재 진행 중인 Case가 없습니다.</p>
            )}
          </div>
        )}
        {closedCases.length ? (
          <div className="mt-8">
            <h3 className="mb-3 text-sm font-bold text-stone-700">종료된 Case</h3>
            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              {closedCases.map((record) => <CaseRow key={record.caseId} record={record} />)}
            </div>
          </div>
        ) : null}
      </section>

      <nav aria-label="기존 업무 바로가기" className="flex flex-wrap gap-x-5 gap-y-2 border-t border-stone-300 pt-5 text-sm font-semibold text-stone-600">
        <Link href="/markets" className="hover:text-stone-950 hover:underline">상권·입지 분석 시작</Link>
        <Link href="/consultations" className="hover:text-stone-950 hover:underline">후보점포 확인</Link>
      </nav>
    </div>
  );
}
