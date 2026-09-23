"use client";

import { useEffect, useState } from "react";
import { FieldEvidenceMetaControls } from "@/components/field/FieldEvidenceMetaControls";
import {
  FieldSaveStatusBanner,
  type FieldSaveUiStatus,
} from "@/components/field/FieldSaveStatusBanner";
import {
  createDefaultDeliveryPath,
  createDefaultProductionSalesSpace,
  formatMeasurementMmDisplay,
  type DeliveryPathObservation,
  type DeliveryPrimaryMethod,
  type ElevatorAccessStatus,
  type LoadingAccessStatus,
  type PathConstraintObservation,
  type ProductionSalesSpaceObservation,
  type SpaceAssessStatus,
  type SpaceObservationField,
} from "@/lib/field/space-equipment";
import type { FieldTabletSurveySummary } from "@/lib/field/tablet-view";

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
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

function ObservationBlock<T extends string>({
  title,
  hint,
  value,
  options,
  onChange,
  limitedNote,
  onLimitedNoteChange,
}: {
  title: string;
  hint?: string;
  value: SpaceObservationField<T>;
  options: readonly { value: T; label: string }[];
  onChange: (next: SpaceObservationField<T>) => void;
  limitedNote?: string;
  onLimitedNoteChange?: (note: string) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-sm font-bold text-[#0B1220]">{title}</p>
      {hint ? <p className="mt-1 text-xs text-slate-600">{hint}</p> : null}
      <div className="mt-2">
        <Segmented
          value={value.value}
          options={options}
          onChange={(next) => onChange({ ...value, value: next })}
        />
      </div>
      {value.value === "LIMITED" && onLimitedNoteChange ? (
        <label className="mt-2 block text-xs font-semibold text-slate-600">
          공간 제약 메모
          <input
            type="text"
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            value={limitedNote ?? ""}
            onChange={(event) => onLimitedNoteChange(event.target.value)}
          />
        </label>
      ) : null}
      <FieldEvidenceMetaControls
        value={value.evidence}
        onChange={(evidence) => onChange({ ...value, evidence })}
      />
    </div>
  );
}

function MeasurementRefRow({
  label,
  dimension,
}: {
  label: string;
  dimension: { status: "KNOWN"; mm: number } | { status: "UNKNOWN" } | undefined;
}) {
  const display = formatMeasurementMmDisplay(dimension);
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-sm font-semibold text-[#0B1220]">{label}</span>
      <span className="text-xs font-semibold text-slate-600">
        {display.kind === "known"
          ? `${display.label} · 실측자료에서 가져옴`
          : display.kind === "unknown"
            ? "실측: 모름"
            : "실측자료 없음"}
      </span>
    </div>
  );
}

const SPACE_OPTIONS: readonly { value: SpaceAssessStatus; label: string }[] = [
  { value: "PLANNABLE", label: "배치 검토 가능" },
  { value: "LIMITED", label: "공간 제약 있음" },
  { value: "NOT_ASSESSED", label: "미검토" },
];

export function SpaceEquipmentForm({
  consultationId,
  survey,
  onDirtyChange,
}: {
  consultationId: string;
  survey: FieldTabletSurveySummary;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const surveyId = survey.surveyId;
  const canEdit = Boolean(surveyId && survey.draftVersion !== null);

  const [section, setSection] = useState<"productionSalesSpace" | "deliveryPath">(
    "productionSalesSpace",
  );
  const [draftVersion, setDraftVersion] = useState(survey.draftVersion ?? 1);
  const [saveStatus, setSaveStatus] = useState<FieldSaveUiStatus>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const [productionSalesSpace, setProductionSalesSpace] = useState<ProductionSalesSpaceObservation>(
    () => survey.productionSalesSpace ?? createDefaultProductionSalesSpace(),
  );
  const [manufacturingLimitedNote, setManufacturingLimitedNote] = useState("");
  const [constraintNote, setConstraintNote] = useState(
    survey.productionSalesSpace?.structuralConstraintNote ?? "",
  );
  const [spaceNote, setSpaceNote] = useState(survey.productionSalesSpace?.note ?? "");
  const [deliveryPath, setDeliveryPath] = useState<DeliveryPathObservation>(
    () => survey.deliveryPath ?? createDefaultDeliveryPath(),
  );
  const [deliveryNote, setDeliveryNote] = useState(survey.deliveryPath?.note ?? "");

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

  function buildProduction(): ProductionSalesSpaceObservation {
    const manufacturingEvidence = productionSalesSpace.manufacturingSpace.evidence;
    const manufacturingNote =
      productionSalesSpace.manufacturingSpace.value === "LIMITED" &&
      manufacturingLimitedNote.trim()
        ? {
            ...manufacturingEvidence,
            note: manufacturingLimitedNote.trim(),
          }
        : manufacturingEvidence;
    return {
      manufacturingSpace: {
        value: productionSalesSpace.manufacturingSpace.value,
        evidence: manufacturingNote,
      },
      salesSpace: productionSalesSpace.salesSpace,
      staffFlow: productionSalesSpace.staffFlow,
      customerFlow: productionSalesSpace.customerFlow,
      packingPickupSpace: productionSalesSpace.packingPickupSpace,
      storageSpace: productionSalesSpace.storageSpace,
      ...(constraintNote.trim() ? { structuralConstraintNote: constraintNote.trim() } : {}),
      ...(spaceNote.trim() ? { note: spaceNote.trim() } : {}),
    };
  }

  function buildDelivery(): DeliveryPathObservation {
    return {
      primaryDeliveryMethod: deliveryPath.primaryDeliveryMethod,
      elevatorAccess: deliveryPath.elevatorAccess,
      stairTurning: deliveryPath.stairTurning,
      intermediateDoorCorridor: deliveryPath.intermediateDoorCorridor,
      loadingAccess: deliveryPath.loadingAccess,
      ...(deliveryNote.trim() ? { note: deliveryNote.trim() } : {}),
    };
  }

  async function save(options: { complete: boolean }) {
    if (!canEdit || !surveyId) return;

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
            productionSalesSpace: buildProduction(),
            deliveryPath: buildDelivery(),
            touchStageIds: ["productionSalesSpace", "deliveryPath"],
            ...(options.complete
              ? { completeStageIds: ["productionSalesSpace", "deliveryPath"] }
              : {}),
          }),
        },
      );
      const payload = (await response.json()) as {
        message?: string;
        code?: string;
        draftVersion?: number;
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
      setDirty(false);
      onDirtyChange?.(false);
      setSaveStatus("saved");
      setSaveMessage(options.complete ? "저장하고 단계를 완료했습니다." : "저장했습니다.");
      if (options.complete) window.location.reload();
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

  const measurement = survey.measurementSet;

  return (
    <div className="mt-4 space-y-4">
      <FieldSaveStatusBanner status={saveStatus} message={saveMessage} />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${
            section === "productionSalesSpace"
              ? "border-[#0B1220] bg-[#0B1220] text-white"
              : "border-slate-300 bg-white text-[#0B1220]"
          }`}
          onClick={() => setSection("productionSalesSpace")}
        >
          제조·판매 공간
        </button>
        <button
          type="button"
          className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${
            section === "deliveryPath"
              ? "border-[#0B1220] bg-[#0B1220] text-white"
              : "border-slate-300 bg-white text-[#0B1220]"
          }`}
          onClick={() => setSection("deliveryPath")}
        >
          장비 반입경로
        </button>
      </div>

      {section === "productionSalesSpace" ? (
        <section className="space-y-3">
          <h3 className="text-base font-bold text-[#0B1220]">제조·판매 공간</h3>
          <p className="text-xs text-slate-600">
            배치 검토 가능은 법적·인허가·영업 가능이 아닙니다. 현장 1차 관찰만 기록합니다.
          </p>
          <ObservationBlock
            title="제조공간"
            value={productionSalesSpace.manufacturingSpace}
            options={SPACE_OPTIONS}
            limitedNote={manufacturingLimitedNote}
            onLimitedNoteChange={(note) => {
              markDirty();
              setManufacturingLimitedNote(note);
            }}
            onChange={(next) => {
              markDirty();
              setProductionSalesSpace((prev) => ({ ...prev, manufacturingSpace: next }));
            }}
          />
          <ObservationBlock
            title="판매공간"
            value={productionSalesSpace.salesSpace}
            options={SPACE_OPTIONS}
            onChange={(next) => {
              markDirty();
              setProductionSalesSpace((prev) => ({ ...prev, salesSpace: next }));
            }}
          />
          <ObservationBlock
            title="직원 동선"
            value={productionSalesSpace.staffFlow}
            options={SPACE_OPTIONS}
            onChange={(next) => {
              markDirty();
              setProductionSalesSpace((prev) => ({ ...prev, staffFlow: next }));
            }}
          />
          <ObservationBlock
            title="고객 동선"
            value={productionSalesSpace.customerFlow}
            options={SPACE_OPTIONS}
            onChange={(next) => {
              markDirty();
              setProductionSalesSpace((prev) => ({ ...prev, customerFlow: next }));
            }}
          />
          <ObservationBlock
            title="포장·픽업 공간"
            value={productionSalesSpace.packingPickupSpace}
            options={SPACE_OPTIONS}
            onChange={(next) => {
              markDirty();
              setProductionSalesSpace((prev) => ({ ...prev, packingPickupSpace: next }));
            }}
          />
          <ObservationBlock
            title="창고·재고 공간"
            value={productionSalesSpace.storageSpace}
            options={SPACE_OPTIONS}
            onChange={(next) => {
              markDirty();
              setProductionSalesSpace((prev) => ({ ...prev, storageSpace: next }));
            }}
          />
          <label className="block text-xs font-semibold text-slate-600">
            공간구성에 영향을 줄 현장 제약 (실측값 재입력 금지)
            <input
              type="text"
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              value={constraintNote}
              onChange={(event) => {
                markDirty();
                setConstraintNote(event.target.value);
              }}
            />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            메모
            <input
              type="text"
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              value={spaceNote}
              onChange={(event) => {
                markDirty();
                setSpaceNote(event.target.value);
              }}
            />
          </label>
        </section>
      ) : (
        <section className="space-y-3">
          <h3 className="text-base font-bold text-[#0B1220]">장비 반입경로</h3>
          <p className="text-xs text-slate-600">
            장비 반입 가능/불가능을 여기서 확정하지 않습니다. 실측값은 실측·구조 화면에서만
            수정합니다.
          </p>
          <div className="space-y-2">
            <p className="text-sm font-bold text-[#0B1220]">실측자료 참조</p>
            <MeasurementRefRow
              label="출입구 폭"
              dimension={measurement?.values.entranceWidthMm}
            />
            <MeasurementRefRow
              label="출입구 높이"
              dimension={measurement?.values.entranceHeightMm}
            />
            <MeasurementRefRow label="복도 폭" dimension={measurement?.values.corridorWidthMm} />
            <MeasurementRefRow label="계단 폭" dimension={measurement?.values.stairWidthMm} />
            <MeasurementRefRow
              label="엘리베이터 문 폭"
              dimension={measurement?.values.elevatorDoorWidthMm}
            />
            <p className="text-xs text-slate-500">
              치수 수정이 필요하면 실측·구조(그룹 C)로 이동하세요. 여기서는 값을 다시 입력하지
              않습니다.
            </p>
          </div>
          <ObservationBlock
            title="주요 반입방식"
            value={deliveryPath.primaryDeliveryMethod}
            options={
              [
                { value: "GROUND_DIRECT", label: "지상 직반입" },
                { value: "STAIRS", label: "계단" },
                { value: "ELEVATOR", label: "엘리베이터" },
                { value: "OTHER", label: "기타" },
                { value: "UNKNOWN", label: "모름" },
              ] as const satisfies readonly { value: DeliveryPrimaryMethod; label: string }[]
            }
            onChange={(next) => {
              markDirty();
              setDeliveryPath((prev) => ({ ...prev, primaryDeliveryMethod: next }));
            }}
          />
          <ObservationBlock
            title="엘리베이터 접근"
            value={deliveryPath.elevatorAccess}
            options={
              [
                { value: "AVAILABLE", label: "접근 검토 가능" },
                { value: "CONSTRAINED", label: "제약 관찰" },
                { value: "UNKNOWN", label: "모름" },
              ] as const satisfies readonly { value: ElevatorAccessStatus; label: string }[]
            }
            onChange={(next) => {
              markDirty();
              setDeliveryPath((prev) => ({ ...prev, elevatorAccess: next }));
            }}
          />
          <ObservationBlock
            title="계단 회전구간"
            value={deliveryPath.stairTurning}
            options={
              [
                { value: "NO_CONSTRAINT_OBSERVED", label: "제약 미관찰" },
                { value: "CONSTRAINT_OBSERVED", label: "제약 관찰" },
                { value: "UNKNOWN", label: "모름" },
              ] as const satisfies readonly { value: PathConstraintObservation; label: string }[]
            }
            onChange={(next) => {
              markDirty();
              setDeliveryPath((prev) => ({ ...prev, stairTurning: next }));
            }}
          />
          <ObservationBlock
            title="중간 문·복도"
            value={deliveryPath.intermediateDoorCorridor}
            options={
              [
                { value: "NO_CONSTRAINT_OBSERVED", label: "제약 미관찰" },
                { value: "CONSTRAINT_OBSERVED", label: "제약 관찰" },
                { value: "UNKNOWN", label: "모름" },
              ] as const satisfies readonly { value: PathConstraintObservation; label: string }[]
            }
            onChange={(next) => {
              markDirty();
              setDeliveryPath((prev) => ({ ...prev, intermediateDoorCorridor: next }));
            }}
          />
          <ObservationBlock
            title="하역 접근"
            value={deliveryPath.loadingAccess}
            options={
              [
                { value: "AVAILABLE", label: "접근 검토 가능" },
                { value: "LIMITED", label: "접근 제약 있음" },
                { value: "UNKNOWN", label: "모름" },
              ] as const satisfies readonly { value: LoadingAccessStatus; label: string }[]
            }
            onChange={(next) => {
              markDirty();
              setDeliveryPath((prev) => ({ ...prev, loadingAccess: next }));
            }}
          />
          <label className="block text-xs font-semibold text-slate-600">
            메모
            <input
              type="text"
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              value={deliveryNote}
              onChange={(event) => {
                markDirty();
                setDeliveryNote(event.target.value);
              }}
            />
          </label>
        </section>
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
