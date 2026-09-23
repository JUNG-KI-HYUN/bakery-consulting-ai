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

const { metersInputToMm, mmToMetersInput, isValidKnownMm } = loadModule(
  path.join(repositoryRoot, "lib/field/measurement-units.ts"),
);
const {
  createEmptyMeasurementSet,
  createKnownMm,
  createUnknownDimension,
  parseMeasurementSet,
  REQUIRED_MEASUREMENT_KEYS,
} = loadModule(path.join(repositoryRoot, "lib/field/measurement.ts"));
const { createMeasurementId, createCandidateStoreId, createSiteSurveyId, isMeasurementId } =
  loadModule(path.join(repositoryRoot, "lib/field/identifiers.ts"));
const {
  createDefaultElectrical,
  parseFacilityObservations,
  observationIsNotAutoVerified,
} = loadModule(path.join(repositoryRoot, "lib/field/facility.ts"));
const { createFieldEvidenceMeta } = loadModule(
  path.join(repositoryRoot, "lib/field/field-evidence-meta.ts"),
);
const { canCompleteFieldStage } = loadModule(
  path.join(repositoryRoot, "lib/field/stage-completion.ts"),
);
const { applyFieldSurveyDraftPatch } = loadModule(
  path.join(repositoryRoot, "lib/field/survey-draft-patch.ts"),
);
const { createSiteSurveyDraft } = loadModule(
  path.join(repositoryRoot, "lib/field/types.ts"),
);
const { parseSiteSurvey } = loadModule(path.join(repositoryRoot, "lib/field/survey-record.ts"));
const { calculateSurveyProgress } = loadModule(
  path.join(repositoryRoot, "lib/field/survey-progress.ts"),
);
const { calculateEvidenceCoverage } = loadModule(
  path.join(repositoryRoot, "lib/evidence/coverage.ts"),
);
const { EVIDENCE_COVERAGE_POLICY_V1 } = loadModule(
  path.join(repositoryRoot, "lib/evidence/coverage-policy.ts"),
);
const { createFieldSurveyService } = loadModule(
  path.join(repositoryRoot, "lib/field/field-survey-service.server.ts"),
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
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "frameone-field-p4-"));
  tempRoots.push(rootDir);
  return createFieldSurveyService({
    rootDir,
    now: () => "2026-09-18T12:00:00.000Z",
  });
}

function fullUnknownMeasurement(survey) {
  const values = {};
  for (const key of REQUIRED_MEASUREMENT_KEYS) {
    values[key] = createUnknownDimension();
  }
  return {
    ...createEmptyMeasurementSet({
      surveyId: survey.surveyId,
      candidateStoreId: survey.candidateStoreId,
      measuredAt: "2026-09-18T12:00:00.000Z",
      measuredBy: "field-staff",
    }),
    values,
    structure: {
      pillarPresence: "UNKNOWN",
      levelStepPresence: "UNKNOWN",
    },
  };
}

function knownMeasurement(survey, overrides = {}) {
  const values = {
    frontageMm: createKnownMm(5800),
    roomWidthMm: createKnownMm(5800),
    roomDepthMm: createKnownMm(11200),
    ceilingHeightMm: createKnownMm(3100),
    entranceWidthMm: createKnownMm(1200),
    entranceHeightMm: createKnownMm(2100),
    ...overrides,
  };
  return {
    ...createEmptyMeasurementSet({
      surveyId: survey.surveyId,
      candidateStoreId: survey.candidateStoreId,
      measuredAt: "2026-09-18T12:00:00.000Z",
      measuredBy: "field-staff",
    }),
    values,
    structure: {
      pillarPresence: "NO",
      levelStepPresence: "NO",
    },
  };
}

test("1. 5.8m converts to 5800mm", () => {
  assert.deepEqual(metersInputToMm("5.8"), { ok: true, mm: 5800 });
});

test("2. 1.25m converts to 1250mm", () => {
  assert.deepEqual(metersInputToMm("1.25"), { ok: true, mm: 1250 });
});

test("3. UNKNOWN measurement is not stored as 0", () => {
  const unknown = createUnknownDimension();
  assert.equal(unknown.status, "UNKNOWN");
  assert.equal("mm" in unknown, false);
  const parsed = parseMeasurementSet({
    schemaVersion: "measurement-v1",
    measurementId: createMeasurementId(),
    surveyId: createSiteSurveyId(),
    candidateStoreId: createCandidateStoreId(),
    measuredAt: "2026-09-18T12:00:00.000Z",
    measuredBy: "field-staff",
    values: { frontageMm: { status: "UNKNOWN", mm: 0 } },
    structure: {},
  });
  assert.equal(parsed, null);
});

test("4. negative measurement is rejected", () => {
  assert.equal(metersInputToMm("-1").ok, false);
  assert.throws(() => createKnownMm(-100));
  assert.equal(isValidKnownMm(-1), false);
});

test("5. NaN and Infinity are rejected", () => {
  assert.equal(metersInputToMm("NaN").ok, false);
  assert.equal(isValidKnownMm(Number.NaN), false);
  assert.equal(isValidKnownMm(Number.POSITIVE_INFINITY), false);
  assert.throws(() => createKnownMm(Number.NaN));
});

test("6. MeasurementSet has a stable measurementId", () => {
  const surveyId = createSiteSurveyId();
  const candidateStoreId = createCandidateStoreId();
  const set = createEmptyMeasurementSet({
    surveyId,
    candidateStoreId,
    measuredAt: "2026-09-18T12:00:00.000Z",
    measuredBy: "field-staff",
  });
  assert.equal(isMeasurementId(set.measurementId), true);
  assert.equal(set.surveyId, surveyId);
  assert.equal(set.candidateStoreId, candidateStoreId);
});

test("7. SiteSurvey keeps candidateStore relationship with MeasurementSet", () => {
  const draft = createSiteSurveyDraft({
    candidateStoreId: createCandidateStoreId(),
    consultationId: "fixture-p4",
    surveySequence: 1,
    surveyor: "field-staff",
    createdAt: "2026-09-18T12:00:00.000Z",
  });
  const measurementSet = knownMeasurement(draft);
  const applied = applyFieldSurveyDraftPatch(
    draft,
    { expectedDraftVersion: 1, measurementSet },
    "2026-09-18T12:01:00.000Z",
  );
  assert.equal(applied.ok, true);
  assert.equal(applied.survey.candidateStoreId, draft.candidateStoreId);
  assert.equal(applied.survey.measurementSet.surveyId, draft.surveyId);
  assert.equal(applied.survey.measurementSet.candidateStoreId, draft.candidateStoreId);
});

test("8. electrical numeric value alone does not become VERIFIED", () => {
  const electrical = createDefaultElectrical();
  const withPower = {
    ...electrical,
    contractPowerKw: {
      value: 30,
      evidence: createFieldEvidenceMeta({
        verificationStatus: "UNKNOWN",
        sourceType: "FIELD_CHECK",
        confirmationRequirement: "NONE",
      }),
    },
  };
  assert.equal(observationIsNotAutoVerified(withPower.contractPowerKw), true);
  assert.equal(withPower.contractPowerKw.evidence.verificationStatus, "UNKNOWN");
});

test("9. owner statement is not promoted to VERIFIED", () => {
  const observation = {
    value: "YES",
    evidence: createFieldEvidenceMeta({
      verificationStatus: "UNKNOWN",
      sourceType: "OWNER_STATEMENT",
      confirmationRequirement: "OWNER_CONFIRMATION_REQUIRED",
    }),
  };
  assert.equal(observation.evidence.sourceType, "OWNER_STATEMENT");
  assert.notEqual(observation.evidence.verificationStatus, "VERIFIED");
});

test("10. electrical UNKNOWN + expert review required can be stored", () => {
  const facility = {
    electrical: {
      contractPowerKw: {
        value: null,
        evidence: createFieldEvidenceMeta({ verificationStatus: "UNKNOWN" }),
      },
      phaseType: {
        value: "UNKNOWN",
        evidence: createFieldEvidenceMeta({ verificationStatus: "UNKNOWN" }),
      },
      panelFieldChecked: {
        value: "UNKNOWN",
        evidence: createFieldEvidenceMeta({ verificationStatus: "UNKNOWN" }),
      },
      expansionStatus: {
        value: "EXPERT_REVIEW_REQUIRED",
        evidence: createFieldEvidenceMeta({
          confirmationRequirement: "EXPERT_CONFIRMATION_REQUIRED",
        }),
      },
    },
  };
  const parsed = parseFacilityObservations(facility);
  assert.ok(parsed);
  assert.equal(parsed.electrical.contractPowerKw.value, null);
  assert.equal(parsed.electrical.expansionStatus.value, "EXPERT_REVIEW_REQUIRED");
});

test("11. explicit UNKNOWN allows stage COMPLETED", () => {
  const draft = createSiteSurveyDraft({
    candidateStoreId: createCandidateStoreId(),
    surveySequence: 1,
    surveyor: "field-staff",
    createdAt: "2026-09-18T12:00:00.000Z",
  });
  const measurementSet = fullUnknownMeasurement(draft);
  assert.equal(canCompleteFieldStage("measurement", { measurementSet }).ok, true);
  assert.equal(canCompleteFieldStage("ceilingStructure", { measurementSet }).ok, true);
  assert.equal(
    canCompleteFieldStage("electrical", {
      facility: {
        electrical: {
          contractPowerKw: {
            value: null,
            evidence: createFieldEvidenceMeta(),
          },
          phaseType: { value: "UNKNOWN", evidence: createFieldEvidenceMeta() },
          panelFieldChecked: { value: "UNKNOWN", evidence: createFieldEvidenceMeta() },
          expansionStatus: {
            value: "EXPERT_REVIEW_REQUIRED",
            evidence: createFieldEvidenceMeta({
              confirmationRequirement: "EXPERT_CONFIRMATION_REQUIRED",
            }),
          },
        },
      },
    }).ok,
    true,
  );
});

test("12. blank required items cannot COMPLETE", () => {
  const draft = createSiteSurveyDraft({
    candidateStoreId: createCandidateStoreId(),
    surveySequence: 1,
    surveyor: "field-staff",
    createdAt: "2026-09-18T12:00:00.000Z",
  });
  const empty = createEmptyMeasurementSet({
    surveyId: draft.surveyId,
    candidateStoreId: draft.candidateStoreId,
    measuredAt: "2026-09-18T12:00:00.000Z",
    measuredBy: "field-staff",
  });
  assert.equal(canCompleteFieldStage("measurement", { measurementSet: empty }).ok, false);
  assert.equal(canCompleteFieldStage("ceilingStructure", { measurementSet: empty }).ok, false);
  assert.equal(canCompleteFieldStage("electrical", { facility: {} }).ok, false);
});

test("13. completing stages increases Survey Progress", () => {
  const draft = createSiteSurveyDraft({
    candidateStoreId: createCandidateStoreId(),
    surveySequence: 1,
    surveyor: "field-staff",
    createdAt: "2026-09-18T12:00:00.000Z",
  });
  const before = calculateSurveyProgress(draft.stageStates);
  const applied = applyFieldSurveyDraftPatch(
    draft,
    {
      expectedDraftVersion: 1,
      measurementSet: fullUnknownMeasurement(draft),
      completeStageIds: ["measurement", "ceilingStructure"],
    },
    "2026-09-18T12:01:00.000Z",
  );
  assert.equal(applied.ok, true);
  const after = calculateSurveyProgress(applied.survey.stageStates);
  assert.ok(after.completedStageCount > before.completedStageCount);
  assert.ok(after.completionPercent > before.completionPercent);
});

test("14. Evidence Coverage stays independent from Survey Progress", () => {
  const draft = createSiteSurveyDraft({
    candidateStoreId: createCandidateStoreId(),
    surveySequence: 1,
    surveyor: "field-staff",
    createdAt: "2026-09-18T12:00:00.000Z",
  });
  const applied = applyFieldSurveyDraftPatch(
    draft,
    {
      expectedDraftVersion: 1,
      measurementSet: fullUnknownMeasurement(draft),
      completeStageIds: ["measurement", "ceilingStructure"],
    },
    "2026-09-18T12:01:00.000Z",
  );
  assert.equal(applied.ok, true);
  const progress = calculateSurveyProgress(applied.survey.stageStates);
  assert.ok(progress.completedStageCount >= 2);

  const coverage = calculateEvidenceCoverage(
    EVIDENCE_COVERAGE_POLICY_V1.fields.map((field) => ({ ...field, evidence: [] })),
    EVIDENCE_COVERAGE_POLICY_V1.policyVersion,
  );
  assert.equal(coverage.totalCoverage.coveragePercent, 0);
  assert.ok(progress.completionPercent > coverage.totalCoverage.coveragePercent);
});

test("15. first real save moves Survey to IN_PROGRESS", () => {
  const draft = createSiteSurveyDraft({
    candidateStoreId: createCandidateStoreId(),
    surveySequence: 1,
    surveyor: "field-staff",
    createdAt: "2026-09-18T12:00:00.000Z",
  });
  assert.equal(draft.status, "DRAFT");
  const applied = applyFieldSurveyDraftPatch(
    draft,
    { expectedDraftVersion: 1, measurementSet: knownMeasurement(draft) },
    "2026-09-18T12:01:00.000Z",
  );
  assert.equal(applied.ok, true);
  assert.equal(applied.survey.status, "IN_PROGRESS");
  assert.equal(applied.survey.startedAt, "2026-09-18T12:01:00.000Z");
});

test("16-18. draft save reload keeps values, bumps version, rejects stale version", async () => {
  const service = makeService();
  const candidateStoreId = createCandidateStoreId();
  const link = await service.ensureLink({
    consultationId: "fixture-p4-reload",
    existingCandidateStoreId: candidateStoreId,
  });
  assert.equal(link.ok, true);
  const started = await service.startSurvey({
    consultationId: "fixture-p4-reload",
    candidateStoreId: link.value.candidateStoreId,
  });
  assert.equal(started.ok, true);
  const survey = started.value.survey;
  const measurementSet = knownMeasurement(survey);
  const saved = await service.updateSurveyDraft({
    surveyId: survey.surveyId,
    expectedDraftVersion: survey.draftVersion,
    measurementSet,
    touchStageIds: ["measurement"],
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.value.draftVersion, survey.draftVersion + 1);
  assert.equal(saved.value.measurementSet.values.frontageMm.mm, 5800);
  assert.equal(saved.value.status, "IN_PROGRESS");

  const reloaded = await service.getSurvey(survey.surveyId);
  assert.equal(reloaded.ok, true);
  assert.equal(reloaded.value.measurementSet.values.frontageMm.mm, 5800);
  assert.equal(reloaded.value.measurementSet.measurementId, measurementSet.measurementId);

  const conflict = await service.updateSurveyDraft({
    surveyId: survey.surveyId,
    expectedDraftVersion: survey.draftVersion,
    measurementSet: knownMeasurement(survey, { frontageMm: createKnownMm(6000) }),
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "VERSION_CONFLICT");

  const again = await service.getSurvey(survey.surveyId);
  assert.equal(again.value.measurementSet.values.frontageMm.mm, 5800);
});

test("19. Phase 3.5 draft without measurement/facility remains readable", () => {
  const draft = createSiteSurveyDraft({
    candidateStoreId: createCandidateStoreId(),
    surveySequence: 1,
    surveyor: "field-staff",
    createdAt: "2026-09-18T12:00:00.000Z",
  });
  const parsed = parseSiteSurvey({ ...draft });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.measurementSet, undefined);
  assert.equal(parsed.value.facility, undefined);
});

test("20. MeasurementSet values stay in mm and round-trip from meters UI", () => {
  assert.equal(mmToMetersInput(5800), "5.8");
  assert.equal(mmToMetersInput(1250), "1.25");
  const mm = metersInputToMm("3.1");
  assert.equal(mm.ok, true);
  assert.equal(mm.mm, 3100);
  assert.equal(Number.isInteger(mm.mm), true);
});

test("Phase 4 tablet groups mark measurement and facility as implemented", () => {
  const measurement = TABLET_GROUPS.find((group) => group.groupId === "MEASUREMENT_STRUCTURE");
  const facility = TABLET_GROUPS.find((group) => group.groupId === "FACILITY");
  const basic = TABLET_GROUPS.find((group) => group.groupId === "BASIC");
  assert.equal(measurement.inputImplemented, true);
  assert.equal(facility.inputImplemented, true);
  assert.equal(basic.inputImplemented, false);
});

test("stale measurementId change is rejected", () => {
  const draft = createSiteSurveyDraft({
    candidateStoreId: createCandidateStoreId(),
    surveySequence: 1,
    surveyor: "field-staff",
    createdAt: "2026-09-18T12:00:00.000Z",
  });
  const first = knownMeasurement(draft);
  const once = applyFieldSurveyDraftPatch(
    draft,
    { expectedDraftVersion: 1, measurementSet: first },
    "2026-09-18T12:01:00.000Z",
  );
  assert.equal(once.ok, true);
  const second = {
    ...knownMeasurement(once.survey),
    measurementId: createMeasurementId(),
  };
  const rejected = applyFieldSurveyDraftPatch(
    once.survey,
    { expectedDraftVersion: once.survey.draftVersion, measurementSet: second },
    "2026-09-18T12:02:00.000Z",
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "INVALID_DATA");
});

test("blank completeStageIds are rejected by patch validation", () => {
  const draft = createSiteSurveyDraft({
    candidateStoreId: createCandidateStoreId(),
    surveySequence: 1,
    surveyor: "field-staff",
    createdAt: "2026-09-18T12:00:00.000Z",
  });
  const rejected = applyFieldSurveyDraftPatch(
    draft,
    {
      expectedDraftVersion: 1,
      measurementSet: createEmptyMeasurementSet({
        surveyId: draft.surveyId,
        candidateStoreId: draft.candidateStoreId,
        measuredAt: "2026-09-18T12:00:00.000Z",
        measuredBy: "field-staff",
      }),
      completeStageIds: ["measurement"],
    },
    "2026-09-18T12:01:00.000Z",
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "INVALID_DATA");
});
