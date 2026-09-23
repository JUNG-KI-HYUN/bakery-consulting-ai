import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  isSafeFieldStorageKey,
  resolveUnderFieldRoot,
} from "../field/field-survey-service.server";
import {
  storageFail,
  storageOk,
  type FieldStorageFailure,
  type FieldStorageResult,
} from "../field/storage-result";
import { isEquipmentDefinitionId } from "./identifiers";
import { parseEquipmentDefinition } from "./validation";
import type { EquipmentDefinition } from "./types";

export const DEFAULT_EQUIPMENT_DEFINITION_ROOT = path.join(
  process.cwd(),
  "data",
  "equipment-definitions",
);

export interface EquipmentDefinitionServiceOptions {
  readonly rootDir?: string;
  readonly now?: () => string;
}

export interface EquipmentDefinitionService {
  getDefinition(
    equipmentDefinitionId: string,
  ): Promise<FieldStorageResult<EquipmentDefinition>>;
  listDefinitions(): Promise<FieldStorageResult<readonly EquipmentDefinition[]>>;
  saveDefinition(
    definition: EquipmentDefinition,
  ): Promise<FieldStorageResult<EquipmentDefinition>>;
}

function ioFail(error: unknown): FieldStorageFailure {
  const message = error instanceof Error ? error.message : "Equipment storage IO failed";
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

/**
 * equipment_<uuid>만 허용. sanitize하여 다른 파일명으로 바꾸지 않는다.
 */
export function resolveEquipmentDefinitionFilePath(
  rootDir: string,
  equipmentDefinitionId: string,
): FieldStorageResult<string> {
  if (!isEquipmentDefinitionId(equipmentDefinitionId)) {
    return storageFail("INVALID_DATA", "equipmentDefinitionId must use equipment_<uuid>");
  }
  if (!isSafeFieldStorageKey(equipmentDefinitionId)) {
    return storageFail("INVALID_DATA", "equipmentDefinitionId is not a safe storage key");
  }
  return resolveUnderFieldRoot(rootDir, "definitions", `${equipmentDefinitionId}.json`);
}

export function createEquipmentDefinitionService(
  options: EquipmentDefinitionServiceOptions = {},
): EquipmentDefinitionService {
  const rootDir = options.rootDir ?? DEFAULT_EQUIPMENT_DEFINITION_ROOT;
  const now = options.now ?? (() => new Date().toISOString());

  async function getDefinition(
    equipmentDefinitionId: string,
  ): Promise<FieldStorageResult<EquipmentDefinition>> {
    const file = resolveEquipmentDefinitionFilePath(rootDir, equipmentDefinitionId);
    if (!file.ok) return file;
    const raw = await readTextFile(file.value);
    if (!raw.ok) return raw;
    if (raw.value === null) {
      return storageFail("NOT_FOUND", "EquipmentDefinition not found");
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw.value) as unknown;
    } catch {
      return storageFail("INVALID_DATA", "EquipmentDefinition JSON is corrupt");
    }
    const parsed = parseEquipmentDefinition(parsedJson);
    if (!parsed) {
      return storageFail("INVALID_DATA", "EquipmentDefinition JSON is invalid");
    }
    if (parsed.equipmentDefinitionId !== equipmentDefinitionId) {
      return storageFail("INVALID_DATA", "equipmentDefinitionId does not match file");
    }
    return storageOk(parsed);
  }

  async function listDefinitions(): Promise<FieldStorageResult<readonly EquipmentDefinition[]>> {
    const dir = resolveUnderFieldRoot(rootDir, "definitions");
    if (!dir.ok) return dir;
    let names: string[];
    try {
      names = await fs.readdir(dir.value);
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      if (code === "ENOENT") return storageOk([]);
      return ioFail(error);
    }
    const definitions: EquipmentDefinition[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const id = name.slice(0, -".json".length);
      if (!isEquipmentDefinitionId(id)) continue;
      const loaded = await getDefinition(id);
      if (!loaded.ok) {
        if (loaded.code === "NOT_FOUND") continue;
        return loaded;
      }
      definitions.push(loaded.value);
    }
    return storageOk(Object.freeze(definitions));
  }

  async function saveDefinition(
    definition: EquipmentDefinition,
  ): Promise<FieldStorageResult<EquipmentDefinition>> {
    const parsed = parseEquipmentDefinition(definition);
    if (!parsed) {
      return storageFail("INVALID_DATA", "EquipmentDefinition is invalid");
    }
    const next = Object.freeze({
      ...parsed,
      updatedAt: now(),
    });
    const file = resolveEquipmentDefinitionFilePath(rootDir, next.equipmentDefinitionId);
    if (!file.ok) return file;
    try {
      await writeJsonBestEffort(file.value, next);
    } catch (error) {
      return ioFail(error);
    }
    return storageOk(next);
  }

  return {
    getDefinition,
    listDefinitions,
    saveDefinition,
  };
}

let defaultService: EquipmentDefinitionService | undefined;

export function getEquipmentDefinitionService(): EquipmentDefinitionService {
  defaultService ??= createEquipmentDefinitionService();
  return defaultService;
}
