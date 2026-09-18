import { notFound } from "next/navigation";
import { FieldSurveyGate } from "@/components/field/FieldSurveyGate";
import { FieldTabletShell } from "@/components/field/FieldTabletShell";
import { getConsultationById } from "@/lib/diagnosis/diagnosis-service";
import { resolveCandidateStoreReference } from "@/lib/field/candidate-store-ref";
import { getFieldSurveyService } from "@/lib/field/field-survey-service.server";
import { isSiteSurveyId } from "@/lib/field/identifiers";
import { buildFieldTabletView } from "@/lib/field/tablet-view";

export default async function ConsultationFieldPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ surveyId?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const record = await getConsultationById(id);
  if (!record) return notFound();

  const field = getFieldSurveyService();
  const linkResult = await field.readLink(id);
  const linkedCandidateStoreId = linkResult.ok ? (linkResult.value?.candidateStoreId ?? null) : null;
  const recordReference = resolveCandidateStoreReference(record);
  const candidateStoreId =
    recordReference.resolution === "explicit"
      ? recordReference.candidateStoreId
      : linkedCandidateStoreId;

  const requestedSurveyId = Array.isArray(query.surveyId) ? query.surveyId[0] : query.surveyId;
  if (requestedSurveyId) {
    if (!isSiteSurveyId(requestedSurveyId)) return notFound();
    const loaded = await field.getSurvey(requestedSurveyId);
    if (!loaded.ok) return notFound();
    if (loaded.value.consultationId && loaded.value.consultationId !== id) return notFound();
    if (candidateStoreId && loaded.value.candidateStoreId !== candidateStoreId) return notFound();
    return (
      <FieldTabletShell
        view={buildFieldTabletView(record, {
          survey: loaded.value,
          linkedCandidateStoreId,
        })}
      />
    );
  }

  const active =
    candidateStoreId === null
      ? { ok: true as const, value: null }
      : await field.findActiveSurveyForCandidateStore(candidateStoreId);
  if (active.ok && active.value) {
    return (
      <FieldSurveyGate
        consultationId={id}
        mode="continue"
        surveyId={active.value.surveyId}
        surveySequence={active.value.surveySequence}
      />
    );
  }

  return <FieldSurveyGate consultationId={id} mode="start" />;
}
