import Link from "next/link";
import { notFound } from "next/navigation";
import { NewCandidateStoreForm } from "@/components/candidates/NewCandidateStoreForm";
import { getAnalysisRunSnapshot } from "@/lib/analysis-runs/analysis-run-repository";
import { getCase } from "@/lib/cases/case-repository";
import { parseActiveAnalysisTarget } from "@/lib/market-data/competition-location";

export const dynamic = "force-dynamic";

export default async function NewCandidateStorePage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { caseId } = await params;
  const caseRecord = await getCase(caseId);
  if (!caseRecord) notFound();
  const query = await searchParams;
  const requestedTarget = parseActiveAnalysisTarget(query);
  const linkedRun = requestedTarget?.analysisRunId.startsWith("basic-location-run:")
    ? await getAnalysisRunSnapshot(requestedTarget.analysisRunId)
    : null;
  const target = linkedRun?.targetSnapshot ?? requestedTarget;
  return (
    <div className="mx-auto max-w-4xl space-y-6 py-2 sm:py-5">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-300 pb-6">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-[#8b6f38]">CANDIDATE STORE · {caseRecord.name}</p>
          <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-stone-950 sm:text-3xl">후보점포 등록</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">확인된 기본정보와 현재 제시조건만 입력합니다.</p>
        </div>
        <Link href={`/cases/${encodeURIComponent(caseId)}`} className="btn-outline">Case로 돌아가기</Link>
      </header>
      <NewCandidateStoreForm
        caseId={caseId}
        initialLabel={target?.label ?? target?.address ?? ""}
        initialAddress={target?.address ?? ""}
        source={linkedRun ? "MARKET_ANALYSIS" : requestedTarget ? "MARKET_WORKSPACE" : "CASE_DIRECT"}
        linkedAnalysisRunId={linkedRun?.analysisRunId ?? null}
      />
    </div>
  );
}
