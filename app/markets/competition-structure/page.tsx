import type { Metadata } from "next";
import { parseActiveAnalysisTarget } from "@/lib/market-data/competition-location";
import { revalidateActiveTargetOfficialReference } from "@/lib/market-data/official-market-reference.server";
import { getAnalysisRunSnapshot } from "@/lib/analysis-runs/analysis-run-repository";
import CompetitionStructureClient from "./CompetitionStructureClient";

export const metadata: Metadata = {
  title: "경쟁환경 | 프레임원 베이커리 창업진단 AI",
  description:
    "Kakao 검색 관측 후보와 서울 공식상권 제과점 참고자료를 분리해 확인합니다.",
};

export default async function CompetitionStructurePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const caseIdValue = Array.isArray(query.caseId) ? query.caseId[0] : query.caseId;
  const caseId = caseIdValue?.trim() || null;
  const initialTarget = await revalidateActiveTargetOfficialReference(
    parseActiveAnalysisTarget(query),
  );
  const persistedRun = initialTarget
    ? await getAnalysisRunSnapshot(initialTarget.analysisRunId)
    : null;
  return (
    <div className="space-y-4">
      <CompetitionStructureClient
        caseId={caseId}
        initialTarget={initialTarget}
        initialPersistedResult={persistedRun?.sections.competition?.versions.at(-1) ?? null}
      />
    </div>
  );
}
