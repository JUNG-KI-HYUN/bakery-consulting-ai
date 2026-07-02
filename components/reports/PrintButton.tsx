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
