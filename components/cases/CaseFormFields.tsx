import {
  CASE_LIFECYCLE_LABELS,
  CASE_LIFECYCLE_STAGES,
  type CaseLifecycleStage,
} from "@/lib/cases/case-contract";
import type { Dispatch, SetStateAction } from "react";

export interface CaseFormValues {
  name: string;
  clientName: string;
  bakeryType: string;
  preferredArea: string;
  budgetMin: string;
  budgetMax: string;
  targetOpeningDate: string;
  lifecycleStage?: CaseLifecycleStage;
}

export function CaseFormFields({
  values,
  onChange,
  includeLifecycle = false,
}: {
  values: CaseFormValues;
  onChange: Dispatch<SetStateAction<CaseFormValues>>;
  includeLifecycle?: boolean;
}) {
  const update = (key: keyof CaseFormValues, value: string) => {
    onChange((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="block">
        <span className="field-label">Case 이름 *</span>
        <input className="input" value={values.name} onChange={(event) => update("name", event.target.value)} required maxLength={100} autoComplete="off" />
      </label>
      <label className="block">
        <span className="field-label">고객명 *</span>
        <input className="input" value={values.clientName} onChange={(event) => update("clientName", event.target.value)} required maxLength={100} autoComplete="off" />
      </label>
      <label className="block">
        <span className="field-label">베이커리 형태</span>
        <input className="input" value={values.bakeryType} onChange={(event) => update("bakeryType", event.target.value)} maxLength={200} placeholder="예: 제조 중심, 카페형" autoComplete="off" />
      </label>
      <label className="block">
        <span className="field-label">희망지역</span>
        <input className="input" value={values.preferredArea} onChange={(event) => update("preferredArea", event.target.value)} maxLength={200} placeholder="확인된 희망지역만 입력" autoComplete="off" />
      </label>
      <label className="block">
        <span className="field-label">최소 예산</span>
        <input className="input" type="number" min="0" step="10000" inputMode="numeric" value={values.budgetMin} onChange={(event) => update("budgetMin", event.target.value)} placeholder="원 단위" />
      </label>
      <label className="block">
        <span className="field-label">최대 예산</span>
        <input className="input" type="number" min="0" step="10000" inputMode="numeric" value={values.budgetMax} onChange={(event) => update("budgetMax", event.target.value)} placeholder="원 단위" />
      </label>
      <label className="block">
        <span className="field-label">목표 오픈일</span>
        <input className="input" type="date" value={values.targetOpeningDate} onChange={(event) => update("targetOpeningDate", event.target.value)} />
      </label>
      {includeLifecycle ? (
        <label className="block">
          <span className="field-label">진행 단계</span>
          <select className="input" value={values.lifecycleStage} onChange={(event) => update("lifecycleStage", event.target.value)}>
            {CASE_LIFECYCLE_STAGES.map((stage) => (
              <option key={stage} value={stage}>{CASE_LIFECYCLE_LABELS[stage]}</option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
