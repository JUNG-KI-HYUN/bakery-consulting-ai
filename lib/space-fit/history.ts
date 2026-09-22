/**
 * Layout Domain history — elements + equipmentInstances snapshot.
 * Zoom/pan/selection/Definition 조회는 history에 넣지 않는다.
 */

import type { EquipmentInstance } from "../equipment/types";
import type { RoomElement, SpaceFitLayout } from "./types";

export const SPACE_FIT_HISTORY_LIMIT = 50;

export interface SpaceFitDomainSnapshot {
  readonly elements: readonly RoomElement[];
  readonly equipmentInstances: readonly EquipmentInstance[];
}

export interface SpaceFitHistoryState {
  readonly past: readonly SpaceFitDomainSnapshot[];
  readonly present: SpaceFitDomainSnapshot;
  readonly future: readonly SpaceFitDomainSnapshot[];
}

function freezeSnapshot(snapshot: SpaceFitDomainSnapshot): SpaceFitDomainSnapshot {
  return Object.freeze({
    elements: Object.freeze([...snapshot.elements]),
    equipmentInstances: Object.freeze([...snapshot.equipmentInstances]),
  });
}

export function createHistory(
  elements: readonly RoomElement[],
  equipmentInstances: readonly EquipmentInstance[] = [],
): SpaceFitHistoryState {
  return Object.freeze({
    past: Object.freeze([]),
    present: freezeSnapshot({ elements, equipmentInstances }),
    future: Object.freeze([]),
  });
}

export function createHistoryFromLayout(layout: SpaceFitLayout): SpaceFitHistoryState {
  return createHistory(layout.elements, layout.equipmentInstances ?? []);
}

export function pushHistory(
  state: SpaceFitHistoryState,
  nextPresent: SpaceFitDomainSnapshot | readonly RoomElement[],
  limit: number = SPACE_FIT_HISTORY_LIMIT,
): SpaceFitHistoryState {
  // Phase 5B 호환: RoomElement[]만 넘기면 equipmentInstances는 유지
  if (Array.isArray(nextPresent)) {
    return pushHistory(
      state,
      {
        elements: nextPresent as readonly RoomElement[],
        equipmentInstances: state.present.equipmentInstances,
      },
      limit,
    );
  }
  const snapshot = nextPresent as SpaceFitDomainSnapshot;
  const past = [...state.past, state.present];
  const trimmed = past.length > limit ? past.slice(past.length - limit) : past;
  return Object.freeze({
    past: Object.freeze(trimmed.map((entry) => freezeSnapshot(entry))),
    present: freezeSnapshot(snapshot),
    future: Object.freeze([]),
  });
}

export function canUndo(state: SpaceFitHistoryState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: SpaceFitHistoryState): boolean {
  return state.future.length > 0;
}

export function undoHistory(state: SpaceFitHistoryState): SpaceFitHistoryState | null {
  if (state.past.length === 0) return null;
  const previous = state.past[state.past.length - 1];
  if (!previous) return null;
  return Object.freeze({
    past: Object.freeze(state.past.slice(0, -1)),
    present: freezeSnapshot(previous),
    future: Object.freeze([state.present, ...state.future]),
  });
}

export function redoHistory(state: SpaceFitHistoryState): SpaceFitHistoryState | null {
  if (state.future.length === 0) return null;
  const next = state.future[0];
  if (!next) return null;
  return Object.freeze({
    past: Object.freeze([...state.past, state.present]),
    present: freezeSnapshot(next),
    future: Object.freeze(state.future.slice(1)),
  });
}

export function withLayoutElements(
  layout: SpaceFitLayout,
  elements: readonly RoomElement[],
): SpaceFitLayout {
  return Object.freeze({
    ...layout,
    elements: Object.freeze([...elements]),
  });
}

export function withLayoutEquipment(
  layout: SpaceFitLayout,
  equipmentInstances: readonly EquipmentInstance[],
): SpaceFitLayout {
  return Object.freeze({
    ...layout,
    equipmentInstances: Object.freeze([...equipmentInstances]),
  });
}

export function withLayoutDomain(
  layout: SpaceFitLayout,
  snapshot: SpaceFitDomainSnapshot,
): SpaceFitLayout {
  return Object.freeze({
    ...layout,
    elements: Object.freeze([...snapshot.elements]),
    ...(snapshot.equipmentInstances.length > 0 || layout.equipmentInstances
      ? { equipmentInstances: Object.freeze([...snapshot.equipmentInstances]) }
      : {}),
  });
}

export function snapshotFromLayout(layout: SpaceFitLayout): SpaceFitDomainSnapshot {
  return freezeSnapshot({
    elements: layout.elements,
    equipmentInstances: layout.equipmentInstances ?? [],
  });
}
