"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  CASE_LIFECYCLE_LABELS,
  type CaseRecord,
} from "@/lib/cases/case-contract";
import { CaseFormFields, type CaseFormValues } from "./CaseFormFields";

function formValues(record: CaseRecord): CaseFormValues {
  return {
    name: record.name,
    clientName: record.clientName,
    bakeryType: record.bakeryType ?? "",
    preferredArea: record.preferredArea ?? "",
    budgetMin: record.budgetMin?.toString() ?? "",
    budgetMax: record.budgetMax?.toString() ?? "",
    targetOpeningDate: record.targetOpeningDate ?? "",
    lifecycleStage: record.lifecycleStage,
  };
}

function updateBody(values: CaseFormValues) {
  return {
    name: values.name,
    clientName: values.clientName,
    bakeryType: values.bakeryType,
    preferredArea: values.preferredArea,
    budgetMin: values.budgetMin ? Number(values.budgetMin) : null,
    budgetMax: values.budgetMax ? Number(values.budgetMax) : null,
    targetOpeningDate: values.targetOpeningDate || null,
    lifecycleStage: values.lifecycleStage,
  };
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function formatBudget(record: CaseRecord) {
  if (record.budgetMin === undefined && record.budgetMax === undefined) return "미입력";
  const min = record.budgetMin === undefined ? "미입력" : `${record.budgetMin.toLocaleString("ko-KR")}원`;
  const max = record.budgetMax === undefined ? "미입력" : `${record.budgetMax.toLocaleString("ko-KR")}원`;
  return `${min} ~ ${max}`;
}

export function CaseDetailClient({ initialRecord }: { initialRecord: CaseRecord }) {
  const [record, setRecord] = useState(initialRecord);
  const [values, setValues] = useState(() => formValues(initialRecord));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const marketHref = `/markets?caseId=${encodeURIComponent(record.caseId)}`;
  const latestAnalysis = record.analysisRunLinks.at(-1) ?? null;

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(record.caseId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateBody(values)),
      });
      const body = await response.json() as CaseRecord | { message?: string };
      if (!response.ok || !("caseId" in body)) {
        setError("message" in body && body.message ? body.message : "Case를 수정하지 못했습니다.");
        return;
      }
      setRecord(body);
      setValues(formValues(body));
      setMessage("Case 정보가 저장되었습니다.");
    } catch {
      setError("Case를 수정하는 중 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="border-b border-stone-300 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-[0.16em] text-[#8b6f38]">CASE</p>
            <h2 className="mt-2 break-words text-2xl font-bold tracking-[-0.03em] text-stone-950 sm:text-3xl">{record.name}</h2>
            <p className="mt-2 text-sm text-stone-600">{record.clientName}</p>
          </div>
          <span className="rounded-full border border-[#d8c59b] bg-[#f8f2e6] px-3 py-1.5 text-xs font-bold text-[#725823]">{CASE_LIFECYCLE_LABELS[record.lifecycleStage]}</span>
        </div>
        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs font-semibold text-stone-400">희망지역</dt><dd className="mt-1 font-semibold text-stone-800">{record.preferredArea ?? "미입력"}</dd></div>
          <div><dt className="text-xs font-semibold text-stone-400">목표 오픈일</dt><dd className="mt-1 font-semibold text-stone-800">{record.targetOpeningDate ?? "미입력"}</dd></div>
          <div><dt className="text-xs font-semibold text-stone-400">예산범위</dt><dd className="mt-1 font-semibold text-stone-800">{formatBudget(record)}</dd></div>
          <div><dt className="text-xs font-semibold text-stone-400">최근 수정</dt><dd className="mt-1 font-semibold text-stone-800">{formatUpdatedAt(record.updatedAt)}</dd></div>
        </dl>
      </section>

      <section className="grid gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200 lg:grid-cols-3" aria-label="Case 업무 연결">
        <article className="bg-white p-5">
          <p className="text-xs font-bold text-[#8b6f38]">분석</p>
          <h3 className="mt-2 text-base font-bold text-stone-950">상권·입지 분석</h3>
          <p className="mt-2 text-sm text-stone-500">{record.analysisRunIds.length ? `연결된 분석 ${record.analysisRunIds.length}건` : "아직 연결된 분석이 없습니다."}</p>
          {latestAnalysis ? (
            <dl className="mt-4 space-y-2 rounded-lg bg-stone-50 p-3 text-sm">
              <div><dt className="text-xs font-semibold text-stone-500">최근 분석 위치</dt><dd className="mt-1 break-words font-semibold text-stone-900">{latestAnalysis.label ?? latestAnalysis.address ?? "위치 이름 미확인"}</dd></div>
              <div className="grid grid-cols-2 gap-3">
                <div><dt className="text-xs font-semibold text-stone-500">분석 반경</dt><dd className="mt-1 font-semibold text-stone-900">{latestAnalysis.radiusM}m</dd></div>
                <div><dt className="text-xs font-semibold text-stone-500">연결 상태</dt><dd className="mt-1 font-semibold text-emerald-700">Case에 연결됨</dd></div>
              </div>
              <div><dt className="text-xs font-semibold text-stone-500">분석 시각</dt><dd className="mt-1 font-semibold text-stone-900">{formatUpdatedAt(latestAnalysis.analyzedAt)}</dd></div>
            </dl>
          ) : record.analysisRunIds.length ? (
            <p className="mt-4 rounded-lg bg-stone-50 p-3 text-xs leading-5 text-stone-600">기존 분석 참조는 있으나 표시 가능한 위치 snapshot이 없습니다.</p>
          ) : null}
          <Link href={marketHref} className="btn-primary mt-5">{record.analysisRunIds.length ? "분석 계속하기" : "상권 분석 시작"}</Link>
        </article>
        <article className="bg-white p-5">
          <p className="text-xs font-bold text-[#8b6f38]">후보점포</p>
          <h3 className="mt-2 text-base font-bold text-stone-950">후보점포 검토</h3>
          <p className="mt-2 text-sm text-stone-500">{record.consultationIds.length ? `${record.consultationIds.length}개 후보점포 참조` : "아직 연결된 후보점포가 없습니다."}</p>
        </article>
        <article className="bg-white p-5">
          <p className="text-xs font-bold text-[#8b6f38]">리포트</p>
          <h3 className="mt-2 text-base font-bold text-stone-950">컨설팅 결과</h3>
          <p className="mt-2 text-sm text-stone-500">아직 생성된 리포트가 없습니다.</p>
        </article>
      </section>

      <form onSubmit={save} className="panel-card p-5 sm:p-6">
        <div className="mb-5 border-b border-stone-200 pb-4">
          <h3 className="text-lg font-bold text-stone-950">Case 정보 수정</h3>
          <p className="mt-1 text-sm text-stone-500">확인된 고객 계획과 현재 진행 단계만 업데이트합니다.</p>
        </div>
        <CaseFormFields values={values} onChange={setValues} includeLifecycle />
        {error ? <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">{error}</p> : null}
        {message ? <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800" role="status">{message}</p> : null}
        <div className="mt-6 border-t border-stone-200 pt-5">
          <button type="submit" className="btn-primary" disabled={pending}>{pending ? "저장 중…" : "변경사항 저장"}</button>
        </div>
      </form>
    </div>
  );
}
