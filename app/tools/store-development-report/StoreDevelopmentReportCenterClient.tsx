"use client";

import { useMemo, useState } from "react";
import {
  STORE_DEVELOPMENT_SCOPE_TYPES,
  type ReportGenerationResultV1,
  type ReportGenerationScopeV1,
  type ReportReadinessStatus,
  type StoreDevelopmentCaseSummaryV1,
  type StoreDevelopmentReportCenterWorkspaceV1,
  type StoreDevelopmentReportType,
  type StoreDevelopmentScopeType,
} from "@/lib/store-development-report/contracts";

const reportTypeLabels: Record<StoreDevelopmentReportType, string> = {
  FIELD_BRIEFING: "후보점포 브리핑",
  DECISION_REPORT: "의사결정 리포트",
  CANDIDATE_SINGLE: "후보 단독 리포트",
  REGION_REPORT: "지역 의사결정 리포트",
};

const scopeLabels: Record<StoreDevelopmentScopeType, string> = {
  ALL: "ALL",
  REGION: "Region",
  APARTMENT_AREA: "Apartment Area",
  CANDIDATE: "Candidate",
};

const readinessLabels: Record<ReportReadinessStatus, string> = {
  READY: "READY",
  PARTIAL: "PARTIAL",
  MISSING: "MISSING",
  NOT_REQUIRED: "NOT REQUIRED",
};

function readinessTone(status: ReportReadinessStatus) {
  if (status === "READY") return "bg-emerald-100 text-emerald-800";
  if (status === "PARTIAL") return "bg-amber-100 text-amber-900";
  if (status === "MISSING") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-600";
}

function resultScope(result: ReportGenerationResultV1, selectedCase: StoreDevelopmentCaseSummaryV1) {
  if (result.scope.scopeType === "ALL") return "ALL";
  if (result.scope.scopeType === "REGION") {
    const regionId = result.scope.regionId;
    return selectedCase.regions.find((region) => region.regionId === regionId)?.label ?? regionId;
  }
  if (result.scope.scopeType === "APARTMENT_AREA") {
    const apartmentAreaId = result.scope.apartmentAreaId;
    return selectedCase.apartmentAreas.find((area) => area.apartmentAreaId === apartmentAreaId)?.label ?? apartmentAreaId;
  }
  const candidateStoreId = result.scope.candidateStoreId;
  return selectedCase.candidates.find((candidate) => candidate.candidateStoreId === candidateStoreId)?.displayCode ?? candidateStoreId;
}

export function StoreDevelopmentReportCenterClient({ initialWorkspace }: { initialWorkspace: StoreDevelopmentReportCenterWorkspaceV1 }) {
  const initialCase = initialWorkspace.cases[0];
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [caseId, setCaseId] = useState(initialCase?.caseId ?? "");
  const [presetId, setPresetId] = useState(initialCase?.presetIds[0] ?? "");
  const [reportType, setReportType] = useState<StoreDevelopmentReportType>("DECISION_REPORT");
  const [scopeType, setScopeType] = useState<StoreDevelopmentScopeType>("ALL");
  const [regionId, setRegionId] = useState(initialCase?.regions[0]?.regionId ?? "");
  const [apartmentAreaId, setApartmentAreaId] = useState(initialCase?.apartmentAreas[0]?.apartmentAreaId ?? "");
  const [candidateStoreId, setCandidateStoreId] = useState(initialCase?.candidates[0]?.candidateStoreId ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ReportGenerationResultV1 | null>(null);

  const selectedCase = workspace.cases.find((item) => item.caseId === caseId) ?? workspace.cases[0];
  const preset = workspace.presets.find((item) => item.presetId === presetId) ?? workspace.presets[0];
  const template = preset?.templates.find((item) => item.reportType === reportType);
  const readiness = workspace.readinessByReportType[reportType];
  const supportedScopes = new Set(template?.supportedScopes ?? []);
  const selectedRegionAreas = selectedCase?.apartmentAreas.filter((area) => !regionId || area.regionId === regionId) ?? [];
  const selectedRegionCandidates = selectedCase?.candidates.filter((candidate) => !regionId || candidate.regionId === regionId) ?? [];

  const scope = useMemo<ReportGenerationScopeV1>(() => {
    if (scopeType === "REGION") return { scopeType, regionId };
    if (scopeType === "APARTMENT_AREA") return { scopeType, apartmentAreaId };
    if (scopeType === "CANDIDATE") return { scopeType, candidateStoreId };
    return { scopeType: "ALL" };
  }, [apartmentAreaId, candidateStoreId, regionId, scopeType]);

  const previewHref = useMemo(() => {
    if (reportType === "CANDIDATE_SINGLE" && scope.scopeType === "CANDIDATE") return `/tools/pork33-candidate-shortlist/briefing-preview?scopeType=CANDIDATE&candidateStoreId=${encodeURIComponent(scope.candidateStoreId)}`;
    if (scope.scopeType === "REGION") {
      const prefix = reportType === "FIELD_BRIEFING" ? "briefing-preview" : "decision-preview";
      return `/tools/pork33-candidate-shortlist/${prefix}?scopeType=REGION&regionId=${encodeURIComponent(scope.regionId)}`;
    }
    if (scope.scopeType === "ALL") return reportType === "FIELD_BRIEFING"
      ? "/tools/pork33-candidate-shortlist/briefing-preview"
      : "/tools/pork33-candidate-shortlist/decision-preview";
    return "";
  }, [reportType, scope]);

  function changeReportType(next: StoreDevelopmentReportType) {
    setReportType(next);
    const nextTemplate = preset?.templates.find((item) => item.reportType === next);
    setScopeType(nextTemplate?.supportedScopes[0] ?? "ALL");
    setResult(null);
    setMessage("");
  }

  function changeRegion(next: string) {
    setRegionId(next);
    const area = selectedCase?.apartmentAreas.find((item) => item.regionId === next);
    const candidate = selectedCase?.candidates.find((item) => item.regionId === next);
    setApartmentAreaId(area?.apartmentAreaId ?? "");
    setCandidateStoreId(candidate?.candidateStoreId ?? "");
  }

  async function generatePdf() {
    setBusy(true);
    setResult(null);
    setMessage("기존 PORK33 generator로 PDF를 생성 중입니다. 창을 닫지 마세요.");
    try {
      const response = await fetch("/api/tools/store-development-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaVersion: "frameone.report-generation-request.v1",
          caseId,
          presetId,
          reportType,
          scope,
          outputFormat: "PDF",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "PDF를 생성하지 못했습니다.");
      setResult(payload);
      setMessage("PDF 생성을 완료했습니다.");
      const refreshed = await fetch("/api/tools/store-development-report", { cache: "no-store" });
      if (refreshed.ok) setWorkspace(await refreshed.json());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PDF를 생성하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (!selectedCase || !preset || !readiness) return <main className="mx-auto max-w-5xl p-10">운영 가능한 Case 또는 Preset이 없습니다.</main>;

  return <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 lg:px-8">
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="overflow-hidden rounded-3xl bg-[#0B1220] text-white shadow-xl">
        <div className="grid gap-6 p-7 lg:grid-cols-[minmax(0,1.4fr)_minmax(420px,0.6fr)] lg:p-9">
          <div><p className="text-xs font-bold tracking-[0.24em] text-amber-300">FRAMEONE · INTERNAL REPORT OPERATIONS</p><h1 className="mt-3 text-3xl font-black">FRAMEONE 점포개발 보고서</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Case의 기존 Candidate·Region·Apartment Area·Evidence를 재사용해 Preview와 PDF를 생성합니다. 계산 엔진과 기존 PORK33 V1/V2는 변경하지 않습니다.</p></div>
          <div className="grid grid-cols-3 gap-3 self-end"><HeaderMetric label="Candidate" value={selectedCase.candidateCount} /><HeaderMetric label="Region" value={selectedCase.regionCount} /><HeaderMetric label="Apartment Area" value={selectedCase.apartmentAreaCount} /></div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <Step number="01" title="Case · Preset">
              <label className="block"><span className="mb-2 block text-xs font-bold text-slate-500">Case 선택</span><select className="input" value={caseId} onChange={(event) => setCaseId(event.target.value)}>{workspace.cases.map((item) => <option key={item.caseId} value={item.caseId}>{item.label}</option>)}</select></label>
              <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm"><Info label="브랜드" value={selectedCase.brandName} /><Info label="업종" value={selectedCase.industryLabel} /><Info label="후보" value={`${selectedCase.candidateCount}개`} /><Info label="Region / Area" value={`${selectedCase.regionCount} / ${selectedCase.apartmentAreaCount}`} /></div>
              <label className="mt-4 block"><span className="mb-2 block text-xs font-bold text-slate-500">Report Preset</span><select className="input" value={presetId} onChange={(event) => setPresetId(event.target.value)}>{workspace.presets.filter((item) => selectedCase.presetIds.includes(item.presetId)).map((item) => <option key={item.presetId} value={item.presetId}>{item.presetId}</option>)}</select></label>
              <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm"><b>{preset.brandName}</b><p className="mt-1 text-slate-700">{preset.industryLabel} · 경쟁업종 명칭: {preset.competitorLabel}</p><p className="mt-2 text-xs text-slate-500">Preset v{preset.presetVersion} · {preset.candidateCriteriaProfileId}</p></div>
            </Step>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <Step number="02" title="Report Type">
              <div className="space-y-2">{preset.templates.map((item) => <button type="button" key={item.reportType} onClick={() => changeReportType(item.reportType)} className={`w-full rounded-xl border p-4 text-left transition ${reportType === item.reportType ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600" : "border-slate-200 hover:border-slate-400"}`}><span className="font-bold">{item.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span><span className="mt-2 block text-[11px] font-bold text-slate-400">{item.generatorVersion}</span></button>)}</div>
            </Step>
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3"><Step number="03" title="Data Readiness" /><span className={`rounded-full px-3 py-1 text-xs font-black ${readiness.overallStatus === "BLOCKED" ? "bg-red-100 text-red-800" : readiness.overallStatus === "READY" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{readiness.overallStatus}</span></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{readiness.items.map((item) => <article key={item.key} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-2"><span className="text-sm font-bold">{item.label}</span><span className={`rounded-full px-2 py-1 text-[10px] font-black ${readinessTone(item.status)}`}>{readinessLabels[item.status]}</span></div><strong className="mt-3 block text-xl">{item.display}</strong><p className="mt-2 text-[11px] font-bold text-slate-500">{item.source}</p>{item.unknownCount > 0 && <p className="mt-1 text-xs text-amber-800">UNKNOWN {item.unknownCount}건</p>}{item.limitation && <p className="mt-2 text-xs leading-5 text-slate-500">{item.limitation}</p>}</article>)}</div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <Step number="04" title="Scope · Preview · Export">
              <div className="grid gap-2 sm:grid-cols-4">{STORE_DEVELOPMENT_SCOPE_TYPES.map((item) => { const disabled = !supportedScopes.has(item); return <button type="button" key={item} disabled={disabled} onClick={() => setScopeType(item)} className={`rounded-xl border px-3 py-3 text-sm font-bold ${scopeType === item && !disabled ? "border-emerald-600 bg-emerald-50 text-emerald-900" : disabled ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300" : "border-slate-200"}`}>{scopeLabels[item]}</button>; })}</div>
              {(scopeType === "REGION" || scopeType === "APARTMENT_AREA" || scopeType === "CANDIDATE") && <label className="mt-4 block"><span className="mb-2 block text-xs font-bold text-slate-500">Region 기준</span><select className="input" value={regionId} onChange={(event) => changeRegion(event.target.value)}>{selectedCase.regions.map((region) => <option key={region.regionId} value={region.regionId}>{region.label}</option>)}</select></label>}
              {scopeType === "APARTMENT_AREA" && <label className="mt-3 block"><span className="mb-2 block text-xs font-bold text-slate-500">Apartment Area</span><select className="input" value={apartmentAreaId} onChange={(event) => setApartmentAreaId(event.target.value)}>{selectedRegionAreas.map((area) => <option key={area.apartmentAreaId} value={area.apartmentAreaId}>{area.label}</option>)}</select></label>}
              {scopeType === "CANDIDATE" && <label className="mt-3 block"><span className="mb-2 block text-xs font-bold text-slate-500">Candidate</span><select className="input" value={candidateStoreId} onChange={(event) => setCandidateStoreId(event.target.value)}>{selectedRegionCandidates.map((candidate) => <option key={candidate.candidateStoreId} value={candidate.candidateStoreId}>{candidate.displayCode} · {candidate.address}</option>)}</select></label>}
              <div className="mt-5 flex flex-wrap items-center gap-3"><a className={`btn-secondary ${!previewHref ? "pointer-events-none opacity-40" : ""}`} href={previewHref || "#"} target="_blank" rel="noreferrer">미리보기</a><button className="btn-primary" disabled={busy || readiness.overallStatus === "BLOCKED" || !supportedScopes.has(scopeType)} onClick={generatePdf}>{busy ? "PDF 생성 중…" : "PDF 생성"}</button><span className="text-xs text-slate-500">PPTX: 고객용 편집본 미지원</span></div>
              {message && <p className={`mt-4 rounded-xl px-4 py-3 text-sm ${result ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>{message}</p>}
              {result && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4"><p className="text-sm font-bold">{reportTypeLabels[result.reportType]} · {resultScope(result, selectedCase)} · {result.pageCount} pages</p><p className="mt-1 text-xs text-slate-500">{result.sourceGenerator} · {result.sourceSbizSnapshotBatchId}</p><a className="btn-primary mt-3 inline-flex" href={result.downloadUrl}>PDF 다운로드</a></div>}
            </Step>
          </section>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold tracking-[0.16em] text-emerald-700">OUTPUT HISTORY</p><h2 className="mt-1 text-lg font-black">최근 생성 결과</h2></div><a className="btn-secondary" href="/tools/pork33-candidate-shortlist">PORK33 기존 도구</a></div>
        <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="px-3 py-2">생성일</th><th className="px-3 py-2">Report</th><th className="px-3 py-2">Scope</th><th className="px-3 py-2">Pages</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">File</th></tr></thead><tbody>{workspace.history.map((item) => <tr className="border-b border-slate-100" key={item.historyId}><td className="whitespace-nowrap px-3 py-3">{new Date(item.generatedAt).toLocaleString("ko-KR")}</td><td className="px-3 py-3 font-bold">{reportTypeLabels[item.reportType]}</td><td className="px-3 py-3">{item.scopeLabel}</td><td className="px-3 py-3">{item.pageCount}</td><td className="px-3 py-3 text-xs text-slate-500">{item.source}</td><td className="px-3 py-3"><a className="font-bold text-emerald-700 underline" href={item.downloadUrl}>{item.fileName}</a></td></tr>)}</tbody></table>{workspace.history.length === 0 && <p className="p-8 text-center text-sm text-slate-500">완료된 output manifest가 없습니다.</p>}</div>
      </section>

      <section className="rounded-2xl bg-slate-900 p-5 text-xs leading-6 text-slate-300"><b className="text-white">Customer Safety</b>{preset.disclaimer.map((item) => <p key={item}>· {item}</p>)}</section>
    </div>
  </main>;
}

function HeaderMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><span className="text-[11px] text-slate-400">{label}</span><strong className="mt-1 block text-2xl">{value}</strong></div>;
}

function Step({ number, title, children }: { number: string; title: string; children?: React.ReactNode }) {
  return <div className={children ? "" : "flex items-center gap-3"}><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#123C35] text-xs font-black text-white">{number}</span><h2 className="text-lg font-black">{title}</h2></div>{children && <div className="mt-4">{children}</div>}</div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><span className="text-xs text-slate-500">{label}</span><b className="mt-1 block">{value}</b></div>;
}
