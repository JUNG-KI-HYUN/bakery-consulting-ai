"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  CASE_LIFECYCLE_LABELS,
  type CaseRecord,
} from "@/lib/cases/case-contract";
import { CaseFormFields, type CaseFormValues } from "./CaseFormFields";
import { activeAnalysisTargetHref, type ActiveAnalysisTarget } from "@/lib/market-data/competition-location";
import {
  CANDIDATE_STORE_STATUS_LABELS,
  type CandidateStore,
} from "@/lib/candidates/candidate-contract";

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

export function CaseDetailClient({
  initialRecord,
  initialCandidates,
  latestAnalysisTarget,
  issuedReports,
}: {
  initialRecord: CaseRecord;
  initialCandidates: CandidateStore[];
  latestAnalysisTarget: ActiveAnalysisTarget | null;
  issuedReports: Array<{
    reportSnapshotId: string;
    candidateId: string;
    candidateLabel: string;
    verdictLabel: string;
    issuedAt: string;
  }>;
}) {
  const [record, setRecord] = useState(initialRecord);
  const [values, setValues] = useState(() => formValues(initialRecord));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const marketHref = activeAnalysisTargetHref(
    `/markets?caseId=${encodeURIComponent(record.caseId)}`,
    latestAnalysisTarget,
  );
  const latestAnalysis = record.analysisRunLinks.at(-1) ?? null;
  const customer = record.customerProfile;
  const recommendation = record.frameoneRecommendation;
  const capitalPlan = recommendation?.capitalPlan;
  const primaryCandidate = initialCandidates[0] ?? null;
  const candidateAreaPyeong = primaryCandidate?.propertyFacts.exclusiveAreaSqm === undefined
    ? null
    : primaryCandidate.propertyFacts.exclusiveAreaSqm / 3.305785;
  const money = (value: number | undefined) => value === undefined ? "확인 필요" : `${value.toLocaleString("ko-KR")}원`;
  const yesNo = (value: boolean | undefined) => value === undefined ? "확인 필요" : value ? "YES" : "NO";
  const range = (min: number | undefined, max: number | undefined, suffix: string) =>
    min === undefined && max === undefined ? "확인 필요" : `${min ?? "확인 필요"}~${max ?? "확인 필요"}${suffix}`;

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

      <section className="space-y-4" aria-label="상담 출처별 정보">
        <article className="rounded-xl border border-sky-200 bg-white p-5 sm:p-6">
          <h3 className="text-lg font-bold text-stone-950">고객 상담정보</h3>
          <p className="mt-1 text-sm text-stone-600">고객이 상담 과정에서 제공한 정보입니다.</p>
          {!customer ? <p className="mt-4 text-sm text-stone-500">저장된 고객 상담정보가 없습니다.</p> : <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-xs font-semibold text-stone-500">브랜드</dt><dd className="mt-1 text-sm font-bold">{customer.brandName ?? "확인 필요"}</dd></div>
            <div><dt className="text-xs font-semibold text-stone-500">총 가용자본</dt><dd className="mt-1 text-sm font-bold">{money(customer.totalAvailableCapitalWon)}</dd></div>
            <div><dt className="text-xs font-semibold text-stone-500">대표 직접근무</dt><dd className="mt-1 text-sm font-bold">{yesNo(customer.ownerWorksInStore)}</dd></div>
            <div><dt className="text-xs font-semibold text-stone-500">대표 역할</dt><dd className="mt-1 text-sm font-bold">{customer.ownerRoles?.join(" / ") ?? "확인 필요"}</dd></div>
            <div><dt className="text-xs font-semibold text-stone-500">희망형태</dt><dd className="mt-1 text-sm font-bold">{customer.conceptPreference ?? "확인 필요"}</dd></div>
            <div><dt className="text-xs font-semibold text-stone-500">희망지역</dt><dd className="mt-1 text-sm font-bold">{customer.areaPreferenceNote ?? "확인 필요"}</dd></div>
            <div><dt className="text-xs font-semibold text-stone-500">희망면적</dt><dd className="mt-1 text-sm font-bold">{range(customer.preferredAreaMinPyeong, customer.preferredAreaMaxPyeong, "평")}</dd></div>
            <div><dt className="text-xs font-semibold text-stone-500">목표 월 세전 영업이익</dt><dd className="mt-1 text-sm font-bold">{money(customer.targetMonthlyOwnerIncomeWon)}</dd></div>
            <div><dt className="text-xs font-semibold text-stone-500">직접 제조 / 커피</dt><dd className="mt-1 text-sm font-bold">{yesNo(customer.directManufacturing)} / {yesNo(customer.coffeeSales)}</dd></div>
            <div><dt className="text-xs font-semibold text-stone-500">홀 / 배달</dt><dd className="mt-1 text-sm font-bold">{customer.hallPreference ?? "확인 필요"} / {customer.deliveryPreference ?? "확인 필요"}</dd></div>
            <div><dt className="text-xs font-semibold text-stone-500">인력 계획</dt><dd className="mt-1 text-sm font-bold">{customer.employeePlan ?? "확인 필요"}</dd></div>
            <div><dt className="text-xs font-semibold text-stone-500">추천 요청</dt><dd className="mt-1 text-sm font-bold">{customer.unknownBudgetItems?.join(", ") ?? "없음"}</dd></div>
          </dl>}
        </article>

        <article className="rounded-xl border border-amber-200 bg-white p-5 sm:p-6">
          <h3 className="text-lg font-bold text-stone-950">FRAMEONE 권장조건</h3>
          <p className="mt-1 text-sm text-stone-600">현재 상담정보와 분석을 바탕으로 상담자가 제안한 검토 기준입니다. 시장·시설 확인에 따라 변경될 수 있습니다.</p>
          {!recommendation ? <p className="mt-4 text-sm text-stone-500">저장된 상담자 권장조건이 없습니다.</p> : <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-xs font-semibold text-stone-500">권장 사업모델</dt><dd className="mt-1 text-sm font-bold">{recommendation.recommendedConcept ?? "확인 필요"}</dd></div>
            <div><dt className="text-xs font-semibold text-stone-500">권장 탐색면적</dt><dd className="mt-1 text-sm font-bold">{range(recommendation.recommendedAreaMinPyeong, recommendation.recommendedAreaMaxPyeong, "평")}</dd></div>
            <div><dt className="text-xs font-semibold text-stone-500">권장 좌석</dt><dd className="mt-1 text-sm font-bold">{range(recommendation.recommendedSeatMin, recommendation.recommendedSeatMax, "석")}</dd></div>
            <div><dt className="text-xs font-semibold text-stone-500">인력</dt><dd className="mt-1 text-sm font-bold">{recommendation.staffingRecommendation ?? "확인 필요"}</dd></div>
            <div><dt className="text-xs font-semibold text-stone-500">운전자금 보존</dt><dd className="mt-1 text-sm font-bold">{money(capitalPlan?.operatingReserveWon)}</dd></div>
            <div><dt className="text-xs font-semibold text-stone-500">개점 전 투자한도</dt><dd className="mt-1 text-sm font-bold">{money(capitalPlan?.preOpeningInvestmentLimitWon)}</dd></div>
            <div><dt className="text-xs font-semibold text-stone-500">권리금 정책</dt><dd className="mt-1 text-sm font-bold">{recommendation.premiumPolicy ?? "확인 필요"}</dd></div>
            <div><dt className="text-xs font-semibold text-stone-500">시설전략</dt><dd className="mt-1 text-sm font-bold">{recommendation.facilityStrategy ?? "확인 필요"}</dd></div>
          </dl>}
          {recommendation?.seatRecommendationNote ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">{recommendation.seatRecommendationNote}</p> : null}
        </article>

        <article className="rounded-xl border border-emerald-200 bg-white p-5 sm:p-6">
          <h3 className="text-lg font-bold text-stone-950">후보점포 실제조건</h3>
          <p className="mt-1 text-sm text-stone-600">후보점포에서 확인하거나 제공받은 실제 조건입니다.</p>
          {!primaryCandidate ? <p className="mt-4 text-sm text-stone-500">등록된 후보점포가 없습니다.</p> : <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-stone-200 text-xs text-stone-500"><th className="p-2">항목</th><th className="p-2">고객 희망</th><th className="p-2">FRAMEONE 권장</th><th className="p-2">후보점포</th></tr></thead><tbody className="divide-y divide-stone-100">
            <tr><th className="p-2">면적</th><td className="p-2">{range(customer?.preferredAreaMinPyeong, customer?.preferredAreaMaxPyeong, "평")}</td><td className="p-2">{range(recommendation?.recommendedAreaMinPyeong, recommendation?.recommendedAreaMaxPyeong, "평")}</td><td className="p-2">{candidateAreaPyeong === null ? "확인 필요" : `${candidateAreaPyeong.toFixed(1)}평`}</td></tr>
            <tr><th className="p-2">좌석</th><td className="p-2">{customer?.hallPreference ?? "확인 필요"}</td><td className="p-2">{range(recommendation?.recommendedSeatMin, recommendation?.recommendedSeatMax, "석 검토")}</td><td className="p-2">도면 확인 필요</td></tr>
            <tr><th className="p-2">보증금</th><td className="p-2">{customer?.unknownBudgetItems?.includes("보증금") ? "추천 요청" : "확인 필요"}</td><td className="p-2">{money(capitalPlan?.depositBudgetWon)}</td><td className="p-2">{money(primaryCandidate.currentAskingTerms.depositWon)}</td></tr>
            <tr><th className="p-2">권리금</th><td className="p-2">{customer?.unknownBudgetItems?.includes("권리금") ? "추천 요청" : "확인 필요"}</td><td className="p-2">{recommendation?.premiumPolicy ?? "확인 필요"}</td><td className="p-2">{money(primaryCandidate.currentAskingTerms.premiumWon)}</td></tr>
          </tbody></table></div>}
        </article>
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
          {!initialCandidates.length ? (
            <p className="mt-2 text-sm text-stone-500">후보점포가 없습니다.</p>
          ) : (
            <div className="mt-4 divide-y divide-stone-200 border-y border-stone-200">
              {initialCandidates.map((candidate) => (
                <div key={candidate.candidateId} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate text-sm font-bold text-stone-950">{candidate.label}</p><p className="mt-1 truncate text-xs text-stone-500">{candidate.address ?? "주소 미입력"}</p></div>
                    <span className="shrink-0 text-[10px] font-bold text-stone-500">{CANDIDATE_STORE_STATUS_LABELS[candidate.status]}</span>
                  </div>
                  <p className="mt-2 text-xs text-stone-600">월세 {candidate.currentAskingTerms.monthlyRentWon === undefined ? "미입력" : `${candidate.currentAskingTerms.monthlyRentWon.toLocaleString("ko-KR")}원`} · {formatUpdatedAt(candidate.updatedAt)}</p>
                  <Link href={`/cases/${encodeURIComponent(record.caseId)}/candidates/${encodeURIComponent(candidate.candidateId)}`} className="mt-2 inline-block text-xs font-bold text-stone-800 underline underline-offset-4">상세 열기</Link>
                </div>
              ))}
            </div>
          )}
          <Link href={`/cases/${encodeURIComponent(record.caseId)}/candidates/new`} className="btn-outline mt-5">후보점포 등록</Link>
        </article>
        <article className="bg-white p-5">
          <p className="text-xs font-bold text-[#8b6f38]">리포트</p>
          <h3 className="mt-2 text-base font-bold text-stone-950">컨설팅 결과</h3>
          {!issuedReports.length ? <p className="mt-2 text-sm text-stone-500">아직 생성된 리포트가 없습니다.</p> : <div className="mt-4 divide-y divide-stone-200 border-y border-stone-200">{issuedReports.map((report) => <div key={report.reportSnapshotId} className="py-3"><p className="text-sm font-bold text-stone-950">{report.candidateLabel}</p><p className="mt-1 text-xs text-stone-500">{report.verdictLabel} · {formatUpdatedAt(report.issuedAt)}</p><Link href={`/cases/${encodeURIComponent(record.caseId)}/candidates/${encodeURIComponent(report.candidateId)}/report/${encodeURIComponent(report.reportSnapshotId)}`} className="mt-2 inline-block text-xs font-bold text-stone-800 underline underline-offset-4">Report 열기</Link></div>)}</div>}
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
