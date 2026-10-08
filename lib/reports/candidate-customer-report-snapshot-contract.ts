import {
  CANDIDATE_CUSTOMER_REPORT_SCHEMA_VERSION,
  type CandidateCustomerReport,
} from "./candidate-customer-report";

export const CANDIDATE_CUSTOMER_REPORT_SNAPSHOT_SCHEMA_VERSION =
  "frameone.candidate-customer-report-snapshot.v1" as const;

export interface CandidateCustomerReportSnapshot {
  reportSnapshotId: string;
  caseId: string;
  candidateId: string;
  schemaVersion: typeof CANDIDATE_CUSTOMER_REPORT_SNAPSHOT_SCHEMA_VERSION;
  reportSchemaVersion: typeof CANDIDATE_CUSTOMER_REPORT_SCHEMA_VERSION;
  decisionId: string;
  readinessSnapshotId: string;
  reportStatusAtIssue: "REPORT_READY";
  materializedReport: CandidateCustomerReport;
  reportGeneratedAt: string;
  issuedAt: string;
  immutable: true;
}

export interface CandidateCustomerReportSnapshotView {
  latestSnapshot: CandidateCustomerReportSnapshot | null;
  snapshotCount: number;
}
