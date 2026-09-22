export const RESEARCH_STORAGE_KEY = "frameoneResearchCollectorV13";
export const RESEARCH_STORAGE_SCHEMA_VERSION = "frameone.research-local-queue.v1.3";

export class StorageApiUnavailableError extends Error {
  constructor() {
    super("STORAGE_API_UNAVAILABLE: chrome.storage.local을 사용할 수 없습니다. 확장프로그램을 다시 로드하고 storage 권한을 확인하세요.");
    this.name = "StorageApiUnavailableError";
    this.code = "STORAGE_API_UNAVAILABLE";
  }
}

export function getChromeStorageLocal(chromeApi = globalThis.chrome) {
  const storageArea = chromeApi?.storage?.local;
  if (
    !storageArea
    || typeof storageArea.get !== "function"
    || typeof storageArea.set !== "function"
    || typeof storageArea.remove !== "function"
  ) {
    throw new StorageApiUnavailableError();
  }
  return storageArea;
}

export function createEmptyCollectorState() {
  return {
    schemaVersion: RESEARCH_STORAGE_SCHEMA_VERSION,
    queueEntries: [],
    activeRecordId: null,
    duplicateDecisions: [],
  };
}

export function normalizeCollectorState(value) {
  if (!value || value.schemaVersion !== RESEARCH_STORAGE_SCHEMA_VERSION) return createEmptyCollectorState();
  return {
    schemaVersion: RESEARCH_STORAGE_SCHEMA_VERSION,
    queueEntries: Array.isArray(value.queueEntries)
      ? value.queueEntries.filter((entry) => entry?.record?.recordId && entry?.collection?.fields)
      : [],
    activeRecordId: typeof value.activeRecordId === "string" ? value.activeRecordId : null,
    duplicateDecisions: Array.isArray(value.duplicateDecisions)
      ? value.duplicateDecisions.filter((entry) => Array.isArray(entry) && entry.length === 2)
      : [],
  };
}

export async function loadCollectorState(storageArea) {
  const stored = await storageArea.get(RESEARCH_STORAGE_KEY);
  return normalizeCollectorState(stored?.[RESEARCH_STORAGE_KEY]);
}

export async function saveCollectorState(storageArea, state) {
  const normalized = normalizeCollectorState({
    ...state,
    schemaVersion: RESEARCH_STORAGE_SCHEMA_VERSION,
  });
  await storageArea.set({ [RESEARCH_STORAGE_KEY]: normalized });
  return normalized;
}

export async function updateCollectorState(storageArea, updater) {
  const current = await loadCollectorState(storageArea);
  const next = await updater(structuredClone(current));
  return saveCollectorState(storageArea, next);
}

export async function removeCollectorState(storageArea) {
  await storageArea.remove(RESEARCH_STORAGE_KEY);
}
