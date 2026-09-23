"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * FIELD → SPACE FIT 진입.
 * 기존 Layout이 있으면 열고, 없으면 명시적 POST로 생성 후 redirect.
 * GET만으로 Layout을 만들지 않는다.
 */
export function SpaceFitEntryButton({
  consultationId,
  surveyId,
  hasKnownRoomDimensions,
}: {
  consultationId: string;
  surveyId: string | null;
  hasKnownRoomDimensions: boolean;
}) {
  const router = useRouter();
  const [existingLayoutId, setExistingLayoutId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!surveyId) return;
    let cancelled = false;
    void (async () => {
      const response = await fetch(
        `/api/consultations/${consultationId}/field/surveys/${surveyId}/space-fit`,
      );
      if (!response.ok || cancelled) return;
      const body = (await response.json()) as { layoutId?: string | null };
      if (!cancelled) setExistingLayoutId(body.layoutId ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [consultationId, surveyId]);

  if (!surveyId) {
    return (
      <p className="mt-3 text-sm text-slate-600">
        SPACE FIT을 열려면 저장된 현장조사가 필요합니다.
      </p>
    );
  }

  async function startOrOpen() {
    if (!surveyId) return;
    const activeSurveyId = surveyId;
    setBusy(true);
    setMessage(null);
    try {
      if (existingLayoutId) {
        router.push(`/space-fit/${existingLayoutId}`);
        return;
      }
      if (!hasKnownRoomDimensions) {
        setMessage(
          "공간 실측정보가 필요합니다. FIELD 실측·구조에서 내부 가로와 깊이를 먼저 확인해 주세요.",
        );
        return;
      }
      const response = await fetch(
        `/api/consultations/${consultationId}/field/surveys/${activeSurveyId}/space-fit/start`,
        { method: "POST" },
      );
      const body = (await response.json()) as {
        layoutId?: string;
        message?: string;
      };
      if (!response.ok || !body.layoutId) {
        setMessage(
          body.message ??
            "공간 실측정보가 필요합니다. FIELD 실측·구조에서 내부 가로와 깊이를 먼저 확인해 주세요.",
        );
        return;
      }
      router.push(`/space-fit/${body.layoutId}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-3">
      <p className="text-sm font-bold text-[#0B1220]">SPACE FIT</p>
      <p className="mt-1 text-xs text-slate-600">
        실측값 기반 평면 초안. 장비 배치·자동추천·Risk 판정은 포함하지 않습니다.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void startOrOpen()}
        className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-[#0B1220] bg-[#0B1220] px-4 text-sm font-semibold text-white"
      >
        {busy ? "처리 중…" : existingLayoutId ? "SPACE FIT 열기" : "SPACE FIT 시작"}
      </button>
      {message ? <p className="mt-2 text-sm text-amber-900">{message}</p> : null}
    </div>
  );
}
