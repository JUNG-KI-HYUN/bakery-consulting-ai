"use client";

import { useState } from "react";
import Link from "next/link";
import type { FieldTabletView } from "@/lib/field/tablet-view";
import type { TabletGroupId } from "@/lib/field/stages";

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-[#0B1220]">{value}</dd>
    </div>
  );
}

function GroupButton({
  group,
  selected,
  onSelect,
}: {
  group: FieldTabletView["groups"][number];
  selected: boolean;
  onSelect: (groupId: TabletGroupId) => void;
}) {
  const stateLabel = group.inputImplemented ? "입력 가능" : "입력 미구현";
  return (
    <button
      type="button"
      onClick={() => onSelect(group.groupId)}
      aria-current={selected ? "true" : undefined}
      aria-label={`${group.specGroup}. ${group.label}, ${stateLabel}, 진행 ${group.completionPercent}%`}
      className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left ${
        selected
          ? "border-[#0B1220] bg-[#0B1220] text-white"
          : "border-slate-300 bg-white text-[#0B1220]"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-xs font-semibold tracking-wide opacity-80">
          {group.specGroup}
        </span>
        <span className="block text-sm font-bold">{group.label}</span>
      </span>
      <span className="shrink-0 text-xs font-semibold">
        {stateLabel} · {group.completedStageCount}/{group.stageCount}
      </span>
    </button>
  );
}

/**
 * FIELD 태블릿 Shell. 조사 입력 form은 포함하지 않는다.
 * 그룹 선택은 현재 그룹을 보는 동작이며, 미구현 입력을 시작하는 버튼이 아니다.
 */
export function FieldTabletShell({ view }: { view: FieldTabletView }) {
  const [currentGroupId, setCurrentGroupId] = useState<TabletGroupId>(view.defaultGroupId);
  const currentGroup =
    view.groups.find((group) => group.groupId === currentGroupId) ?? view.groups[0];
  if (!currentGroup) return null;
  const storeIdLabel =
    view.candidateStore.resolution === "explicit" ? "연결됨" : "미연결";
  const surveyRoundLabel =
    view.survey.surveySequence === null
      ? "저장된 회차 없음"
      : `현장조사 #${view.survey.surveySequence}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F6F8FB] text-[#0B1220]">
      <header className="border-b border-slate-800 bg-[#0B1220] text-white">
        <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-slate-300">FRAMEONE FIELD</p>
            <h1 className="truncate text-base font-bold">{view.consultationTitle}</h1>
          </div>
          <Link
            href={`/consultations/${view.consultationId}`}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-500 bg-slate-800 px-3 text-sm font-semibold text-white"
          >
            상담으로
          </Link>
        </div>
      </header>

      <section className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {view.sampleData && <span className="badge-sample">SAMPLE</span>}
          <p className="text-sm font-bold text-[#0B1220]">조사 수행 진행률 {view.progress.completionPercent}%</p>
          <p className="text-xs text-slate-600">
            {view.progress.completedStageCount}/{view.progress.stageCount}단계 완료
          </p>
        </div>
        <div
          role="progressbar"
          aria-label="조사 수행 진행률"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={view.progress.completionPercent}
          className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
        >
          <div
            className="h-full bg-[#0B1220]"
            style={{ width: `${view.progress.completionPercent}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          이 수치는 직원이 조사 단계를 얼마나 수행했는지만 나타냅니다. 자료 확인도, 위험, 추천/계약 가능 여부가 아닙니다.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
          <MetaItem label="상담" value={view.consultationId} />
          <MetaItem label="후보점포 ID" value={storeIdLabel} />
          <MetaItem label="후보점포" value={`${view.store.floor} · ${view.store.address}`} />
          <MetaItem label="현장조사 회차" value={surveyRoundLabel} />
          <MetaItem label="조사상태" value={view.survey.persisted ? view.survey.statusLabel : `${view.survey.statusLabel} (저장 없음)`} />
        </dl>
      </section>

      {view.candidateStoreBlockedReasonLabel && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-bold">FIELD 데이터 연결 불가</p>
          <p className="mt-1">{view.candidateStoreBlockedReasonLabel}</p>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <nav
          aria-label="조사 그룹"
          className="shrink-0 border-b border-slate-200 bg-[#F1F5F9] p-3 lg:w-80 lg:border-r lg:border-b-0"
        >
          <p className="mb-2 text-xs font-bold tracking-wide text-slate-500">조사 그룹</p>
          <div className="grid grid-cols-1 gap-2">
            {view.groups.map((group) => (
              <GroupButton
                key={group.groupId}
                group={group}
                selected={group.groupId === currentGroup.groupId}
                onSelect={setCurrentGroupId}
              />
            ))}
          </div>
        </nav>

        <section className="min-h-0 flex-1 overflow-auto p-4">
          <p className="text-xs font-semibold text-slate-500">현재 그룹</p>
          <h2 className="mt-1 text-xl font-bold text-[#0B1220]">
            {currentGroup.specGroup}. {currentGroup.label}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            진행 {currentGroup.completedStageCount}/{currentGroup.stageCount} · {currentGroup.inputImplemented ? "입력 가능" : "입력 미구현"}
          </p>
          <ul className="mt-4 space-y-2">
            {currentGroup.stageLabels.map((label, index) => (
              <li
                key={currentGroup.stageIds[index]}
                className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
              >
                <span className="text-sm font-semibold text-[#0B1220]">{label}</span>
                <span className="text-xs font-semibold text-slate-600">
                  {currentGroup.stageStateLabels[index]}
                </span>
              </li>
            ))}
          </ul>
          {!currentGroup.inputImplemented && (
            <div className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">
              <p className="font-bold text-[#0B1220]">Phase 4에서 입력기능 제공</p>
              <p className="mt-1">
                이 그룹의 실제 현장 입력은 아직 제공하지 않습니다. 지금은 조사 단계 구성과 진행 상태만 확인할 수 있습니다.
              </p>
            </div>
          )}
          <ul className="mt-4 space-y-2 text-xs text-slate-600">
            {view.notices.map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
