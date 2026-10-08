import { NextResponse } from "next/server";
import {
  CustomerReportSnapshotReferenceError,
  CustomerReportSnapshotRepositoryError,
  getCandidateCustomerReportSnapshotView,
  saveCandidateCustomerReportSnapshot,
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

export async function GET(request: Request, { params }: { params: Promise<{ candidateId: string }> }) {
  try {
    const caseId = new URL(request.url).searchParams.get("caseId") ?? "";
    return NextResponse.json(await getCandidateCustomerReportSnapshotView((await params).candidateId, caseId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ candidateId: string }> }) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const caseId = typeof body.caseId === "string" ? body.caseId : "";
    const snapshot = await saveCandidateCustomerReportSnapshot((await params).candidateId, caseId);
    return NextResponse.json(snapshot, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: "JSON 요청 본문이 올바르지 않습니다." }, { status: 400 });
    }
    return errorResponse(error);
  }
}
