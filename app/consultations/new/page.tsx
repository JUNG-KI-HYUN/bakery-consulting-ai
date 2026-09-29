"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { BreakEvenForm } from "@/components/diagnosis/BreakEvenForm";
import { BrandMarketingForm } from "@/components/diagnosis/BrandMarketingForm";
import { CandidateStoreForm } from "@/components/diagnosis/CandidateStoreForm";
import { ConsultationForm } from "@/components/diagnosis/ConsultationForm";
import { DiagnosisResultView } from "@/components/diagnosis/DiagnosisResultView";
import { FacilityCheckForm } from "@/components/diagnosis/FacilityCheckForm";
import { InteriorSketchForm } from "@/components/diagnosis/InteriorSketchForm";
import { StartupCostForm } from "@/components/diagnosis/StartupCostForm";
import { StepIndicator } from "@/components/ui/StepIndicator";
import { sampleConsultation } from "@/lib/diagnosis/sample-data";
import { calculateBreakEven } from "@/lib/diagnosis/calculateBreakEven";
import { calculateStartupCost } from "@/lib/diagnosis/calculateStartupCost";
import { DiagnosisResult, type ConsultationRecord, StartupCostInput } from "@/lib/diagnosis/types";
import { parseActiveAnalysisTarget } from "@/lib/market-data/competition-location";

const emptyStartupCost: StartupCostInput = {
  interiorCost: 0,
  productionEquipmentCost: 0,
  salesEquipmentCost: 0,
  signageCost: 0,
  initialSuppliesCost: 0,
  licenseRelatedCost: 0,
  reserveCost: 0,
};

export default function NewConsultationPage() {
  const generatedConsultationId = useId().replace(/[^a-zA-Z0-9-]/g, "");
  const [record, setRecord] = useState<ConsultationRecord>({
    ...sampleConsultation,
    consultation: {
      ...sampleConsultation.consultation,
      id: `consult-${generatedConsultationId}`,
      title: "새 상담",
      sampleData: true,
    },
  });
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [analysisLinkAdded, setAnalysisLinkAdded] = useState(false);

  useEffect(() => {
    const query = Object.fromEntries(new URLSearchParams(window.location.search));
    const target = parseActiveAnalysisTarget(query);
    if (!target) return;
    const linkId = `market-analysis:${target.analysisRunId}`;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setRecord((current) => {
        if (current.analysisTargetLinks?.some((link) => link.linkId === linkId)) {
          return current;
        }
        return {
          ...current,
          candidateStore: {
            ...current.candidateStore,
            address: target.address ?? current.candidateStore.address,
          },
          analysisTargetLinks: [
            ...(current.analysisTargetLinks ?? []),
            {
              linkId,
              linkedAt: new Date().toISOString(),
              sourceSnapshot: target,
            },
          ],
        };
      });
      setAnalysisLinkAdded(true);
    });
    return () => { active = false; };
  }, []);

  const breakEvenResult = useMemo(
    () => calculateBreakEven(record.breakEven),
    [record.breakEven],
  );

  const startupCostResult = useMemo(() => {
    if (!record.startupCost) return undefined;
    return calculateStartupCost(
      record.startupCost,
      record.candidateStore.deposit,
      record.candidateStore.premium,
      record.consultation.startupBudget,
    );
  }, [
    record.startupCost,
    record.candidateStore.deposit,
    record.candidateStore.premium,
    record.consultation.startupBudget,
  ]);

  const save = async () => {
    await fetch("/api/consultations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    alert("상담이 저장되었습니다.");
  };

  const diagnose = async () => {
    await save();
    const res = await fetch(
      `/api/consultations/${record.consultation.id}/diagnose`,
      { method: "POST" },
    );
    const data = (await res.json()) as DiagnosisResult;
    setResult(data);
  };

  return (
    <div className="space-y-6">
      <section className="panel-card rounded-2xl p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#2563EB]">
          Step-by-step Consulting
        </p>
        <h2 className="mt-1 text-2xl font-bold text-[#0B1220]">
          먼저 창업자님 상황부터 알려주세요.
        </h2>
        <p className="mt-2 text-sm text-[#334155]">
          모르는 항목은 비워두거나 &apos;확인 필요&apos;로 남겨도 괜찮습니다.
          AI가 먼저 정리하고, 전문가가 최종 확인합니다.
        </p>
        <div className="mt-4">
          <StepIndicator current={result ? 5 : 1} />
        </div>
      </section>

      {analysisLinkAdded ? (
        <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs font-semibold text-blue-900">
          현재 상권분석 snapshot을 후보점포 원본 근거로 연결했습니다. 이후 주소를 수정해도 연결 당시 snapshot은 덮어쓰지 않습니다.
        </p>
      ) : null}

      <ConsultationForm
        value={record.consultation}
        onChange={(next) => setRecord({ ...record, consultation: next })}
      />
      <CandidateStoreForm
        value={record.candidateStore}
        onChange={(next) => setRecord({ ...record, candidateStore: next })}
      />
      <FacilityCheckForm
        value={record.facilityCheck}
        evidence={record.evidence}
        onChange={(next) => setRecord({ ...record, facilityCheck: next })}
      />
      <BreakEvenForm
        value={record.breakEven}
        result={breakEvenResult}
        onChange={(next) => setRecord({ ...record, breakEven: next })}
      />
      <StartupCostForm
        value={record.startupCost ?? emptyStartupCost}
        result={startupCostResult}
        deposit={record.candidateStore.deposit}
        premium={record.candidateStore.premium}
        startupBudget={record.consultation.startupBudget}
        onChange={(next) => setRecord({ ...record, startupCost: next })}
      />
      <BrandMarketingForm
        value={record.brandMarketing ?? sampleConsultation.brandMarketing!}
        onChange={(next) => setRecord({ ...record, brandMarketing: next })}
      />
      <InteriorSketchForm
        value={record.interiorSketch ?? sampleConsultation.interiorSketch!}
        onChange={(next) => setRecord({ ...record, interiorSketch: next })}
      />

      <div className="panel-card flex flex-wrap gap-2 rounded-2xl p-4">
        <button onClick={save} className="btn-secondary">
          임시 저장
        </button>
        <button onClick={diagnose} className="btn-primary">
          AI 1차 점포진단 실행
        </button>
      </div>

      {result && (
        <DiagnosisResultView
          result={result}
          consultationId={record.consultation.id}
        />
      )}
    </div>
  );
}
