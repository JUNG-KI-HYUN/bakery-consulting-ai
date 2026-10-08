"use client";

import Link from "next/link";
import { useState } from "react";
import type { CandidateCustomerReportStatus } from "@/lib/reports/candidate-customer-report";

type SnapshotSummary = {
  reportSnapshotId: string;
  issuedAt: string;
  verdictLabel: string;
};

function dateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function CandidateCustomerReportIssuePanel({
  caseId,
  candidateId,
  reportStatus,
  initialLatestSnapshot,
  initialSnapshotCount,
}: {
  caseId: string;
  candidateId: string;
  reportStatus: CandidateCustomerReportStatus;
  initialLatestSnapshot: SnapshotSummary | null;
  initialSnapshotCount: number;
}) {
  const [latestSnapshot, setLatestSnapshot] = useState(initialLatestSnapshot);
  const [snapshotCount, setSnapshotCount] = useState(initialSnapshotCount);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const snapshotHref = latestSnapshot
    ? `/cases/${encodeURIComponent(caseId)}/candidates/${encodeURIComponent(candidateId)}/report/${encodeURIComponent(latestSnapshot.reportSnapshotId)}`
    : null;

  async function issueReport() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/candidates/${encodeURIComponent(candidateId)}/report-snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId }),
      });
      const result = await response.json() as {
        message?: string;
        reportSnapshotId?: string;
        issuedAt?: string;
        materializedReport?: { decision?: { verdictLabel?: string } };
      };
      if (!response.ok || !result.reportSnapshotId || !result.issuedAt) {
        throw new Error(result.message ?? "고객용 리포트를 확정하지 못했습니다.");
      }
      setLatestSnapshot({
        reportSnapshotId: result.reportSnapshotId,
        issuedAt: result.issuedAt,
        verdictLabel: result.materializedReport?.decision?.verdictLabel ?? "확인 필요",
      });
      setSnapshotCount((value) => value + 1);
      setMessage("고객용 리포트가 확정되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "고객용 리포트를 확정하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const ready = reportStatus === "REPORT_READY";
  return (
    <section className="report-interactive no-print mx-auto mb-5 max-w-[1080px] rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-stone-950">고객용 리포트 확정</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            현재 Preview를 서버에서 다시 검증하고, 발행 시점의 고객용 리포트를 변경 불가능한 확정본으로 보관합니다.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!ready || saving}
          onClick={issueReport}
        >
          {saving ? "확정 중..." : "고객용 리포트 확정"}
        </button>
      </div>

      {!ready ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          현재 자료 변경 또는 미확인 항목으로 고객용 리포트를 확정할 수 없습니다. 최종 판단을 먼저 재검토하세요.
        </p>
      ) : null}
      {message ? <p className="mt-4 text-sm font-semibold text-stone-800">{message}</p> : null}

      <div className="mt-4 grid gap-2 rounded-lg bg-stone-50 p-4 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="font-bold text-stone-900">확정본 {snapshotCount}건</p>
          {latestSnapshot ? (
            <p className="mt-1 text-stone-600">
              최근 확정본 · {dateTime(latestSnapshot.issuedAt)} · {latestSnapshot.verdictLabel}
            </p>
          ) : <p className="mt-1 text-stone-500">아직 확정된 고객 리포트가 없습니다.</p>}
        </div>
        {snapshotHref ? <Link href={snapshotHref} className="btn-outline">최근 확정본 보기</Link> : null}
      </div>
    </section>
  );
}
