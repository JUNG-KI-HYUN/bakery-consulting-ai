"use client";

export type FieldSaveUiStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "conflict"
  | "error";

const LABELS: Record<FieldSaveUiStatus, string> = {
  idle: "저장됨",
  dirty: "저장 전 변경 있음",
  saving: "저장 중",
  saved: "저장 완료",
  conflict: "저장 충돌",
  error: "저장 실패",
};

export function FieldSaveStatusBanner({
  status,
  message,
}: {
  status: FieldSaveUiStatus;
  message?: string | null;
}) {
  if (status === "idle") return null;
  const tone =
    status === "conflict" || status === "error"
      ? "border-amber-300 bg-amber-50 text-amber-950"
      : status === "saved"
        ? "border-emerald-300 bg-emerald-50 text-emerald-950"
        : "border-slate-300 bg-white text-slate-800";
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${tone}`} role="status">
      <p className="font-bold">{LABELS[status]}</p>
      {message ? <p className="mt-1 text-xs">{message}</p> : null}
      {status === "conflict" ? (
        <p className="mt-1 text-xs">
          다른 저장내용이 먼저 반영되었습니다. 페이지를 다시 불러와 최신 내용을 확인해 주세요.
        </p>
      ) : null}
    </div>
  );
}
