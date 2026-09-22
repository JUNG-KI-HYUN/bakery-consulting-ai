import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  isSafeFieldStorageKey,
  resolveUnderFieldRoot,
} from "../field/field-survey-service.server";
import { isSiteSurveyId } from "../field/identifiers";
import {
  storageFail,
  storageOk,
  type FieldStorageFailure,
  type FieldStorageResult,
} from "../field/storage-result";
import { createLayoutFromMeasurement } from "./create-from-measurement";
import { isLayoutId } from "./identifiers";
import { parseRoomElement, parseSpaceFitLayout } from "./layout-record";
import type { MeasurementSet } from "../field/measurement";
import type { RoomElement, SpaceFitLayout } from "./types";

export const DEFAULT_SPACE_FIT_LAYOUT_ROOT = path.join(process.cwd(), "data", "space-fit-layouts");

export interface SpaceFitLayoutServiceOptions {
  readonly rootDir?: string;
  readonly now?: () => string;
}

export interface SpaceFitLayoutService {
  getLayout(layoutId: string): Promise<FieldStorageResult<SpaceFitLayout>>;
  findActiveLayoutForSurvey(surveyId: string): Promise<FieldStorageResult<SpaceFitLayout | null>>;
  /**
   * Survey당 active Layout 1개.
   * 기존 Layout이 있으면 재사용. GET side-effect 없음 — 이 메서드만 생성한다.
   */
  startLayout(input: {
    measurement: MeasurementSet;
    consultationId?: string;
  }): Promise<FieldStorageResult<{ layout: SpaceFitLayout; created: boolean }>>;
  updateLayout(input: {
    layoutId: string;
    expectedLayoutVersion: number;
    elements: readonly RoomElement[];
  }): Promise<FieldStorageResult<SpaceFitLayout>>;
}

function ioFail(error: unknown): FieldStorageFailure {
  const message = error instanceof Error ? error.message : "SPACE FIT storage IO failed";
  return storageFail("IO_ERROR", message);
}

async function writeJsonBestEffort(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${globalThis.crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    try {
      await fs.rename(tempPath, filePath);
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      if (code === "EEXIST" || code === "EPERM") {
        await fs.copyFile(tempPath, filePath);
        await fs.unlink(tempPath);
        return;
      }
      throw error;
    }
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

async function readTextFile(filePath: string): Promise<FieldStorageResult<string | null>> {
  try {
    return storageOk(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return storageOk(null);
    return ioFail(error);
  }
}

function parseJsonValue(raw: string): FieldStorageResult<unknown> {
  try {
    return storageOk(JSON.parse(raw) as unknown);
  } catch {
    return storageFail("INVALID_DATA", "SPACE FIT JSON is corrupt");
  }
}

/**
 * layoutId는 layout_<uuid>만 허용.
 * sanitize하여 다른 파일명으로 바꾸지 않는다 — 거부한다.
 */
export function resolveLayoutFilePath(
  rootDir: string,
  layoutId: string,
): FieldStorageResult<string> {
  if (!isLayoutId(layoutId)) {
    return storageFail("INVALID_DATA", "layoutId must use layout_<uuid>");
  }
  // layout_<uuid>는 SAFE_STORAGE_KEY 패턴과 호환 (A-Za-z0-9._-)
  if (!isSafeFieldStorageKey(layoutId)) {
    return storageFail("INVALID_DATA", "layoutId is not a safe storage key");
  }
  return resolveUnderFieldRoot(rootDir, "layouts", `${layoutId}.json`);
}

export function resolveSurveyIndexPath(
  rootDir: string,
  surveyId: string,
): FieldStorageResult<string> {
  if (!isSiteSurveyId(surveyId)) {
    return storageFail("INVALID_DATA", "surveyId must use survey_<uuid>");
  }
  if (!isSafeFieldStorageKey(surveyId)) {
    return storageFail("INVALID_DATA", "surveyId is not a safe storage key");
  }
  return resolveUnderFieldRoot(rootDir, "by-survey", `${surveyId}.json`);
}

export function createSpaceFitLayoutService(
  options: SpaceFitLayoutServiceOptions = {},
): SpaceFitLayoutService {
  const rootDir = options.rootDir ?? DEFAULT_SPACE_FIT_LAYOUT_ROOT;
  const now = options.now ?? (() => new Date().toISOString());

  async function getLayout(layoutId: string): Promise<FieldStorageResult<SpaceFitLayout>> {
    const file = resolveLayoutFilePath(rootDir, layoutId);
    if (!file.ok) return file;
    const raw = await readTextFile(file.value);
    if (!raw.ok) return raw;
    if (raw.value === null) return storageFail("NOT_FOUND", "SpaceFitLayout not found");
    const parsedJson = parseJsonValue(raw.value);
    if (!parsedJson.ok) return parsedJson;
    const parsed = parseSpaceFitLayout(parsedJson.value);
    if (!parsed) return storageFail("INVALID_DATA", "SpaceFitLayout JSON is invalid");
    if (parsed.layoutId !== layoutId) {
      return storageFail("INVALID_DATA", "layoutId does not match file");
    }
    return storageOk(parsed);
  }

  async function findActiveLayoutForSurvey(
    surveyId: string,
  ): Promise<FieldStorageResult<SpaceFitLayout | null>> {
    const indexPath = resolveSurveyIndexPath(rootDir, surveyId);
    if (!indexPath.ok) return indexPath;
    const raw = await readTextFile(indexPath.value);
    if (!raw.ok) return raw;
    if (raw.value === null) return storageOk(null);
    const parsedJson = parseJsonValue(raw.value);
    if (!parsedJson.ok) return parsedJson;
    if (
      typeof parsedJson.value !== "object" ||
      parsedJson.value === null ||
      Array.isArray(parsedJson.value)
    ) {
      return storageFail("INVALID_DATA", "survey layout index invalid");
    }
    const layoutId = (parsedJson.value as Record<string, unknown>).layoutId;
    if (!isLayoutId(layoutId)) {
      return storageFail("INVALID_DATA", "survey layout index has invalid layoutId");
    }
    return getLayout(layoutId);
  }

  async function startLayout(input: {
    measurement: MeasurementSet;
    consultationId?: string;
  }): Promise<FieldStorageResult<{ layout: SpaceFitLayout; created: boolean }>> {
    const existing = await findActiveLayoutForSurvey(input.measurement.surveyId);
    if (!existing.ok) return existing;
    if (existing.value) {
      return storageOk({ layout: existing.value, created: false });
    }

    const created = createLayoutFromMeasurement({
      measurement: input.measurement,
      consultationId: input.consultationId,
      createdAt: now(),
    });
    if (!created.ok) {
      return storageFail("INVALID_DATA", created.message);
    }

    const layoutFile = resolveLayoutFilePath(rootDir, created.layout.layoutId);
    if (!layoutFile.ok) return layoutFile;
    const indexFile = resolveSurveyIndexPath(rootDir, created.layout.surveyId);
    if (!indexFile.ok) return indexFile;

    try {
      await writeJsonBestEffort(layoutFile.value, created.layout);
      await writeJsonBestEffort(indexFile.value, {
        surveyId: created.layout.surveyId,
        layoutId: created.layout.layoutId,
        candidateStoreId: created.layout.candidateStoreId,
        measurementId: created.layout.measurementId,
        updatedAt: created.layout.updatedAt,
      });
    } catch (error) {
      return ioFail(error);
    }
    return storageOk({ layout: created.layout, created: true });
  }

  async function updateLayout(input: {
    layoutId: string;
    expectedLayoutVersion: number;
    elements: readonly RoomElement[];
  }): Promise<FieldStorageResult<SpaceFitLayout>> {
    if (
      typeof input.expectedLayoutVersion !== "number" ||
      !Number.isInteger(input.expectedLayoutVersion) ||
      input.expectedLayoutVersion < 1
    ) {
      return storageFail("INVALID_DATA", "expectedLayoutVersion required");
    }
    const loaded = await getLayout(input.layoutId);
    if (!loaded.ok) return loaded;
    if (loaded.value.layoutVersion !== input.expectedLayoutVersion) {
      return storageFail(
        "VERSION_CONFLICT",
        "SpaceFitLayout layoutVersion does not match the stored layout",
      );
    }

    // 요소 재파싱으로 invalid geometry 저장 거부 (가짜 pillar default 등 방지)
    const elements: RoomElement[] = [];
    for (const item of input.elements) {
      const parsed = parseRoomElement(item);
      if (!parsed) {
        return storageFail("INVALID_DATA", "elements contain invalid geometry");
      }
      elements.push(parsed);
    }

    const next: SpaceFitLayout = Object.freeze({
      ...loaded.value,
      elements: Object.freeze(elements),
      layoutVersion: loaded.value.layoutVersion + 1,
      updatedAt: now(),
    });

    const file = resolveLayoutFilePath(rootDir, next.layoutId);
    if (!file.ok) return file;
    try {
      await writeJsonBestEffort(file.value, next);
    } catch (error) {
      return ioFail(error);
    }
    return storageOk(next);
  }

  return {
    getLayout,
    findActiveLayoutForSurvey,
    startLayout,
    updateLayout,
  };
}

let defaultService: SpaceFitLayoutService | undefined;

export function getSpaceFitLayoutService(): SpaceFitLayoutService {
  defaultService ??= createSpaceFitLayoutService();
  return defaultService;
}
