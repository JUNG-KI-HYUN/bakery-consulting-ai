import { NextResponse } from "next/server";
import { getConsultationById } from "@/lib/diagnosis/diagnosis-service";
import { getFieldSurveyService } from "@/lib/field/field-survey-service.server";
import { isSiteSurveyId } from "@/lib/field/identifiers";
import { getSpaceFitLayoutService } from "@/lib/space-fit/layout-service.server";

/**
 * 기존 Layout 조회만. 없으면 null.
 * GET으로 Layout을 생성하지 않는다.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; surveyId: string }> },
) {
  const { id, surveyId } = await params;
  if (!isSiteSurveyId(surveyId)) {
    return NextResponse.json({ message: "invalid surveyId", code: "INVALID_DATA" }, { status: 400 });
  }

  const record = await getConsultationById(id);
  if (!record) {
    return NextResponse.json({ message: "not found" }, { status: 404 });
  }

  const field = getFieldSurveyService();
  const survey = await field.getSurvey(surveyId);
  if (!survey.ok) {
    const status = survey.code === "NOT_FOUND" ? 404 : survey.code === "INVALID_DATA" ? 400 : 500;
    return NextResponse.json({ message: survey.message, code: survey.code }, { status });
  }
  if (survey.value.consultationId && survey.value.consultationId !== id) {
    return NextResponse.json({ message: "survey not in consultation", code: "INVALID_DATA" }, { status: 400 });
  }

  const spaceFit = getSpaceFitLayoutService();
  const found = await spaceFit.findActiveLayoutForSurvey(surveyId);
  if (!found.ok) {
    const status = found.code === "INVALID_DATA" ? 400 : 500;
    return NextResponse.json({ message: found.message, code: found.code }, { status });
  }

  return NextResponse.json({
    layoutId: found.value?.layoutId ?? null,
    layoutVersion: found.value?.layoutVersion ?? null,
  });
}
