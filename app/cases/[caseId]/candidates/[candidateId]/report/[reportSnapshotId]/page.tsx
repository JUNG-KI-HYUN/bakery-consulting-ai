import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CandidateCustomerReportDocument } from "@/components/reports/CandidateCustomerReportDocument";
import { CandidateCustomerReportPrintButton } from "@/components/reports/CandidateCustomerReportPrintButton";
import {
  CustomerReportSnapshotReferenceError,
  getCandidateCustomerReportSnapshot,
} from "@/lib/reports/candidate-customer-report-snapshot-repository";

export const dynamic = "force-dynamic";

type SnapshotPageParams = Promise<{ caseId: string; candidateId: string; reportSnapshotId: string }>;

function dateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function loadSnapshot(params: SnapshotPageParams) {
  const { caseId, candidateId, reportSnapshotId } = await params;
  try {
    const snapshot = await getCandidateCustomerReportSnapshot(candidateId, caseId, reportSnapshotId);
    if (!snapshot) notFound();
    return snapshot;
  } catch (error) {
    if (error instanceof CustomerReportSnapshotReferenceError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: SnapshotPageParams }): Promise<Metadata> {
  const snapshot = await loadSnapshot(params);
  const candidate = snapshot.materializedReport.candidateSummary.label.replace(/[\\/:*?"<>|]/g, "-");
  return { title: `FRAMEONE_후보점포진단_${candidate}_${snapshot.issuedAt.slice(0, 10)}` };
}

export default async function CandidateCustomerReportSnapshotPage({ params }: { params: SnapshotPageParams }) {
  const snapshot = await loadSnapshot(params);
  const report = snapshot.materializedReport;
  return (
    <>
      <section className="report-snapshot-header mx-auto mb-5 max-w-[1080px] rounded-xl border border-[#d8c59b] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-[#8b6f38]">FRAMEONE</p>
            <h1 className="mt-2 text-2xl font-bold text-stone-950">베이커리 후보점포 진단 리포트</h1>
            <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <div><dt className="text-stone-500">발행일</dt><dd className="font-bold">{dateTime(snapshot.issuedAt)}</dd></div>
              <div><dt className="text-stone-500">후보점포</dt><dd className="font-bold">{report.candidateSummary.label}</dd></div>
              <div><dt className="text-stone-500">최종 판단</dt><dd className="font-bold">{report.decision.verdictLabel}</dd></div>
            </dl>
          </div>
          <div className="report-interactive no-print">
            <CandidateCustomerReportPrintButton />
          </div>
        </div>
        <p className="mt-4 rounded-lg bg-stone-100 px-3 py-2 text-sm leading-6 text-stone-700">
          본 화면은 {dateTime(snapshot.issuedAt)} 기준으로 확정·보관된 고객용 리포트입니다.
        </p>
      </section>
      <CandidateCustomerReportDocument report={report} />
    </>
  );
}
