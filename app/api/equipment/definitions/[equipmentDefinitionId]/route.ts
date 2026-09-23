import { NextResponse } from "next/server";
import { getEquipmentDefinitionService } from "@/lib/equipment/definition-service.server";
import { isEquipmentDefinitionId } from "@/lib/equipment/identifiers";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ equipmentDefinitionId: string }> },
) {
  const { equipmentDefinitionId } = await params;
  if (!isEquipmentDefinitionId(equipmentDefinitionId)) {
    return NextResponse.json(
      { message: "invalid equipmentDefinitionId", code: "INVALID_DATA" },
      { status: 400 },
    );
  }
  const service = getEquipmentDefinitionService();
  const loaded = await service.getDefinition(equipmentDefinitionId);
  if (!loaded.ok) {
    const status =
      loaded.code === "NOT_FOUND" ? 404 : loaded.code === "INVALID_DATA" ? 400 : 500;
    return NextResponse.json({ message: loaded.message, code: loaded.code }, { status });
  }
  return NextResponse.json({ definition: loaded.value });
}
