/**
 * SPACE FIT 식별자.
 * layout_<uuid> / element_<uuid>. 주소·상호 등 변경 가능 값을 넣지 않는다.
 */

const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const LAYOUT_ID_PATTERN = new RegExp(`^layout_${UUID_PATTERN}$`, "i");
const ELEMENT_ID_PATTERN = new RegExp(`^element_${UUID_PATTERN}$`, "i");

function createOpaqueId(prefix: "layout" | "element"): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new RangeError("SPACE FIT identifier creation requires crypto.randomUUID()");
  }
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}

export function createLayoutId(): string {
  return createOpaqueId("layout");
}

export function isLayoutId(value: unknown): value is string {
  return typeof value === "string" && LAYOUT_ID_PATTERN.test(value);
}

export function createElementId(): string {
  return createOpaqueId("element");
}

export function isElementId(value: unknown): value is string {
  return typeof value === "string" && ELEMENT_ID_PATTERN.test(value);
}
