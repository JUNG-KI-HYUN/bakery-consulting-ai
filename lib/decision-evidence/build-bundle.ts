/**
 * buildDecisionEvidenceBundle — pure derived integration.
 * source Domain을 mutation하지 않는다. persistence 없음.
 */

import type { EquipmentDefinition } from "../equipment/types";
import type { FacilityObservations } from "../field/facility";
import type { MeasurementSet } from "../field/measurement";
import type {
  DeliveryPathObservation,
  ProductionSalesSpaceObservation,
} from "../field/space-equipment";
import type { GeometryWarning } from "../space-fit/geometry";
import type { SpaceFitLayout } from "../space-fit/types";
import { buildTechnicalCheckReport } from "../technical-check/build-report";
import type { TechnicalCheckReport } from "../technical-check/types";
import { buildEquipmentDataTrustEvidence } from "./equipment-adapter";
import { buildFieldDecisionEvidence } from "./field-adapter";
import { buildGeometryDecisionEvidence } from "./geometry-adapter";
import { dedupeById, sortDecisionEvidenceItems } from "./helpers";
import { buildTechnicalDecisionEvidence } from "./technical-adapter";
import {
  DECISION_EVIDENCE_DISCLAIMER,
  DECISION_EVIDENCE_SCHEMA_VERSION,
  type DecisionEvidenceBundle,
  type DecisionEvidenceItem,
  type DecisionEvidenceSummaryCounts,
} from "./types";

function summarize(items: {
  observedFacts: readonly DecisionEvidenceItem[];
  observedConstraints: readonly DecisionEvidenceItem[];
  missingInformation: readonly DecisionEvidenceItem[];
  expertReviewItems: readonly DecisionEvidenceItem[];
  geometryIssues: readonly DecisionEvidenceItem[];
}): DecisionEvidenceSummaryCounts {
  return Object.freeze({
    observedFacts: items.observedFacts.length,
    observedConstraints: items.observedConstraints.length,
    missingInformation: items.missingInformation.length,
    expertReviewItems: items.expertReviewItems.length,
    geometryIssues: items.geometryIssues.length,
    coreMissing: items.missingInformation.filter((item) => item.importance === "CORE").length,
  });
}

export function buildDecisionEvidenceBundle(input: {
  layout: SpaceFitLayout;
  definitions: ReadonlyMap<string, EquipmentDefinition> | ReadonlyArray<EquipmentDefinition>;
  geometryWarnings: readonly GeometryWarning[];
  facility?: FacilityObservations | null;
  measurement?: MeasurementSet | null;
  productionSalesSpace?: ProductionSalesSpaceObservation | null;
  deliveryPath?: DeliveryPathObservation | null;
  technicalReport?: TechnicalCheckReport | null;
  generatedAt: string;
}): DecisionEvidenceBundle {
  const technicalReport =
    input.technicalReport ??
    buildTechnicalCheckReport({
      layout: input.layout,
      definitions: input.definitions,
      facility: input.facility,
      measurement: input.measurement,
      deliveryPath: input.deliveryPath,
      generatedAt: input.generatedAt,
    });

  const field = buildFieldDecisionEvidence({
    measurement: input.measurement,
    facility: input.facility,
    productionSalesSpace: input.productionSalesSpace,
    deliveryPath: input.deliveryPath,
  });
  const geometry = buildGeometryDecisionEvidence(input.geometryWarnings);
  const technical = buildTechnicalDecisionEvidence(technicalReport);
  const equipment = buildEquipmentDataTrustEvidence({
    instances: input.layout.equipmentInstances ?? [],
    definitions: input.definitions,
  });

  // Geometry는 geometryIssues에만 — observedConstraints에 중복하지 않음
  const observedFacts = sortDecisionEvidenceItems(
    dedupeById([...field.observedFacts, ...equipment.observedFacts]),
  );
  const observedConstraints = sortDecisionEvidenceItems(
    dedupeById([...technical.observedConstraints]),
  );
  const missingInformation = sortDecisionEvidenceItems(
    dedupeById([
      ...field.missingInformation,
      ...technical.missingInformation,
      ...equipment.missingInformation,
    ]),
  );
  const expertReviewItems = sortDecisionEvidenceItems(
    dedupeById([...field.expertReviewItems, ...technical.expertReviewItems]),
  );
  const geometryIssues = sortDecisionEvidenceItems(dedupeById(geometry.geometryIssues));

  return Object.freeze({
    schemaVersion: DECISION_EVIDENCE_SCHEMA_VERSION,
    candidateStoreId: input.layout.candidateStoreId,
    surveyId: input.layout.surveyId,
    layoutId: input.layout.layoutId,
    generatedAt: input.generatedAt,
    observedFacts,
    observedConstraints,
    missingInformation,
    expertReviewItems,
    geometryIssues,
    summary: summarize({
      observedFacts,
      observedConstraints,
      missingInformation,
      expertReviewItems,
      geometryIssues,
    }),
    disclaimer: DECISION_EVIDENCE_DISCLAIMER,
    createsVerdict: false as const,
    createsScore: false as const,
    createsRisk: false as const,
  });
}
