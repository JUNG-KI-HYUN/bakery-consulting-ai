"use client";

import { technicalCheckStatusLabel } from "@/lib/technical-check/helpers";
import type {
  EquipmentTechnicalCheck,
  TechnicalCheckAspect,
  TechnicalCheckReport,
} from "@/lib/technical-check/types";

function AspectRow({ aspect }: { aspect: TechnicalCheckAspect }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-slate-100 py-1.5 text-xs last:border-b-0">
      <span className="shrink-0 font-semibold text-slate-600">{labelForKind(aspect.kind)}</span>
      <div className="min-w-0 text-right">
        <p className="font-semibold text-slate-900">{technicalCheckStatusLabel(aspect.status)}</p>
        <p className="mt-0.5 text-slate-600">{aspect.message}</p>
      </div>
    </div>
  );
}

function labelForKind(kind: TechnicalCheckAspect["kind"]): string {
  switch (kind) {
    case "electrical":
      return "전기";
    case "water":
      return "급수";
    case "drainage":
      return "배수";
    case "exhaust":
      return "배기";
    case "delivery":
      return "반입";
  }
}

function EquipmentBlock({ check }: { check: EquipmentTechnicalCheck }) {
  return (
    <li className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-sm font-bold">{check.equipmentName}</p>
      <p className="text-xs font-semibold text-amber-900">{check.dataStatusNote}</p>
      {check.blockingNote ? (
        <p className="mt-1 text-xs font-semibold text-amber-800">{check.blockingNote}</p>
      ) : null}
      <div className="mt-2">
        <AspectRow aspect={check.electrical} />
        <AspectRow aspect={check.water} />
        <AspectRow aspect={check.drainage} />
        <AspectRow aspect={check.exhaust} />
        <AspectRow aspect={check.delivery} />
      </div>
    </li>
  );
}

export function TechnicalCheckPanel({ report }: { report: TechnicalCheckReport }) {
  const { statusCounts, powerSummary } = report;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-bold">기술조건 검토</h2>
        <p className="mt-1 text-xs text-slate-500">
          Geometry 경고와 별도입니다. Risk/Verdict/적합도 점수가 아닙니다.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-[#F8FAFC] px-3 py-2 text-xs">
        <p className="font-semibold">요약 (count만)</p>
        <ul className="mt-1 space-y-0.5 text-slate-700">
          <li>제약사항 관찰 {statusCounts.constraintObserved}</li>
          <li>자료 부족 {statusCounts.insufficientData}</li>
          <li>전문가 확인 필요 {statusCounts.expertReviewRequired}</li>
          <li>직접 충돌 미확인 {statusCounts.noConflictObserved}</li>
          <li>해당 없음 {statusCounts.notApplicable}</li>
        </ul>
      </div>

      <div className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
        <p className="font-semibold">확인된 장비 요구전력 합계</p>
        <p className="mt-1">
          {powerSummary.knownEquipmentPowerKw.toLocaleString("ko-KR")} kW
          <span className="text-slate-500">
            {" "}
            · 전력 미확인 장비 {powerSummary.unknownPowerEquipmentCount}대
          </span>
        </p>
        <p className="mt-1 text-slate-600">
          현장 계약전력:{" "}
          {powerSummary.fieldContractPowerKw != null
            ? `${powerSummary.fieldContractPowerKw.toLocaleString("ko-KR")} kW`
            : "확인되지 않음"}
        </p>
        {powerSummary.arithmeticMessage ? (
          <p className="mt-1 font-semibold text-amber-900">{powerSummary.arithmeticMessage}</p>
        ) : null}
        <p className="mt-1 text-slate-500">{powerSummary.expertDisclaimer}</p>
      </div>

      {report.equipmentChecks.length === 0 ? (
        <p className="text-sm text-slate-600">배치된 장비가 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {report.equipmentChecks.map((check) => (
            <EquipmentBlock key={check.equipmentInstanceId} check={check} />
          ))}
        </ul>
      )}

      <p className="border-t border-slate-200 pt-2 text-xs leading-relaxed text-slate-600">
        {report.disclaimer}
      </p>
    </section>
  );
}
