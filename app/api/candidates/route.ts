import { NextResponse } from "next/server";
import {
  CandidateStoreReferenceError,
  CandidateStoreRepositoryError,
  CandidateStoreValidationError,
  createCandidateStore,
  listCandidateStoresByCase,
} from "@/lib/candidates/candidate-repository";

function storageError() {
  return NextResponse.json({ message: "Candidate Store 저장소를 처리하지 못했습니다." }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const caseId = new URL(request.url).searchParams.get("caseId")?.trim();
    if (!caseId) return NextResponse.json({ message: "caseId가 필요합니다." }, { status: 400 });
    return NextResponse.json(await listCandidateStoresByCase(caseId));
  } catch {
    return storageError();
  }
}

export async function POST(request: Request) {
  try {
    return NextResponse.json(await createCandidateStore(await request.json()), { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ message: "JSON 요청 본문이 올바르지 않습니다." }, { status: 400 });
    if (error instanceof CandidateStoreReferenceError) return NextResponse.json({ message: error.message }, { status: error.status });
    if (error instanceof CandidateStoreValidationError) return NextResponse.json({ message: error.message }, { status: 400 });
    if (error instanceof CandidateStoreRepositoryError) return storageError();
    return storageError();
  }
}
