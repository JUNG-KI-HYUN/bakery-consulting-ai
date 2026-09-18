import { NextResponse } from "next/server";
import { getConsultationById } from "@/lib/diagnosis/diagnosis-service";
import { getFieldSurveyService } from "@/lib/field/field-survey-service.server";
import { resolveCandidateStoreReference } from "@/lib/field/candidate-store-ref";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const record = await getConsultationById(id);
  if (!record) {
    return NextResponse.json({ message: "not found" }, { status: 404 });
  }

  const reference = resolveCandidateStoreReference(record);
  const existingCandidateStoreId =
    reference.resolution === "explicit" ? reference.candidateStoreId : null;
  const field = getFieldSurveyService();
  const link = await field.ensureLink({
    consultationId: id,
    existingCandidateStoreId,
  });
  if (!link.ok) {
    const status = link.code === "INVALID_DATA" ? 400 : 500;
    return NextResponse.json({ message: link.message, code: link.code }, { status });
  }

  const started = await field.startSurvey({
    consultationId: id,
    candidateStoreId: link.value.candidateStoreId,
  });
  if (!started.ok) {
    const status = started.code === "INVALID_DATA" ? 400 : 500;
    return NextResponse.json({ message: started.message, code: started.code }, { status });
  }

  return NextResponse.json({
    candidateStoreId: started.value.survey.candidateStoreId,
    surveyId: started.value.survey.surveyId,
    surveySequence: started.value.survey.surveySequence,
    created: started.value.created,
  });
}
