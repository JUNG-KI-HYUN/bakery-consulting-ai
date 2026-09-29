import { NextResponse } from "next/server";
import {
  CaseValidationError,
  getCase,
  updateCase,
} from "@/lib/cases/case-repository";

function storageError() {
  return NextResponse.json(
    { message: "Case 저장소를 처리하지 못했습니다." },
    { status: 500 },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  try {
    const { caseId } = await params;
    const record = await getCase(caseId);
    return record
      ? NextResponse.json(record)
      : NextResponse.json({ message: "Case를 찾을 수 없습니다." }, { status: 404 });
  } catch {
    return storageError();
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  try {
    const { caseId } = await params;
    const record = await updateCase(caseId, await request.json());
    return record
      ? NextResponse.json(record)
      : NextResponse.json({ message: "Case를 찾을 수 없습니다." }, { status: 404 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: "JSON 요청 본문이 올바르지 않습니다." }, { status: 400 });
    }
    if (error instanceof CaseValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return storageError();
  }
}
