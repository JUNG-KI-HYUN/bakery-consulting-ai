import { Verdict } from "@/lib/diagnosis/types";

const colorMap: Record<Verdict, string> = {
  추천: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
  "조건부 추천": "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  보류: "bg-orange-100 text-orange-800 ring-1 ring-orange-200",
  위험: "bg-red-100 text-red-800 ring-1 ring-red-200",
};

export function RiskVerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span
      className={`rounded-full px-3.5 py-1.5 text-sm font-bold ${colorMap[verdict]}`}
    >
      {verdict}
    </span>
  );
}
