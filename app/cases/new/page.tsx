import Link from "next/link";
import { NewCaseForm } from "@/components/cases/NewCaseForm";

export default function NewCasePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 py-2 sm:py-5">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-300 pb-6">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-[#8b6f38]">NEW CASE</p>
          <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-stone-950 sm:text-3xl">새 베이커리 창업 프로젝트</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">고객과 프로젝트를 구분할 최소 정보부터 등록합니다.</p>
        </div>
        <Link href="/" className="btn-outline">홈으로 돌아가기</Link>
      </header>
      <NewCaseForm />
    </div>
  );
}
