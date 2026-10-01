"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { CandidateStore, CandidateStoreSource } from "@/lib/candidates/candidate-contract";
import { CandidateStoreFormFields, type CandidateStoreFormValues } from "./CandidateStoreFormFields";

function optionalNumber(value: string) {
  return value === "" ? undefined : Number(value);
}

function requestBody(values: CandidateStoreFormValues, caseId: string, source: CandidateStoreSource, linkedAnalysisRunId: string | null) {
  return {
    caseId,
    label: values.label,
    address: values.address || undefined,
    unit: values.unit || undefined,
    floor: values.floor || undefined,
    exclusiveAreaSqm: optionalNumber(values.exclusiveAreaSqm),
    frontageM: optionalNumber(values.frontageM),
    parkingStatus: values.parkingStatus || undefined,
    parkingNote: values.parkingNote || undefined,
    depositWon: optionalNumber(values.depositWon),
    monthlyRentWon: optionalNumber(values.monthlyRentWon),
    maintenanceFeeWon: optionalNumber(values.maintenanceFeeWon),
    premiumWon: optionalNumber(values.premiumWon),
    source,
    linkedAnalysisRunId: linkedAnalysisRunId ?? undefined,
  };
}

export function NewCandidateStoreForm({
  caseId,
  initialLabel = "",
  initialAddress = "",
  source,
  linkedAnalysisRunId,
}: {
  caseId: string;
  initialLabel?: string;
  initialAddress?: string;
  source: CandidateStoreSource;
  linkedAnalysisRunId: string | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<CandidateStoreFormValues>({
    label: initialLabel,
    address: initialAddress,
    unit: "",
    floor: "",
    exclusiveAreaSqm: "",
    frontageM: "",
    parkingStatus: "",
    parkingNote: "",
    depositWon: "",
    monthlyRentWon: "",
    maintenanceFeeWon: "",
    premiumWon: "",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody(values, caseId, source, linkedAnalysisRunId)),
      });
      const body = await response.json() as CandidateStore | { message?: string };
      if (!response.ok || !("candidateId" in body)) {
        setError("message" in body && body.message ? body.message : "후보점포를 등록하지 못했습니다.");
        return;
      }
      router.push(`/cases/${encodeURIComponent(caseId)}/candidates/${encodeURIComponent(body.candidateId)}`);
    } catch {
      setError("후보점포를 등록하는 중 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="panel-card p-5 sm:p-6">
      {source === "MARKET_ANALYSIS" ? (
        <p className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">현재 Market Analysis 위치와 저장된 Run snapshot을 연결합니다. 새 분석은 실행하지 않습니다.</p>
      ) : source === "MARKET_WORKSPACE" ? (
        <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">현재 위치는 전달했지만 저장된 Analysis Run은 확인되지 않아 연결하지 않습니다.</p>
      ) : null}
      <CandidateStoreFormFields values={values} onChange={setValues} />
      {error ? <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">{error}</p> : null}
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-stone-200 pt-5">
        <button className="btn-primary" type="submit" disabled={pending}>{pending ? "등록 중…" : "후보점포 등록"}</button>
        <p className="text-xs text-stone-500">비어 있는 선택 항목은 0으로 저장하지 않습니다.</p>
      </div>
    </form>
  );
}
