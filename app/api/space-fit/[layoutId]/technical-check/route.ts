import { NextResponse } from "next/server";
import { getEquipmentDefinitionService } from "@/lib/equipment/definition-service.server";
import type { EquipmentDefinition, EquipmentInstance } from "@/lib/equipment/types";
import { getFieldSurveyService } from "@/lib/field/field-survey-service.server";
import { isLayoutId } from "@/lib/space-fit/identifiers";
import { getSpaceFitLayoutService } from "@/lib/space-fit/layout-service.server";
import { validateLayoutGeometry } from "@/lib/space-fit/element-geometry";
import { buildTechnicalCheckReport } from "@/lib/technical-check/build-report";

/**
 * GET only — derived Technical Check.
 * runtime data를 생성/수정하지 않는다. persistence 파일 없음.
 */
async function loadDefinitionsForLayout(
  instances: readonly EquipmentInstance[] | undefined,
): Promise<EquipmentDefinition[]> {
  if (!instances || instances.length === 0) return [];
  const service = getEquipmentDefinitionService();
  const definitions: EquipmentDefinition[] = [];
  const seen = new Set<string>();
  for (const instance of instances) {
    if (seen.has(instance.equipmentDefinitionId)) continue;
    seen.add(instance.equipmentDefinitionId);
    const loaded = await service.getDefinition(instance.equipmentDefinitionId);
    if (loaded.ok) definitions.push(loaded.value);
  }
  return definitions;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ layoutId: string }> },
) {
  const { layoutId } = await params;
  if (!isLayoutId(layoutId)) {
    return NextResponse.json({ message: "invalid layoutId", code: "INVALID_DATA" }, { status: 400 });
  }

  const spaceFit = getSpaceFitLayoutService();
  const loaded = await spaceFit.getLayout(layoutId);
  if (!loaded.ok) {
    const status =
      loaded.code === "NOT_FOUND" ? 404 : loaded.code === "INVALID_DATA" ? 400 : 500;
    return NextResponse.json({ message: loaded.message, code: loaded.code }, { status });
  }

  const field = getFieldSurveyService();
  const survey = await field.getSurvey(loaded.value.surveyId);
  const facility = survey.ok ? (survey.value.facility ?? null) : null;
  const measurementSet = survey.ok ? (survey.value.measurementSet ?? null) : null;
  const deliveryPath = survey.ok ? (survey.value.deliveryPath ?? null) : null;

  const equipmentDefinitions = await loadDefinitionsForLayout(
    loaded.value.equipmentInstances,
  );

  const technicalCheck = buildTechnicalCheckReport({
    layout: loaded.value,
    definitions: equipmentDefinitions,
    facility,
    measurement: measurementSet,
    deliveryPath,
    generatedAt: new Date().toISOString(),
  });

  return NextResponse.json({
    technicalCheck,
    geometryWarnings: validateLayoutGeometry(loaded.value, equipmentDefinitions),
  });
}
