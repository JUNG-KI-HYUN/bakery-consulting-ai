# 프레임원 베이커리 창업진단 AI - 전체 소스 덤프

## app\api\consultations\[id]\diagnose\route.ts

```ts
import { NextResponse } from "next/server";
import { runDiagnosis } from "@/lib/diagnosis/diagnosis-service";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await runDiagnosis(id);
  if (!result) {
    return NextResponse.json({ message: "not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}

```

## app\api\consultations\[id]\route.ts

```ts
import { NextResponse } from "next/server";
import { getConsultationById } from "@/lib/diagnosis/diagnosis-service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const item = await getConsultationById(id);
  if (!item) {
    return NextResponse.json({ message: "not found" }, { status: 404 });
  }
  return NextResponse.json(item);
}

```

## app\api\consultations\route.ts

```ts
import { NextResponse } from "next/server";
import { getConsultations, saveConsultation } from "@/lib/diagnosis/diagnosis-service";
import { ConsultationRecord } from "@/lib/diagnosis/types";

export async function GET() {
  const list = await getConsultations();
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const body = (await req.json()) as ConsultationRecord;
  const saved = await saveConsultation(body);
  return NextResponse.json(saved);
}

```

## app\bakery-report-print.css

```css
@media print {
  body {
    background: #fff;
    color: #000;
  }

  header,
  .no-print,
  .print\:hidden {
    display: none !important;
  }

  .report-doc {
    font-size: 12pt;
    line-height: 1.5;
  }

  .report-doc section,
  .print-card,
  .report-doc article {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .report-doc .grid {
    gap: 8px !important;
  }

  .report-doc .rounded-2xl,
  .report-doc .rounded-xl,
  .report-doc .rounded-lg {
    border-radius: 8px !important;
  }
}

```

## app\consultations\[id]\page.tsx

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { DiagnosisResultView } from "@/components/diagnosis/DiagnosisResultView";
import { RiskVerdictBadge } from "@/components/diagnosis/RiskVerdictBadge";
import { DiagnosisReportPreview } from "@/components/reports/DiagnosisReportPreview";
import { mockAiDiagnosis } from "@/lib/diagnosis/mockAiDiagnosis";
import { getConsultationById } from "@/lib/diagnosis/diagnosis-service";

export default async function ConsultationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await getConsultationById(id);
  if (!record) return notFound();
  const diagnosis = mockAiDiagnosis(record);

  return (
    <div className="space-y-6">
      <section className="panel-card rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {record.consultation.sampleData && (
              <span className="badge-sample">샘플 데이터</span>
            )}
            <h2 className="mt-2 text-xl font-bold text-[#0B1220]">
              {record.consultation.title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {record.candidateStore.address}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              이 리포트는 계약 전 의사결정을 돕는 참고자료입니다.
            </p>
          </div>
          <RiskVerdictBadge verdict={diagnosis.verdict} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/reports/${id}`} className="btn-primary">
            고객용 리포트 보기
          </Link>
        </div>
      </section>
      <DiagnosisResultView result={diagnosis} consultationId={id} />
      <DiagnosisReportPreview result={diagnosis} />
    </div>
  );
}

```

## app\consultations\new\page.tsx

```tsx
"use client";

import { useMemo, useState } from "react";
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
import { DiagnosisResult, StartupCostInput } from "@/lib/diagnosis/types";

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
  const [record, setRecord] = useState({
    ...sampleConsultation,
    consultation: {
      ...sampleConsultation.consultation,
      id: `consult-${Date.now()}`,
      title: "새 상담",
      sampleData: true,
    },
  });
  const [result, setResult] = useState<DiagnosisResult | null>(null);

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

```

## app\consultations\page.tsx

```tsx
import Link from "next/link";
import { RiskVerdictBadge } from "@/components/diagnosis/RiskVerdictBadge";
import { getConsultations } from "@/lib/diagnosis/diagnosis-service";
import { mockAiDiagnosis } from "@/lib/diagnosis/mockAiDiagnosis";

export default async function ConsultationsPage() {
  const list = await getConsultations();

  return (
    <div className="space-y-6">
      <section className="panel-card rounded-2xl p-5">
        <h2 className="text-xl font-bold text-[#0B1220]">상담 목록</h2>
        <p className="mt-2 text-sm text-[#334155]">
          후보 점포별 진단 현황을 확인하고, 고객용 리포트로 바로 연결합니다.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          좋은 창업은 감이 아니라, 계약 전 검증에서 시작됩니다.
        </p>
        <Link href="/consultations/new" className="btn-primary mt-4">
          AI 점포진단 시작하기
        </Link>
      </section>

      <p className="text-xs text-amber-700">
        ※ 샘플 데이터는 실제 주소/매출 정보가 아닙니다.
      </p>

      <div className="space-y-4">
        {list.map((item) => {
          const diagnosis = mockAiDiagnosis(item);
          return (
            <article
              key={item.consultation.id}
              className="panel-card rounded-2xl p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  {item.consultation.sampleData && (
                    <span className="badge-sample">샘플 데이터</span>
                  )}
                  <h3 className="mt-2 text-lg font-bold text-[#0B1220]">
                    {item.consultation.title}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {item.candidateStore.address}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1">
                      희망지역: {item.consultation.preferredArea}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1">
                      매장형태: {item.consultation.storeType}
                    </span>
                  </div>
                </div>
                <RiskVerdictBadge verdict={diagnosis.verdict} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/consultations/${item.consultation.id}`}
                  className="btn-primary"
                >
                  상세 보기
                </Link>
                <Link
                  href={`/reports/${item.consultation.id}`}
                  className="btn-outline"
                >
                  리포트 보기
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

```

## app\globals.css

```css
@import "tailwindcss";

:root {
  --primary-navy: #0b1220;
  --deep-navy: #111827;
  --slate: #334155;
  --background: #f6f8fb;
  --card-white: #ffffff;
  --warm-cream: #fff7ed;
  --amber-accent: #f59e0b;
  --risk-red: #ef4444;
  --safe-green: #10b981;
  --info-blue: #2563eb;
}

@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--background);
  color: var(--primary-navy);
  font-family: var(--font-geist-sans), Arial, Helvetica, sans-serif;
}

.input {
  width: 100%;
  border-radius: 0.625rem;
  border: 1px solid #cbd5e1;
  background: #fff;
  padding: 0.6rem 0.8rem;
  font-size: 0.9rem;
  color: #0b1220;
}

.input:focus {
  outline: 2px solid #2563eb33;
  border-color: #2563eb;
}

.field-label {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: #334155;
}

.card {
  border-radius: 1rem;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 0.9rem;
}

.panel-card {
  border-radius: 1rem;
  border: 1px solid #e2e8f0;
  background: #fff;
  box-shadow: 0 1px 3px rgba(11, 18, 32, 0.06);
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.625rem;
  background: #0b1220;
  padding: 0.55rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #fff;
}

.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.625rem;
  background: #334155;
  padding: 0.55rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #fff;
}

.btn-outline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.625rem;
  border: 1px solid #cbd5e1;
  background: #fff;
  padding: 0.55rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #0b1220;
}

.badge-sample {
  display: inline-block;
  border-radius: 9999px;
  background: #fff7ed;
  padding: 0.2rem 0.6rem;
  font-size: 0.7rem;
  font-weight: 600;
  color: #b45309;
}

.risk-highlight {
  border-left: 4px solid #ef4444;
  background: #fef2f2;
}

```

## app\layout.tsx

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./bakery-report-print.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "프레임원 베이커리 창업진단 AI",
  description: "AI 기반 베이커리 창업 점포진단 및 오픈 마케팅 지원 솔루션",
};

const navItems = [
  { href: "/", label: "대시보드" },
  { href: "/consultations", label: "상담 목록" },
  { href: "/consultations/new", label: "상담 등록" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="border-b border-slate-800 bg-[#0B1220] text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
            <div>
              <h1 className="text-sm font-bold tracking-tight">
                프레임원 베이커리 창업진단 AI
              </h1>
              <p className="mt-0.5 text-xs text-slate-400">
                AI Copilot · Premium Consulting · Contract Before Check
              </p>
            </div>
            <nav className="flex flex-wrap gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-full border border-slate-700 bg-slate-800/60 px-3.5 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}

```

## app\page.tsx

```tsx
import Link from "next/link";
import { BentoCard } from "@/components/ui/BentoCard";
import { getConsultations } from "@/lib/diagnosis/diagnosis-service";

const statMeta: Record<string, { label: string; accent?: string }> = {
  "전체 상담 건수": { label: "TOTAL" },
  "진단 진행 중": { label: "IN PROGRESS", accent: "text-[#2563EB]" },
  "리포트 생성 완료": { label: "REPORT", accent: "text-[#10B981]" },
  "조건부 추천 점포 수": { label: "CONDITIONAL", accent: "text-[#F59E0B]" },
  "보류/위험 점포 수": { label: "RISK", accent: "text-[#EF4444]" },
};

export default async function Home() {
  const list = await getConsultations();
  const total = list.length;
  const inProgress = list.length;
  const reportDone = 1;
  const conditional = 1;
  const holdOrRisk = 1;

  const cards = [
    ["전체 상담 건수", total],
    ["진단 진행 중", inProgress],
    ["리포트 생성 완료", reportDone],
    ["조건부 추천 점포 수", conditional],
    ["보류/위험 점포 수", holdOrRisk],
  ] as const;

  return (
    <div className="space-y-8">
      <section className="panel-card grid gap-6 rounded-2xl bg-gradient-to-br from-white to-[#FFF7ED] p-6 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#F59E0B]">
            AI 기반 베이커리 창업 점포진단
          </p>
          <h2 className="mt-2 text-2xl font-bold leading-snug text-[#0B1220] md:text-3xl">
            이 점포, 계약해도 괜찮을까요?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[#334155]">
            입지·월세·시설·손익·브랜드까지 계약 전에 먼저 확인해볼게요.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/consultations/new" className="btn-primary">
              점포 진단 시작
            </Link>
            <Link href="/reports/sample-001" className="btn-outline">
              샘플 리포트 보기
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            브랜드와 오픈 마케팅도 같이 봅니다.
          </p>
        </div>
        <div className="panel-card rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-[#0B1220]">오늘의 진단 흐름</h3>
          <ol className="mt-4 space-y-3 text-sm text-[#334155]">
            {[
              "후보 점포 입력",
              "시설·장비 체크",
              "손익분기점 추정",
              "최종 판단 리포트",
            ].map((step, i) => (
              <li key={step} className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0B1220] text-xs font-bold text-white">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            AI가 먼저 정리하고, 전문가가 최종 확인합니다.
          </p>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        {cards.map(([label, count]) => {
          const meta = statMeta[label];
          return (
            <article key={label} className="panel-card rounded-2xl p-4">
              <p className={`text-[10px] font-bold tracking-wider ${meta.accent ?? "text-slate-400"}`}>
                {meta.label}
              </p>
              <p className="mt-1 text-xs text-slate-500">{label}</p>
              <p className={`mt-2 text-3xl font-bold ${meta.accent ?? "text-[#0B1220]"}`}>
                {count}
              </p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <BentoCard
          title="계약 전 리스크"
          description="상권이 좋아도, 시설이 막히면 보류가 안전합니다."
          accent="risk"
        />
        <BentoCard
          title="손익 생존선"
          description="이 월세, 매달 버틸 수 있을지 먼저 계산합니다."
          accent="finance"
        />
        <BentoCard
          title="브랜드 설계"
          description="손님이 왜 이 빵집을 기억해야 할지 같이 봅니다."
          accent="default"
        />
        <BentoCard
          title="공간 활용"
          description="제조공간, 쇼케이스, 홀 동선을 간단히 그려봅니다."
          accent="marketing"
        />
      </section>
    </div>
  );
}

```

## app\reports\[id]\page.tsx

```tsx
import { notFound } from "next/navigation";
import { DiagnosisReportPreview } from "@/components/reports/DiagnosisReportPreview";
import { getConsultationById } from "@/lib/diagnosis/diagnosis-service";
import { mockAiDiagnosis } from "@/lib/diagnosis/mockAiDiagnosis";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await getConsultationById(id);
  if (!record) return notFound();
  const diagnosis = mockAiDiagnosis(record);
  return <DiagnosisReportPreview result={diagnosis} />;
}

```

## components\diagnosis\BrandMarketingForm.tsx

```tsx
"use client";

import { BrandMarketingInput } from "@/lib/diagnosis/types";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function BrandMarketingForm({
  value,
  onChange,
}: {
  value: BrandMarketingInput;
  onChange: (next: BrandMarketingInput) => void;
}) {
  const update = <K extends keyof BrandMarketingInput>(
    key: K,
    next: BrandMarketingInput[K],
  ) => onChange({ ...value, [key]: next });

  return (
    <section className="panel-card rounded-2xl p-5">
      <p className="text-xs font-semibold text-[#2563EB]">브랜드·마케팅 설계</p>
      <h2 className="mt-1 text-lg font-bold text-[#0B1220]">브랜드·마케팅 설계</h2>
      <p className="mt-1 text-sm text-[#334155]">
        손님이 왜 이 빵집을 기억해야 할지 같이 봅니다.
      </p>
      <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        오픈 초기 3개월은 고객이 이 매장을 기억하게 만드는 시간입니다.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="브랜드 콘셉트">
          <input
            className="input"
            value={value.brandConcept}
            onChange={(e) => update("brandConcept", e.target.value)}
          />
        </Field>
        <Field label="창업 스토리">
          <input
            className="input"
            value={value.founderStory}
            onChange={(e) => update("founderStory", e.target.value)}
          />
        </Field>
        <Field label="대표 고객층">
          <input
            className="input"
            value={value.targetCustomer}
            onChange={(e) => update("targetCustomer", e.target.value)}
          />
        </Field>
        <Field label="시그니처 메뉴 후보">
          <input
            className="input"
            value={value.signatureMenu}
            onChange={(e) => update("signatureMenu", e.target.value)}
          />
        </Field>
        <Field label="브랜드 톤">
          <input
            className="input"
            value={value.brandTone}
            onChange={(e) => update("brandTone", e.target.value)}
          />
        </Field>
        <Field label="지역 키워드">
          <input
            className="input"
            value={value.localKeywords}
            onChange={(e) => update("localKeywords", e.target.value)}
          />
        </Field>
        <Field label="네이버 플레이스 전략 메모">
          <textarea
            className="input min-h-20"
            value={value.naverPlaceStrategy}
            onChange={(e) => update("naverPlaceStrategy", e.target.value)}
          />
        </Field>
        <Field label="블로그 콘텐츠 소재">
          <textarea
            className="input min-h-20"
            value={value.blogContentIdeas}
            onChange={(e) => update("blogContentIdeas", e.target.value)}
          />
        </Field>
        <Field label="인스타그램 콘텐츠 소재">
          <textarea
            className="input min-h-20"
            value={value.instagramContentIdeas}
            onChange={(e) => update("instagramContentIdeas", e.target.value)}
          />
        </Field>
        <Field label="리뷰 이벤트 아이디어">
          <textarea
            className="input min-h-20"
            value={value.reviewEventIdea}
            onChange={(e) => update("reviewEventIdea", e.target.value)}
          />
        </Field>
      </div>
    </section>
  );
}

```

## components\diagnosis\BreakEvenForm.tsx

```tsx
"use client";

import { BreakEvenInput, BreakEvenResult } from "@/lib/diagnosis/types";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

const fields: [keyof BreakEvenInput, string][] = [
  ["expectedUnitPrice", "예상 객단가 (원)"],
  ["expectedDailyVisitors", "예상 일 방문객 (명)"],
  ["expectedDailySales", "예상 일매출 (원)"],
  ["expectedMonthlySales", "예상 월매출 (원)"],
  ["materialCostRate", "원재료비율 (예: 0.34)"],
  ["laborCost", "인건비 (원)"],
  ["rent", "월세 (원)"],
  ["maintenanceFee", "관리비 (원)"],
  ["cardFeeRate", "카드수수료율 (예: 0.03)"],
  ["deliveryFeeRate", "배달수수료율 (예: 0.04)"],
  ["adCost", "광고비 (원)"],
  ["otherFixedCost", "기타 고정비 (원)"],
  ["premium", "권리금 (원)"],
];

export function BreakEvenForm({
  value,
  result,
  onChange,
}: {
  value: BreakEvenInput;
  result?: BreakEvenResult;
  onChange: (next: BreakEvenInput) => void;
}) {
  const update = <K extends keyof BreakEvenInput>(
    key: K,
    next: BreakEvenInput[K],
  ) => onChange({ ...value, [key]: next });

  return (
    <section className="panel-card rounded-2xl p-5">
      <p className="text-xs font-semibold text-[#2563EB]">STEP 4</p>
      <h2 className="mt-1 text-lg font-bold text-[#0B1220]">
        손익분기점 (추정/참고값)
      </h2>
      <p className="mt-1 text-sm text-[#334155]">
        이 월세를 매달 버틸 수 있을지 계산해봅니다.
      </p>
      <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
        예상 매출보다 먼저 확인해야 할 것은 버틸 수 있는 비용 구조입니다.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {fields.map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              className="input"
              type="number"
              value={value[key]}
              onChange={(e) => update(key, Number(e.target.value))}
            />
          </Field>
        ))}
      </div>
      {result && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-semibold text-[#0B1220]">추정 결과 (참고값)</p>
          <div className="mt-2 grid gap-1 md:grid-cols-2">
            <p>월세 부담률(추정): {result.rentBurdenRate.toFixed(2)}%</p>
            <p>
              총 고정비(추정):{" "}
              {Math.round(result.totalFixedCost).toLocaleString()}원
            </p>
            <p>
              손익분기 매출(추정):{" "}
              {Math.round(result.breakEvenSales).toLocaleString()}원
            </p>
            <p>
              월순이익(추정):{" "}
              {Math.round(result.estimatedMonthlyNetProfit).toLocaleString()}원
            </p>
            <p className="md:col-span-2">
              권리금 회수 예상기간(참고값):{" "}
              {result.premiumRecoveryMonths
                ? `${result.premiumRecoveryMonths.toFixed(1)}개월`
                : "적자 또는 0원으로 산정 불가"}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

```

## components\diagnosis\CandidateStoreForm.tsx

```tsx
"use client";

import { CandidateStoreInput } from "@/lib/diagnosis/types";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function CandidateStoreForm({
  value,
  onChange,
}: {
  value: CandidateStoreInput;
  onChange: (next: CandidateStoreInput) => void;
}) {
  const update = <K extends keyof CandidateStoreInput>(
    key: K,
    next: CandidateStoreInput[K],
  ) => onChange({ ...value, [key]: next });

  return (
    <section className="panel-card rounded-2xl p-5">
      <p className="text-xs font-semibold text-[#2563EB]">STEP 2</p>
      <h2 className="mt-1 text-lg font-bold text-[#0B1220]">후보 점포</h2>
      <p className="mt-1 text-sm text-[#334155]">
        좋아 보이는 점포도 계약 전 확인할 게 많습니다.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="주소" className="md:col-span-2">
          <input
            className="input"
            value={value.address}
            onChange={(e) => update("address", e.target.value)}
          />
        </Field>
        <Field label="보증금 (원)">
          <input
            className="input"
            type="number"
            value={value.deposit}
            onChange={(e) => update("deposit", Number(e.target.value))}
          />
        </Field>
        <Field label="월세 (원)">
          <input
            className="input"
            type="number"
            value={value.rent}
            onChange={(e) => update("rent", Number(e.target.value))}
          />
        </Field>
        <Field label="관리비 (원)">
          <input
            className="input"
            type="number"
            value={value.maintenanceFee}
            onChange={(e) => update("maintenanceFee", Number(e.target.value))}
          />
        </Field>
        <Field label="권리금 (원)">
          <input
            className="input"
            type="number"
            value={value.premium}
            onChange={(e) => update("premium", Number(e.target.value))}
          />
        </Field>
        <Field label="전용면적 (㎡)">
          <input
            className="input"
            type="number"
            value={value.exclusiveArea}
            onChange={(e) => update("exclusiveArea", Number(e.target.value))}
          />
        </Field>
        <Field label="층수">
          <input
            className="input"
            value={value.floor}
            onChange={(e) => update("floor", e.target.value)}
          />
        </Field>
        <Field label="전면 길이 (m)">
          <input
            className="input"
            type="number"
            value={value.frontage}
            onChange={(e) => update("frontage", Number(e.target.value))}
          />
        </Field>
        <Field label="출입구 위치">
          <input
            className="input"
            value={value.entrancePosition}
            onChange={(e) => update("entrancePosition", e.target.value)}
          />
        </Field>
        <Field label="간판 노출">
          <input
            className="input"
            value={value.signExposure}
            onChange={(e) => update("signExposure", e.target.value)}
          />
        </Field>
        <Field label="주차 가능 여부">
          <select
            className="input"
            value={value.parkingAvailable ? "yes" : "no"}
            onChange={(e) =>
              update("parkingAvailable", e.target.value === "yes")
            }
          >
            <option value="no">주차 불가</option>
            <option value="yes">주차 가능</option>
          </select>
        </Field>
        <Field label="기존 업종">
          <input
            className="input"
            value={value.previousBusiness}
            onChange={(e) => update("previousBusiness", e.target.value)}
          />
        </Field>
        <Field label="계약기간">
          <input
            className="input"
            value={value.contractPeriod}
            onChange={(e) => update("contractPeriod", e.target.value)}
          />
        </Field>
        <Field label="업종 제한">
          <input
            className="input"
            value={value.businessRestriction}
            onChange={(e) => update("businessRestriction", e.target.value)}
          />
        </Field>
        <Field label="원상복구 범위">
          <input
            className="input"
            value={value.restorationScope}
            onChange={(e) => update("restorationScope", e.target.value)}
          />
        </Field>
        <Field label="특약 필요사항" className="md:col-span-2">
          <input
            className="input"
            value={value.specialTerms}
            onChange={(e) => update("specialTerms", e.target.value)}
          />
        </Field>
      </div>
    </section>
  );
}

```

## components\diagnosis\ChecklistSection.tsx

```tsx
export function ChecklistSection({
  title,
  items,
  highlight = false,
}: {
  title: string;
  items: string[];
  highlight?: boolean;
}) {
  return (
    <section
      className={`rounded-xl border p-4 ${
        highlight
          ? "risk-highlight border-red-200"
          : "border-slate-200 bg-white"
      }`}
    >
      <h3 className="text-base font-semibold text-[#0B1220]">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-[#334155]">
        {items.map((item, idx) => (
          <li
            key={`${title}-${idx}`}
            className={`rounded-lg p-2.5 ${
              highlight ? "bg-white/80" : "bg-slate-50"
            }`}
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

```

## components\diagnosis\ConsultationForm.tsx

```tsx
"use client";

import { ConsultationInput, StoreType } from "@/lib/diagnosis/types";

const storeTypes: StoreType[] = ["판매형", "제조형", "카페형", "배달병행형"];

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function ConsultationForm({
  value,
  onChange,
}: {
  value: ConsultationInput;
  onChange: (next: ConsultationInput) => void;
}) {
  const update = <K extends keyof ConsultationInput>(
    key: K,
    next: ConsultationInput[K],
  ) => onChange({ ...value, [key]: next });

  return (
    <section className="panel-card rounded-2xl p-5">
      <p className="text-xs font-semibold text-[#2563EB]">STEP 1</p>
      <h2 className="mt-1 text-lg font-bold text-[#0B1220]">상담 정보</h2>
      <p className="mt-1 text-sm text-[#334155]">
        창업자의 예산과 매장 방향을 먼저 확인합니다.
      </p>
      <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        계약 전에 먼저 확인해볼게요.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="고객명">
          <input
            className="input"
            value={value.customerName}
            onChange={(e) => update("customerName", e.target.value)}
          />
        </Field>
        <Field label="연락처">
          <input
            className="input"
            value={value.contact}
            onChange={(e) => update("contact", e.target.value)}
          />
        </Field>
        <Field label="창업예산 (원)">
          <input
            className="input"
            type="number"
            value={value.startupBudget}
            onChange={(e) => update("startupBudget", Number(e.target.value))}
          />
        </Field>
        <Field label="희망지역">
          <input
            className="input"
            value={value.preferredArea}
            onChange={(e) => update("preferredArea", e.target.value)}
          />
        </Field>
        <Field label="창업경험">
          <select
            className="input"
            value={value.hasExperience ? "yes" : "no"}
            onChange={(e) => update("hasExperience", e.target.value === "yes")}
          >
            <option value="no">창업경험 없음</option>
            <option value="yes">창업경험 있음</option>
          </select>
        </Field>
        <Field label="희망 매장형태">
          <select
            className="input"
            value={value.storeType}
            onChange={(e) => update("storeType", e.target.value as StoreType)}
          >
            {storeTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="상담 메모">
        <textarea
          className="input mt-1 min-h-24"
          value={value.memo}
          onChange={(e) => update("memo", e.target.value)}
        />
      </Field>
    </section>
  );
}

```

## components\diagnosis\DiagnosisResultView.tsx

```tsx
import Link from "next/link";
import { DiagnosisResult } from "@/lib/diagnosis/types";
import { InteriorSketchBoard } from "./InteriorSketchBoard";
import { ChecklistSection } from "./ChecklistSection";
import { RiskVerdictBadge } from "./RiskVerdictBadge";

function StartupCostSection({ result }: { result: DiagnosisResult }) {
  if (!result.startupCostResult || !result.startupCost) return null;

  const rows: [string, number, string?][] = [
    ["보증금", result.startupCostDeposit ?? 0],
    ["권리금", result.startupCostPremium ?? 0],
    ["인테리어비", result.startupCost.interiorCost],
    ["제조장비비", result.startupCost.productionEquipmentCost],
    ["판매장비비", result.startupCost.salesEquipmentCost],
    ["간판비", result.startupCost.signageCost],
    ["초도물품비", result.startupCost.initialSuppliesCost],
    ["인허가 관련비", result.startupCost.licenseRelatedCost, "전문가 확인 필요"],
    ["예비비", result.startupCost.reserveCost],
  ];

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-base font-semibold text-[#0B1220]">창업비용 예상표</h3>
      <p className="text-sm text-slate-600">
        이 금액은 추정치이며 실제 비용은 시공사, 장비 견적, 현장 상황에 따라
        달라질 수 있습니다.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-slate-700">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2 pr-4">항목</th>
              <th className="py-2 pr-4">금액(추정)</th>
              <th className="py-2">비고</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, amount, note]) => (
              <tr key={label} className="border-b border-slate-100">
                <td className="py-2 pr-4">{label}</td>
                <td className="py-2 pr-4">{Math.round(amount).toLocaleString()}원</td>
                <td className="py-2 text-xs text-amber-700">{note ?? ""}</td>
              </tr>
            ))}
            <tr className="font-semibold text-[#0B1220]">
              <td className="py-2 pr-4">총 창업비용(추정)</td>
              <td className="py-2 pr-4">
                {Math.round(result.startupCostResult.totalCost).toLocaleString()}원
              </td>
              <td className="py-2" />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="grid gap-1 text-sm text-slate-700 md:grid-cols-2">
        <p>창업예산: {(result.startupBudget ?? 0).toLocaleString()}원</p>
        <p>
          예산 대비 차액:{" "}
          {Math.round(result.startupCostResult.budgetDifference).toLocaleString()}원
        </p>
        <p>예산 초과율(추정): {result.startupCostResult.budgetOverRatePercent.toFixed(2)}%</p>
        <p>예비비 비율(추정): {result.startupCostResult.reserveRatePercent.toFixed(2)}%</p>
      </div>
      <p className="text-xs text-amber-700">
        인허가·소방·전기 관련 항목은 전문가 확인 필요
      </p>
    </section>
  );
}

export function DiagnosisResultView({
  result,
  consultationId,
}: {
  result: DiagnosisResult;
  consultationId?: string;
}) {
  const reportId = consultationId ?? result.id;

  return (
    <section className="panel-card space-y-5 rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[#2563EB]">STEP 5</p>
          <h2 className="text-lg font-bold text-[#0B1220]">
            AI 1차 점포진단 결과
          </h2>
        </div>
        <RiskVerdictBadge verdict={result.verdict} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/reports/${reportId}`} className="btn-primary">
          고객용 리포트 보기
        </Link>
        <span className="text-xs text-slate-500">
          PDF 인쇄는 리포트 화면에서 가능합니다.
        </span>
      </div>

      <ChecklistSection
        title="핵심 리스크"
        items={result.sections.keyRisks}
        highlight
      />

      <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-base font-semibold text-[#0B1220]">
          왜 이 판단이 나왔는지
        </h3>
        <ul className="mt-2 space-y-1 text-sm text-[#334155]">
          {result.reasons.map((reason) => (
            <li key={reason}>· {reason}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          AI는 리스크를 빠르게 정리하고, 전문가가 최종 판단합니다.
        </p>
      </article>

      <section className="space-y-3 rounded-xl border border-amber-200 bg-[#FFF7ED] p-4">
        <h3 className="text-base font-semibold text-[#0B1220]">공간 활용 1차 의견</h3>
        <p className="text-sm text-slate-700">
          이 공간은 테이크아웃 중심으로 쓰면 무리가 적어 보입니다. 홀 좌석을 많이
          넣기보다는 쇼케이스와 픽업 동선을 우선 보는 편이 안전합니다.
        </p>
        <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-2">
          <article className="card">
            <h4 className="font-semibold">추천 인테리어 톤</h4>
            <p className="mt-1">{result.sections.interiorToneSuggestion}</p>
          </article>
          <article className="card">
            <h4 className="font-semibold">장비 배치 방향</h4>
            <p className="mt-1">{result.sections.equipmentPlacementIdea}</p>
          </article>
          <article className="card">
            <h4 className="font-semibold">쇼케이스/카운터 배치 의견</h4>
            <p className="mt-1">{result.sections.layoutIdea}</p>
          </article>
          <article className="card">
            <h4 className="font-semibold">홀 공간 활용 의견</h4>
            <p className="mt-1">{result.sections.hallUsageIdea}</p>
          </article>
          <article className="card">
            <h4 className="font-semibold">고객 동선 의견</h4>
            <p className="mt-1">{result.sections.customerFlowOpinion}</p>
          </article>
          <article className="card">
            <h4 className="font-semibold">직원 동선 의견</h4>
            <p className="mt-1">{result.sections.staffFlowOpinion}</p>
          </article>
          <article className="card md:col-span-2">
            <h4 className="font-semibold">확인 필요사항</h4>
            <p className="mt-1">{result.sections.interiorCheckRequired}</p>
          </article>
        </div>
      </section>

      <InteriorSketchBoard
        sketch={{
          interiorTone: result.sections.interiorToneSuggestion,
          operationType: result.sections.layoutIdea,
          showcasePosition: result.sections.equipmentPlacementIdea,
          counterPosition: result.sections.layoutIdea,
          kitchenPosition: result.sections.equipmentPlacementIdea,
          hallUsage: result.sections.hallUsageIdea,
          customerFlow: result.sections.customerFlowOpinion,
          staffFlow: result.sections.staffFlowOpinion,
          lowCostIdeas: result.sections.lowCostInteriorIdeas,
          checkRequired: result.sections.interiorCheckRequired,
        }}
      />

      <ChecklistSection
        title="계약 전 확인 질문"
        items={result.sections.preContractQuestions}
      />

      <div className="grid gap-3 text-sm text-[#334155] md:grid-cols-2">
        <article className="card">
          <h3 className="font-semibold">후보 점포 요약</h3>
          <p className="mt-1">{result.sections.candidateSummary}</p>
        </article>
        <article className="card">
          <h3 className="font-semibold">입지 분석</h3>
          <p className="mt-1">{result.sections.locationAnalysis}</p>
        </article>
        <article className="card">
          <h3 className="font-semibold">임대차 조건 분석</h3>
          <p className="mt-1">{result.sections.leaseAnalysis}</p>
        </article>
        <article className="card">
          <h3 className="font-semibold">시설·인허가 리스크</h3>
          <p className="mt-1">{result.sections.facilityRiskAnalysis}</p>
        </article>
        <article className="card">
          <h3 className="font-semibold">도면 기반 매장세팅 가능성</h3>
          <p className="mt-1">{result.sections.layoutFeasibilityAnalysis}</p>
        </article>
        <StartupCostSection result={result} />
        <article className="card">
          <h3 className="font-semibold">손익분기점 분석</h3>
          <p className="mt-1">{result.sections.breakEvenAnalysis}</p>
        </article>
        <article className="card">
          <h3 className="font-semibold">오픈 후 마케팅 가능성</h3>
          <p className="mt-1">{result.sections.marketingPotentialAnalysis}</p>
        </article>
        <article className="card">
          <h3 className="font-semibold">최종 판단</h3>
          <p className="mt-1">{result.sections.finalJudgment}</p>
        </article>
        <article className="card">
          <h3 className="font-semibold">브랜드 스토리텔링 진단</h3>
          <p className="mt-1">{result.sections.brandStoryDirection}</p>
        </article>
        <article className="card">
          <h3 className="font-semibold">콘텐츠 가능성</h3>
          <p className="mt-1">{result.sections.marketingPotential}</p>
        </article>
        <article className="card">
          <h3 className="font-semibold">오픈 후 3개월 마케팅 플랜</h3>
          <p className="mt-1">{result.sections.threeMonthMarketingPlan}</p>
        </article>
        <article className="card">
          <h3 className="font-semibold">지역 키워드 전략</h3>
          <p className="mt-1">{result.sections.localKeywordStrategy}</p>
        </article>
        <article className="card md:col-span-2">
          <h3 className="font-semibold">리뷰·단골 확보 전략</h3>
          <p className="mt-1">{result.sections.reviewAndRegularCustomerStrategy}</p>
        </article>
        <article className="card md:col-span-2">
          <h3 className="font-semibold">저비용 인테리어 아이디어</h3>
          <p className="mt-1">{result.sections.lowCostInteriorIdeas}</p>
        </article>
      </div>
    </section>
  );
}

```

## components\diagnosis\FacilityCheckForm.tsx

```tsx
"use client";

import { FacilityCheckInput } from "@/lib/diagnosis/types";

const tri = ["가능", "불확실", "불가"] as const;

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function FacilityCheckForm({
  value,
  onChange,
}: {
  value: FacilityCheckInput;
  onChange: (next: FacilityCheckInput) => void;
}) {
  const update = <K extends keyof FacilityCheckInput>(
    key: K,
    next: FacilityCheckInput[K],
  ) => onChange({ ...value, [key]: next });

  const triSelect = (key: keyof FacilityCheckInput, label: string) => (
    <Field label={label}>
      <select
        className="input"
        value={String(value[key])}
        onChange={(e) =>
          update(
            key,
            e.target.value as FacilityCheckInput[keyof FacilityCheckInput],
          )
        }
      >
        {tri.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <section className="panel-card rounded-2xl p-5">
      <p className="text-xs font-semibold text-[#2563EB]">STEP 3</p>
      <h2 className="mt-1 text-lg font-bold text-[#0B1220]">시설·장비 체크</h2>
      <p className="mt-1 text-sm text-[#334155]">
        베이커리는 시설에서 많이 막힙니다. 전기·배기·급배수부터 봅니다.
      </p>
      <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        상권이 좋아도, 전기·배기·급배수가 막히면 계약은 보류입니다.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="전기 용량">
          <input
            className="input"
            value={value.electricCapacity}
            onChange={(e) => update("electricCapacity", e.target.value)}
          />
        </Field>
        <Field label="천장고">
          <input
            className="input"
            value={value.ceilingHeight}
            onChange={(e) => update("ceilingHeight", e.target.value)}
          />
        </Field>
        <Field label="화장실">
          <input
            className="input"
            value={value.restroom}
            onChange={(e) => update("restroom", e.target.value)}
          />
        </Field>
        <Field label="기둥 위치">
          <input
            className="input"
            value={value.pillarLocation}
            onChange={(e) => update("pillarLocation", e.target.value)}
          />
        </Field>
        {triSelect("electricExpansionPossible", "전기 증설 가능 여부")}
        {triSelect("plumbingPossible", "급배수 가능 여부")}
        {triSelect("exhaustPossible", "배기 가능 여부")}
        {triSelect("ovenMovePossible", "오븐 반입 가능성")}
        {triSelect("mixerMovePossible", "믹서 반입 가능성")}
        {triSelect("prooferPlacementPossible", "발효기 배치 가능성")}
        {triSelect("coldStoragePlacementPossible", "냉장·냉동고 배치 가능성")}
        {triSelect("showcasePlacementPossible", "쇼케이스 배치 가능성")}
        {triSelect("productionSpaceSecured", "제조공간 확보 가능성")}
        {triSelect("salesSpaceSecured", "판매공간 확보 가능성")}
        <label className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={value.fireSafetyChecked}
            onChange={(e) => update("fireSafetyChecked", e.target.checked)}
          />
          소방 확인 여부
        </label>
        <label className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={value.drawingConfirmed}
            onChange={(e) => update("drawingConfirmed", e.target.checked)}
          />
          도면 또는 현장사진 확인 여부
        </label>
      </div>
    </section>
  );
}

```

## components\diagnosis\InteriorSketchBoard.tsx

```tsx
import { InteriorSketchInput } from "@/lib/diagnosis/types";

function Cell({ title, content }: { title: string; content: string }) {
  return (
    <article className="rounded-lg border border-amber-200 bg-white p-3">
      <p className="text-xs font-semibold text-amber-700">{title}</p>
      <p className="mt-1 text-sm text-slate-700">{content}</p>
    </article>
  );
}

export function InteriorSketchBoard({ sketch }: { sketch: InteriorSketchInput }) {
  return (
    <section className="rounded-xl border border-amber-200 bg-[#FFF7ED] p-4">
      <h3 className="text-base font-semibold text-[#0B1220]">간단 스케치 보드</h3>
      <p className="mt-1 text-xs text-slate-600">
        정식 설계도가 아니라, 계약 전 가능성을 보는 간단 스케치입니다.
      </p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <Cell title="전면 / 입구" content={`운영 방식: ${sketch.operationType}`} />
        <Cell title="쇼케이스 / 판매존" content={sketch.showcasePosition} />
        <Cell title="카운터 / 픽업존" content={sketch.counterPosition} />
        <Cell title="제조공간 / 홀" content={`${sketch.kitchenPosition} · ${sketch.hallUsage}`} />
      </div>
    </section>
  );
}

```

## components\diagnosis\InteriorSketchForm.tsx

```tsx
"use client";

import { InteriorSketchInput } from "@/lib/diagnosis/types";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

const toneOptions = [
  "따뜻한 동네빵집",
  "프리미엄 베이커리",
  "미니멀 화이트",
  "우드&크림",
  "디저트 카페형",
];

const operationOptions = [
  "테이크아웃 중심",
  "홀 좌석 중심",
  "제조공간 중심",
  "선물·포장 중심",
  "배달 병행",
];

export function InteriorSketchForm({
  value,
  onChange,
}: {
  value: InteriorSketchInput;
  onChange: (next: InteriorSketchInput) => void;
}) {
  const update = <K extends keyof InteriorSketchInput>(
    key: K,
    next: InteriorSketchInput[K],
  ) => onChange({ ...value, [key]: next });

  return (
    <section className="panel-card rounded-2xl p-5">
      <p className="text-xs font-semibold text-[#2563EB]">공간 활용 스케치</p>
      <h2 className="mt-1 text-lg font-bold text-[#0B1220]">공간 활용 스케치</h2>
      <p className="mt-1 text-sm text-[#334155]">
        정식 도면은 아니지만, 계약 전 제조공간·쇼케이스·카운터·홀 동선을 빠르게
        검토합니다.
      </p>
      <p className="mt-2 rounded-lg bg-[#FFF7ED] px-3 py-2 text-xs text-amber-900">
        정식 설계도가 아니라, 계약 전 가능성을 보는 간단 스케치입니다.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="선호 인테리어 톤">
          <select
            className="input"
            value={value.interiorTone}
            onChange={(e) => update("interiorTone", e.target.value)}
          >
            {toneOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
        <Field label="매장 운영 방식">
          <select
            className="input"
            value={value.operationType}
            onChange={(e) => update("operationType", e.target.value)}
          >
            {operationOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
        <Field label="쇼케이스 위치 아이디어">
          <input
            className="input"
            value={value.showcasePosition}
            onChange={(e) => update("showcasePosition", e.target.value)}
          />
        </Field>
        <Field label="카운터·픽업대 위치 아이디어">
          <input
            className="input"
            value={value.counterPosition}
            onChange={(e) => update("counterPosition", e.target.value)}
          />
        </Field>
        <Field label="제조공간 위치 아이디어">
          <input
            className="input"
            value={value.kitchenPosition}
            onChange={(e) => update("kitchenPosition", e.target.value)}
          />
        </Field>
        <Field label="홀 좌석 활용">
          <input
            className="input"
            value={value.hallUsage}
            onChange={(e) => update("hallUsage", e.target.value)}
          />
        </Field>
        <Field label="고객 동선 메모">
          <input
            className="input"
            value={value.customerFlow}
            onChange={(e) => update("customerFlow", e.target.value)}
          />
        </Field>
        <Field label="직원 동선 메모">
          <input
            className="input"
            value={value.staffFlow}
            onChange={(e) => update("staffFlow", e.target.value)}
          />
        </Field>
        <Field label="저비용 인테리어 아이디어">
          <textarea
            className="input min-h-20"
            value={value.lowCostIdeas}
            onChange={(e) => update("lowCostIdeas", e.target.value)}
          />
        </Field>
        <Field label="확인 필요사항">
          <textarea
            className="input min-h-20"
            value={value.checkRequired}
            onChange={(e) => update("checkRequired", e.target.value)}
          />
        </Field>
      </div>
    </section>
  );
}

```

## components\diagnosis\RiskVerdictBadge.tsx

```tsx
import { Verdict } from "@/lib/diagnosis/types";

const colorMap: Record<Verdict, string> = {
  추천: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
  "조건부 추천": "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  보류: "bg-orange-100 text-orange-800 ring-1 ring-orange-200",
  위험: "bg-red-100 text-red-800 ring-1 ring-red-200",
};

export function RiskVerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span
      className={`rounded-full px-3.5 py-1.5 text-sm font-bold ${colorMap[verdict]}`}
    >
      {verdict}
    </span>
  );
}

```

## components\diagnosis\StartupCostForm.tsx

```tsx
"use client";

import { StartupCostInput, StartupCostResult } from "@/lib/diagnosis/types";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

const fields: [keyof StartupCostInput, string][] = [
  ["interiorCost", "인테리어비 (원)"],
  ["productionEquipmentCost", "제조장비비 (원)"],
  ["salesEquipmentCost", "판매장비비 (원)"],
  ["signageCost", "간판비 (원)"],
  ["initialSuppliesCost", "초도물품비 (원)"],
  ["licenseRelatedCost", "인허가 관련비 (원)"],
  ["reserveCost", "예비비 (원)"],
];

export function StartupCostForm({
  value,
  result,
  deposit,
  premium,
  startupBudget,
  onChange,
}: {
  value: StartupCostInput;
  result?: StartupCostResult;
  deposit: number;
  premium: number;
  startupBudget: number;
  onChange: (next: StartupCostInput) => void;
}) {
  const update = <K extends keyof StartupCostInput>(
    key: K,
    next: StartupCostInput[K],
  ) => onChange({ ...value, [key]: next });

  return (
    <section className="panel-card rounded-2xl p-5">
      <p className="text-xs font-semibold text-[#2563EB]">STEP 5</p>
      <h2 className="mt-1 text-lg font-bold text-[#0B1220]">창업비용 예상표</h2>
      <p className="mt-1 text-sm text-[#334155]">
        보증금·권리금과 함께 초기 투입 비용을 추정해봅니다.
      </p>
      <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
        이 금액은 추정치이며 실제 비용은 시공사, 장비 견적, 현장 상황에 따라
        달라질 수 있습니다.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Field label="보증금 (원, 후보 점포 입력값)">
          <input className="input" type="number" value={deposit} readOnly />
        </Field>
        <Field label="권리금 (원, 후보 점포 입력값)">
          <input className="input" type="number" value={premium} readOnly />
        </Field>
        <Field label="창업예산 (원, 상담 입력값)">
          <input className="input" type="number" value={startupBudget} readOnly />
        </Field>
        {fields.map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              className="input"
              type="number"
              value={value[key]}
              onChange={(e) => update(key, Number(e.target.value))}
            />
            {key === "licenseRelatedCost" && (
              <p className="mt-1 text-xs text-amber-700">전문가 확인 필요</p>
            )}
          </Field>
        ))}
      </div>
      <p className="mt-2 text-xs text-amber-700">
        인허가·소방·전기 관련 항목은 전문가 확인 필요
      </p>
      {result && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-semibold text-[#0B1220]">추정 결과 (참고값)</p>
          <div className="mt-2 grid gap-1 md:grid-cols-2">
            <p>
              총 창업비용(추정):{" "}
              {Math.round(result.totalCost).toLocaleString()}원
            </p>
            <p>
              예산 대비 차액:{" "}
              {Math.round(result.budgetDifference).toLocaleString()}원
            </p>
            <p>예산 초과율(추정): {result.budgetOverRatePercent.toFixed(2)}%</p>
            <p>예비비 비율(추정): {result.reserveRatePercent.toFixed(2)}%</p>
          </div>
        </div>
      )}
    </section>
  );
}

```

## components\reports\DiagnosisReportDocument.tsx

```tsx
import { DiagnosisResult } from "@/lib/diagnosis/types";
import { RiskVerdictBadge } from "@/components/diagnosis/RiskVerdictBadge";
import { InteriorSketchReportSection } from "./InteriorSketchReportSection";

export function DiagnosisReportDocument({ result }: { result: DiagnosisResult }) {
  const risks = result.sections.keyRisks ?? [];
  const topRisks = risks.slice(0, 5);
  const monthlyBreakEven = Number.isFinite(result.breakEvenResult?.breakEvenSales)
    ? Math.round(result.breakEvenResult.breakEvenSales).toLocaleString()
    : "확인 필요";
  const monthlyProfit = Number.isFinite(result.breakEvenResult?.estimatedMonthlyNetProfit)
    ? Math.round(result.breakEvenResult.estimatedMonthlyNetProfit).toLocaleString()
    : "확인 필요";
  const rentBurdenRate = Number.isFinite(result.breakEvenResult?.rentBurdenRate)
    ? `${result.breakEvenResult.rentBurdenRate.toFixed(1)}%`
    : "확인 필요";
  const recoveryMonths =
    typeof result.breakEvenResult?.premiumRecoveryMonths === "number"
      ? `${result.breakEvenResult.premiumRecoveryMonths.toFixed(1)}개월`
      : "확인 필요";

  const riskStatus = (text: string) => {
    if (/위험|불가|초과/.test(text)) return "위험";
    if (/보류|주의|불확실/.test(text)) return "주의";
    if (/확인/.test(text)) return "확인 필요";
    return "양호";
  };

  const riskStatusClass: Record<string, string> = {
    위험: "bg-red-100 text-red-700 border-red-200",
    주의: "bg-amber-100 text-amber-700 border-amber-200",
    "확인 필요": "bg-slate-100 text-slate-700 border-slate-200",
    양호: "bg-emerald-100 text-emerald-700 border-emerald-200",
  };

  return (
    <article className="report-doc space-y-6 text-[#0B1220]">
      <section className="print-card rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-[#FFF7ED] p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#F59E0B]">
          FrameOne Bakery Consulting AI
        </p>
        <h1 className="mt-2 text-2xl font-bold">
          이 점포, 계약해도 괜찮을까요?
        </h1>
        <p className="mt-2 text-sm text-[#334155]">
          {result.sections.candidateSummary || "계약 전 핵심 항목을 먼저 점검해보는 리포트입니다."}
        </p>
        <p className="mt-3 text-sm font-medium text-[#0B1220]">
          AI가 먼저 정리하고, 전문가가 최종 확인합니다.
        </p>
        <div className="mt-4">
          <RiskVerdictBadge verdict={result.verdict} />
        </div>
      </section>

      <section className="print-card grid gap-3 md:grid-cols-4">
        {[
          {
            title: "계약 판단",
            status: result.verdict,
            desc: "현재 입력값 기준 1차 판단입니다.",
          },
          {
            title: "시설 리스크",
            status:
              topRisks.find((r) => /전기|배기|급배수|소방|위생|인허가/.test(r))
                ? "확인 필요"
                : "양호",
            desc: "전기·배기·급배수·소방·위생은 전문가 확인 필요",
          },
          {
            title: "월세 부담",
            status: rentBurdenRate === "확인 필요" ? "확인 필요" : "주의",
            desc: `월세 부담률(추정치): ${rentBurdenRate}`,
          },
          {
            title: "공간 활용",
            status: result.sections.interiorCheckRequired ? "확인 필요" : "양호",
            desc: "정식 설계 전 1차 스케치 의견입니다.",
          },
        ].map((card) => (
          <article key={card.title} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold text-slate-500">{card.title}</p>
            <p className={`mt-2 inline-block rounded-full border px-2.5 py-1 text-xs font-semibold ${riskStatusClass[card.status] ?? riskStatusClass["확인 필요"]}`}>
              {card.status}
            </p>
            <p className="mt-2 text-sm text-slate-700">{card.desc}</p>
          </article>
        ))}
      </section>

      <section className="print-card rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">핵심 리스크 TOP 5</h2>
        <p className="mt-1 text-sm text-slate-600">
          좋아 보이는 점포도 계약 전 확인할 게 많습니다. 확인 전에는 계약을 서두르지 않는 것이 안전합니다.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {(topRisks.length > 0 ? topRisks : ["핵심 리스크 정보가 부족하여 확인 필요"]).map((item) => {
            const status = riskStatus(item);
            return (
              <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <span className={`mr-2 inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${riskStatusClass[status]}`}>
                  {status}
                </span>
                {item}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          베이커리는 시설에서 많이 막힙니다. 전기·배기·급배수·소방·위생·인허가 항목은 전문가 확인 필요입니다.
        </p>
      </section>

      <section className="print-card rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">시설·장비 체크 요약</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {[
            ["전기/배기/급배수", "확인 필요", "전문가 확인 필요"],
            ["소방/위생/인허가", "확인 필요", "전문가 확인 필요"],
            ["제조공간/장비 반입", "주의", result.sections.layoutFeasibilityAnalysis || "확인 필요"],
            ["쇼케이스/판매 동선", "주의", result.sections.equipmentPlacementIdea || "확인 필요"],
          ].map(([name, status, desc]) => (
            <article key={name} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-500">{name}</p>
              <p className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${riskStatusClass[status]}`}>
                {status}
              </p>
              <p className="mt-1 text-sm text-slate-700">{desc}</p>
            </article>
          ))}
        </div>
      </section>

      {result.startupCostResult && result.startupCost && (
        <section className="print-card rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold">창업비용 예상표</h2>
          <p className="mt-1 text-sm text-slate-600">
            이 금액은 추정치이며 실제 비용은 시공사, 장비 견적, 현장 상황에 따라
            달라질 수 있습니다.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm text-slate-700">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2 pr-4">항목</th>
                  <th className="py-2 pr-4">금액(추정)</th>
                  <th className="py-2">비고</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["보증금", result.startupCostDeposit ?? 0],
                    ["권리금", result.startupCostPremium ?? 0],
                    ["인테리어비", result.startupCost.interiorCost],
                    ["제조장비비", result.startupCost.productionEquipmentCost],
                    ["판매장비비", result.startupCost.salesEquipmentCost],
                    ["간판비", result.startupCost.signageCost],
                    ["초도물품비", result.startupCost.initialSuppliesCost],
                    ["인허가 관련비", result.startupCost.licenseRelatedCost, "전문가 확인 필요"],
                    ["예비비", result.startupCost.reserveCost],
                  ] as [string, number, string?][]
                ).map(([label, amount, note]) => (
                  <tr key={label} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{label}</td>
                    <td className="py-2 pr-4">{Math.round(amount).toLocaleString()}원</td>
                    <td className="py-2 text-xs text-amber-700">{note ?? ""}</td>
                  </tr>
                ))}
                <tr className="font-semibold text-[#0B1220]">
                  <td className="py-2 pr-4">총 창업비용(추정)</td>
                  <td className="py-2 pr-4">
                    {Math.round(result.startupCostResult.totalCost).toLocaleString()}원
                  </td>
                  <td className="py-2" />
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">창업예산</p>
              <p className="mt-1 font-semibold">
                {(result.startupBudget ?? 0).toLocaleString()}원
              </p>
            </article>
            <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">예산 대비 차액</p>
              <p className="mt-1 font-semibold">
                {Math.round(result.startupCostResult.budgetDifference).toLocaleString()}원
              </p>
            </article>
            <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">예산 초과율(추정치)</p>
              <p className="mt-1 font-semibold">
                {result.startupCostResult.budgetOverRatePercent.toFixed(2)}%
              </p>
            </article>
            <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">예비비 비율(추정치)</p>
              <p className="mt-1 font-semibold">
                {result.startupCostResult.reserveRatePercent.toFixed(2)}%
              </p>
            </article>
          </div>
          <p className="mt-3 text-xs text-amber-700">
            인허가·소방·전기 관련 항목은 전문가 확인 필요
          </p>
        </section>
      )}

      <section className="print-card rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">손익분기점 요약 (추정치)</h2>
        <p className="mt-1 text-sm text-slate-600">
          이 월세를 매달 버틸 수 있을지 계산해봅니다. 현재 입력값 기준 추정치입니다.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">손익분기 매출(추정치)</p>
            <p className="mt-1 font-semibold">{monthlyBreakEven}원</p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">월순이익(추정치)</p>
            <p className="mt-1 font-semibold">{monthlyProfit}원</p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">월세 부담률(추정치)</p>
            <p className="mt-1 font-semibold">{rentBurdenRate}</p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 md:col-span-3">
            <p className="text-xs text-slate-500">권리금 회수 예상기간(추정치)</p>
            <p className="mt-1 font-semibold">{recoveryMonths}</p>
          </article>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          실제 매출은 입지, 상품력, 운영 역량, 마케팅 실행에 따라 달라질 수 있습니다.
        </p>
      </section>

      <section className="print-card rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">손님이 왜 이 빵집을 기억해야 할까요?</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">브랜드 콘셉트/스토리</p>
            <p className="mt-1 text-sm">{result.sections.brandStoryDirection || "확인 필요"}</p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">대표 고객층/시그니처</p>
            <p className="mt-1 text-sm">{result.sections.reviewAndRegularCustomerStrategy || "확인 필요"}</p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-3 md:col-span-2">
            <p className="text-xs text-slate-500">지역 키워드</p>
            <p className="mt-1 text-sm">{result.sections.localKeywordStrategy || "확인 필요"}</p>
          </article>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {[
            ["1개월차", "네이버 플레이스 세팅, 오픈 이벤트, 초기 리뷰 확보"],
            ["2개월차", "블로그 콘텐츠, 지역 키워드 노출, 메뉴 사진 강화"],
            ["3개월차", "단골 확보, 리뷰 이벤트, 시그니처 메뉴 홍보"],
          ].map(([month, plan]) => (
            <article key={month} className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
              <p className="text-xs font-semibold text-blue-700">{month}</p>
              <p className="mt-1 text-sm text-slate-700">{plan}</p>
            </article>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          오픈 후 3개월은 고객이 이 매장을 기억하게 만드는 시간입니다.
        </p>
      </section>

      <InteriorSketchReportSection result={result} />

      <section className="print-card">
        <h2 className="font-semibold">최종 판단</h2>
        <p className="mt-1 text-sm">{result.sections.finalJudgment}</p>
      </section>
      <section className="print-card">
        <h2 className="font-semibold">계약 전 확인 질문</h2>
        <ul className="mt-1 text-sm">
          {result.sections.preContractQuestions.map((item) => (
            <li key={item}>- {item}</li>
          ))}
        </ul>
      </section>
      <section className="print-card rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p>본 리포트는 창업 성공을 보장하지 않습니다.</p>
        <p className="mt-1">본 리포트는 계약 전 의사결정을 돕기 위한 참고 자료입니다.</p>
        <p className="mt-1">
          매출, 수익, 권리금 회수기간은 입력값 기준 추정치이며 보장하지 않습니다.
        </p>
        <p className="mt-1">
          본 마케팅 플랜은 매출을 보장하지 않으며, 오픈 초기 고객 유입 가능성을
          높이기 위한 실행 참고안입니다.
        </p>
        <p className="mt-1">
          법률·세무·인허가·위생·소방·전기·배기·급배수는 반드시 전문가 확인이
          필요합니다.
        </p>
        <p className="mt-1">
          이 리포트는 계약 전 의사결정을 돕는 참고자료입니다.
        </p>
      </section>
    </article>
  );
}

```

## components\reports\DiagnosisReportPreview.tsx

```tsx
import Link from "next/link";
import { DiagnosisResult } from "@/lib/diagnosis/types";
import { DiagnosisReportDocument } from "./DiagnosisReportDocument";
import { PrintButton } from "./PrintButton";

export function DiagnosisReportPreview({ result }: { result: DiagnosisResult }) {
  return (
    <section className="panel-card space-y-4 rounded-2xl p-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-[#0B1220]">
            고객용 리포트 미리보기
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            PDF 인쇄는 리포트 화면에서 가능합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/consultations/${result.id}`}
            className="btn-secondary"
          >
            상담 상세로 돌아가기
          </Link>
          <PrintButton />
        </div>
      </div>
      <DiagnosisReportDocument result={result} />
    </section>
  );
}

```

## components\reports\InteriorSketchReportSection.tsx

```tsx
import { DiagnosisResult } from "@/lib/diagnosis/types";

export function InteriorSketchReportSection({
  result,
}: {
  result: DiagnosisResult;
}) {
  return (
    <section className="print-card rounded-xl border border-amber-200 bg-[#FFF7ED] p-4">
      <h2 className="font-semibold">공간 활용 스케치</h2>
      <p className="mt-1 text-sm text-slate-700">
        정식 도면 전, 먼저 보는 매장 구성 아이디어
      </p>
      <div className="mt-3 overflow-hidden rounded-xl border border-amber-300 bg-white">
        <div className="grid grid-cols-6 gap-px bg-amber-200 text-sm">
          <article className="col-span-6 bg-white p-3">
            <h3 className="text-xs font-semibold text-amber-700">전면 / 입구</h3>
            <p className="mt-1">{result.sections.layoutIdea || "확인 필요"}</p>
          </article>
          <article className="col-span-3 bg-white p-3">
            <h3 className="text-xs font-semibold text-amber-700">쇼케이스 / 판매존</h3>
            <p className="mt-1">{result.sections.equipmentPlacementIdea || "확인 필요"}</p>
          </article>
          <article className="col-span-3 bg-white p-3">
            <h3 className="text-xs font-semibold text-amber-700">카운터 / 픽업존</h3>
            <p className="mt-1">{result.sections.layoutIdea || "확인 필요"}</p>
          </article>
          <article className="col-span-3 bg-white p-3">
            <h3 className="text-xs font-semibold text-amber-700">제조공간</h3>
            <p className="mt-1">{result.sections.interiorToneSuggestion || "확인 필요"}</p>
          </article>
          <article className="col-span-3 bg-white p-3">
            <h3 className="text-xs font-semibold text-amber-700">홀 좌석 / 대기공간</h3>
            <p className="mt-1">{result.sections.hallUsageIdea || "확인 필요"}</p>
          </article>
          <article className="col-span-3 bg-white p-3">
            <h3 className="text-xs font-semibold text-amber-700">고객 동선</h3>
            <p className="mt-1">{result.sections.customerFlowOpinion || "확인 필요"}</p>
          </article>
          <article className="col-span-3 bg-white p-3">
            <h3 className="text-xs font-semibold text-amber-700">직원 동선</h3>
            <p className="mt-1">{result.sections.staffFlowOpinion || "확인 필요"}</p>
          </article>
          <article className="col-span-6 bg-white p-3">
            <h3 className="text-xs font-semibold text-amber-700">저비용 개선 아이디어</h3>
            <p className="mt-1">{result.sections.lowCostInteriorIdeas || "확인 필요"}</p>
          </article>
          <article className="col-span-6 bg-white p-3">
            <h3 className="text-xs font-semibold text-amber-700">전문가 확인 필요사항</h3>
            <p className="mt-1">{result.sections.interiorCheckRequired || "확인 필요"}</p>
          </article>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-600">
        본 스케치는 정식 설계도면이 아닙니다. 실제 공사 가능 여부는 현장 실측,
        인테리어 업체, 전기·소방·위생·급배수·배기 전문가 확인이 필요합니다.
      </p>
    </section>
  );
}

```

## components\reports\PrintButton.tsx

```tsx
"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="btn-primary print:hidden"
    >
      PDF 인쇄 / 저장
    </button>
  );
}

```

## components\ui\BentoCard.tsx

```tsx
export function BentoCard({
  title,
  description,
  accent = "default",
}: {
  title: string;
  description: string;
  accent?: "default" | "risk" | "finance" | "marketing";
}) {
  const accentMap = {
    default: "border-slate-200 bg-white",
    risk: "border-red-200 bg-red-50/40",
    finance: "border-amber-200 bg-amber-50/40",
    marketing: "border-blue-200 bg-blue-50/40",
  };

  return (
    <article className={`panel-card rounded-2xl border p-5 ${accentMap[accent]}`}>
      <h3 className="text-base font-semibold text-[#0B1220]">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[#334155]">{description}</p>
    </article>
  );
}

```

## components\ui\StepIndicator.tsx

```tsx
const steps = [
  "상담 정보",
  "후보 점포",
  "시설·장비",
  "손익분기점",
  "AI 진단",
];

export function StepIndicator({ current = 1 }: { current?: number }) {
  return (
    <ol className="flex flex-wrap gap-2">
      {steps.map((label, index) => {
        const step = index + 1;
        const active = step === current;
        const done = step < current;
        return (
          <li
            key={label}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              active
                ? "bg-[#0B1220] text-white"
                : done
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-600"
            }`}
          >
            {step}. {label}
          </li>
        );
      })}
    </ol>
  );
}

```

## data\consultations.json

```json
[
  {
    "consultation": {
      "id": "sample-001",
      "title": "서울 성동구 성수동 후보지 A",
      "sampleData": true,
      "customerName": "홍길동",
      "contact": "010-0000-0000",
      "startupBudget": 150000000,
      "preferredArea": "서울 성동구",
      "hasExperience": false,
      "storeType": "제조형",
      "memo": "샘플 데이터 - 실제 주소/상권으로 오해 금지"
    },
    "candidateStore": {
      "address": "샘플 데이터: 서울 성동구 성수동 후보지 A",
      "deposit": 50000000,
      "rent": 4500000,
      "maintenanceFee": 500000,
      "premium": 30000000,
      "exclusiveArea": 66,
      "floor": "1층",
      "frontage": 6,
      "entrancePosition": "정면",
      "signExposure": "보통",
      "parkingAvailable": false,
      "previousBusiness": "카페",
      "contractPeriod": "2년",
      "businessRestriction": "제과제빵 가능 여부 확인 필요",
      "restorationScope": "천장/벽체 일부 원상복구",
      "specialTerms": "배기 및 전기 증설 관련 특약 필요"
    },
    "facilityCheck": {
      "electricCapacity": "20kW 추정",
      "electricExpansionPossible": "불확실",
      "plumbingPossible": "가능",
      "exhaustPossible": "불확실",
      "ceilingHeight": "2.8m",
      "restroom": "공용",
      "fireSafetyChecked": false,
      "pillarLocation": "중앙 1개",
      "ovenMovePossible": "불확실",
      "mixerMovePossible": "가능",
      "prooferPlacementPossible": "가능",
      "coldStoragePlacementPossible": "불확실",
      "showcasePlacementPossible": "가능",
      "productionSpaceSecured": "불확실",
      "salesSpaceSecured": "가능",
      "drawingConfirmed": false
    },
    "breakEven": {
      "expectedUnitPrice": 8500,
      "expectedDailyVisitors": 90,
      "expectedDailySales": 765000,
      "expectedMonthlySales": 22950000,
      "materialCostRate": 0.34,
      "laborCost": 5000000,
      "rent": 4500000,
      "maintenanceFee": 500000,
      "cardFeeRate": 0.03,
      "deliveryFeeRate": 0.04,
      "adCost": 700000,
      "otherFixedCost": 1200000,
      "premium": 30000000
    }
  },
  {
    "consultation": {
      "id": "consult-1782978715998",
      "title": "새 상담",
      "sampleData": true,
      "customerName": "홍길동",
      "contact": "010-0000-0000",
      "startupBudget": 150000000,
      "preferredArea": "서울 성동구",
      "hasExperience": false,
      "storeType": "제조형",
      "memo": "샘플 데이터 - 실제 주소/상권으로 오해 금지"
    },
    "candidateStore": {
      "address": "샘플 데이터: 서울 성동구 성수동 후보지 A",
      "deposit": 50000000,
      "rent": 4500000,
      "maintenanceFee": 500000,
      "premium": 30000000,
      "exclusiveArea": 66,
      "floor": "1층",
      "frontage": 6,
      "entrancePosition": "정면",
      "signExposure": "보통",
      "parkingAvailable": false,
      "previousBusiness": "카페",
      "contractPeriod": "2년",
      "businessRestriction": "제과제빵 가능 여부 확인 필요",
      "restorationScope": "천장/벽체 일부 원상복구",
      "specialTerms": "배기 및 전기 증설 관련 특약 필요"
    },
    "facilityCheck": {
      "electricCapacity": "20kW 추정",
      "electricExpansionPossible": "불확실",
      "plumbingPossible": "가능",
      "exhaustPossible": "불확실",
      "ceilingHeight": "2.8m",
      "restroom": "공용",
      "fireSafetyChecked": false,
      "pillarLocation": "중앙 1개",
      "ovenMovePossible": "불확실",
      "mixerMovePossible": "가능",
      "prooferPlacementPossible": "가능",
      "coldStoragePlacementPossible": "불확실",
      "showcasePlacementPossible": "가능",
      "productionSpaceSecured": "불확실",
      "salesSpaceSecured": "가능",
      "drawingConfirmed": false
    },
    "breakEven": {
      "expectedUnitPrice": 8500,
      "expectedDailyVisitors": 90,
      "expectedDailySales": 765000,
      "expectedMonthlySales": 22950000,
      "materialCostRate": 0.34,
      "laborCost": 5000000,
      "rent": 4500000,
      "maintenanceFee": 500000,
      "cardFeeRate": 0.03,
      "deliveryFeeRate": 0.04,
      "adCost": 700000,
      "otherFixedCost": 1200000,
      "premium": 30000000
    }
  }
]
```

## eslint.config.mjs

```mjs
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

```

## lib\diagnosis\calculateBreakEven.ts

```ts
import { BreakEvenInput, BreakEvenResult } from "./types";

export function calculateBreakEven(input: BreakEvenInput): BreakEvenResult {
  const monthlySales = Math.max(input.expectedMonthlySales, 1);

  // 월세 부담률 = 월세 / 예상 월매출 × 100
  const rentBurdenRate = (input.rent / monthlySales) * 100;

  // 총 고정비 = 월세 + 관리비 + 인건비 + 광고비 + 기타 고정비
  const totalFixedCost =
    input.rent +
    input.maintenanceFee +
    input.laborCost +
    input.adCost +
    input.otherFixedCost;

  // 변동비율 = 원재료비율 + 카드수수료율 + 배달수수료율
  const variableCostRate =
    input.materialCostRate + input.cardFeeRate + input.deliveryFeeRate;

  // 손익분기 매출 = 총 고정비 / (1 - 변동비율)
  const denominator = 1 - variableCostRate;
  const breakEvenSales = denominator > 0 ? totalFixedCost / denominator : Infinity;

  const estimatedMonthlyNetProfit =
    monthlySales * (1 - variableCostRate) - totalFixedCost;

  // 권리금 회수 예상기간 = 권리금 / 예상 월순이익
  const premiumRecoveryMonths =
    estimatedMonthlyNetProfit > 0
      ? input.premium / estimatedMonthlyNetProfit
      : null;

  return {
    rentBurdenRate,
    totalFixedCost,
    variableCostRate,
    breakEvenSales,
    estimatedMonthlyNetProfit,
    premiumRecoveryMonths,
  };
}

```

## lib\diagnosis\calculateRisk.ts

```ts
import {
  BreakEvenResult,
  ConsultationRecord,
  StartupCostResult,
  Verdict,
} from "./types";

interface RiskOutput {
  verdict: Verdict;
  reasons: string[];
}

export function calculateRisk(
  record: ConsultationRecord,
  breakEvenResult: BreakEvenResult,
  startupCostResult?: StartupCostResult,
): RiskOutput {
  const reasons: string[] = [];
  let score = 0;

  if (
    record.consultation.storeType === "제조형" &&
    record.facilityCheck.exhaustPossible !== "가능"
  ) {
    score += 3;
    reasons.push("제조형 매장인데 배기 가능성이 불확실하거나 불가합니다.");
  }

  if (
    record.facilityCheck.electricExpansionPossible === "불확실" ||
    record.facilityCheck.electricExpansionPossible === "불가"
  ) {
    score += 2;
    reasons.push("전기 증설 가능성이 낮거나 불확실합니다.");
  }

  if (breakEvenResult.rentBurdenRate > 15) {
    score += 2;
    reasons.push("월세 부담률이 15%를 초과합니다.");
  }

  if (record.facilityCheck.productionSpaceSecured !== "가능") {
    score += 2;
    reasons.push("제조공간 확보가 불확실하거나 어렵습니다.");
  }

  if (!record.facilityCheck.drawingConfirmed) {
    score += 1;
    reasons.push("도면 또는 현장사진 미확인으로 레이아웃 판단 신뢰도가 낮습니다.");
  }

  if (record.startupCost && startupCostResult) {
    if (startupCostResult.budgetOverRatePercent >= 20) {
      score += 3;
      reasons.push("총 창업비용이 창업예산을 20% 이상 초과합니다.");
    } else if (startupCostResult.budgetOverRatePercent > 0) {
      score += 1;
      reasons.push("총 창업비용이 창업예산을 초과합니다.");
    }

    if (startupCostResult.reserveRatePercent < 10) {
      score += 1;
      reasons.push("예비비가 총 창업비용의 10% 미만으로 부족할 수 있습니다.");
    }
  }

  let verdict: Verdict = "추천";
  if (score >= 7) verdict = "위험";
  else if (score >= 5) verdict = "보류";
  else if (score >= 2) verdict = "조건부 추천";

  if (reasons.length === 0) {
    reasons.push("핵심 조건이 전반적으로 양호합니다.");
  }

  return { verdict, reasons };
}

```

## lib\diagnosis\calculateStartupCost.ts

```ts
import { StartupCostInput, StartupCostResult } from "./types";

export function calculateStartupCost(
  startupCost: StartupCostInput,
  deposit: number,
  premium: number,
  startupBudget: number,
): StartupCostResult {
  // 총 창업비용 = 보증금 + 권리금 + 인테리어비 + 제조장비비 + 판매장비비 + 간판비 + 초도물품비 + 인허가관련비 + 예비비
  const totalCost =
    deposit +
    premium +
    startupCost.interiorCost +
    startupCost.productionEquipmentCost +
    startupCost.salesEquipmentCost +
    startupCost.signageCost +
    startupCost.initialSuppliesCost +
    startupCost.licenseRelatedCost +
    startupCost.reserveCost;

  // 예산 대비 차액 = 창업예산 - 총 창업비용
  const budgetDifference = startupBudget - totalCost;

  // 예산 초과율(%) = (총 창업비용 - 창업예산) / 창업예산 × 100
  const budgetOverRatePercent =
    startupBudget > 0 ? ((totalCost - startupBudget) / startupBudget) * 100 : 0;

  // 예비비 비율(%) = 예비비 / 총 창업비용 × 100
  const reserveRatePercent =
    totalCost > 0 ? (startupCost.reserveCost / totalCost) * 100 : 0;

  return {
    totalCost,
    budgetDifference,
    budgetOverRatePercent,
    reserveRatePercent,
  };
}

```

## lib\diagnosis\diagnosis-service.ts

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { buildDiagnosisResult } from "./mockAiDiagnosis";
import { ConsultationRecord, DiagnosisResult } from "./types";
import { sampleConsultation } from "./sample-data";

const dataDir = path.join(process.cwd(), "data");
const consultationsFile = path.join(dataDir, "consultations.json");
const draftsBackupFile = path.join(dataDir, "diagnosis-drafts.json.backup");

async function ensureDataFiles() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(consultationsFile);
  } catch {
    await fs.writeFile(
      consultationsFile,
      JSON.stringify([sampleConsultation], null, 2),
      "utf-8",
    );
  }

  try {
    await fs.access(draftsBackupFile);
  } catch {
    await fs.writeFile(draftsBackupFile, JSON.stringify([], null, 2), "utf-8");
  }
}

export async function getConsultations(): Promise<ConsultationRecord[]> {
  await ensureDataFiles();
  const raw = await fs.readFile(consultationsFile, "utf-8");
  return JSON.parse(raw) as ConsultationRecord[];
}

export async function getConsultationById(id: string) {
  const list = await getConsultations();
  return list.find((item) => item.consultation.id === id) ?? null;
}

export async function saveConsultation(record: ConsultationRecord) {
  const list = await getConsultations();
  const index = list.findIndex((item) => item.consultation.id === record.consultation.id);
  if (index >= 0) list[index] = record;
  else list.push(record);
  await fs.writeFile(consultationsFile, JSON.stringify(list, null, 2), "utf-8");
  return record;
}

export async function runDiagnosis(id: string): Promise<DiagnosisResult | null> {
  const record = await getConsultationById(id);
  if (!record) return null;
  const result = buildDiagnosisResult(record);

  await ensureDataFiles();
  const draftsRaw = await fs.readFile(draftsBackupFile, "utf-8");
  const drafts = JSON.parse(draftsRaw) as DiagnosisResult[];
  const nextDrafts = [result, ...drafts].slice(0, 20);
  await fs.writeFile(draftsBackupFile, JSON.stringify(nextDrafts, null, 2), "utf-8");
  return result;
}

```

## lib\diagnosis\mockAiDiagnosis.ts

```ts
import { calculateBreakEven } from "./calculateBreakEven";
import { calculateRisk } from "./calculateRisk";
import { calculateStartupCost } from "./calculateStartupCost";
import { buildNarrative } from "./reportNarrative";
import { ConsultationRecord, DiagnosisResult } from "./types";

export function buildDiagnosisResult(record: ConsultationRecord): DiagnosisResult {
  const breakEvenResult = calculateBreakEven(record.breakEven);

  const startupCostResult = record.startupCost
    ? calculateStartupCost(
        record.startupCost,
        record.candidateStore.deposit,
        record.candidateStore.premium,
        record.consultation.startupBudget,
      )
    : undefined;

  const { verdict, reasons } = calculateRisk(
    record,
    breakEvenResult,
    startupCostResult,
  );
  const sections = buildNarrative(record, verdict, reasons, breakEvenResult);

  return {
    id: record.consultation.id,
    verdict,
    reasons,
    breakEvenResult,
    startupCostResult,
    startupCost: record.startupCost,
    startupCostDeposit: record.startupCost ? record.candidateStore.deposit : undefined,
    startupCostPremium: record.startupCost ? record.candidateStore.premium : undefined,
    startupBudget: record.startupCost ? record.consultation.startupBudget : undefined,
    sections,
    generatedAt: new Date().toISOString(),
  };
}

export function mockAiDiagnosis(record: ConsultationRecord): DiagnosisResult {
  return buildDiagnosisResult(record);
}

```

## lib\diagnosis\reportNarrative.ts

```ts
import { BreakEvenResult, ConsultationRecord, DiagnosisSections, Verdict } from "./types";

export function buildNarrative(
  record: ConsultationRecord,
  verdict: Verdict,
  reasons: string[],
  breakEven: BreakEvenResult,
): DiagnosisSections {
  const brand = record.brandMarketing;
  const sketch = record.interiorSketch;
  const target = brand?.targetCustomer || "동네 단골 고객";
  const signature = brand?.signatureMenu || "시그니처 메뉴 후보 검토 필요";
  const keywords = brand?.localKeywords || "지역 키워드 추가 검토 필요";
  const operationType = sketch?.operationType || "운영 방식 확인 필요";
  const tone = sketch?.interiorTone || "인테리어 톤 확인 필요";
  const showcase = sketch?.showcasePosition || "쇼케이스 위치 확인 필요";
  const counter = sketch?.counterPosition || "카운터 위치 확인 필요";
  const kitchen = sketch?.kitchenPosition || "제조공간 위치 확인 필요";
  const hall = sketch?.hallUsage || "홀 활용 확인 필요";
  const customerFlow = sketch?.customerFlow || "고객 동선 확인 필요";
  const staffFlow = sketch?.staffFlow || "직원 동선 확인 필요";
  const lowCostIdeas = sketch?.lowCostIdeas || "저비용 인테리어 아이디어 검토 필요";
  const checkRequired = sketch?.checkRequired || "기둥/급배수/배기/전기 동선 확인 필요";

  return {
    candidateSummary: `${record.consultation.title} (샘플 데이터) 후보지는 ${record.consultation.storeType} 중심 운영을 가정한 1차 검토 대상입니다.`,
    keyRisks: reasons,
    locationAnalysis:
      "상권 정보는 1차 MVP 기준 정성 검토(참고값)입니다. 실제 유동/매출 데이터는 별도 API 연동 후 확인이 필요합니다.",
    leaseAnalysis: `보증금 ${record.candidateStore.deposit.toLocaleString()}원, 월세 ${record.candidateStore.rent.toLocaleString()}원 기준이며 특약 협의 필요사항은 '${record.candidateStore.specialTerms}'입니다.`,
    facilityRiskAnalysis:
      "베이커리는 시설에서 많이 막힐 수 있습니다. 전기, 배기, 급배수, 소방, 위생, 인허가 관련 항목은 현장 실측과 전문가 확인이 필요합니다.",
    layoutFeasibilityAnalysis:
      record.facilityCheck.drawingConfirmed
        ? "도면/사진 확인 기준으로 장비 반입 및 제조/판매 동선은 참고 수준에서 검토되었습니다."
        : "도면/사진 미확인 상태이므로 매장 세팅 가능성은 반드시 현장 검증이 필요합니다.",
    breakEvenAnalysis: `추정 월 손익분기 매출은 약 ${Math.round(
      breakEven.breakEvenSales,
    ).toLocaleString()}원(참고값)이며, 추정 월순이익은 약 ${Math.round(
      breakEven.estimatedMonthlyNetProfit,
    ).toLocaleString()}원입니다. 이 수치는 입력값 기준 추정치이며 실제 결과는 달라질 수 있습니다.`,
    marketingPotentialAnalysis:
      "오픈 초기 3개월은 고객이 이 매장을 기억하게 만드는 시간입니다. 지도/리뷰 채널과 지역 제휴, 시식/체험형 프로모션을 함께 검토하는 편이 좋습니다(참고안).",
    brandStoryDirection:
      "이 점포, 계약 전에 먼저 확인해볼게요. 점포는 계약 전에 검증하고 브랜드는 오픈 전에 설계해야 합니다. 고객이 기억할 한 문장과 시그니처 메뉴를 함께 정리하는 것이 좋습니다.",
    marketingPotential:
      "상권이 좋아도 이야기가 없으면 기억되기 어렵고, 이야기가 좋아도 비용 구조가 무너지면 오래 버티기 어렵습니다. 네이버 플레이스, 블로그, 인스타그램 소재는 실행 가능성을 검토할 수 있습니다.",
    threeMonthMarketingPlan:
      "오픈 전 2주는 플레이스 기본 세팅과 촬영 콘텐츠를 준비하고, 1개월차는 리뷰 확보, 2개월차는 지역 키워드 노출, 3개월차는 단골 전환 이벤트 중심으로 운영을 검토할 수 있습니다(참고용입니다).",
    localKeywordStrategy: `대표 고객층은 ${target}을 우선 가정하고, 지역 키워드는 '${keywords}' 기준으로 콘텐츠 일관성을 맞추는 전략이 검토가 필요합니다.`,
    reviewAndRegularCustomerStrategy: `시그니처 메뉴 후보 '${signature}'를 중심으로 첫 방문 리뷰 유도와 재방문 스탬프/세트 제안을 병행하면 단골 전환 가능성이 있습니다.`,
    interiorToneSuggestion: `추천 인테리어 톤은 '${tone}' 방향으로 검토 가능하며, 실제 시공 가능 여부는 전문가 확인이 필요합니다.`,
    layoutIdea: `운영 방식은 '${operationType}' 기준으로, 제조공간은 '${kitchen}' 배치를 우선 검토하는 편이 안전합니다. 확정 전에는 현장 조건 확인이 필요합니다.`,
    equipmentPlacementIdea: `쇼케이스는 '${showcase}', 카운터/픽업대는 '${counter}' 위치 아이디어로 1차 검토할 수 있습니다.`,
    hallUsageIdea: `홀/대기 공간은 '${hall}' 구성을 우선 고려하되, 현장 폭과 동선 간섭 여부 확인이 필요합니다.`,
    customerFlowOpinion: `고객 동선은 '${customerFlow}' 흐름을 기준으로 검토 가능하며, 혼잡 시간대 시뮬레이션이 권장됩니다.`,
    staffFlowOpinion: `직원 동선은 '${staffFlow}' 기준으로 검토 가능하나, 장비 반입/배기 위치와 함께 재검토가 필요합니다.`,
    lowCostInteriorIdeas: `저비용 개선 아이디어: ${lowCostIdeas}.`,
    interiorCheckRequired: `우선 확인 권장 항목: ${checkRequired}.`,
    finalJudgment: `최종 판단은 '${verdict}'이며, 본 결과는 AI 보조 진단 기반 참고 의견입니다.`,
    preContractQuestions: [
      "배기/전기 증설 관련 건물주 및 관리주체 확약 가능 여부는?",
      "원상복구 범위와 특약 조항을 서면으로 명확히 남길 수 있는가?",
      "인허가/위생/소방 점검을 계약 전 완료할 수 있는가?",
    ],
  };
}

```

## lib\diagnosis\sample-data.ts

```ts
import { ConsultationRecord } from "./types";

export const sampleConsultation: ConsultationRecord = {
  consultation: {
    id: "sample-001",
    title: "서울 성동구 성수동 후보지 A",
    sampleData: true,
    customerName: "홍길동",
    contact: "010-0000-0000",
    startupBudget: 150000000,
    preferredArea: "서울 성동구",
    hasExperience: false,
    storeType: "제조형",
    memo: "샘플 데이터 - 실제 주소/상권으로 오해 금지",
  },
  candidateStore: {
    address: "샘플 데이터: 서울 성동구 성수동 후보지 A",
    deposit: 50000000,
    rent: 4500000,
    maintenanceFee: 500000,
    premium: 30000000,
    exclusiveArea: 66,
    floor: "1층",
    frontage: 6,
    entrancePosition: "정면",
    signExposure: "보통",
    parkingAvailable: false,
    previousBusiness: "카페",
    contractPeriod: "2년",
    businessRestriction: "제과제빵 가능 여부 확인 필요",
    restorationScope: "천장/벽체 일부 원상복구",
    specialTerms: "배기 및 전기 증설 관련 특약 필요",
  },
  facilityCheck: {
    electricCapacity: "20kW 추정",
    electricExpansionPossible: "불확실",
    plumbingPossible: "가능",
    exhaustPossible: "불확실",
    ceilingHeight: "2.8m",
    restroom: "공용",
    fireSafetyChecked: false,
    pillarLocation: "중앙 1개",
    ovenMovePossible: "불확실",
    mixerMovePossible: "가능",
    prooferPlacementPossible: "가능",
    coldStoragePlacementPossible: "불확실",
    showcasePlacementPossible: "가능",
    productionSpaceSecured: "불확실",
    salesSpaceSecured: "가능",
    drawingConfirmed: false,
  },
  breakEven: {
    expectedUnitPrice: 8500,
    expectedDailyVisitors: 90,
    expectedDailySales: 765000,
    expectedMonthlySales: 22950000,
    materialCostRate: 0.34,
    laborCost: 5000000,
    rent: 4500000,
    maintenanceFee: 500000,
    cardFeeRate: 0.03,
    deliveryFeeRate: 0.04,
    adCost: 700000,
    otherFixedCost: 1200000,
    premium: 30000000,
  },
  brandMarketing: {
    brandConcept: "성수동 직장인을 위한 따뜻한 데일리 베이커리",
    founderStory: "좋은 재료와 기본기 있는 빵으로 동네 단골을 만들고 싶다는 동기",
    targetCustomer: "직장인, 동네 단골",
    signatureMenu: "버터 소금빵, 사워도우 샌드위치",
    brandTone: "친근한, 감성적인",
    localKeywords: "성수동 베이커리, 성수동 소금빵, 성수 브런치",
    naverPlaceStrategy: "오픈 전 사진/메뉴 세팅, 주차/영업시간/대표메뉴 고정",
    blogContentIdeas: "시그니처 메뉴 제작 과정, 출근길 추천 세트, 주간 한정 메뉴",
    instagramContentIdeas: "오븐 굽는 영상, 당일 라인업 카드뉴스, 고객 후기 리그램",
    reviewEventIdea: "오픈 1개월 리뷰 작성 시 아메리카노 또는 미니빵 증정",
  },
  interiorSketch: {
    interiorTone: "우드&크림",
    operationType: "테이크아웃 중심",
    showcasePosition: "전면 노출",
    counterPosition: "쇼케이스 옆",
    kitchenPosition: "후면",
    hallUsage: "2~4석",
    customerFlow: "입구 → 쇼케이스 → 계산 → 픽업 → 퇴장",
    staffFlow: "제조 → 진열 → 포장 → 픽업",
    lowCostIdeas: "조명 교체, 메뉴보드 정리, 시그니처 진열존 구성",
    checkRequired: "급배수 위치, 배기 방향, 전기 콘센트, 장비 반입 동선",
  },
};

```

## lib\diagnosis\types.ts

```ts
export type StoreType = "판매형" | "제조형" | "카페형" | "배달병행형";
export type Verdict = "추천" | "조건부 추천" | "보류" | "위험";

export interface ConsultationInput {
  id: string;
  title: string;
  sampleData: boolean;
  customerName: string;
  contact: string;
  startupBudget: number;
  preferredArea: string;
  hasExperience: boolean;
  storeType: StoreType;
  memo: string;
}

export interface CandidateStoreInput {
  address: string;
  deposit: number;
  rent: number;
  maintenanceFee: number;
  premium: number;
  exclusiveArea: number;
  floor: string;
  frontage: number;
  entrancePosition: string;
  signExposure: string;
  parkingAvailable: boolean;
  previousBusiness: string;
  contractPeriod: string;
  businessRestriction: string;
  restorationScope: string;
  specialTerms: string;
}

export interface FacilityCheckInput {
  electricCapacity: string;
  electricExpansionPossible: "가능" | "불확실" | "불가";
  plumbingPossible: "가능" | "불확실" | "불가";
  exhaustPossible: "가능" | "불확실" | "불가";
  ceilingHeight: string;
  restroom: string;
  fireSafetyChecked: boolean;
  pillarLocation: string;
  ovenMovePossible: "가능" | "불확실" | "불가";
  mixerMovePossible: "가능" | "불확실" | "불가";
  prooferPlacementPossible: "가능" | "불확실" | "불가";
  coldStoragePlacementPossible: "가능" | "불확실" | "불가";
  showcasePlacementPossible: "가능" | "불확실" | "불가";
  productionSpaceSecured: "가능" | "불확실" | "불가";
  salesSpaceSecured: "가능" | "불확실" | "불가";
  drawingConfirmed: boolean;
}

export interface BreakEvenInput {
  expectedUnitPrice: number;
  expectedDailyVisitors: number;
  expectedDailySales: number;
  expectedMonthlySales: number;
  materialCostRate: number;
  laborCost: number;
  rent: number;
  maintenanceFee: number;
  cardFeeRate: number;
  deliveryFeeRate: number;
  adCost: number;
  otherFixedCost: number;
  premium: number;
}

export interface BreakEvenResult {
  rentBurdenRate: number;
  totalFixedCost: number;
  variableCostRate: number;
  breakEvenSales: number;
  estimatedMonthlyNetProfit: number;
  premiumRecoveryMonths: number | null;
}

export interface StartupCostInput {
  interiorCost: number;
  productionEquipmentCost: number;
  salesEquipmentCost: number;
  signageCost: number;
  initialSuppliesCost: number;
  licenseRelatedCost: number;
  reserveCost: number;
}

export interface StartupCostResult {
  totalCost: number;
  budgetDifference: number;
  budgetOverRatePercent: number;
  reserveRatePercent: number;
}

export interface BrandMarketingInput {
  brandConcept: string;
  founderStory: string;
  targetCustomer: string;
  signatureMenu: string;
  brandTone: string;
  localKeywords: string;
  naverPlaceStrategy: string;
  blogContentIdeas: string;
  instagramContentIdeas: string;
  reviewEventIdea: string;
}

export interface InteriorSketchInput {
  interiorTone: string;
  operationType: string;
  showcasePosition: string;
  counterPosition: string;
  kitchenPosition: string;
  hallUsage: string;
  customerFlow: string;
  staffFlow: string;
  lowCostIdeas: string;
  checkRequired: string;
}

export interface DiagnosisSections {
  candidateSummary: string;
  keyRisks: string[];
  locationAnalysis: string;
  leaseAnalysis: string;
  facilityRiskAnalysis: string;
  layoutFeasibilityAnalysis: string;
  breakEvenAnalysis: string;
  marketingPotentialAnalysis: string;
  brandStoryDirection: string;
  marketingPotential: string;
  threeMonthMarketingPlan: string;
  localKeywordStrategy: string;
  reviewAndRegularCustomerStrategy: string;
  interiorToneSuggestion: string;
  layoutIdea: string;
  equipmentPlacementIdea: string;
  hallUsageIdea: string;
  customerFlowOpinion: string;
  staffFlowOpinion: string;
  lowCostInteriorIdeas: string;
  interiorCheckRequired: string;
  finalJudgment: string;
  preContractQuestions: string[];
}

export interface ConsultationRecord {
  consultation: ConsultationInput;
  candidateStore: CandidateStoreInput;
  facilityCheck: FacilityCheckInput;
  breakEven: BreakEvenInput;
  startupCost?: StartupCostInput;
  brandMarketing?: BrandMarketingInput;
  interiorSketch?: InteriorSketchInput;
}

export interface DiagnosisResult {
  id: string;
  verdict: Verdict;
  reasons: string[];
  breakEvenResult: BreakEvenResult;
  startupCostResult?: StartupCostResult;
  startupCost?: StartupCostInput;
  startupCostDeposit?: number;
  startupCostPremium?: number;
  startupBudget?: number;
  sections: DiagnosisSections;
  generatedAt: string;
}

```

## next-env.d.ts

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/types/routes.d.ts";

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.

```

## next.config.ts

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

```

## package.json

```json
{
  "name": "bakery-consulting-ai",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  },
  "dependencies": {
    "next": "16.2.10",
    "react": "19.2.4",
    "react-dom": "19.2.4"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.2.10",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}

```

## postcss.config.mjs

```mjs
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;

```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}

```
