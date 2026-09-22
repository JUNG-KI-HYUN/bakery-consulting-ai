/**
 * Equipment opaque IDs.
 * equipment_<uuid> / equipment_instance_<uuid>
 * 장비명·제조사·모델·치수를 ID에 넣지 않는다.
 */

const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const DEFINITION_ID_PATTERN = new RegExp(`^equipment_${UUID_PATTERN}$`, "i");
const INSTANCE_ID_PATTERN = new RegExp(`^equipment_instance_${UUID_PATTERN}$`, "i");

function createOpaqueId(prefix: "equipment" | "equipment_instance"): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new RangeError("Equipment identifier creation requires crypto.randomUUID()");
  }
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}

export function createEquipmentDefinitionId(): string {
  return createOpaqueId("equipment");
}

export function isEquipmentDefinitionId(value: unknown): value is string {
  return typeof value === "string" && DEFINITION_ID_PATTERN.test(value);
}

export function createEquipmentInstanceId(): string {
  return createOpaqueId("equipment_instance");
}

export function isEquipmentInstanceId(value: unknown): value is string {
  return typeof value === "string" && INSTANCE_ID_PATTERN.test(value);
}
