import fs from "node:fs/promises";
import path from "node:path";
import { buildDiagnosisResult } from "./mockAiDiagnosis";
import { ConsultationRecord, DiagnosisResult } from "./types";
import { sampleConsultation } from "./sample-data";

const dataDir = path.join(process.cwd(), "data");
const consultationsFile = path.join(dataDir, "consultations.json");
const draftsBackupFile = path.join(dataDir, "diagnosis-drafts.json.backup");

async function ensureDataFiles() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(consultationsFile);
  } catch {
    await fs.writeFile(
      consultationsFile,
      JSON.stringify([sampleConsultation], null, 2),
      "utf-8",
    );
  }

  try {
    await fs.access(draftsBackupFile);
  } catch {
    await fs.writeFile(draftsBackupFile, JSON.stringify([], null, 2), "utf-8");
  }
}

export async function getConsultations(): Promise<ConsultationRecord[]> {
  await ensureDataFiles();
  const raw = await fs.readFile(consultationsFile, "utf-8");
  return JSON.parse(raw) as ConsultationRecord[];
}

export async function getConsultationById(id: string) {
  const list = await getConsultations();
  return list.find((item) => item.consultation.id === id) ?? null;
}

export async function saveConsultation(record: ConsultationRecord) {
  const list = await getConsultations();
  const index = list.findIndex((item) => item.consultation.id === record.consultation.id);
  if (index >= 0) list[index] = record;
  else list.push(record);
  await fs.writeFile(consultationsFile, JSON.stringify(list, null, 2), "utf-8");
  return record;
}

export async function runDiagnosis(id: string): Promise<DiagnosisResult | null> {
  const record = await getConsultationById(id);
  if (!record) return null;
  const result = buildDiagnosisResult(record);

  await ensureDataFiles();
  const draftsRaw = await fs.readFile(draftsBackupFile, "utf-8");
  const drafts = JSON.parse(draftsRaw) as DiagnosisResult[];
  const nextDrafts = [result, ...drafts].slice(0, 20);
  await fs.writeFile(draftsBackupFile, JSON.stringify(nextDrafts, null, 2), "utf-8");
  return result;
}
