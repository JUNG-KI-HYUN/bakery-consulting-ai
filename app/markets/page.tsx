import type { Metadata } from "next";
import marketHierarchyJson from "@/data/seoul-market/v1.1-final/MARKET_HIERARCHY.json";
import { getCase } from "@/lib/cases/case-repository";
import { getAnalysisRunSnapshot } from "@/lib/analysis-runs/analysis-run-repository";
import { parseActiveAnalysisTarget } from "@/lib/market-data/competition-location";
import { revalidateActiveTargetOfficialReference } from "@/lib/market-data/official-market-reference.server";
import MarketsExplorer, { type MarketHierarchy } from "./MarketsExplorer";

export const metadata: Metadata = {
  title: "상권분석 | 프레임원 베이커리 창업진단 AI",
  description: "FRAMEONE 서울 주요상권과 세부상권, Node 구조를 탐색합니다.",
};

const marketHierarchy = marketHierarchyJson as unknown as MarketHierarchy;

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const requestedCaseIdValue = Array.isArray(query.caseId) ? query.caseId[0] : query.caseId;
  const requestedCaseId = requestedCaseIdValue?.trim() || null;
  const caseRecord = requestedCaseId ? await getCase(requestedCaseId) : null;
  const activeTarget = await revalidateActiveTargetOfficialReference(
    parseActiveAnalysisTarget(query),
  );
  const persistedRun = activeTarget
    ? await getAnalysisRunSnapshot(activeTarget.analysisRunId)
    : null;
  const requestedView = Array.isArray(query.view) ? query.view[0] : query.view;
  const workflowStep = requestedView === "location"
    ? "location"
    : requestedView === "evidence"
      ? "evidence"
      : "target";
  const initialTab = requestedView === "location"
    ? "market-map"
    : requestedView === "evidence"
      ? "public-data"
      : "briefing";
  return (
    <div className="space-y-4">
      <MarketsExplorer
        key={requestedCaseId ?? "direct-market-workspace"}
        hierarchy={marketHierarchy}
        initialTarget={activeTarget}
        initialLocationResult={persistedRun?.sections.location?.versions.at(-1)?.result ?? null}
        initialTab={initialTab}
        workflowStep={workflowStep}
        requestedCaseId={requestedCaseId}
        caseContext={caseRecord ? {
          caseId: caseRecord.caseId,
          name: caseRecord.name,
          analysisRunIds: caseRecord.analysisRunIds,
        } : null}
      />
    </div>
  );
}
