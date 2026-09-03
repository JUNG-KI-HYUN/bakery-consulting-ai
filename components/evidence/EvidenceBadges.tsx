import type { Evidence, EvidenceSourceType, VerificationStatus } from "@/lib/evidence/types";
import {
  getEvidenceSourceLabel,
  getEvidenceValueTypeLabel,
  getVerificationLabel,
} from "@/lib/evidence/presentation";

const badgeClass = "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold";
const statusClasses: Record<VerificationStatus, string> = {
  VERIFIED: "border-blue-200 bg-blue-50 text-blue-800",
  ESTIMATED: "border-indigo-200 bg-indigo-50 text-indigo-800",
  UNKNOWN: "border-amber-300 bg-amber-50 text-amber-900",
  CONFLICTED: "border-violet-300 bg-violet-50 text-violet-900",
  STALE: "border-orange-300 bg-orange-50 text-orange-900",
};

export function EvidenceStatusBadge({ status }: { status: VerificationStatus }) {
  const label = getVerificationLabel(status);
  return (
    <span
      className={`${badgeClass} ${statusClasses[status]}`}
      aria-label={`검증상태: ${label}`}
      title="근거의 검증상태이며 점포의 안전 여부를 뜻하지 않습니다."
    >
      {label}
    </span>
  );
}

export function EvidenceValueTypeBadge({ valueType }: { valueType?: Evidence["valueType"] }) {
  const label = getEvidenceValueTypeLabel(valueType);
  if (label === undefined) return null;
  return (
    <span className={`${badgeClass} border-slate-200 bg-white text-slate-700`} aria-label={`값의 성격: ${label}`}>
      {label}
    </span>
  );
}

export function EvidenceSourceBadge({ sourceType }: { sourceType: EvidenceSourceType }) {
  const label = getEvidenceSourceLabel(sourceType);
  return (
    <span className={`${badgeClass} border-slate-200 bg-slate-50 text-slate-700`} aria-label={`출처: ${label}`}>
      {label}
    </span>
  );
}
