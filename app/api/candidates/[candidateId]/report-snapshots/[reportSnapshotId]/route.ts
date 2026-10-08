import { NextResponse } from "next/server";
import {
  CustomerReportSnapshotReferenceError,
  CustomerReportSnapshotRepositoryError,
  getCandidateCustomerReportSnapshot,
} from "@/lib/reports/candidate-customer-report-snapshot-repository";

function errorResponse(error: unknown) {
  if (error instanceof CustomerReportSnapshotReferenceError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  if (error instanceof CustomerReportSnapshotRepositoryError) {
    return NextResponse.json({ message: "Customer Report Snapshot 저장소를 처리하지 못했습니다." }, { status: 500 });
  }
  return NextResponse.json({ message: "Customer Report Snapshot을 처리하지 못했습니다." }, { status: 500 });
}

export async function GET(request: Request, {
  params,
}: {
  params: Promise<{ candidateId: string; reportSnapshotId: string }>;
}) {
  try {
    const caseId = new URL(request.url).searchParams.get("caseId") ?? "";
    const { candidateId, reportSnapshotId } = await params;
    const snapshot = await getCandidateCustomerReportSnapshot(candidateId, caseId, reportSnapshotId);
    if (!snapshot) return NextResponse.json({ message: "확정된 고객 리포트를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json(snapshot);
  } catch (error) {
    return errorResponse(error);
  }
}
