import { NextResponse } from "next/server";
import { getEquipmentDefinitionService } from "@/lib/equipment/definition-service.server";
import type { EquipmentDefinition, EquipmentInstance } from "@/lib/equipment/types";
import { getFieldSurveyService } from "@/lib/field/field-survey-service.server";
import { buildDecisionEvidenceBundle } from "@/lib/decision-evidence/build-bundle";
import { validateLayoutGeometry } from "@/lib/space-fit/element-geometry";
import { isLayoutId } from "@/lib/space-fit/identifiers";
import { getSpaceFitLayoutService } from "@/lib/space-fit/layout-service.server";
import { buildTechnicalCheckReport } from "@/lib/technical-check/build-report";

/**
 * GET only — derived Decision Evidence.
 * source mutation / persistence 파일 생성 없음.
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
  const productionSalesSpace = survey.ok
    ? (survey.value.productionSalesSpace ?? null)
    : null;

  const equipmentDefinitions = await loadDefinitionsForLayout(
    loaded.value.equipmentInstances,
  );
  const geometryWarnings = validateLayoutGeometry(loaded.value, equipmentDefinitions);
  const generatedAt = new Date().toISOString();
  const technicalCheck = buildTechnicalCheckReport({
    layout: loaded.value,
    definitions: equipmentDefinitions,
    facility,
    measurement: measurementSet,
    deliveryPath,
    generatedAt,
  });
  const decisionEvidence = buildDecisionEvidenceBundle({
    layout: loaded.value,
    definitions: equipmentDefinitions,
    geometryWarnings,
    facility,
    measurement: measurementSet,
    productionSalesSpace,
    deliveryPath,
    technicalReport: technicalCheck,
    generatedAt,
  });

  return NextResponse.json({
    decisionEvidence,
    technicalCheck,
    geometryWarnings,
  });
}
