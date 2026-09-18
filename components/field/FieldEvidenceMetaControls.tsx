"use client";

import type {
  ConfirmationRequirement,
  EvidenceSourceType,
  VerificationStatus,
} from "@/lib/evidence/types";
import {
  getConfirmationRequirementLabel,
  getEvidenceSourceLabel,
  getVerificationLabel,
} from "@/lib/evidence/presentation";
import type { FieldEvidenceMeta } from "@/lib/field/field-evidence-meta";

const SOURCE_OPTIONS: readonly EvidenceSourceType[] = [
  "FIELD_CHECK",
  "OWNER_STATEMENT",
  "TENANT_STATEMENT",
  "DOCUMENT",
  "CUSTOMER_INPUT",
  "EXPERT_STATEMENT",
];

const VERIFICATION_OPTIONS: readonly VerificationStatus[] = [
  "UNKNOWN",
  "ESTIMATED",
  "VERIFIED",
  "CONFLICTED",
  "STALE",
];

const CONFIRMATION_OPTIONS: readonly ConfirmationRequirement[] = [
  "NONE",
  "FIELD_CHECK_REQUIRED",
  "OWNER_CONFIRMATION_REQUIRED",
  "EXPERT_CONFIRMATION_REQUIRED",
  "AUTHORITY_CONFIRMATION_REQUIRED",
  "DOCUMENT_REQUIRED",
];

export function FieldEvidenceMetaControls({
  value,
  onChange,
  disabled,
}: {
  value: FieldEvidenceMeta;
  onChange: (next: FieldEvidenceMeta) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-2 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <label className="block text-xs font-semibold text-slate-600">
        근거 출처
        <select
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
          value={value.sourceType}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, sourceType: event.target.value as EvidenceSourceType })
          }
        >
          {SOURCE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {getEvidenceSourceLabel(option)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-semibold text-slate-600">
        확인 상태
        <select
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
          value={value.verificationStatus}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              verificationStatus: event.target.value as VerificationStatus,
            })
          }
        >
          {VERIFICATION_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {getVerificationLabel(option)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-semibold text-slate-600">
        추가 확인
        <select
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
          value={value.confirmationRequirement}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              confirmationRequirement: event.target.value as ConfirmationRequirement,
            })
          }
        >
          {CONFIRMATION_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {getConfirmationRequirementLabel(option)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-semibold text-slate-600">
        메모
        <input
          type="text"
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
          value={value.note ?? ""}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              note: event.target.value.trim() === "" ? undefined : event.target.value,
            })
          }
        />
      </label>
      <p className="text-xs text-slate-500">
        값을 입력해도 확인 상태가 자동으로 &quot;확인됨&quot;이 되지 않습니다. 임대인 진술은 출처일 뿐
        확인완료가 아닙니다.
      </p>
    </div>
  );
}
