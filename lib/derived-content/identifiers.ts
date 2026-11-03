const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const DERIVED_CONTENT_REVISION_ID_PATTERN = new RegExp(`^derived_rev_${UUID_PATTERN}$`, "i");

/** 배열 index나 timestamp가 아닌 stable opaque revision ID를 발급한다. */
export function createDerivedContentRevisionId(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new RangeError("Derived Content revision creation requires crypto.randomUUID()");
  }
  return `derived_rev_${globalThis.crypto.randomUUID()}`;
}

export function isDerivedContentRevisionId(value: unknown): value is string {
  return typeof value === "string" && DERIVED_CONTENT_REVISION_ID_PATTERN.test(value);
}
