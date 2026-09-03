import type { ReactNode } from "react";
import type { Evidence } from "@/lib/evidence/types";
import {
  formatEvidenceTimestamp,
  formatEvidenceValue,
  getEvidenceSourceHref,
  getEvidenceSourceLabel,
  getEvidenceValueTypeLabel,
  getVerificationLabel,
} from "@/lib/evidence/presentation";
import { EvidenceSourceBadge, EvidenceStatusBadge, EvidenceValueTypeBadge } from "./EvidenceBadges";

export interface EvidenceViewerProps {
  evidence: Evidence;
  /** 화면에서 사용하는 쉬운 항목명. 내부 fieldPath를 기본 제목으로 사용하지 않는다. */
  label?: string;
  audience?: "staff" | "customer";
  /** 고객 전달용으로 검토한 제한사항. 내부 limitation/description을 자동 공개하지 않는다. */
  customerLimitation?: string;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-b border-slate-100 py-2.5 last:border-b-0 sm:grid sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-1 min-w-0 whitespace-pre-wrap break-words text-sm text-slate-800 sm:mt-0">{children}</dd>
    </div>
  );
}

/** 표시수준만 구분한다. 데이터 접근권한이나 서버 응답 필터링을 대신하지 않는다. */
export function EvidenceViewer({
  evidence,
  label = "근거 정보",
  audience = "customer",
  customerLimitation,
}: EvidenceViewerProps) {
  const staff = audience === "staff";
  const structuredValue = evidence.assertedValue !== null && typeof evidence.assertedValue === "object";
  const scalarValue = structuredValue ? undefined : formatEvidenceValue(evidence.assertedValue);
  const sourceHref = staff ? getEvidenceSourceHref(evidence.sourceUrl) : undefined;
  const limitation = staff ? evidence.limitation : customerLimitation;

  return (
    <section aria-label={label} className="panel-card min-w-0 p-4">
      <p className="text-sm font-semibold text-slate-900">{label}</p>
      {evidence.assertedValue !== undefined && (
        <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm text-slate-700">
          {structuredValue ? "구조화된 값" : scalarValue}
          {!structuredValue && evidence.assertedValue !== null && evidence.unit ? ` ${evidence.unit}` : ""}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <EvidenceStatusBadge status={evidence.verificationStatus} />
        <EvidenceValueTypeBadge valueType={evidence.valueType} />
        <EvidenceSourceBadge sourceType={evidence.sourceType} />
      </div>
      <details className="mt-3">
        <summary className="w-fit cursor-pointer rounded px-1 py-1 text-sm font-semibold text-blue-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
          근거 보기<span className="sr-only">: {label}</span>
        </summary>
        <dl className="mt-2 border-t border-slate-200 pt-1">
          <DetailRow label="당시 값">
            {structuredValue ? (
              staff ? (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 text-xs">
                  {formatEvidenceValue(evidence.assertedValue)}
                </pre>
              ) : "상세 값은 직원에게 확인해 주세요."
            ) : scalarValue}
          </DetailRow>
          {evidence.unit !== undefined && <DetailRow label="단위">{evidence.unit}</DetailRow>}
          <DetailRow label="검증상태">{getVerificationLabel(evidence.verificationStatus)}</DetailRow>
          <DetailRow label="값의 성격">{getEvidenceValueTypeLabel(evidence.valueType) ?? "미기록"}</DetailRow>
          <DetailRow label="출처">{getEvidenceSourceLabel(evidence.sourceType)}</DetailRow>
          <DetailRow label="확인일">{formatEvidenceTimestamp(evidence.checkedAt)}</DetailRow>
          {evidence.effectiveAt !== undefined && (
            <DetailRow label="자료 기준일">{formatEvidenceTimestamp(evidence.effectiveAt)}</DetailRow>
          )}
          {staff && (
            <>
              {evidence.description !== undefined && <DetailRow label="설명·메모">{evidence.description}</DetailRow>}
              {evidence.checkedBy !== undefined && <DetailRow label="확인자">{evidence.checkedBy}</DetailRow>}
              {evidence.observedAt !== undefined && (
                <DetailRow label="관찰·측정일">{formatEvidenceTimestamp(evidence.observedAt)}</DetailRow>
              )}
              {evidence.expiresAt !== undefined && (
                <DetailRow label="만료·재확인일">{formatEvidenceTimestamp(evidence.expiresAt)}</DetailRow>
              )}
              {evidence.createdAt !== undefined && (
                <DetailRow label="근거 기록일">{formatEvidenceTimestamp(evidence.createdAt)}</DetailRow>
              )}
              <DetailRow label="근거 ID">{evidence.id}</DetailRow>
              {evidence.fieldPath !== undefined && <DetailRow label="필드 경로">{evidence.fieldPath}</DetailRow>}
              {evidence.sourceRef !== undefined && <DetailRow label="원본 참조">{evidence.sourceRef}</DetailRow>}
              {evidence.sourceUrl !== undefined && (
                <DetailRow label="원본 URL">
                  {sourceHref ? (
                    <a href={sourceHref} target="_blank" rel="noopener noreferrer" className="break-all text-blue-800 underline">
                      {evidence.sourceUrl}<span className="sr-only"> (새 탭)</span>
                    </a>
                  ) : <span className="break-all">{evidence.sourceUrl}</span>}
                </DetailRow>
              )}
            </>
          )}
          {limitation !== undefined && <DetailRow label="제한사항">{limitation}</DetailRow>}
        </dl>
      </details>
    </section>
  );
}
