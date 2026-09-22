/**
 * Layout Domain history — snapshot 방식.
 * Zoom/pan/selection은 history에 넣지 않는다.
 */

import type { RoomElement, SpaceFitLayout } from "./types";

export const SPACE_FIT_HISTORY_LIMIT = 50;

export interface SpaceFitHistoryState {
  readonly past: readonly (readonly RoomElement[])[];
  readonly present: readonly RoomElement[];
  readonly future: readonly (readonly RoomElement[])[];
}

export function createHistory(present: readonly RoomElement[]): SpaceFitHistoryState {
  return Object.freeze({
    past: Object.freeze([]),
    present: Object.freeze([...present]),
    future: Object.freeze([]),
  });
}

export function pushHistory(
  state: SpaceFitHistoryState,
  nextPresent: readonly RoomElement[],
  limit: number = SPACE_FIT_HISTORY_LIMIT,
): SpaceFitHistoryState {
  const past = [...state.past, state.present];
  const trimmed =
    past.length > limit ? past.slice(past.length - limit) : past;
  return Object.freeze({
    past: Object.freeze(trimmed.map((entry) => Object.freeze([...entry]))),
    present: Object.freeze([...nextPresent]),
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
    present: Object.freeze([...previous]),
    future: Object.freeze([state.present, ...state.future]),
  });
}

export function redoHistory(state: SpaceFitHistoryState): SpaceFitHistoryState | null {
  if (state.future.length === 0) return null;
  const next = state.future[0];
  if (!next) return null;
  return Object.freeze({
    past: Object.freeze([...state.past, state.present]),
    present: Object.freeze([...next]),
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
