import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const loadModule = createRequire(import.meta.url);
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
  if (previousLoader) loadModule.extensions[".ts"] = previousLoader;
  else delete loadModule.extensions[".ts"];
});

const identifiers = loadModule(path.join(repositoryRoot, "lib/field/identifiers.ts"));
const candidateStoreRef = loadModule(path.join(repositoryRoot, "lib/field/candidate-store-ref.ts"));
const stages = loadModule(path.join(repositoryRoot, "lib/field/stages.ts"));
const surveyTypes = loadModule(path.join(repositoryRoot, "lib/field/types.ts"));
const surveyProgress = loadModule(path.join(repositoryRoot, "lib/field/survey-progress.ts"));
const tabletView = loadModule(path.join(repositoryRoot, "lib/field/tablet-view.ts"));
const coverage = loadModule(path.join(repositoryRoot, "lib/evidence/coverage.ts"));
const coveragePolicy = loadModule(path.join(repositoryRoot, "lib/evidence/coverage-policy.ts"));
const { sampleConsultation } = loadModule(path.join(repositoryRoot, "lib/diagnosis/sample-data.ts"));

const { createCandidateStoreId, createSiteSurveyId, isCandidateStoreId, isSiteSurveyId } = identifiers;
const { resolveCandidateStoreReference } = candidateStoreRef;
const { SURVEY_STAGE_IDS, SURVEY_STAGES, TABLET_GROUPS, TABLET_GROUP_IDS } = stages;
const { createInitialSurveyStageStates, createSiteSurveyDraft } = surveyTypes;
const { calculateSurveyProgress } = surveyProgress;
const { buildFieldTabletView } = tabletView;
const { calculateEvidenceCoverage } = coverage;
const { EVIDENCE_COVERAGE_POLICY_V1 } = coveragePolicy;

function fixtureConsultation(overrides = {}) {
  const record = structuredClone(sampleConsultation);
  record.consultation.id = "fixture-field-consultation";
  record.consultation.title = "FIELD SAMPLE 상담";
  record.consultation.sampleData = true;
  record.consultation.customerName = "SAMPLE 고객";
  record.consultation.contact = "000-0000-0000";
  record.candidateStore.address = "SAMPLE 주소: 실제 점포 아님";
  return Object.assign(record, overrides);
}

function fillStageStates(state, overrides = {}) {
  const next = {};
  for (const stageId of SURVEY_STAGE_IDS) next[stageId] = state;
  return { ...next, ...overrides };
}

test("1. a new CandidateStore reference keeps a stored opaque ID that does not use address", () => {
  const first = createCandidateStoreId();
  const second = createCandidateStoreId();
  assert.equal(isCandidateStoreId(first), true);
  assert.equal(isCandidateStoreId(second), true);
  assert.notEqual(first, second);

  const record = fixtureConsultation();
  record.candidateStore.candidateStoreId = first;
  record.candidateStore.address = "SAMPLE 다른 주소";
  record.candidateStore.deposit = 1;
  record.consultation.customerName = "SAMPLE 다른 이름";
  record.consultation.contact = "111-1111-1111";
  const reference = resolveCandidateStoreReference(record);
  assert.equal(reference.resolution, "explicit");
  assert.equal(reference.candidateStoreId, first);
  assert.equal(reference.canAttachFieldData, true);
  assert.equal(first.includes(record.candidateStore.address), false);
  assert.equal(first.includes(record.consultation.customerName), false);
  assert.equal(first.includes(record.consultation.contact), false);
});

test("2. a legacy consultation without candidateStoreId stays legacy_embedded", () => {
  assert.equal(Object.hasOwn(sampleConsultation.candidateStore, "candidateStoreId"), false);
  const reference = resolveCandidateStoreReference(sampleConsultation);
  assert.equal(reference.resolution, "legacy_embedded");
  assert.equal(reference.candidateStoreId, null);
  assert.equal(reference.canAttachFieldData, false);
  assert.equal(reference.blockedReason, "CANDIDATE_STORE_ID_NOT_ASSIGNED");
});

test("3. resolving a legacy record does not mutate the original consultation", () => {
  const record = fixtureConsultation();
  const malformed = fixtureConsultation();
  malformed.candidateStore.candidateStoreId = "SAMPLE-address-hash";
  const recordSnapshot = structuredClone(record);
  const malformedSnapshot = structuredClone(malformed);

  const missing = resolveCandidateStoreReference(record);
  const invalid = resolveCandidateStoreReference(malformed);
  buildFieldTabletView(record);
  buildFieldTabletView(malformed);

  assert.deepEqual(record, recordSnapshot);
  assert.deepEqual(malformed, malformedSnapshot);
  assert.equal(Object.hasOwn(record.candidateStore, "candidateStoreId"), false);
  assert.equal(malformed.candidateStore.candidateStoreId, "SAMPLE-address-hash");
  assert.equal(missing.candidateStoreId, null);
  assert.equal(invalid.blockedReason, "CANDIDATE_STORE_ID_MALFORMED");
  assert.equal(invalid.canAttachFieldData, false);
});

test("4. SiteSurvey requires and keeps the CandidateStore ID relationship", () => {
  const candidateStoreId = createCandidateStoreId();
  const survey = createSiteSurveyDraft({
    candidateStoreId,
    consultationId: "fixture-field-consultation",
    surveySequence: 2,
    surveyor: "staff-fixture",
    createdAt: "2026-09-18T01:00:00.000Z",
  });

  assert.equal(survey.candidateStoreId, candidateStoreId);
  assert.equal(isSiteSurveyId(survey.surveyId), true);
  assert.notEqual(survey.surveyId, createSiteSurveyId());
  assert.equal(survey.surveySequence, 2);
  assert.equal(survey.status, "DRAFT");

  const secondSurvey = createSiteSurveyDraft({
    candidateStoreId,
    consultationId: "fixture-field-consultation",
    surveySequence: 2,
    surveyor: "staff-fixture",
    createdAt: "2026-09-18T01:00:00.000Z",
  });
  assert.notEqual(secondSurvey.surveyId, survey.surveyId);
  assert.equal(secondSurvey.candidateStoreId, candidateStoreId);

  assert.throws(
    () => createSiteSurveyDraft({
      candidateStoreId: "SAMPLE-address-hash",
      surveySequence: 1,
      surveyor: "staff-fixture",
      createdAt: "2026-09-18T01:00:00.000Z",
    }),
    /assigned candidateStoreId/,
  );
});

test("5. every survey stage ID is unique and stable", () => {
  assert.equal(SURVEY_STAGE_IDS.length, 21);
  assert.equal(new Set(SURVEY_STAGE_IDS).size, 21);
  assert.equal(SURVEY_STAGE_IDS.includes("productionSalesSpace"), true);
  assert.deepEqual(
    SURVEY_STAGES.map((stage) => stage.stageId),
    [...SURVEY_STAGE_IDS],
  );
  assert.deepEqual(
    [...SURVEY_STAGE_IDS].sort(),
    [...new Set(SURVEY_STAGES.map((stage) => stage.stageId))].sort(),
  );
});

test("6. every stage belongs to exactly one tablet UI group", () => {
  assert.equal(TABLET_GROUP_IDS.length, 8);
  assert.equal(TABLET_GROUPS.length, 8);
  const seen = [];
  for (const group of TABLET_GROUPS) {
    assert.ok(group.stageIds.length > 0);
    for (const stageId of group.stageIds) {
      assert.equal(seen.includes(stageId), false);
      seen.push(stageId);
    }
  }
  assert.deepEqual([...seen].sort(), [...SURVEY_STAGE_IDS].sort());
  const spaceGroup = TABLET_GROUPS.find((group) => group.groupId === "SPACE_EQUIPMENT");
  assert.deepEqual(spaceGroup.stageIds, ["productionSalesSpace", "deliveryPath"]);
  for (const stage of SURVEY_STAGES) {
    const owners = TABLET_GROUPS.filter((group) => group.stageIds.includes(stage.stageId));
    assert.equal(owners.length, 1);
    assert.equal(owners[0].groupId, stage.groupId);
  }
});

test("7. survey progress is 0% when no stage has started", () => {
  const progress = calculateSurveyProgress(createInitialSurveyStageStates());
  assert.equal(progress.completionPercent, 0);
  assert.equal(progress.completedStageCount, 0);
  assert.equal(progress.stageCount, 21);
  assert.equal(progress.notStartedStageCount, 21);
  assert.equal(progress.unfinishedStageIds.length, 21);
});

test("8. partial completion yields a proportional percent below 100", () => {
  const [first, second, third, fourth, fifth, ...rest] = SURVEY_STAGE_IDS;
  const progress = calculateSurveyProgress(fillStageStates("NOT_STARTED", {
    [first]: "COMPLETED",
    [second]: "COMPLETED",
    [third]: "COMPLETED",
    [fourth]: "COMPLETED",
    [fifth]: "COMPLETED",
    [rest[0]]: "SKIPPED",
    [rest[1]]: "IN_PROGRESS",
  }));
  assert.equal(progress.completedStageCount, 5);
  assert.equal(progress.skippedStageCount, 1);
  assert.equal(progress.inProgressStageCount, 1);
  assert.equal(progress.completionPercent, 24);
  assert.ok(progress.completionPercent < 100);
  assert.equal(progress.unfinishedStageIds.includes(rest[0]), true);
});

test("9. all completed stages yield 100%, and skipped stages do not", () => {
  const allCompleted = calculateSurveyProgress(fillStageStates("COMPLETED"));
  assert.equal(allCompleted.completionPercent, 100);
  assert.equal(allCompleted.completedStageCount, 21);
  assert.equal(allCompleted.unfinishedStageIds.length, 0);

  const skippedLast = calculateSurveyProgress(fillStageStates("COMPLETED", {
    [SURVEY_STAGE_IDS[SURVEY_STAGE_IDS.length - 1]]: "SKIPPED",
  }));
  assert.equal(skippedLast.completedStageCount, 20);
  assert.ok(skippedLast.completionPercent < 100);
  assert.equal(skippedLast.unfinishedStageIds.length, 1);
});

test("10. survey progress stays independent from evidence verification", () => {
  const progressSource = fs.readFileSync(path.join(repositoryRoot, "lib/field/survey-progress.ts"), "utf8");
  assert.equal(/from ["'][^"']*evidence/.test(progressSource), false);

  const progress = calculateSurveyProgress(fillStageStates("COMPLETED"));
  assert.equal(progress.completionPercent, 100);

  const exhaustEvidence = Object.freeze({
    id: "fixture-field-exhaust",
    fieldPath: "facilityCheck.exhaustPossible",
    sourceType: "OWNER_STATEMENT",
    verificationStatus: "UNKNOWN",
    confirmationRequirement: "EXPERT_CONFIRMATION_REQUIRED",
    description: "SAMPLE fixture, not an actual facility observation",
  });
  const coverageResult = calculateEvidenceCoverage(
    EVIDENCE_COVERAGE_POLICY_V1.fields.map((field) => ({
      ...field,
      evidence: field.fieldPath === exhaustEvidence.fieldPath ? [exhaustEvidence] : [],
    })),
    EVIDENCE_COVERAGE_POLICY_V1.policyVersion,
  );

  assert.equal(coverageResult.policyVersion, "evidence-coverage-v1");
  assert.equal(coverageResult.hasCriticalUnresolved, true);
  assert.ok(coverageResult.totalCoverage.coveragePercent < 100);
  assert.equal(progress.completionPercent, 100);
  assert.equal(progress.policyVersion.startsWith("survey-progress"), true);
});
