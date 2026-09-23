import { NextResponse } from "next/server";
import { getEquipmentDefinitionService } from "@/lib/equipment/definition-service.server";
import {
  createEquipmentDefinition,
  createKnownEquipmentMm,
  createUnknownEquipmentDimension,
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_DATA_STATUSES,
  EQUIPMENT_SOURCE_TYPES,
  type EquipmentCategory,
  type EquipmentDataStatus,
  type EquipmentSourceType,
} from "@/lib/equipment/types";
import { parseEquipmentDefinition } from "@/lib/equipment/validation";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET() {
  const service = getEquipmentDefinitionService();
  const listed = await service.listDefinitions();
  if (!listed.ok) {
    const status = listed.code === "INVALID_DATA" ? 400 : 500;
    return NextResponse.json({ message: listed.message, code: listed.code }, { status });
  }
  return NextResponse.json({ definitions: listed.value });
}

/**
 * Definition 생성/저장.
 * SAMPLE→VERIFIED 자동승격 없음. VERIFIED는 기본조건 검증.
 */
export async function POST(req: Request) {
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
    typeof body.category !== "string" ||
    !EQUIPMENT_CATEGORIES.includes(body.category as EquipmentCategory)
  ) {
    return NextResponse.json({ message: "category invalid", code: "INVALID_DATA" }, { status: 400 });
  }
  if (typeof body.name !== "string" || body.name.trim() === "") {
    return NextResponse.json({ message: "name required", code: "INVALID_DATA" }, { status: 400 });
  }
  if (
    typeof body.dataStatus !== "string" ||
    !EQUIPMENT_DATA_STATUSES.includes(body.dataStatus as EquipmentDataStatus)
  ) {
    return NextResponse.json({ message: "dataStatus invalid", code: "INVALID_DATA" }, { status: 400 });
  }

  const now = new Date().toISOString();
  let widthMm;
  let depthMm;
  let heightMm;
  try {
    if (body.widthStatus === "UNKNOWN") widthMm = createUnknownEquipmentDimension();
    else if (body.widthMm !== undefined && body.widthMm !== "")
      widthMm = createKnownEquipmentMm(Number(body.widthMm));
    if (body.depthStatus === "UNKNOWN") depthMm = createUnknownEquipmentDimension();
    else if (body.depthMm !== undefined && body.depthMm !== "")
      depthMm = createKnownEquipmentMm(Number(body.depthMm));
    if (body.heightStatus === "UNKNOWN") heightMm = createUnknownEquipmentDimension();
    else if (body.heightMm !== undefined && body.heightMm !== "")
      heightMm = createKnownEquipmentMm(Number(body.heightMm));
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "dimension invalid",
        code: "INVALID_DATA",
      },
      { status: 400 },
    );
  }

  let source;
  if (body.sourceType) {
    if (
      typeof body.sourceType !== "string" ||
      !EQUIPMENT_SOURCE_TYPES.includes(body.sourceType as EquipmentSourceType)
    ) {
      return NextResponse.json({ message: "sourceType invalid", code: "INVALID_DATA" }, { status: 400 });
    }
    source = {
      sourceType: body.sourceType as EquipmentSourceType,
      ...(typeof body.sourceLabel === "string" && body.sourceLabel.trim()
        ? { sourceLabel: body.sourceLabel.trim() }
        : {}),
      ...(typeof body.sourceReference === "string" && body.sourceReference.trim()
        ? { sourceReference: body.sourceReference.trim() }
        : {}),
      ...(typeof body.verifiedBy === "string" && body.verifiedBy.trim()
        ? { verifiedBy: body.verifiedBy.trim() }
        : {}),
      ...(typeof body.sourceVerifiedAt === "string" && body.sourceVerifiedAt.trim()
        ? { verifiedAt: body.sourceVerifiedAt.trim() }
        : {}),
    };
  }

  let definition;
  try {
    definition = createEquipmentDefinition({
      category: body.category as EquipmentCategory,
      name: body.name,
      dataStatus: body.dataStatus as EquipmentDataStatus,
      createdAt: now,
      ...(typeof body.manufacturer === "string" ? { manufacturer: body.manufacturer } : {}),
      ...(typeof body.model === "string" ? { model: body.model } : {}),
      dimensions: {
        ...(widthMm ? { widthMm } : {}),
        ...(depthMm ? { depthMm } : {}),
        ...(heightMm ? { heightMm } : {}),
      },
      ...(body.rotationAllowed === true || body.rotationAllowed === false
        ? { rotationAllowed: body.rotationAllowed }
        : {}),
      ...(body.electricalRequired === true ||
      body.electricalRequired === false ||
      body.electricalRequired === "UNKNOWN"
        ? {
            electricalRequirement: {
              required: body.electricalRequired,
              ...(body.powerKw === "" || body.powerKw === undefined
                ? {}
                : body.powerKw === null
                  ? { powerKw: null }
                  : { powerKw: Number(body.powerKw) }),
            },
          }
        : {}),
      ...(source ? { source } : {}),
      ...(typeof body.verifiedAt === "string" && body.verifiedAt.trim()
        ? { verifiedAt: body.verifiedAt.trim() }
        : {}),
      ...(typeof body.limitation === "string" ? { limitation: body.limitation } : {}),
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "create failed",
        code: "INVALID_DATA",
      },
      { status: 400 },
    );
  }

  const validated = parseEquipmentDefinition(definition);
  if (!validated) {
    return NextResponse.json(
      { message: "EquipmentDefinition failed validation", code: "INVALID_DATA" },
      { status: 400 },
    );
  }

  const service = getEquipmentDefinitionService();
  const saved = await service.saveDefinition(validated);
  if (!saved.ok) {
    const status = saved.code === "INVALID_DATA" ? 400 : 500;
    return NextResponse.json({ message: saved.message, code: saved.code }, { status });
  }
  return NextResponse.json({ definition: saved.value });
}
