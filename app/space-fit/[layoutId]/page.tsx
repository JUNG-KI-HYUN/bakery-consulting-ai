import { notFound } from "next/navigation";
import { SpaceFitWorkspace } from "@/components/space-fit/SpaceFitWorkspace";
import { getEquipmentDefinitionService } from "@/lib/equipment/definition-service.server";
import type { EquipmentDefinition } from "@/lib/equipment/types";
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

  const equipmentService = getEquipmentDefinitionService();
  const listed = await equipmentService.listDefinitions();
  const catalog: EquipmentDefinition[] = listed.ok ? [...listed.value] : [];

  // Layout Instance에 연결된 Definition도 포함 (카탈로그에 없을 수 있음)
  const byId = new Map(catalog.map((item) => [item.equipmentDefinitionId, item]));
  for (const instance of loaded.value.equipmentInstances ?? []) {
    if (byId.has(instance.equipmentDefinitionId)) continue;
    const one = await equipmentService.getDefinition(instance.equipmentDefinitionId);
    if (one.ok) byId.set(one.value.equipmentDefinitionId, one.value);
  }
  const equipmentDefinitions = [...byId.values()];

  return (
    <SpaceFitWorkspace
      key={`${loaded.value.layoutId}-${loaded.value.layoutVersion}`}
      initialLayout={loaded.value}
      initialWarnings={validateLayoutGeometry(loaded.value, equipmentDefinitions)}
      initialEquipmentDefinitions={equipmentDefinitions}
      fieldContext={fieldContext}
    />
  );
}
