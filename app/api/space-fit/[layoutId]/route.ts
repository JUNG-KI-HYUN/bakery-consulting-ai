import { NextResponse } from "next/server";
import { getConsultationById } from "@/lib/diagnosis/diagnosis-service";
import { getFieldSurveyService } from "@/lib/field/field-survey-service.server";
import { isLayoutId } from "@/lib/space-fit/identifiers";
import { parseRoomElement } from "@/lib/space-fit/layout-record";
import { getSpaceFitLayoutService } from "@/lib/space-fit/layout-service.server";
import { validateLayoutGeometry } from "@/lib/space-fit/element-geometry";
import type { RoomElement } from "@/lib/space-fit/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

  // Field context (read-only) — Layout JSON에 복제하지 않음
  let measurementSet = null;
  let productionSalesSpace = null;
  let deliveryPath = null;
  let surveySequence: number | null = null;
  const field = getFieldSurveyService();
  const survey = await field.getSurvey(loaded.value.surveyId);
  if (survey.ok) {
    surveySequence = survey.value.surveySequence;
    measurementSet = survey.value.measurementSet ?? null;
    productionSalesSpace = survey.value.productionSalesSpace ?? null;
    deliveryPath = survey.value.deliveryPath ?? null;
  }

  return NextResponse.json({
    layout: loaded.value,
    geometryWarnings: validateLayoutGeometry(loaded.value),
    fieldContext: {
      surveySequence,
      measurementSet,
      productionSalesSpace,
      deliveryPath,
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

  const spaceFit = getSpaceFitLayoutService();
  const updated = await spaceFit.updateLayout({
    layoutId,
    expectedLayoutVersion: body.expectedLayoutVersion,
    elements,
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

  // consultation ownership soft-check when present
  if (updated.value.consultationId) {
    const record = await getConsultationById(updated.value.consultationId);
    if (!record) {
      return NextResponse.json({ message: "consultation not found", code: "NOT_FOUND" }, { status: 404 });
    }
  }

  return NextResponse.json({
    layout: updated.value,
    geometryWarnings: validateLayoutGeometry(updated.value),
  });
}
