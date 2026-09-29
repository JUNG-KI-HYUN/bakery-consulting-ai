"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CaseFormFields, type CaseFormValues } from "./CaseFormFields";
import type { CaseRecord } from "@/lib/cases/case-contract";

const initialValues: CaseFormValues = {
  name: "",
  clientName: "",
  bakeryType: "",
  preferredArea: "",
  budgetMin: "",
  budgetMax: "",
  targetOpeningDate: "",
};

function requestBody(values: CaseFormValues) {
  return {
    name: values.name,
    clientName: values.clientName,
    bakeryType: values.bakeryType,
    preferredArea: values.preferredArea,
    budgetMin: values.budgetMin ? Number(values.budgetMin) : undefined,
    budgetMax: values.budgetMax ? Number(values.budgetMax) : undefined,
    targetOpeningDate: values.targetOpeningDate || undefined,
  };
}

export function NewCaseForm() {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody(values)),
      });
      const body = await response.json() as CaseRecord | { message?: string };
      if (!response.ok || !("caseId" in body)) {
        setError("message" in body && body.message ? body.message : "Case를 생성하지 못했습니다.");
        return;
      }
      router.push(`/cases/${encodeURIComponent(body.caseId)}`);
    } catch {
      setError("Case를 생성하는 중 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="panel-card p-5 sm:p-6">
      <CaseFormFields values={values} onChange={setValues} />
      {error ? <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">{error}</p> : null}
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-stone-200 pt-5">
        <button className="btn-primary" type="submit" disabled={pending}>{pending ? "생성 중…" : "Case 생성"}</button>
        <p className="text-xs text-stone-500">생성 후 Case 상세 화면으로 이동합니다.</p>
      </div>
    </form>
  );
}
