export type MarketWorkflowStep = "target" | "location" | "competition" | "rental" | "economic" | "candidate" | "evidence";

export const MARKET_WORKFLOW_STEPS: Array<{
  id: MarketWorkflowStep;
  label: string;
  pathname: string;
}> = [
  { id: "target", label: "1. 분석대상", pathname: "/markets?view=target" },
  { id: "location", label: "2. 입지·상권", pathname: "/markets?view=location" },
  { id: "competition", label: "3. 경쟁환경", pathname: "/markets/competition-structure" },
  { id: "rental", label: "4. 임대시장", pathname: "/markets/rental-research" },
  { id: "economic", label: "5. 사업성·손익", pathname: "/markets/economic-feasibility" },
  { id: "candidate", label: "6. 후보점포 진단", pathname: "/consultations/new" },
  { id: "evidence", label: "7. 데이터·근거", pathname: "/markets?view=evidence" },
];

export function caseAwareMarketWorkflowPath(
  step: (typeof MARKET_WORKFLOW_STEPS)[number],
  caseId: string | null,
) {
  const normalizedCaseId = caseId?.trim() ?? "";
  if (!normalizedCaseId) return step.pathname;
  if (step.id === "candidate") {
    return `/cases/${encodeURIComponent(normalizedCaseId)}/candidates/new?origin=market`;
  }
  const url = new URL(step.pathname, "https://frameone.local");
  url.searchParams.set("caseId", normalizedCaseId);
  return `${url.pathname}${url.search}`;
}
