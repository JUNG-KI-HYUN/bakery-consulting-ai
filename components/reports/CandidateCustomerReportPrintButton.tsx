"use client";

export function CandidateCustomerReportPrintButton() {
  return (
    <button type="button" className="btn-primary" onClick={() => window.print()}>
      인쇄 / PDF 저장
    </button>
  );
}
