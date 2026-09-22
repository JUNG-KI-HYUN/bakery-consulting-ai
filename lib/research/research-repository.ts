import fs from "node:fs/promises";
import path from "node:path";
import { assertConfirmedForServerSave, parseLeaseResearchRecord } from "./research-record-contract";
import type { LeaseResearchRecord, VerificationStatus } from "./types";

const dataDir = path.join(process.cwd(), "data");
const researchRecordsFile = path.join(dataDir, "research-records.json");
let pendingWrite = Promise.resolve();

export class ResearchRecordConflictError extends Error {}

async function ensureResearchFile() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(researchRecordsFile);
  } catch {
    await fs.writeFile(researchRecordsFile, "[]\n", "utf-8");
  }
}

async function readRecords() {
  await ensureResearchFile();
  const parsed = JSON.parse(await fs.readFile(researchRecordsFile, "utf-8")) as unknown;
  if (!Array.isArray(parsed)) throw new TypeError("Research repository root must be an array.");
  return parsed.map(parseLeaseResearchRecord);
}

async function writeRecords(records: LeaseResearchRecord[]) {
  await fs.writeFile(researchRecordsFile, `${JSON.stringify(records, null, 2)}\n`, "utf-8");
}

function serialized(record: LeaseResearchRecord) {
  return JSON.stringify(record);
}

export async function listResearchRecords(): Promise<LeaseResearchRecord[]> {
  await pendingWrite;
  return structuredClone(await readRecords());
}

export async function getResearchRecord(recordId: string): Promise<LeaseResearchRecord | null> {
  const records = await listResearchRecords();
  return records.find((record) => record.recordId === recordId) ?? null;
}

export function createResearchRecord(input: unknown): Promise<{ record: LeaseResearchRecord; created: boolean }> {
  const record = parseLeaseResearchRecord(input);
  assertConfirmedForServerSave(record);
  let result!: { record: LeaseResearchRecord; created: boolean };
  const operation = pendingWrite.then(async () => {
    const records = await readRecords();
    const existing = records.find((item) => item.recordId === record.recordId);
    if (existing) {
      if (serialized(existing) !== serialized(record)) {
        throw new ResearchRecordConflictError("recordId already exists with different content.");
      }
      result = { record: structuredClone(existing), created: false };
      return;
    }
    records.push(record);
    await writeRecords(records);
    result = { record: structuredClone(record), created: true };
  });
  pendingWrite = operation.then(() => undefined, () => undefined);
  return operation.then(() => result);
}

export function updateVerificationStatus(
  recordId: string,
  verificationStatus: VerificationStatus,
  changedAt: string,
): Promise<LeaseResearchRecord | null> {
  let result: LeaseResearchRecord | null = null;
  const operation = pendingWrite.then(async () => {
    const records = await readRecords();
    const index = records.findIndex((record) => record.recordId === recordId);
    if (index < 0) return;
    const previous = records[index];
    const next: LeaseResearchRecord = {
      ...previous,
      quality: { ...previous.quality, verificationStatus },
      history: [
        ...previous.history,
        {
          type: "VERIFICATION_STATUS_CHANGED",
          changedAt,
          previousValue: previous.quality.verificationStatus,
          currentValue: verificationStatus,
        },
      ],
    };
    records[index] = next;
    await writeRecords(records);
    result = structuredClone(next);
  });
  pendingWrite = operation.then(() => undefined, () => undefined);
  return operation.then(() => result);
}

export function markExcluded(recordId: string, changedAt: string) {
  return updateVerificationStatus(recordId, "EXCLUDED", changedAt);
}
