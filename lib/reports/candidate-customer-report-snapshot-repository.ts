import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getCandidateStore } from "../candidates/candidate-repository";
import {
  CANDIDATE_CUSTOMER_REPORT_SCHEMA_VERSION,
  CandidateCustomerReportInputError,
  type CandidateCustomerReport,
} from "./candidate-customer-report";
import { getCandidateCustomerReport } from "./candidate-customer-report-service";
import {
  CANDIDATE_CUSTOMER_REPORT_SNAPSHOT_SCHEMA_VERSION,
  type CandidateCustomerReportSnapshot,
  type CandidateCustomerReportSnapshotView,
} from "./candidate-customer-report-snapshot-contract";

let pendingWrite = Promise.resolve();

export class CustomerReportSnapshotRepositoryError extends Error {}
export class CustomerReportSnapshotReferenceError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) {
    super(message);
  }
}

function snapshotFilePath() {
  const override = process.env.FRAMEONE_CUSTOMER_REPORT_SNAPSHOTS_FILE?.trim();
  return override
    ? path.resolve(override)
    : path.join(process.cwd(), "data", "candidate-customer-report-snapshots.json");
}

async function ensureFile(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.writeFile(filePath, "[]\n", { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}

function validTimestamp(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function assertStoredSnapshot(value: unknown): asserts value is CandidateCustomerReportSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Customer Report Snapshot이 객체가 아닙니다.");
  }
  const snapshot = value as Partial<CandidateCustomerReportSnapshot>;
  if (typeof snapshot.reportSnapshotId !== "string" || !snapshot.reportSnapshotId.startsWith("customer-report-")) {
    throw new TypeError("Customer Report Snapshot ID가 올바르지 않습니다.");
  }
  if (typeof snapshot.caseId !== "string" || !snapshot.caseId || typeof snapshot.candidateId !== "string" || !snapshot.candidateId) {
    throw new TypeError("Customer Report Snapshot 소유권 정보가 올바르지 않습니다.");
  }
  if (snapshot.schemaVersion !== CANDIDATE_CUSTOMER_REPORT_SNAPSHOT_SCHEMA_VERSION
    || snapshot.reportSchemaVersion !== CANDIDATE_CUSTOMER_REPORT_SCHEMA_VERSION) {
    throw new TypeError("Customer Report Snapshot version이 올바르지 않습니다.");
  }
  if (typeof snapshot.decisionId !== "string" || !snapshot.decisionId
    || typeof snapshot.readinessSnapshotId !== "string" || !snapshot.readinessSnapshotId) {
    throw new TypeError("Customer Report Snapshot 판단 기준이 올바르지 않습니다.");
  }
  if (snapshot.reportStatusAtIssue !== "REPORT_READY" || snapshot.immutable !== true) {
    throw new TypeError("Customer Report Snapshot 발행 상태가 올바르지 않습니다.");
  }
  if (!validTimestamp(snapshot.reportGeneratedAt) || !validTimestamp(snapshot.issuedAt)) {
    throw new TypeError("Customer Report Snapshot 시각이 올바르지 않습니다.");
  }
  const report = snapshot.materializedReport as CandidateCustomerReport | undefined;
  if (!report || typeof report !== "object"
    || report.meta?.schemaVersion !== CANDIDATE_CUSTOMER_REPORT_SCHEMA_VERSION
    || report.meta.reportStatus !== "REPORT_READY"
    || report.meta.caseId !== snapshot.caseId
    || report.meta.candidateId !== snapshot.candidateId
    || report.meta.decisionId !== snapshot.decisionId
    || report.meta.readinessSnapshotId !== snapshot.readinessSnapshotId
    || report.meta.generatedAt !== snapshot.reportGeneratedAt) {
    throw new TypeError("Customer Report Snapshot materialized report가 올바르지 않습니다.");
  }
}

async function readSnapshots(filePath: string): Promise<CandidateCustomerReportSnapshot[]> {
  await ensureFile(filePath);
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) throw new TypeError("Customer Report Snapshot 저장소 root가 배열이 아닙니다.");
    parsed.forEach(assertStoredSnapshot);
    return parsed;
  } catch (error) {
    throw new CustomerReportSnapshotRepositoryError("Customer Report Snapshot 저장소를 읽지 못했습니다.", { cause: error });
  }
}

async function writeSnapshots(filePath: string, snapshots: CandidateCustomerReportSnapshot[]) {
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(snapshots, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, filePath);
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined);
    throw new CustomerReportSnapshotRepositoryError("Customer Report Snapshot 저장소에 기록하지 못했습니다.", { cause: error });
  }
}

async function assertOwnedCandidate(candidateId: string, caseId: string) {
  if (!caseId.trim()) throw new CustomerReportSnapshotReferenceError("caseId는 필수입니다.", 400);
  const candidate = await getCandidateStore(candidateId);
  if (!candidate) throw new CustomerReportSnapshotReferenceError("후보점포를 찾을 수 없습니다.", 404);
  if (candidate.caseId !== caseId) {
    throw new CustomerReportSnapshotReferenceError("다른 Case의 후보점포에는 접근할 수 없습니다.", 404);
  }
}

function assertIssuableReport(report: CandidateCustomerReport) {
  if (report.meta.reportStatus !== "REPORT_READY") {
    throw new CustomerReportSnapshotReferenceError(
      "필수 분석 근거가 확인되지 않아 고객용 리포트를 확정할 수 없습니다.",
      409,
    );
  }
  const decision = report.provenance.decisionBasisSources.humanDecision;
  const readiness = report.provenance.decisionBasisSources.readinessSnapshot;
  if (!report.meta.decisionId || !report.meta.readinessSnapshotId
    || !decision || !readiness
    || decision.decisionId !== report.meta.decisionId
    || decision.readinessSnapshotId !== report.meta.readinessSnapshotId
    || readiness.readinessSnapshotId !== report.meta.readinessSnapshotId) {
    throw new CustomerReportSnapshotReferenceError(
      "Human Decision과 Readiness Snapshot의 발행 기준을 확인할 수 없습니다.",
      409,
    );
  }
}

function viewFrom(snapshots: CandidateCustomerReportSnapshot[]): CandidateCustomerReportSnapshotView {
  return {
    latestSnapshot: structuredClone(snapshots.at(-1) ?? null),
    snapshotCount: snapshots.length,
  };
}

export async function getCandidateCustomerReportSnapshotView(candidateId: string, caseId: string) {
  await pendingWrite;
  await assertOwnedCandidate(candidateId, caseId);
  const snapshots = await readSnapshots(snapshotFilePath());
  return viewFrom(snapshots.filter((item) => item.candidateId === candidateId && item.caseId === caseId));
}

export async function getCandidateCustomerReportSnapshot(
  candidateId: string,
  caseId: string,
  reportSnapshotId: string,
) {
  await pendingWrite;
  await assertOwnedCandidate(candidateId, caseId);
  const snapshots = await readSnapshots(snapshotFilePath());
  return structuredClone(snapshots.find((item) => item.reportSnapshotId === reportSnapshotId
    && item.candidateId === candidateId
    && item.caseId === caseId) ?? null);
}

export function saveCandidateCustomerReportSnapshot(
  candidateId: string,
  caseId: string,
): Promise<CandidateCustomerReportSnapshot> {
  const filePath = snapshotFilePath();
  let saved!: CandidateCustomerReportSnapshot;
  const operation = pendingWrite.then(async () => {
    await assertOwnedCandidate(candidateId, caseId);
    let report: CandidateCustomerReport | null;
    try {
      report = await getCandidateCustomerReport(caseId, candidateId);
    } catch (error) {
      if (error instanceof CandidateCustomerReportInputError) {
        throw new CustomerReportSnapshotReferenceError(
          "현재 고객 리포트의 판단 기준을 재검증하지 못했습니다.",
          409,
        );
      }
      throw error;
    }
    if (!report) throw new CustomerReportSnapshotReferenceError("고객 리포트를 찾을 수 없습니다.", 404);
    assertIssuableReport(report);
    const snapshots = await readSnapshots(filePath);
    const decisionId = report.meta.decisionId!;
    const readinessSnapshotId = report.meta.readinessSnapshotId!;
    saved = {
      reportSnapshotId: `customer-report-${randomUUID()}`,
      caseId,
      candidateId,
      schemaVersion: CANDIDATE_CUSTOMER_REPORT_SNAPSHOT_SCHEMA_VERSION,
      reportSchemaVersion: report.meta.schemaVersion,
      decisionId,
      readinessSnapshotId,
      reportStatusAtIssue: "REPORT_READY",
      materializedReport: structuredClone(report),
      reportGeneratedAt: report.meta.generatedAt,
      issuedAt: new Date().toISOString(),
      immutable: true,
    };
    snapshots.push(saved);
    await writeSnapshots(filePath, snapshots);
  });
  pendingWrite = operation.then(() => undefined, () => undefined);
  return operation.then(() => structuredClone(saved));
}
