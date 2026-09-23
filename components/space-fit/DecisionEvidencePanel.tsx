"use client";

import type {
  DecisionEvidenceBundle,
  DecisionEvidenceItem,
} from "@/lib/decision-evidence/types";

function ItemList({
  title,
  items,
}: {
  title: string;
  items: readonly DecisionEvidenceItem[];
}) {
  return (
    <section className="space-y-1">
      <h3 className="text-xs font-bold text-slate-800">
        {title}{" "}
        <span className="font-semibold text-slate-500">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-slate-500">해당 항목 없음</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded border border-slate-200 px-2 py-1.5 text-xs"
            >
              <p className="font-semibold">{item.title}</p>
              <p className="mt-0.5 text-slate-600">{item.description}</p>
              <p className="mt-0.5 text-[10px] text-slate-400">
                {item.sourceDomain} · {item.category}
                {item.importance === "CORE" ? " · CORE" : ""}
                {item.sourceType ? ` · ${item.sourceType}` : ""}
                {item.verificationStatus ? ` · ${item.verificationStatus}` : ""}
                {item.equipmentDataStatus ? ` · ${item.equipmentDataStatus}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function DecisionEvidencePanel({ bundle }: { bundle: DecisionEvidenceBundle }) {
  const { summary } = bundle;
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-bold">판단 근거 정리</h2>
        <p className="mt-1 text-xs text-slate-500">
          Geometry · 기술조건과 별도입니다. 점수·추천·위험 Verdict가 아닙니다.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-[#F8FAFC] px-3 py-2 text-xs">
        <p className="font-semibold">요약 (count만)</p>
        <ul className="mt-1 space-y-0.5 text-slate-700">
          <li>현장 확인 사실 {summary.observedFacts}</li>
          <li>관찰된 제약 {summary.observedConstraints}</li>
          <li>확인할 정보 {summary.missingInformation}</li>
          <li>전문가 확인사항 {summary.expertReviewItems}</li>
          <li>공간 Geometry 이슈 {summary.geometryIssues}</li>
        </ul>
      </div>

      <ItemList title="관찰된 제약" items={bundle.observedConstraints} />
      <ItemList
        title="확인할 정보 (CORE 우선)"
        items={bundle.missingInformation}
      />
      <ItemList title="전문가 확인사항" items={bundle.expertReviewItems} />
      <ItemList title="공간 Geometry 이슈" items={bundle.geometryIssues} />
      <ItemList title="현장 확인 사실" items={bundle.observedFacts} />

      <p className="border-t border-slate-200 pt-2 text-xs leading-relaxed text-slate-600">
        {bundle.disclaimer}
      </p>
    </div>
  );
}
