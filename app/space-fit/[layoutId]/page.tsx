import { notFound } from "next/navigation";
import { SpaceFitWorkspace } from "@/components/space-fit/SpaceFitWorkspace";
import { getFieldSurveyService } from "@/lib/field/field-survey-service.server";
import { validateLayoutGeometry } from "@/lib/space-fit/element-geometry";
import { isLayoutId } from "@/lib/space-fit/identifiers";
import { getSpaceFitLayoutService } from "@/lib/space-fit/layout-service.server";

export default async function SpaceFitLayoutPage({
  params,
}: {
  params: Promise<{ layoutId: string }>;
}) {
  const { layoutId } = await params;
  if (!isLayoutId(layoutId)) return notFound();

  const spaceFit = getSpaceFitLayoutService();
  const loaded = await spaceFit.getLayout(layoutId);
  if (!loaded.ok) return notFound();

  const field = getFieldSurveyService();
  const survey = await field.getSurvey(loaded.value.surveyId);
  const fieldContext = {
    surveySequence: survey.ok ? survey.value.surveySequence : null,
    measurementSet: survey.ok ? (survey.value.measurementSet ?? null) : null,
    productionSalesSpace: survey.ok ? (survey.value.productionSalesSpace ?? null) : null,
    deliveryPath: survey.ok ? (survey.value.deliveryPath ?? null) : null,
  };

  return (
    <SpaceFitWorkspace
      key={`${loaded.value.layoutId}-${loaded.value.layoutVersion}`}
      initialLayout={loaded.value}
      initialWarnings={validateLayoutGeometry(loaded.value)}
      fieldContext={fieldContext}
    />
  );
}
