"use client";

import { useEffect, useState } from "react";
import { FieldEvidenceMetaControls } from "@/components/field/FieldEvidenceMetaControls";
import {
  FieldSaveStatusBanner,
  type FieldSaveUiStatus,
} from "@/components/field/FieldSaveStatusBanner";
import {
  createDefaultDrainage,
  createDefaultElectrical,
  createDefaultExhaust,
  createDefaultRestroom,
  createDefaultWaterSupply,
  type DrainageFacility,
  type ElectricalFacility,
  type ExhaustFacility,
  type FacilityObservation,
  type FacilityObservations,
  type RestroomFacility,
  type TriStateCheck,
  type WaterSupplyFacility,
} from "@/lib/field/facility";
import {
  createFieldEvidenceMeta,
  type FieldEvidenceMeta,
} from "@/lib/field/field-evidence-meta";
import {
  createEmptyMeasurementSet,
  createKnownMm,
  createUnknownDimension,
  OPTIONAL_MEASUREMENT_KEYS,
  REQUIRED_MEASUREMENT_KEYS,
  type MeasuredDimension,
  type MeasurementSet,
  type MeasurementValueKey,
  type PresenceAnswer,
} from "@/lib/field/measurement";
import { metersInputToMm, mmToMetersInput } from "@/lib/field/measurement-units";
import type { TabletGroupId } from "@/lib/field/stages";
import type { FieldTabletSurveySummary } from "@/lib/field/tablet-view";

const DIMENSION_LABELS: Record<MeasurementValueKey, string> = {
  frontageMm: "매장 전면",
  roomWidthMm: "내부 가로",
  roomDepthMm: "내부 깊이",
  ceilingHeightMm: "천장고",
  entranceWidthMm: "출입구 폭",
  entranceHeightMm: "출입구 높이",
  corridorWidthMm: "복도 폭",
  stairWidthMm: "계단 폭",
  elevatorDoorWidthMm: "엘리베이터 문 폭",
};

type DimensionDraft = {
  mode: "blank" | "known" | "unknown";
  metersText: string;
};

function dimensionToDraft(value: MeasuredDimension | undefined): DimensionDraft {
  if (!value) return { mode: "blank", metersText: "" };
  if (value.status === "UNKNOWN") return { mode: "unknown", metersText: "" };
  return { mode: "known", metersText: mmToMetersInput(value.mm) };
}

function draftToDimension(draft: DimensionDraft): MeasuredDimension | undefined {
  if (draft.mode === "blank") return undefined;
  if (draft.mode === "unknown") return createUnknownDimension();
  const parsed = metersInputToMm(draft.metersText);
  if (!parsed.ok) return undefined;
  return createKnownMm(parsed.mm);
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T | "";
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`min-h-11 min-w-11 rounded-lg border px-3 text-sm font-semibold ${
              selected
                ? "border-[#0B1220] bg-[#0B1220] text-white"
                : "border-slate-300 bg-white text-[#0B1220]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const TRI_OPTIONS: readonly { value: TriStateCheck; label: string }[] = [
  { value: "YES", label: "예" },
  { value: "NO", label: "아니오" },
  { value: "UNKNOWN", label: "모름" },
];

function ObservationBlock<T extends string>({
  title,
  value,
  options,
  onChange,
  disabled,
}: {
  title: string;
  value: FacilityObservation<T>;
  options: readonly { value: T; label: string }[];
  onChange: (next: FacilityObservation<T>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-sm font-bold text-[#0B1220]">{title}</p>
      <div className="mt-2">
        <Segmented
          value={value.value}
          options={options}
          disabled={disabled}
          onChange={(next) => onChange({ ...value, value: next })}
        />
      </div>
      <FieldEvidenceMetaControls
        value={value.evidence}
        disabled={disabled}
        onChange={(evidence) => onChange({ ...value, evidence })}
      />
    </div>
  );
}

export function MeasurementFacilityForm({
  consultationId,
  groupId,
  survey,
  onDirtyChange,
}: {
  consultationId: string;
  groupId: Extract<TabletGroupId, "MEASUREMENT_STRUCTURE" | "FACILITY">;
  survey: FieldTabletSurveySummary;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const surveyId = survey.surveyId;
  const candidateStoreId = survey.candidateStoreId;
  const canEdit = Boolean(surveyId && candidateStoreId && survey.draftVersion !== null);

  const [draftVersion, setDraftVersion] = useState(survey.draftVersion ?? 1);
  const [saveStatus, setSaveStatus] = useState<FieldSaveUiStatus>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const [measurementId, setMeasurementId] = useState(
    survey.measurementSet?.measurementId ?? null,
  );
  const [dimensions, setDimensions] = useState<Record<MeasurementValueKey, DimensionDraft>>(() => {
    const initial = {} as Record<MeasurementValueKey, DimensionDraft>;
    for (const key of [...REQUIRED_MEASUREMENT_KEYS, ...OPTIONAL_MEASUREMENT_KEYS]) {
      initial[key] = dimensionToDraft(survey.measurementSet?.values[key]);
    }
    return initial;
  });
  const [pillarPresence, setPillarPresence] = useState<PresenceAnswer | "">(
    survey.measurementSet?.structure.pillarPresence ?? "",
  );
  const [levelStepPresence, setLevelStepPresence] = useState<PresenceAnswer | "">(
    survey.measurementSet?.structure.levelStepPresence ?? "",
  );
  const [pillarCountText, setPillarCountText] = useState(
    survey.measurementSet?.structure.pillarCount !== undefined
      ? String(survey.measurementSet.structure.pillarCount)
      : "",
  );
  const [structuralNote, setStructuralNote] = useState(
    survey.measurementSet?.structure.structuralNote ?? "",
  );

  const [electrical, setElectrical] = useState<ElectricalFacility>(
    () => survey.facility?.electrical ?? createDefaultElectrical(),
  );
  const [contractPowerText, setContractPowerText] = useState(
    electrical.contractPowerKw.value === null ? "" : String(electrical.contractPowerKw.value),
  );
  const [contractPowerUnknown, setContractPowerUnknown] = useState(
    electrical.contractPowerKw.value === null,
  );
  const [waterSupply, setWaterSupply] = useState<WaterSupplyFacility>(
    () => survey.facility?.waterSupply ?? createDefaultWaterSupply(),
  );
  const [drainage, setDrainage] = useState<DrainageFacility>(
    () => survey.facility?.drainage ?? createDefaultDrainage(),
  );
  const [exhaust, setExhaust] = useState<ExhaustFacility>(
    () => survey.facility?.exhaust ?? createDefaultExhaust(),
  );
  const [restroom, setRestroom] = useState<RestroomFacility>(
    () => survey.facility?.restroom ?? createDefaultRestroom(),
  );
  const [facilitySection, setFacilitySection] = useState<
    "electrical" | "waterSupply" | "drainage" | "exhaust" | "restroom"
  >("electrical");

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function markDirty() {
    setDirty(true);
    onDirtyChange?.(true);
    setSaveStatus("dirty");
    setSaveMessage(null);
  }

  function buildMeasurementSet(): MeasurementSet | null {
    if (!surveyId || !candidateStoreId) return null;
    const base = createEmptyMeasurementSet({
      surveyId,
      candidateStoreId,
      measuredAt: survey.measurementSet?.measuredAt ?? new Date().toISOString(),
      measuredBy: survey.surveyor ?? "field-staff",
      measurementId: measurementId ?? survey.measurementSet?.measurementId,
    });

    const values: MeasurementSet["values"] = {};
    for (const key of [...REQUIRED_MEASUREMENT_KEYS, ...OPTIONAL_MEASUREMENT_KEYS]) {
      const dim = draftToDimension(dimensions[key]);
      if (dim) (values as Record<string, MeasuredDimension>)[key] = dim;
    }

    const pillarCountRaw = pillarCountText.trim();
    let pillarCount: number | undefined;
    if (pillarCountRaw !== "") {
      const n = Number(pillarCountRaw);
      if (!Number.isInteger(n) || n < 0) return null;
      pillarCount = n;
    }

    return {
      ...base,
      values,
      structure: {
        ...(pillarPresence ? { pillarPresence } : {}),
        ...(pillarCount !== undefined ? { pillarCount } : {}),
        ...(levelStepPresence ? { levelStepPresence } : {}),
        ...(structuralNote.trim() ? { structuralNote: structuralNote.trim() } : {}),
      },
    };
  }

  function buildFacility(): FacilityObservations {
    const powerEvidence = electrical.contractPowerKw.evidence;
    let contractPowerKw: FacilityObservation<number | null>;
    if (contractPowerUnknown) {
      contractPowerKw = { value: null, evidence: powerEvidence };
    } else {
      const n = Number(contractPowerText);
      if (!Number.isFinite(n) || n < 0) {
        contractPowerKw = { value: null, evidence: powerEvidence };
      } else {
        contractPowerKw = { value: n, evidence: powerEvidence };
      }
    }
    return {
      electrical: { ...electrical, contractPowerKw },
      waterSupply,
      drainage,
      exhaust,
      restroom,
    };
  }

  async function save(options: { complete: boolean }) {
    if (!canEdit || !surveyId) return;
    if (dirty === false && !options.complete) return;

    const measurementSet = groupId === "MEASUREMENT_STRUCTURE" ? buildMeasurementSet() : undefined;
    if (groupId === "MEASUREMENT_STRUCTURE") {
      if (!measurementSet) {
        setSaveStatus("error");
        setSaveMessage("실측값을 확인해주세요. 음수·잘못된 소수·빈 필수값은 저장할 수 없습니다.");
        return;
      }
      setMeasurementId(measurementSet.measurementId);
    }

    // known mode with invalid text
    if (groupId === "MEASUREMENT_STRUCTURE" && measurementSet) {
      for (const key of REQUIRED_MEASUREMENT_KEYS) {
        const draft = dimensions[key];
        if (draft.mode === "known") {
          const parsed = metersInputToMm(draft.metersText);
          if (!parsed.ok) {
            setSaveStatus("error");
            setSaveMessage(`${DIMENSION_LABELS[key]} 값이 올바르지 않습니다.`);
            return;
          }
        }
      }
    }

    if (groupId === "FACILITY" && !contractPowerUnknown && contractPowerText.trim() !== "") {
      const n = Number(contractPowerText);
      if (!Number.isFinite(n) || n < 0) {
        setSaveStatus("error");
        setSaveMessage("계약전력(kW)은 0 이상의 숫자여야 합니다.");
        return;
      }
    }

    const facility = groupId === "FACILITY" ? buildFacility() : undefined;
    const completeStageIds =
      options.complete && groupId === "MEASUREMENT_STRUCTURE"
        ? (["measurement", "ceilingStructure"] as const)
        : options.complete && groupId === "FACILITY"
          ? (["electrical", "waterSupply", "drainage", "exhaust", "restroom"] as const)
          : undefined;
    const touchStageIds =
      groupId === "MEASUREMENT_STRUCTURE"
        ? (["measurement", "ceilingStructure"] as const)
        : (["electrical", "waterSupply", "drainage", "exhaust", "restroom"] as const);

    setSaveStatus("saving");
    setSaveMessage(null);
    try {
      const response = await fetch(
        `/api/consultations/${consultationId}/field/surveys/${surveyId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expectedDraftVersion: draftVersion,
            ...(measurementSet ? { measurementSet } : {}),
            ...(facility ? { facility } : {}),
            touchStageIds,
            ...(completeStageIds ? { completeStageIds } : {}),
          }),
        },
      );
      const payload = (await response.json()) as {
        message?: string;
        code?: string;
        draftVersion?: number;
        measurementSet?: MeasurementSet | null;
      };
      if (response.status === 409 || payload.code === "VERSION_CONFLICT") {
        setSaveStatus("conflict");
        setSaveMessage(payload.message ?? null);
        return;
      }
      if (!response.ok) {
        setSaveStatus("error");
        setSaveMessage(payload.message ?? "저장에 실패했습니다.");
        return;
      }
      if (typeof payload.draftVersion === "number") setDraftVersion(payload.draftVersion);
      if (payload.measurementSet?.measurementId) {
        setMeasurementId(payload.measurementSet.measurementId);
      }
      setDirty(false);
      onDirtyChange?.(false);
      setSaveStatus("saved");
      setSaveMessage(options.complete ? "저장하고 단계를 완료했습니다." : "저장했습니다.");
      if (options.complete) {
        // 진행률 갱신을 위해 서버 view를 다시 읽는다.
        window.location.reload();
      }
    } catch {
      setSaveStatus("error");
      setSaveMessage("네트워크 오류로 저장하지 못했습니다.");
    }
  }

  if (!canEdit) {
    return (
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        저장된 현장조사 회차가 없어 입력할 수 없습니다. 먼저 조사를 시작해 주세요.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <FieldSaveStatusBanner status={saveStatus} message={saveMessage} />

      {groupId === "MEASUREMENT_STRUCTURE" ? (
        <>
          <section className="space-y-3">
            <h3 className="text-base font-bold text-[#0B1220]">실측 (내부 단위 mm)</h3>
            <p className="text-xs text-slate-600">
              화면에서는 m 단위로 입력합니다. 모름과 0은 구분됩니다. 모르는 값은 0으로 저장하지
              않습니다.
            </p>
            {[...REQUIRED_MEASUREMENT_KEYS, ...OPTIONAL_MEASUREMENT_KEYS].map((key) => {
              const draft = dimensions[key];
              return (
                <div
                  key={key}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-[#0B1220]">{DIMENSION_LABELS[key]}</p>
                    {!REQUIRED_MEASUREMENT_KEYS.includes(key as (typeof REQUIRED_MEASUREMENT_KEYS)[number]) ? (
                      <span className="text-xs text-slate-500">선택</span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="min-h-11 w-28 rounded-lg border border-slate-300 bg-white px-3 text-sm"
                      value={draft.mode === "known" ? draft.metersText : ""}
                      disabled={draft.mode === "unknown"}
                      placeholder="예: 5.8"
                      onChange={(event) => {
                        markDirty();
                        setDimensions((prev) => ({
                          ...prev,
                          [key]: { mode: "known", metersText: event.target.value },
                        }));
                      }}
                    />
                    <span className="text-sm font-semibold text-slate-600">m</span>
                    <button
                      type="button"
                      className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${
                        draft.mode === "unknown"
                          ? "border-[#0B1220] bg-[#0B1220] text-white"
                          : "border-slate-300 bg-white text-[#0B1220]"
                      }`}
                      onClick={() => {
                        markDirty();
                        setDimensions((prev) => ({
                          ...prev,
                          [key]:
                            draft.mode === "unknown"
                              ? { mode: "blank", metersText: "" }
                              : { mode: "unknown", metersText: "" },
                        }));
                      }}
                    >
                      모름
                    </button>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-[#0B1220]">구조 관찰</h3>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-sm font-bold">기둥 유무</p>
              <div className="mt-2">
                <Segmented
                  value={pillarPresence}
                  options={[
                    { value: "YES", label: "있음" },
                    { value: "NO", label: "없음" },
                    { value: "UNKNOWN", label: "모름" },
                  ]}
                  onChange={(next) => {
                    markDirty();
                    setPillarPresence(next);
                  }}
                />
              </div>
              {pillarPresence === "YES" ? (
                <label className="mt-3 block text-xs font-semibold text-slate-600">
                  기둥 개수
                  <input
                    type="text"
                    inputMode="numeric"
                    className="mt-1 min-h-11 w-24 rounded-lg border border-slate-300 px-3 text-sm"
                    value={pillarCountText}
                    onChange={(event) => {
                      markDirty();
                      setPillarCountText(event.target.value);
                    }}
                  />
                </label>
              ) : null}
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-sm font-bold">단차 / 레벨 유무</p>
              <div className="mt-2">
                <Segmented
                  value={levelStepPresence}
                  options={[
                    { value: "YES", label: "있음" },
                    { value: "NO", label: "없음" },
                    { value: "UNKNOWN", label: "모름" },
                  ]}
                  onChange={(next) => {
                    markDirty();
                    setLevelStepPresence(next);
                  }}
                />
              </div>
            </div>
            <label className="block text-xs font-semibold text-slate-600">
              구조 메모
              <input
                type="text"
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                value={structuralNote}
                onChange={(event) => {
                  markDirty();
                  setStructuralNote(event.target.value);
                }}
              />
            </label>
          </section>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["electrical", "전기"],
                ["waterSupply", "급수"],
                ["drainage", "배수"],
                ["exhaust", "배기"],
                ["restroom", "화장실"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${
                  facilitySection === id
                    ? "border-[#0B1220] bg-[#0B1220] text-white"
                    : "border-slate-300 bg-white text-[#0B1220]"
                }`}
                onClick={() => setFacilitySection(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {facilitySection === "electrical" ? (
            <section className="space-y-3">
              <h3 className="text-base font-bold">전기</h3>
              <p className="text-xs text-slate-600">
                전기 충분/증설 가능을 프로그램이 확정하지 않습니다. 관찰과 근거만 기록합니다.
              </p>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-sm font-bold">현재 계약전력 (kW)</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    className="min-h-11 w-28 rounded-lg border border-slate-300 px-3 text-sm"
                    value={contractPowerUnknown ? "" : contractPowerText}
                    disabled={contractPowerUnknown}
                    onChange={(event) => {
                      markDirty();
                      setContractPowerUnknown(false);
                      setContractPowerText(event.target.value);
                    }}
                  />
                  <button
                    type="button"
                    className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${
                      contractPowerUnknown
                        ? "border-[#0B1220] bg-[#0B1220] text-white"
                        : "border-slate-300 bg-white"
                    }`}
                    onClick={() => {
                      markDirty();
                      setContractPowerUnknown(true);
                      setContractPowerText("");
                    }}
                  >
                    모름
                  </button>
                </div>
                <FieldEvidenceMetaControls
                  value={electrical.contractPowerKw.evidence}
                  onChange={(evidence) => {
                    markDirty();
                    setElectrical((prev) => ({
                      ...prev,
                      contractPowerKw: { ...prev.contractPowerKw, evidence },
                    }));
                  }}
                />
              </div>
              <ObservationBlock
                title="전원 유형"
                value={electrical.phaseType}
                options={[
                  { value: "SINGLE_PHASE", label: "단상" },
                  { value: "THREE_PHASE", label: "삼상" },
                  { value: "UNKNOWN", label: "모름" },
                ]}
                onChange={(next) => {
                  markDirty();
                  setElectrical((prev) => ({ ...prev, phaseType: next }));
                }}
              />
              <ObservationBlock
                title="분전반 현장 확인"
                value={electrical.panelFieldChecked}
                options={TRI_OPTIONS}
                onChange={(next) => {
                  markDirty();
                  setElectrical((prev) => ({ ...prev, panelFieldChecked: next }));
                }}
              />
              <ObservationBlock
                title="증설 관련 상태"
                value={electrical.expansionStatus}
                options={[
                  { value: "NOT_CHECKED", label: "미확인" },
                  { value: "DISCUSSED", label: "논의됨" },
                  { value: "EXPERT_REVIEW_REQUIRED", label: "전문가 확인 필요" },
                ]}
                onChange={(next) => {
                  markDirty();
                  setElectrical((prev) => ({ ...prev, expansionStatus: next }));
                }}
              />
            </section>
          ) : null}

          {facilitySection === "waterSupply" ? (
            <section className="space-y-3">
              <h3 className="text-base font-bold">급수</h3>
              <ObservationBlock
                title="급수 위치 확인"
                value={waterSupply.locationChecked}
                options={TRI_OPTIONS}
                onChange={(next) => {
                  markDirty();
                  setWaterSupply((prev) => ({ ...prev, locationChecked: next }));
                }}
              />
              <ObservationBlock
                title="급수점 존재 관찰"
                value={waterSupply.supplyPointObserved}
                options={TRI_OPTIONS}
                onChange={(next) => {
                  markDirty();
                  setWaterSupply((prev) => ({ ...prev, supplyPointObserved: next }));
                }}
              />
              <ObservationBlock
                title="추가 확인 필요"
                value={waterSupply.furtherCheckNeeded}
                options={TRI_OPTIONS}
                onChange={(next) => {
                  markDirty();
                  setWaterSupply((prev) => ({ ...prev, furtherCheckNeeded: next }));
                }}
              />
            </section>
          ) : null}

          {facilitySection === "drainage" ? (
            <section className="space-y-3">
              <h3 className="text-base font-bold">배수</h3>
              <ObservationBlock
                title="배수 위치 확인"
                value={drainage.locationChecked}
                options={TRI_OPTIONS}
                onChange={(next) => {
                  markDirty();
                  setDrainage((prev) => ({ ...prev, locationChecked: next }));
                }}
              />
              <ObservationBlock
                title="바닥배수 관찰"
                value={drainage.floorDrainObserved}
                options={TRI_OPTIONS}
                onChange={(next) => {
                  markDirty();
                  setDrainage((prev) => ({ ...prev, floorDrainObserved: next }));
                }}
              />
              <ObservationBlock
                title="추가 확인 필요"
                value={drainage.furtherCheckNeeded}
                options={TRI_OPTIONS}
                onChange={(next) => {
                  markDirty();
                  setDrainage((prev) => ({ ...prev, furtherCheckNeeded: next }));
                }}
              />
            </section>
          ) : null}

          {facilitySection === "exhaust" ? (
            <section className="space-y-3">
              <h3 className="text-base font-bold">배기</h3>
              <p className="text-xs text-slate-600">
                배기 가능/불가능을 여기서 판정하지 않습니다. 관찰과 확인 필요만 기록합니다.
              </p>
              <ObservationBlock
                title="기존 배기설비 관찰"
                value={exhaust.existingEquipmentObserved}
                options={TRI_OPTIONS}
                onChange={(next) => {
                  markDirty();
                  setExhaust((prev) => ({ ...prev, existingEquipmentObserved: next }));
                }}
              />
              <ObservationBlock
                title="외부 배출 경로 확인"
                value={exhaust.externalPathChecked}
                options={TRI_OPTIONS}
                onChange={(next) => {
                  markDirty();
                  setExhaust((prev) => ({ ...prev, externalPathChecked: next }));
                }}
              />
              <ObservationBlock
                title="임대인 확인"
                value={exhaust.landlordConfirmation}
                options={TRI_OPTIONS}
                onChange={(next) => {
                  markDirty();
                  setExhaust((prev) => ({ ...prev, landlordConfirmation: next }));
                }}
              />
              <ObservationBlock
                title="전문업체 확인 필요"
                value={exhaust.expertReviewNeeded}
                options={TRI_OPTIONS}
                onChange={(next) => {
                  markDirty();
                  const evidence: FieldEvidenceMeta =
                    next.value === "YES"
                      ? createFieldEvidenceMeta({
                          ...next.evidence,
                          confirmationRequirement: "EXPERT_CONFIRMATION_REQUIRED",
                        })
                      : next.evidence;
                  setExhaust((prev) => ({
                    ...prev,
                    expertReviewNeeded: { ...next, evidence },
                  }));
                }}
              />
            </section>
          ) : null}

          {facilitySection === "restroom" ? (
            <section className="space-y-3">
              <h3 className="text-base font-bold">화장실</h3>
              <ObservationBlock
                title="위치"
                value={restroom.location}
                options={[
                  { value: "INTERNAL", label: "내부" },
                  { value: "EXTERNAL", label: "외부" },
                  { value: "UNKNOWN", label: "모름" },
                ]}
                onChange={(next) => {
                  markDirty();
                  setRestroom((prev) => ({ ...prev, location: next }));
                }}
              />
              <ObservationBlock
                title="사용 형태"
                value={restroom.usage}
                options={[
                  { value: "EXCLUSIVE", label: "전용" },
                  { value: "SHARED", label: "공용" },
                  { value: "UNKNOWN", label: "모름" },
                ]}
                onChange={(next) => {
                  markDirty();
                  setRestroom((prev) => ({ ...prev, usage: next }));
                }}
              />
              <ObservationBlock
                title="현장 확인"
                value={restroom.fieldChecked}
                options={TRI_OPTIONS}
                onChange={(next) => {
                  markDirty();
                  setRestroom((prev) => ({ ...prev, fieldChecked: next }));
                }}
              />
            </section>
          ) : null}
        </>
      )}

      <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-slate-200 bg-[#F6F8FB] py-3">
        <button
          type="button"
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-[#0B1220]"
          onClick={() => void save({ complete: false })}
          disabled={saveStatus === "saving"}
        >
          저장
        </button>
        <button
          type="button"
          className="min-h-11 rounded-lg border border-[#0B1220] bg-[#0B1220] px-4 text-sm font-bold text-white"
          onClick={() => void save({ complete: true })}
          disabled={saveStatus === "saving"}
        >
          저장하고 단계 완료
        </button>
        {dirty ? (
          <p className="self-center text-xs font-semibold text-amber-800">저장 전 변경 있음</p>
        ) : null}
      </div>
    </div>
  );
}
