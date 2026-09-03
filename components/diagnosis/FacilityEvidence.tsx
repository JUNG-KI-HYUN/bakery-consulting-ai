import type { ReactNode } from "react";
import type { FacilityCheckInput } from "@/lib/diagnosis/types";
import type { Evidence } from "@/lib/evidence/types";
import { getEvidenceForField } from "@/lib/evidence/field";
import { formatEvidenceValue } from "@/lib/evidence/presentation";
import { EvidenceViewer } from "@/components/evidence/EvidenceViewer";

const facilityEvidenceFields = [
  { key: "electricCapacity", label: "전기 용량" },
  { key: "electricExpansionPossible", label: "전기 증설 가능 여부" },
  { key: "exhaustPossible", label: "배기 가능 여부" },
  { key: "plumbingPossible", label: "급배수 가능 여부" },
  { key: "fireSafetyChecked", label: "소방 확인 여부" },
  { key: "ovenMovePossible", label: "오븐 반입 가능성" },
] as const satisfies readonly { key: keyof FacilityCheckInput; label: string }[];

/** label 바깥에 배치하여 근거 열기가 기존 input/checkbox 동작에 영향을 주지 않게 한다. */
export function FacilityEvidenceField({
  fieldKey,
  evidence,
  children,
}: {
  fieldKey: keyof FacilityCheckInput;
  evidence?: readonly Evidence[];
  children: ReactNode;
}) {
  const field = facilityEvidenceFields.find((item) => item.key === fieldKey);
  if (!field) return children;
  const matches = getEvidenceForField(evidence, `facilityCheck.${field.key}`);
  if (matches.length === 0) return children;

  return (
    <div className="min-w-0">
      {children}
      <div className="mt-2 space-y-2" role="group" aria-label={`${field.label} 기록된 근거`}>
        <p className="text-xs font-semibold text-slate-500">기록된 근거 {matches.length}건</p>
        {matches.map((item, index) => (
          <EvidenceViewer
            key={`${item.id}-${index}`}
            evidence={item}
            label={`${field.label} · 근거 ${index + 1}`}
            audience="staff"
          />
        ))}
      </div>
    </div>
  );
}

/** 저장된 상담의 직원 검토용. 현재 입력값과 당시 근거값을 각각 표시하며 편집하지 않는다. */
export function FacilityEvidenceReview({
  value,
  evidence,
}: {
  value: FacilityCheckInput;
  evidence?: readonly Evidence[];
}) {
  const fields = facilityEvidenceFields.filter(
    (field) => getEvidenceForField(evidence, `facilityCheck.${field.key}`).length > 0,
  );
  if (fields.length === 0) return null;

  return (
    <section className="panel-card rounded-2xl p-5" aria-label="시설 근거 검토">
      <h2 className="text-lg font-bold text-[#0B1220]">시설 근거 검토</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {fields.map((field) => (
          <FacilityEvidenceField key={field.key} fieldKey={field.key} evidence={evidence}>
            <p className="field-label">{field.label}</p>
            <p className="whitespace-pre-wrap break-words text-sm text-slate-700">
              현재 입력값: {formatEvidenceValue(value[field.key])}
            </p>
          </FacilityEvidenceField>
        ))}
      </div>
    </section>
  );
}
