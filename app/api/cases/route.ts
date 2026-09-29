import { NextResponse } from "next/server";
import {
  CaseValidationError,
  createCase,
  listCases,
} from "@/lib/cases/case-repository";

function storageError() {
  return NextResponse.json(
    { message: "Case 저장소를 처리하지 못했습니다." },
    { status: 500 },
  );
}

export async function GET() {
  try {
    return NextResponse.json(await listCases());
  } catch {
    return storageError();
  }
}

export async function POST(request: Request) {
  try {
    const record = await createCase(await request.json());
    return NextResponse.json(record, { status: 201 });
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
