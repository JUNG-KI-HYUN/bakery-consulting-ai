"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function FieldSurveyGate({
  consultationId,
  mode,
  surveyId,
  surveySequence,
}: {
  consultationId: string;
  mode: "start" | "continue";
  surveyId?: string;
  surveySequence?: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startSurvey() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/consultations/${consultationId}/field/start`, {
        method: "POST",
      });
      const body = (await response.json()) as { surveyId?: string; message?: string };
      if (!response.ok || typeof body.surveyId !== "string") {
        setError("현장조사를 시작하지 못했습니다. 다시 시도해 주세요.");
        return;
      }
      router.push(`/consultations/${consultationId}/field?surveyId=${encodeURIComponent(body.surveyId)}`);
      router.refresh();
    } catch {
      setError("현장조사를 시작하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }

  function continueSurvey() {
    if (!surveyId) return;
    router.push(`/consultations/${consultationId}/field?surveyId=${encodeURIComponent(surveyId)}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F6F8FB] text-[#0B1220]">
      <header className="border-b border-slate-800 bg-[#0B1220] text-white">
        <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
          <p className="text-xs font-semibold tracking-wide text-slate-300">FRAMEONE FIELD</p>
          <a
            href={`/consultations/${consultationId}`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-500 bg-slate-800 px-3 text-sm font-semibold text-white"
          >
            상담으로
          </a>
        </div>
      </header>
      <section className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-8">
        {mode === "start" ? (
          <>
            <h1 className="text-xl font-bold">현장조사가 아직 시작되지 않았습니다.</h1>
            <p className="mt-2 text-sm text-slate-600">
              시작하면 이 상담의 후보점포에 현장조사 회차가 만들어집니다. 기존 상담 기록은 바꾸지 않습니다.
            </p>
            <button
              type="button"
              onClick={() => void startSurvey()}
              disabled={pending}
              className="btn-primary mt-6 min-h-11"
            >
              {pending ? "시작하는 중" : "현장조사 시작"}
            </button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold">진행 중인 현장조사가 있습니다.</h1>
            <p className="mt-2 text-sm text-slate-600">
              {typeof surveySequence === "number"
                ? `현장조사 #${surveySequence}를 이어서 확인할 수 있습니다.`
                : "기존 조사를 이어서 확인할 수 있습니다."}
            </p>
            <button
              type="button"
              onClick={continueSurvey}
              className="btn-primary mt-6 min-h-11"
            >
              조사 계속하기
            </button>
          </>
        )}
        {error && <p className="mt-4 text-sm text-amber-800">{error}</p>}
        <p className="mt-6 text-xs text-slate-500">
          실측·시설 입력을 사용할 수 있습니다. 사진·인터뷰·SPACE FIT은 이후 단계에서 제공합니다.
        </p>
      </section>
    </div>
  );
}
