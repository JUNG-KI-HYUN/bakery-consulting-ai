import {
  CANDIDATE_STORE_STATUS_LABELS,
  CANDIDATE_STORE_STATUSES,
  type CandidateParkingStatus,
  type CandidateStoreStatus,
} from "@/lib/candidates/candidate-contract";
import type { Dispatch, SetStateAction } from "react";

export interface CandidateStoreFormValues {
  label: string;
  address: string;
  unit: string;
  floor: string;
  exclusiveAreaSqm: string;
  frontageM: string;
  parkingStatus: "" | CandidateParkingStatus;
  parkingNote: string;
  depositWon: string;
  monthlyRentWon: string;
  maintenanceFeeWon: string;
  premiumWon: string;
  status?: CandidateStoreStatus;
}

export function CandidateStoreFormFields({
  values,
  onChange,
  includeStatus = false,
}: {
  values: CandidateStoreFormValues;
  onChange: Dispatch<SetStateAction<CandidateStoreFormValues>>;
  includeStatus?: boolean;
}) {
  const update = (key: keyof CandidateStoreFormValues, value: string) => {
    onChange((current) => ({ ...current, [key]: value }));
  };
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className="field-label">후보점포 이름 *</span>
        <input className="input" value={values.label} onChange={(event) => update("label", event.target.value)} required maxLength={120} placeholder="예: 성수 후보 A" autoComplete="off" />
      </label>
      <label className="block sm:col-span-2">
        <span className="field-label">주소</span>
        <input className="input" value={values.address} onChange={(event) => update("address", event.target.value)} maxLength={300} placeholder="확인된 주소만 입력" autoComplete="street-address" />
      </label>
      <label className="block">
        <span className="field-label">호수</span>
        <input className="input" value={values.unit} onChange={(event) => update("unit", event.target.value)} maxLength={100} autoComplete="off" />
      </label>
      <label className="block">
        <span className="field-label">층</span>
        <input className="input" value={values.floor} onChange={(event) => update("floor", event.target.value)} maxLength={100} placeholder="예: 1층" autoComplete="off" />
      </label>
      <label className="block">
        <span className="field-label">전용면적 (㎡)</span>
        <input className="input" type="number" min="0" step="0.01" inputMode="decimal" value={values.exclusiveAreaSqm} onChange={(event) => update("exclusiveAreaSqm", event.target.value)} />
      </label>
      <label className="block">
        <span className="field-label">전면 길이 (m)</span>
        <input className="input" type="number" min="0" step="0.01" inputMode="decimal" value={values.frontageM} onChange={(event) => update("frontageM", event.target.value)} />
      </label>
      <label className="block">
        <span className="field-label">주차 상태</span>
        <select className="input" value={values.parkingStatus} onChange={(event) => update("parkingStatus", event.target.value)}>
          <option value="">미입력</option>
          <option value="UNKNOWN">확인 필요</option>
          <option value="AVAILABLE">가능</option>
          <option value="UNAVAILABLE">불가</option>
        </select>
      </label>
      <label className="block">
        <span className="field-label">주차 메모</span>
        <input className="input" value={values.parkingNote} onChange={(event) => update("parkingNote", event.target.value)} maxLength={300} placeholder="확인된 조건 또는 확인 필요사항" autoComplete="off" />
      </label>
      {[
        ["depositWon", "보증금 (원)"],
        ["monthlyRentWon", "월세 (원)"],
        ["maintenanceFeeWon", "관리비 (원)"],
        ["premiumWon", "권리금 (원)"],
      ].map(([key, label]) => (
        <label className="block" key={key}>
          <span className="field-label">{label}</span>
          <input className="input" type="number" min="0" step="10000" inputMode="numeric" value={values[key as keyof CandidateStoreFormValues] ?? ""} onChange={(event) => update(key as keyof CandidateStoreFormValues, event.target.value)} />
        </label>
      ))}
      {includeStatus ? (
        <label className="block">
          <span className="field-label">검토 상태</span>
          <select className="input" value={values.status} onChange={(event) => update("status", event.target.value)}>
            {CANDIDATE_STORE_STATUSES.map((status) => <option key={status} value={status}>{CANDIDATE_STORE_STATUS_LABELS[status]}</option>)}
          </select>
        </label>
      ) : null}
    </div>
  );
}
