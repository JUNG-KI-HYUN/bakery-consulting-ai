export type FieldStorageErrorCode = "NOT_FOUND" | "VERSION_CONFLICT" | "INVALID_DATA" | "IO_ERROR";

export interface FieldStorageFailure {
  readonly ok: false;
  readonly code: FieldStorageErrorCode;
  readonly message: string;
}

export interface FieldStorageSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export type FieldStorageResult<T> = FieldStorageSuccess<T> | FieldStorageFailure;

export function storageOk<T>(value: T): FieldStorageSuccess<T> {
  return { ok: true, value };
}

export function storageFail(code: FieldStorageErrorCode, message: string): FieldStorageFailure {
  return { ok: false, code, message };
}
