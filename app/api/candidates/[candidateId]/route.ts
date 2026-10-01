import { NextResponse } from "next/server";
import {
  CandidateStoreRepositoryError,
  CandidateStoreValidationError,
  getCandidateStore,
  updateCandidateStore,
} from "@/lib/candidates/candidate-repository";

function storageError() {
  return NextResponse.json({ message: "Candidate Store 저장소를 처리하지 못했습니다." }, { status: 500 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const record = await getCandidateStore((await params).candidateId);
    return record
      ? NextResponse.json(record)
      : NextResponse.json({ message: "후보점포를 찾을 수 없습니다." }, { status: 404 });
  } catch {
    return storageError();
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const record = await updateCandidateStore((await params).candidateId, await request.json());
    return record
      ? NextResponse.json(record)
      : NextResponse.json({ message: "후보점포를 찾을 수 없습니다." }, { status: 404 });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ message: "JSON 요청 본문이 올바르지 않습니다." }, { status: 400 });
    if (error instanceof CandidateStoreValidationError) return NextResponse.json({ message: error.message }, { status: 400 });
    if (error instanceof CandidateStoreRepositoryError) return storageError();
    return storageError();
  }
}
