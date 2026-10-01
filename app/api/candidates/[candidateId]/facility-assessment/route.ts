import { NextResponse } from "next/server";
import {
  BakeryFacilityAssessmentReferenceError,
  BakeryFacilityAssessmentRepositoryError,
  BakeryFacilityAssessmentValidationError,
  createBakeryFacilityAssessment,
  getBakeryFacilityAssessment,
  updateBakeryFacilityAssessment,
} from "@/lib/candidates/bakery-facility-assessment-repository";

function errorResponse(error: unknown) {
  if (error instanceof BakeryFacilityAssessmentValidationError) return NextResponse.json({ message: error.message }, { status: 400 });
  if (error instanceof BakeryFacilityAssessmentReferenceError) return NextResponse.json({ message: error.message }, { status: error.status });
  if (error instanceof BakeryFacilityAssessmentRepositoryError) return NextResponse.json({ message: "시설검토 저장소를 처리하지 못했습니다." }, { status: 500 });
  return NextResponse.json({ message: "시설검토를 처리하지 못했습니다." }, { status: 500 });
}

export async function GET(request: Request, { params }: { params: Promise<{ candidateId: string }> }) {
  try {
    const caseId = new URL(request.url).searchParams.get("caseId") ?? "";
    const record = await getBakeryFacilityAssessment((await params).candidateId, caseId);
    return NextResponse.json(record);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ candidateId: string }> }) {
  try {
    const candidateId = (await params).candidateId;
    const body = await request.json() as Record<string, unknown>;
    return NextResponse.json(await createBakeryFacilityAssessment({ ...body, candidateId }), { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ message: "JSON 요청 본문이 올바르지 않습니다." }, { status: 400 });
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ candidateId: string }> }) {
  try {
    const candidateId = (await params).candidateId;
    const record = await updateBakeryFacilityAssessment(candidateId, await request.json());
    return record ? NextResponse.json(record) : NextResponse.json({ message: "시설검토를 찾을 수 없습니다." }, { status: 404 });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ message: "JSON 요청 본문이 올바르지 않습니다." }, { status: 400 });
    return errorResponse(error);
  }
}
