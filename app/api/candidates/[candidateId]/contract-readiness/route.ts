import { NextResponse } from "next/server";
import {
  ContractReadinessReferenceError,
  ContractReadinessRepositoryError,
  getCandidateContractReadinessView,
  saveCandidateContractReadinessSnapshot,
} from "@/lib/candidates/contract-readiness-repository";

function errorResponse(error: unknown) {
  if (error instanceof ContractReadinessReferenceError) return NextResponse.json({ message: error.message }, { status: error.status });
  if (error instanceof ContractReadinessRepositoryError) return NextResponse.json({ message: "Contract Readiness 저장소를 처리하지 못했습니다." }, { status: 500 });
  return NextResponse.json({ message: "Contract Readiness를 처리하지 못했습니다." }, { status: 500 });
}

export async function GET(request: Request, { params }: { params: Promise<{ candidateId: string }> }) {
  try {
    const caseId = new URL(request.url).searchParams.get("caseId") ?? "";
    return NextResponse.json(await getCandidateContractReadinessView((await params).candidateId, caseId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ candidateId: string }> }) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const caseId = typeof body.caseId === "string" ? body.caseId : "";
    return NextResponse.json(await saveCandidateContractReadinessSnapshot((await params).candidateId, caseId), { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ message: "JSON 요청 본문이 올바르지 않습니다." }, { status: 400 });
    return errorResponse(error);
  }
}
