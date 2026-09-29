import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl py-4 sm:py-8 lg:py-12">
      <section className="border-b border-stone-300 pb-8 sm:pb-10">
        <p className="text-xs font-bold tracking-[0.18em] text-[#8b6f38]">FRAMEONE</p>
        <h2 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-stone-950 sm:text-4xl">베이커리 점포개발</h2>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-600 sm:text-base">
          상권 탐색부터 후보점포 검토, 사업성 확인과 리포트까지 계약 전 판단에 필요한 업무를 한 흐름으로 이어갑니다.
        </p>
      </section>

      <section className="py-8 sm:py-10" aria-labelledby="quick-work-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-stone-400">빠른 작업</p>
            <h3 id="quick-work-heading" className="mt-1 text-xl font-bold text-stone-950">어디서 시작할까요?</h3>
          </div>
        </div>
        <div className="mt-5 grid gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200 sm:grid-cols-2">
          <Link href="/markets" className="group bg-white p-5 transition-colors hover:bg-[#fbfaf7] sm:p-6">
            <span className="text-xs font-bold text-[#8b6f38]">분석</span>
            <strong className="mt-2 block text-lg text-stone-950">상권·입지 분석 시작</strong>
            <span className="mt-2 block text-sm leading-6 text-stone-500">분석대상을 정하고 입지, 경쟁환경, 임대시장과 사업성을 순서대로 확인합니다.</span>
            <span className="mt-5 inline-block text-sm font-bold text-stone-800 group-hover:underline">분석으로 이동 →</span>
          </Link>
          <Link href="/consultations" className="group bg-white p-5 transition-colors hover:bg-[#fbfaf7] sm:p-6">
            <span className="text-xs font-bold text-[#8b6f38]">후보점포</span>
            <strong className="mt-2 block text-lg text-stone-950">후보점포 확인</strong>
            <span className="mt-2 block text-sm leading-6 text-stone-500">저장된 후보점포를 확인하고 계약 전 진단과 기존 리포트로 이어갑니다.</span>
            <span className="mt-5 inline-block text-sm font-bold text-stone-800 group-hover:underline">후보점포로 이동 →</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
