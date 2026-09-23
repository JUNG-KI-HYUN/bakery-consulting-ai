import { NextResponse } from "next/server";
import { getConsultationById } from "@/lib/diagnosis/diagnosis-service";
import { parseFacilityObservations } from "@/lib/field/facility";
import { getFieldSurveyService } from "@/lib/field/field-survey-service.server";
import { isSiteSurveyId } from "@/lib/field/identifiers";
import { parseMeasurementSet } from "@/lib/field/measurement";
import {
  parseDeliveryPathObservation,
  parseProductionSalesSpaceObservation,
} from "@/lib/field/space-equipment";
import { isFieldInputStage } from "@/lib/field/stage-completion";
import { isSurveyStageId } from "@/lib/field/stages";
import type { SurveyStageId } from "@/lib/field/stages";
import type { SurveyStageState } from "@/lib/field/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; surveyId: string }> },
) {
  const { id, surveyId } = await params;
  if (!isSiteSurveyId(surveyId)) {
    return NextResponse.json({ message: "invalid surveyId", code: "INVALID_DATA" }, { status: 400 });
  }

  const record = await getConsultationById(id);
  if (!record) {
    return NextResponse.json({ message: "not found" }, { status: 404 });
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
    typeof body.expectedDraftVersion !== "number" ||
    !Number.isInteger(body.expectedDraftVersion) ||
    body.expectedDraftVersion < 1
  ) {
    return NextResponse.json(
      { message: "expectedDraftVersion required", code: "INVALID_DATA" },
      { status: 400 },
    );
  }

  let measurementSet: ReturnType<typeof parseMeasurementSet> extends infer T
    ? Exclude<T, null> | undefined
    : never;
  if (body.measurementSet !== undefined) {
    const parsed = parseMeasurementSet(body.measurementSet);
    if (!parsed) {
      return NextResponse.json(
        { message: "measurementSet invalid", code: "INVALID_DATA" },
        { status: 400 },
      );
    }
    measurementSet = parsed;
  }

  let facility: ReturnType<typeof parseFacilityObservations> extends infer T
    ? Exclude<T, null> | undefined
    : never;
  if (body.facility !== undefined) {
    const parsed = parseFacilityObservations(body.facility);
    if (!parsed) {
      return NextResponse.json({ message: "facility invalid", code: "INVALID_DATA" }, { status: 400 });
    }
    facility = parsed;
  }

  let productionSalesSpace: ReturnType<typeof parseProductionSalesSpaceObservation> extends infer T
    ? Exclude<T, null> | undefined
    : never;
  if (body.productionSalesSpace !== undefined) {
    const parsed = parseProductionSalesSpaceObservation(body.productionSalesSpace);
    if (!parsed) {
      return NextResponse.json(
        { message: "productionSalesSpace invalid", code: "INVALID_DATA" },
        { status: 400 },
      );
    }
    productionSalesSpace = parsed;
  }

  let deliveryPath: ReturnType<typeof parseDeliveryPathObservation> extends infer T
    ? Exclude<T, null> | undefined
    : never;
  if (body.deliveryPath !== undefined) {
    const parsed = parseDeliveryPathObservation(body.deliveryPath);
    if (!parsed) {
      return NextResponse.json(
        { message: "deliveryPath invalid", code: "INVALID_DATA" },
        { status: 400 },
      );
    }
    deliveryPath = parsed;
  }

  let completeStageIds: SurveyStageId[] | undefined;
  if (body.completeStageIds !== undefined) {
    if (!Array.isArray(body.completeStageIds)) {
      return NextResponse.json(
        { message: "completeStageIds invalid", code: "INVALID_DATA" },
        { status: 400 },
      );
    }
    completeStageIds = [];
    for (const item of body.completeStageIds) {
      if (typeof item !== "string" || !isSurveyStageId(item) || !isFieldInputStage(item)) {
        return NextResponse.json(
          { message: "completeStageIds invalid", code: "INVALID_DATA" },
          { status: 400 },
        );
      }
      completeStageIds.push(item);
    }
  }

  let touchStageIds: SurveyStageId[] | undefined;
  if (body.touchStageIds !== undefined) {
    if (!Array.isArray(body.touchStageIds)) {
      return NextResponse.json(
        { message: "touchStageIds invalid", code: "INVALID_DATA" },
        { status: 400 },
      );
    }
    touchStageIds = [];
    for (const item of body.touchStageIds) {
      if (typeof item !== "string" || !isSurveyStageId(item) || !isFieldInputStage(item)) {
        return NextResponse.json(
          { message: "touchStageIds invalid", code: "INVALID_DATA" },
          { status: 400 },
        );
      }
      touchStageIds.push(item);
    }
  }

  let stageStates: Partial<Record<SurveyStageId, SurveyStageState>> | undefined;
  if (body.stageStates !== undefined) {
    if (!isRecord(body.stageStates)) {
      return NextResponse.json(
        { message: "stageStates invalid", code: "INVALID_DATA" },
        { status: 400 },
      );
    }
    stageStates = {};
    for (const [key, value] of Object.entries(body.stageStates)) {
      if (!isSurveyStageId(key)) {
        return NextResponse.json(
          { message: "stageStates invalid", code: "INVALID_DATA" },
          { status: 400 },
        );
      }
      if (
        value !== "NOT_STARTED" &&
        value !== "IN_PROGRESS" &&
        value !== "COMPLETED" &&
        value !== "SKIPPED"
      ) {
        return NextResponse.json(
          { message: "stageStates invalid", code: "INVALID_DATA" },
          { status: 400 },
        );
      }
      stageStates[key] = value;
    }
  }

  const field = getFieldSurveyService();
  const loaded = await field.getSurvey(surveyId);
  if (!loaded.ok) {
    const status = loaded.code === "NOT_FOUND" ? 404 : loaded.code === "INVALID_DATA" ? 400 : 500;
    return NextResponse.json({ message: loaded.message, code: loaded.code }, { status });
  }
  if (loaded.value.consultationId && loaded.value.consultationId !== id) {
    return NextResponse.json({ message: "survey not in consultation", code: "INVALID_DATA" }, { status: 400 });
  }

  const updated = await field.updateSurveyDraft({
    surveyId,
    expectedDraftVersion: body.expectedDraftVersion,
    measurementSet,
    facility,
    productionSalesSpace,
    deliveryPath,
    stageStates: stageStates as never,
    completeStageIds,
    touchStageIds,
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

  return NextResponse.json({
    surveyId: updated.value.surveyId,
    draftVersion: updated.value.draftVersion,
    status: updated.value.status,
    stageStates: updated.value.stageStates,
    measurementSet: updated.value.measurementSet ?? null,
    facility: updated.value.facility ?? null,
    productionSalesSpace: updated.value.productionSalesSpace ?? null,
    deliveryPath: updated.value.deliveryPath ?? null,
    updatedAt: updated.value.updatedAt,
  });
}
