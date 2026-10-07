import { NextResponse } from "next/server";
import {
  CandidateLeaseAssessmentReferenceError,
  CandidateLeaseAssessmentRepositoryError,
  CandidateLeaseAssessmentValidationError,
  createCandidateLeaseAssessment,
  getCandidateLeaseAssessment,
  updateCandidateLeaseAssessment,
} from "@/lib/candidates/candidate-lease-assessment-repository";

function errorResponse(error: unknown) {
  if (error instanceof CandidateLeaseAssessmentValidationError) return NextResponse.json({ message: error.message }, { status: 400 });
  if (error instanceof CandidateLeaseAssessmentReferenceError) return NextResponse.json({ message: error.message }, { status: error.status });
  if (error instanceof CandidateLeaseAssessmentRepositoryError) return NextResponse.json({ message: "임대차 검토 저장소를 처리하지 못했습니다." }, { status: 500 });
  return NextResponse.json({ message: "임대차 검토를 처리하지 못했습니다." }, { status: 500 });
}

export async function GET(request: Request, { params }: { params: Promise<{ candidateId: string }> }) {
  try {
    const caseId = new URL(request.url).searchParams.get("caseId") ?? "";
    return NextResponse.json(await getCandidateLeaseAssessment((await params).candidateId, caseId));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ candidateId: string }> }) {
  try {
    const candidateId = (await params).candidateId;
    const body = await request.json() as Record<string, unknown>;
    return NextResponse.json(await createCandidateLeaseAssessment({ ...body, candidateId }), { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ message: "JSON 요청 본문이 올바르지 않습니다." }, { status: 400 });
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ candidateId: string }> }) {
  try {
    const record = await updateCandidateLeaseAssessment((await params).candidateId, await request.json());
    return record ? NextResponse.json(record) : NextResponse.json({ message: "임대차 검토를 찾을 수 없습니다." }, { status: 404 });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ message: "JSON 요청 본문이 올바르지 않습니다." }, { status: 400 });
    return errorResponse(error);
  }
}
