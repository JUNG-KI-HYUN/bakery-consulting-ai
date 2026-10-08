import { NextResponse } from "next/server";
import {
  CandidateEconomicSelectionReferenceError,
  CandidateEconomicSelectionRepositoryError,
  getCandidateEconomicSelectionView,
  saveCandidateEconomicSelection,
} from "@/lib/candidates/candidate-economic-selection-repository";

function errorResponse(error: unknown) {
  if (error instanceof CandidateEconomicSelectionReferenceError) return NextResponse.json({ message: error.message }, { status: error.status });
  if (error instanceof CandidateEconomicSelectionRepositoryError) return NextResponse.json({ message: "Economic 선택 저장소를 처리하지 못했습니다." }, { status: 500 });
  return NextResponse.json({ message: "Economic version 선택을 처리하지 못했습니다." }, { status: 500 });
}

export async function GET(request: Request, { params }: { params: Promise<{ candidateId: string }> }) {
  try {
    const caseId = new URL(request.url).searchParams.get("caseId") ?? "";
    return NextResponse.json(await getCandidateEconomicSelectionView((await params).candidateId, caseId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ candidateId: string }> }) {
  try {
    return NextResponse.json(await saveCandidateEconomicSelection((await params).candidateId, await request.json()));
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ message: "JSON 요청 본문이 올바르지 않습니다." }, { status: 400 });
    return errorResponse(error);
  }
}
