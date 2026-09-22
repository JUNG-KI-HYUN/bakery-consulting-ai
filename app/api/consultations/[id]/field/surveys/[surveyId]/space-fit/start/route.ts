import { NextResponse } from "next/server";
import { getConsultationById } from "@/lib/diagnosis/diagnosis-service";
import { getFieldSurveyService } from "@/lib/field/field-survey-service.server";
import { isSiteSurveyId } from "@/lib/field/identifiers";
import { getSpaceFitLayoutService } from "@/lib/space-fit/layout-service.server";

/**
 * 명시적 SPACE FIT 시작.
 * GET으로 Layout을 만들지 않는다. Survey당 active Layout 1개 재사용.
 */
export async function POST(
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
  if (!survey.value.measurementSet) {
    return NextResponse.json(
      {
        message:
          "공간 실측정보가 필요합니다. FIELD 실측·구조에서 내부 가로와 깊이를 먼저 확인해 주세요.",
        code: "MISSING_ROOM_DIMENSIONS",
      },
      { status: 400 },
    );
  }

  const spaceFit = getSpaceFitLayoutService();
  const started = await spaceFit.startLayout({
    measurement: survey.value.measurementSet,
    consultationId: id,
  });
  if (!started.ok) {
    const status =
      started.code === "INVALID_DATA"
        ? 400
        : started.code === "NOT_FOUND"
          ? 404
          : 500;
    return NextResponse.json({ message: started.message, code: started.code }, { status });
  }

  return NextResponse.json({
    layoutId: started.value.layout.layoutId,
    layoutVersion: started.value.layout.layoutVersion,
    created: started.value.created,
    surveyId: started.value.layout.surveyId,
    measurementId: started.value.layout.measurementId,
    candidateStoreId: started.value.layout.candidateStoreId,
  });
}
