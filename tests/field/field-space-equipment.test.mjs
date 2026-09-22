import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const loadModule = createRequire(import.meta.url);
const previousLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "server-only") return {};
  return previousLoad.call(this, request, parent, isMain);
};
const previousLoader = loadModule.extensions[".ts"];
loadModule.extensions[".ts"] = (module, filename) => {
  const originalRequire = module.require.bind(module);
  module.require = (specifier) =>
    originalRequire(
      specifier.startsWith("@/") ? path.join(repositoryRoot, specifier.slice(2)) : specifier,
    );
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
};
after(() => {
  Module._load = previousLoad;
  if (previousLoader) loadModule.extensions[".ts"] = previousLoader;
  else delete loadModule.extensions[".ts"];
});

const {
  createDefaultDeliveryPath,
  createDefaultProductionSalesSpace,
  formatMeasurementMmDisplay,
  parseDeliveryPathObservation,
  parseProductionSalesSpaceObservation,
  spaceObservationIsNotAutoVerified,
} = loadModule(path.join(repositoryRoot, "lib/field/space-equipment.ts"));
const { createFieldEvidenceMeta } = loadModule(
  path.join(repositoryRoot, "lib/field/field-evidence-meta.ts"),
);
const { canCompleteFieldStage } = loadModule(
  path.join(repositoryRoot, "lib/field/stage-completion.ts"),
);
const { applyFieldSurveyDraftPatch } = loadModule(
  path.join(repositoryRoot, "lib/field/survey-draft-patch.ts"),
);
const { createSiteSurveyDraft } = loadModule(path.join(repositoryRoot, "lib/field/types.ts"));
const { parseSiteSurvey } = loadModule(path.join(repositoryRoot, "lib/field/survey-record.ts"));
const { calculateSurveyProgress } = loadModule(
  path.join(repositoryRoot, "lib/field/survey-progress.ts"),
);
const { createFieldSurveyService } = loadModule(
  path.join(repositoryRoot, "lib/field/field-survey-service.server.ts"),
);
const { createCandidateStoreId, createMeasurementId } = loadModule(
  path.join(repositoryRoot, "lib/field/identifiers.ts"),
);
const { createEmptyMeasurementSet, createKnownMm } = loadModule(
  path.join(repositoryRoot, "lib/field/measurement.ts"),
);
const { TABLET_GROUPS } = loadModule(path.join(repositoryRoot, "lib/field/stages.ts"));

const consultationsPath = path.join(repositoryRoot, "data/consultations.json");
const consultationsBefore = fs.existsSync(consultationsPath)
  ? fs.readFileSync(consultationsPath)
  : null;
const backupPath = path.join(repositoryRoot, "data/diagnosis-drafts.json.backup");
const backupBefore = fs.existsSync(backupPath) ? fs.readFileSync(backupPath) : null;
const tempRoots = [];

after(() => {
  for (const rootDir of tempRoots) fs.rmSync(rootDir, { recursive: true, force: true });
  if (consultationsBefore) {
    assert.deepEqual(fs.readFileSync(consultationsPath), consultationsBefore);
  }
  if (backupBefore) {
    assert.deepEqual(fs.readFileSync(backupPath), backupBefore);
  }
});

function makeService() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "frameone-field-p45-"));
  tempRoots.push(rootDir);
  return createFieldSurveyService({
    rootDir,
    now: () => "2026-09-18T15:00:00.000Z",
  });
}

function withStatus(status) {
  const base = createDefaultProductionSalesSpace();
  return {
    ...base,
    manufacturingSpace: {
      value: status,
      evidence: createFieldEvidenceMeta({ sourceType: "FIELD_CHECK" }),
    },
    salesSpace: { value: status, evidence: createFieldEvidenceMeta() },
  };
}

test("1. ProductionSalesSpace Domain save/reload", async () => {
  const service = makeService();
  const link = await service.ensureLink({
    consultationId: "fixture-p45-space",
    existingCandidateStoreId: createCandidateStoreId(),
  });
  assert.equal(link.ok, true);
  const started = await service.startSurvey({
    consultationId: "fixture-p45-space",
    candidateStoreId: link.value.candidateStoreId,
  });
  assert.equal(started.ok, true);
  const space = withStatus("LIMITED");
  const saved = await service.updateSurveyDraft({
    surveyId: started.value.survey.surveyId,
    expectedDraftVersion: 1,
    productionSalesSpace: space,
    touchStageIds: ["productionSalesSpace"],
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.value.productionSalesSpace.manufacturingSpace.value, "LIMITED");
  const reloaded = await service.getSurvey(started.value.survey.surveyId);
  assert.equal(reloaded.ok, true);
  assert.equal(reloaded.value.productionSalesSpace.manufacturingSpace.value, "LIMITED");
});

test("2. DeliveryPath Domain save/reload", async () => {
  const service = makeService();
  const link = await service.ensureLink({
    consultationId: "fixture-p45-delivery",
    existingCandidateStoreId: createCandidateStoreId(),
  });
  const started = await service.startSurvey({
    consultationId: "fixture-p45-delivery",
    candidateStoreId: link.value.candidateStoreId,
  });
  const delivery = {
    ...createDefaultDeliveryPath(),
    primaryDeliveryMethod: {
      value: "STAIRS",
      evidence: createFieldEvidenceMeta(),
    },
    intermediateDoorCorridor: {
      value: "CONSTRAINT_OBSERVED",
      evidence: createFieldEvidenceMeta(),
    },
  };
  const saved = await service.updateSurveyDraft({
    surveyId: started.value.survey.surveyId,
    expectedDraftVersion: 1,
    deliveryPath: delivery,
  });
  assert.equal(saved.ok, true);
  const reloaded = await service.getSurvey(started.value.survey.surveyId);
  assert.equal(reloaded.value.deliveryPath.primaryDeliveryMethod.value, "STAIRS");
  assert.equal(reloaded.value.deliveryPath.intermediateDoorCorridor.value, "CONSTRAINT_OBSERVED");
});

test("3. PLANNABLE can be stored", () => {
  const parsed = parseProductionSalesSpaceObservation(withStatus("PLANNABLE"));
  assert.ok(parsed);
  assert.equal(parsed.manufacturingSpace.value, "PLANNABLE");
});

test("4. LIMITED can be stored", () => {
  const parsed = parseProductionSalesSpaceObservation(withStatus("LIMITED"));
  assert.ok(parsed);
  assert.equal(parsed.manufacturingSpace.value, "LIMITED");
});

test("5. NOT_ASSESSED can be stored", () => {
  const parsed = parseProductionSalesSpaceObservation(createDefaultProductionSalesSpace());
  assert.ok(parsed);
  assert.equal(parsed.manufacturingSpace.value, "NOT_ASSESSED");
  const delivery = parseDeliveryPathObservation(createDefaultDeliveryPath());
  assert.ok(delivery);
  assert.equal(delivery.primaryDeliveryMethod.value, "UNKNOWN");
});

test("6. blank required responses cannot complete stage", () => {
  assert.equal(canCompleteFieldStage("productionSalesSpace", {}).ok, false);
  assert.equal(canCompleteFieldStage("deliveryPath", {}).ok, false);
});

test("7. explicit NOT_ASSESSED allows stage completion", () => {
  assert.equal(
    canCompleteFieldStage("productionSalesSpace", {
      productionSalesSpace: createDefaultProductionSalesSpace(),
    }).ok,
    true,
  );
  assert.equal(
    canCompleteFieldStage("deliveryPath", {
      deliveryPath: createDefaultDeliveryPath(),
    }).ok,
    true,
  );
});

test("8-9. MeasurementSet reused without duplication", () => {
  const draft = createSiteSurveyDraft({
    candidateStoreId: createCandidateStoreId(),
    surveySequence: 1,
    surveyor: "field-staff",
    createdAt: "2026-09-18T15:00:00.000Z",
  });
  const measurementSet = {
    ...createEmptyMeasurementSet({
      surveyId: draft.surveyId,
      candidateStoreId: draft.candidateStoreId,
      measuredAt: "2026-09-18T15:00:00.000Z",
      measuredBy: "field-staff",
      measurementId: createMeasurementId(),
    }),
    values: {
      entranceWidthMm: createKnownMm(1200),
      corridorWidthMm: createKnownMm(900),
    },
  };
  const applied = applyFieldSurveyDraftPatch(
    draft,
    {
      expectedDraftVersion: 1,
      measurementSet,
      deliveryPath: createDefaultDeliveryPath(),
    },
    "2026-09-18T15:01:00.000Z",
  );
  assert.equal(applied.ok, true);
  assert.equal(applied.survey.measurementSet.values.entranceWidthMm.mm, 1200);
  assert.equal("entranceWidthMm" in (applied.survey.deliveryPath ?? {}), false);
  assert.equal(formatMeasurementMmDisplay(measurementSet.values.entranceWidthMm).kind, "known");
});

test("10. missing Measurement does not invent fake dimensions", () => {
  assert.deepEqual(formatMeasurementMmDisplay(undefined), { kind: "missing" });
  const draft = createSiteSurveyDraft({
    candidateStoreId: createCandidateStoreId(),
    surveySequence: 1,
    surveyor: "field-staff",
    createdAt: "2026-09-18T15:00:00.000Z",
  });
  const applied = applyFieldSurveyDraftPatch(
    draft,
    {
      expectedDraftVersion: 1,
      deliveryPath: createDefaultDeliveryPath(),
    },
    "2026-09-18T15:01:00.000Z",
  );
  assert.equal(applied.ok, true);
  assert.equal(applied.survey.measurementSet, undefined);
});

test("11. DeliveryPath does not create equipment delivery verdict", () => {
  const delivery = createDefaultDeliveryPath();
  assert.equal("verdict" in delivery, false);
  assert.equal("canDeliver" in delivery, false);
  assert.equal("equipmentFit" in delivery, false);
});

test("12. ProductionSalesSpace LIMITED does not create Risk/Verdict", () => {
  const space = withStatus("LIMITED");
  assert.equal(space.manufacturingSpace.value, "LIMITED");
  assert.equal("risk" in space, false);
  assert.equal("verdict" in space, false);
  assert.equal("hardFail" in space, false);
});

test("13. completing stages increases Survey Progress", () => {
  const draft = createSiteSurveyDraft({
    candidateStoreId: createCandidateStoreId(),
    surveySequence: 1,
    surveyor: "field-staff",
    createdAt: "2026-09-18T15:00:00.000Z",
  });
  const before = calculateSurveyProgress(draft.stageStates);
  const applied = applyFieldSurveyDraftPatch(
    draft,
    {
      expectedDraftVersion: 1,
      productionSalesSpace: createDefaultProductionSalesSpace(),
      deliveryPath: createDefaultDeliveryPath(),
      completeStageIds: ["productionSalesSpace", "deliveryPath"],
    },
    "2026-09-18T15:01:00.000Z",
  );
  assert.equal(applied.ok, true);
  const after = calculateSurveyProgress(applied.survey.stageStates);
  assert.equal(after.completedStageCount, before.completedStageCount + 2);
});

test("14-16. draft version, conflict, reload identity", async () => {
  const service = makeService();
  const candidateStoreId = createCandidateStoreId();
  const link = await service.ensureLink({
    consultationId: "fixture-p45-version",
    existingCandidateStoreId: candidateStoreId,
  });
  const started = await service.startSurvey({
    consultationId: "fixture-p45-version",
    candidateStoreId: link.value.candidateStoreId,
  });
  const first = await service.updateSurveyDraft({
    surveyId: started.value.survey.surveyId,
    expectedDraftVersion: 1,
    productionSalesSpace: createDefaultProductionSalesSpace(),
    deliveryPath: createDefaultDeliveryPath(),
  });
  assert.equal(first.ok, true);
  assert.equal(first.value.draftVersion, 2);
  assert.equal(first.value.candidateStoreId, candidateStoreId);
  assert.equal(first.value.surveyId, started.value.survey.surveyId);

  const conflict = await service.updateSurveyDraft({
    surveyId: started.value.survey.surveyId,
    expectedDraftVersion: 1,
    productionSalesSpace: withStatus("PLANNABLE"),
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "VERSION_CONFLICT");

  const reloaded = await service.getSurvey(started.value.survey.surveyId);
  assert.equal(reloaded.value.draftVersion, 2);
  assert.equal(reloaded.value.productionSalesSpace.manufacturingSpace.value, "NOT_ASSESSED");
});

test("17. Evidence source alone does not auto-verify", () => {
  const observation = {
    value: "LIMITED",
    evidence: createFieldEvidenceMeta({
      sourceType: "OWNER_STATEMENT",
      verificationStatus: "UNKNOWN",
    }),
  };
  assert.equal(spaceObservationIsNotAutoVerified(observation), true);
});

test("18. candidateStoreId / surveyId relationship retained", () => {
  const draft = createSiteSurveyDraft({
    candidateStoreId: createCandidateStoreId(),
    consultationId: "fixture-p45-rel",
    surveySequence: 1,
    surveyor: "field-staff",
    createdAt: "2026-09-18T15:00:00.000Z",
  });
  const applied = applyFieldSurveyDraftPatch(
    draft,
    {
      expectedDraftVersion: 1,
      productionSalesSpace: createDefaultProductionSalesSpace(),
      deliveryPath: createDefaultDeliveryPath(),
    },
    "2026-09-18T15:01:00.000Z",
  );
  assert.equal(applied.ok, true);
  assert.equal(applied.survey.candidateStoreId, draft.candidateStoreId);
  assert.equal(applied.survey.surveyId, draft.surveyId);
});

test("Phase 4 draft without space fields remains readable", () => {
  const draft = createSiteSurveyDraft({
    candidateStoreId: createCandidateStoreId(),
    surveySequence: 1,
    surveyor: "field-staff",
    createdAt: "2026-09-18T15:00:00.000Z",
  });
  const parsed = parseSiteSurvey({ ...draft });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.productionSalesSpace, undefined);
  assert.equal(parsed.value.deliveryPath, undefined);
});

test("SPACE_EQUIPMENT tablet group is inputImplemented", () => {
  const group = TABLET_GROUPS.find((item) => item.groupId === "SPACE_EQUIPMENT");
  assert.equal(group.inputImplemented, true);
});

test("invalid enum values are rejected", () => {
  assert.equal(
    parseProductionSalesSpaceObservation({
      ...createDefaultProductionSalesSpace(),
      manufacturingSpace: {
        value: "INSTALLABLE",
        evidence: createFieldEvidenceMeta(),
      },
    }),
    null,
  );
});
