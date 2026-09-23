import { NextResponse } from "next/server";
import { getConsultationById } from "@/lib/diagnosis/diagnosis-service";
import { getEquipmentDefinitionService } from "@/lib/equipment/definition-service.server";
import { parseEquipmentInstance } from "@/lib/equipment/validation";
import type { EquipmentDefinition, EquipmentInstance } from "@/lib/equipment/types";
import { getFieldSurveyService } from "@/lib/field/field-survey-service.server";
import { isLayoutId } from "@/lib/space-fit/identifiers";
import { parseRoomElement } from "@/lib/space-fit/layout-record";
import { getSpaceFitLayoutService } from "@/lib/space-fit/layout-service.server";
import { validateLayoutGeometry } from "@/lib/space-fit/element-geometry";
import type { RoomElement } from "@/lib/space-fit/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

  let measurementSet = null;
  let productionSalesSpace = null;
  let deliveryPath = null;
  let facility = null;
  let surveySequence: number | null = null;
  const field = getFieldSurveyService();
  const survey = await field.getSurvey(loaded.value.surveyId);
  if (survey.ok) {
    surveySequence = survey.value.surveySequence;
    measurementSet = survey.value.measurementSet ?? null;
    productionSalesSpace = survey.value.productionSalesSpace ?? null;
    deliveryPath = survey.value.deliveryPath ?? null;
    facility = survey.value.facility ?? null;
  }

  const equipmentDefinitions = await loadDefinitionsForLayout(
    loaded.value.equipmentInstances,
  );

  return NextResponse.json({
    layout: loaded.value,
    geometryWarnings: validateLayoutGeometry(loaded.value, equipmentDefinitions),
    equipmentDefinitions,
    fieldContext: {
      surveySequence,
      measurementSet,
      productionSalesSpace,
      deliveryPath,
      facility,
    },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ layoutId: string }> },
) {
  const { layoutId } = await params;
  if (!isLayoutId(layoutId)) {
    return NextResponse.json({ message: "invalid layoutId", code: "INVALID_DATA" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "invalid JSON", code: "INVALID_DATA" }, { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json({ message: "body must be object", code: "INVALID_DATA" }, { status: 400 });
  }
  if (
    typeof body.expectedLayoutVersion !== "number" ||
    !Number.isInteger(body.expectedLayoutVersion) ||
    body.expectedLayoutVersion < 1
  ) {
    return NextResponse.json(
      { message: "expectedLayoutVersion required", code: "INVALID_DATA" },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.elements)) {
    return NextResponse.json({ message: "elements required", code: "INVALID_DATA" }, { status: 400 });
  }

  const elements: RoomElement[] = [];
  for (const item of body.elements) {
    const parsed = parseRoomElement(item);
    if (!parsed) {
      return NextResponse.json(
        { message: "elements contain invalid geometry", code: "INVALID_DATA" },
        { status: 400 },
      );
    }
    elements.push(parsed);
  }

  let equipmentInstances: EquipmentInstance[] | undefined;
  if (body.equipmentInstances !== undefined) {
    if (!Array.isArray(body.equipmentInstances)) {
      return NextResponse.json(
        { message: "equipmentInstances invalid", code: "INVALID_DATA" },
        { status: 400 },
      );
    }
    equipmentInstances = [];
    for (const item of body.equipmentInstances) {
      const parsed = parseEquipmentInstance(item);
      if (!parsed) {
        return NextResponse.json(
          { message: "equipmentInstances contain invalid data", code: "INVALID_DATA" },
          { status: 400 },
        );
      }
      equipmentInstances.push(parsed);
    }
  }

  const spaceFit = getSpaceFitLayoutService();
  const updated = await spaceFit.updateLayout({
    layoutId,
    expectedLayoutVersion: body.expectedLayoutVersion,
    elements,
    equipmentInstances,
  });
  if (!updated.ok) {
    const status =
      updated.code === "VERSION_CONFLICT"
        ? 409
        : updated.code === "INVALID_DATA"
          ? 400
          : updated.code === "NOT_FOUND"
            ? 404
            : 500;
    return NextResponse.json({ message: updated.message, code: updated.code }, { status });
  }

  if (updated.value.consultationId) {
    const record = await getConsultationById(updated.value.consultationId);
    if (!record) {
      return NextResponse.json({ message: "consultation not found", code: "NOT_FOUND" }, { status: 404 });
    }
  }

  const equipmentDefinitions = await loadDefinitionsForLayout(
    updated.value.equipmentInstances,
  );

  return NextResponse.json({
    layout: updated.value,
    geometryWarnings: validateLayoutGeometry(updated.value, equipmentDefinitions),
    equipmentDefinitions,
  });
}
