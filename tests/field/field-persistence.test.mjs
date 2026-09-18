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

const { createFieldSurveyService, isSafeFieldStorageKey, resolveUnderFieldRoot } = loadModule(
  path.join(repositoryRoot, "lib/field/field-survey-service.server.ts"),
);
const { isCandidateStoreId, isSiteSurveyId } = loadModule(
  path.join(repositoryRoot, "lib/field/identifiers.ts"),
);
const { sampleConsultation } = loadModule(path.join(repositoryRoot, "lib/diagnosis/sample-data.ts"));

const consultationsPath = path.join(repositoryRoot, "data/consultations.json");
const consultationsBefore = fs.existsSync(consultationsPath)
  ? fs.readFileSync(consultationsPath)
  : null;
const tempRoots = [];

function makeService() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "frameone-field-surveys-"));
  tempRoots.push(rootDir);
  return {
    rootDir,
    service: createFieldSurveyService({
      rootDir,
      now: () => "2026-09-18T01:00:00.000Z",
    }),
  };
}

after(() => {
  for (const rootDir of tempRoots) fs.rmSync(rootDir, { recursive: true, force: true });
  if (consultationsBefore) {
    assert.deepEqual(fs.readFileSync(consultationsPath), consultationsBefore);
  }
});

function fixtureConsultation(id) {
  const record = structuredClone(sampleConsultation);
  record.consultation.id = id;
  record.consultation.sampleData = true;
  record.consultation.customerName = "SAMPLE 고객";
  record.consultation.contact = "000-0000-0000";
  record.candidateStore.address = "SAMPLE 주소: 실제 점포 아님";
  return record;
}

test("1. explicit link creation assigns one candidateStoreId", async () => {
  const { service } = makeService();
  const record = fixtureConsultation("fixture-field-consult-a");
  const created = await service.ensureLink({ consultationId: record.consultation.id });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(isCandidateStoreId(created.value.candidateStoreId), true);
  assert.equal(created.value.consultationId, record.consultation.id);
  assert.equal(created.value.linkVersion, 1);
});

test("2. repeating link creation returns the same candidateStoreId", async () => {
  const { service } = makeService();
  const consultationId = "fixture-field-consult-reuse";
  const first = await service.ensureLink({ consultationId });
  const second = await service.ensureLink({ consultationId });
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(second.value.candidateStoreId, first.value.candidateStoreId);
});

test("3. a plain read does not create a candidateStoreId", async () => {
  const { service, rootDir } = makeService();
  const read = await service.readLink("fixture-field-consult-read");
  assert.equal(read.ok, true);
  if (!read.ok) return;
  assert.equal(read.value, null);
  assert.equal(fs.existsSync(path.join(rootDir, "links")), false);
});

test("4. different consultations receive different candidateStoreIds", async () => {
  const { service } = makeService();
  const first = await service.ensureLink({ consultationId: "fixture-field-consult-one" });
  const second = await service.ensureLink({ consultationId: "fixture-field-consult-two" });
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.notEqual(first.value.candidateStoreId, second.value.candidateStoreId);
});

test("5-7. SiteSurvey creation keeps store relation and starts at sequence 1", async () => {
  const { service } = makeService();
  const consultationId = "fixture-field-consult-survey";
  const link = await service.ensureLink({ consultationId });
  assert.equal(link.ok, true);
  if (!link.ok) return;
  const started = await service.startSurvey({
    consultationId,
    candidateStoreId: link.value.candidateStoreId,
  });
  assert.equal(started.ok, true);
  if (!started.ok) return;
  assert.equal(started.value.created, true);
  assert.equal(isSiteSurveyId(started.value.survey.surveyId), true);
  assert.equal(started.value.survey.candidateStoreId, link.value.candidateStoreId);
  assert.equal(started.value.survey.surveySequence, 1);
  assert.equal(started.value.survey.status, "DRAFT");
  assert.equal(started.value.survey.draftVersion, 1);
});

test("8. an active survey is reused instead of creating another", async () => {
  const { service } = makeService();
  const consultationId = "fixture-field-consult-active";
  const link = await service.ensureLink({ consultationId });
  if (!link.ok) return;
  const first = await service.startSurvey({
    consultationId,
    candidateStoreId: link.value.candidateStoreId,
  });
  const second = await service.startSurvey({
    consultationId,
    candidateStoreId: link.value.candidateStoreId,
  });
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(second.value.created, false);
  assert.equal(second.value.survey.surveyId, first.value.survey.surveyId);
  assert.equal(second.value.survey.surveySequence, 1);
});

test("9. a completed survey allows the next sequence", async () => {
  const { service } = makeService();
  const consultationId = "fixture-field-consult-completed";
  const link = await service.ensureLink({ consultationId });
  if (!link.ok) return;
  const first = await service.startSurvey({
    consultationId,
    candidateStoreId: link.value.candidateStoreId,
  });
  if (!first.ok) return;
  const completed = await service.updateSurveyDraft({
    surveyId: first.value.survey.surveyId,
    expectedDraftVersion: first.value.survey.draftVersion,
    status: "COMPLETED",
  });
  assert.equal(completed.ok, true);
  const second = await service.startSurvey({
    consultationId,
    candidateStoreId: link.value.candidateStoreId,
  });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.value.created, true);
  assert.equal(second.value.survey.surveySequence, 2);
  assert.notEqual(second.value.survey.surveyId, first.value.survey.surveyId);
});

test("10. draft save and reload restores the same domain", async () => {
  const { service } = makeService();
  const consultationId = "fixture-field-consult-reload";
  const link = await service.ensureLink({ consultationId });
  if (!link.ok) return;
  const started = await service.startSurvey({
    consultationId,
    candidateStoreId: link.value.candidateStoreId,
  });
  if (!started.ok) return;
  const loaded = await service.getSurvey(started.value.survey.surveyId);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.deepEqual(loaded.value, started.value.survey);
});

test("11. draft update increments draftVersion", async () => {
  const { service } = makeService();
  const consultationId = "fixture-field-consult-update";
  const link = await service.ensureLink({ consultationId });
  if (!link.ok) return;
  const started = await service.startSurvey({
    consultationId,
    candidateStoreId: link.value.candidateStoreId,
  });
  if (!started.ok) return;
  const nextStates = { ...started.value.survey.stageStates, siteBasic: "IN_PROGRESS" };
  const updated = await service.updateSurveyDraft({
    surveyId: started.value.survey.surveyId,
    expectedDraftVersion: 1,
    stageStates: nextStates,
  });
  assert.equal(updated.ok, true);
  if (!updated.ok) return;
  assert.equal(updated.value.draftVersion, 2);
  assert.equal(updated.value.stageStates.siteBasic, "IN_PROGRESS");
  const reloaded = await service.getSurvey(started.value.survey.surveyId);
  assert.equal(reloaded.ok, true);
  if (!reloaded.ok) return;
  assert.equal(reloaded.value.draftVersion, 2);
});

test("12. a stale expectedDraftVersion does not overwrite", async () => {
  const { service } = makeService();
  const consultationId = "fixture-field-consult-conflict";
  const link = await service.ensureLink({ consultationId });
  if (!link.ok) return;
  const started = await service.startSurvey({
    consultationId,
    candidateStoreId: link.value.candidateStoreId,
  });
  if (!started.ok) return;
  const firstUpdate = await service.updateSurveyDraft({
    surveyId: started.value.survey.surveyId,
    expectedDraftVersion: 1,
    status: "IN_PROGRESS",
  });
  assert.equal(firstUpdate.ok, true);
  const stale = await service.updateSurveyDraft({
    surveyId: started.value.survey.surveyId,
    expectedDraftVersion: 1,
    status: "READY_FOR_REVIEW",
  });
  assert.equal(stale.ok, false);
  if (stale.ok) return;
  assert.equal(stale.code, "VERSION_CONFLICT");
  const stored = await service.getSurvey(started.value.survey.surveyId);
  assert.equal(stored.ok, true);
  if (!stored.ok) return;
  assert.equal(stored.value.draftVersion, 2);
  assert.equal(stored.value.status, "IN_PROGRESS");
});

test("13. invalid or corrupt JSON is not treated as a normal draft", async () => {
  const { service, rootDir } = makeService();
  const consultationId = "fixture-field-consult-corrupt";
  const link = await service.ensureLink({ consultationId });
  if (!link.ok) return;
  const started = await service.startSurvey({
    consultationId,
    candidateStoreId: link.value.candidateStoreId,
  });
  if (!started.ok) return;
  const surveyFile = path.join(rootDir, "surveys", `${started.value.survey.surveyId}.json`);
  fs.writeFileSync(surveyFile, "{", "utf8");
  const corrupt = await service.getSurvey(started.value.survey.surveyId);
  assert.equal(corrupt.ok, false);
  if (corrupt.ok) return;
  assert.equal(corrupt.code, "INVALID_DATA");

  fs.writeFileSync(
    surveyFile,
    JSON.stringify({ schemaVersion: "not-a-supported-survey", surveyId: started.value.survey.surveyId }),
    "utf8",
  );
  const unsupported = await service.getSurvey(started.value.survey.surveyId);
  assert.equal(unsupported.ok, false);
  if (unsupported.ok) return;
  assert.equal(unsupported.code, "INVALID_DATA");
});

test("14. linking does not mutate the consultation object or consultations.json", async () => {
  const { service } = makeService();
  const record = fixtureConsultation("fixture-field-consult-immutable");
  const snapshot = structuredClone(record);
  Object.freeze(record);
  Object.freeze(record.candidateStore);
  const created = await service.ensureLink({ consultationId: record.consultation.id });
  assert.equal(created.ok, true);
  assert.deepEqual(record, snapshot);
  assert.equal(Object.hasOwn(record.candidateStore, "candidateStoreId"), false);
});

test("15. persistence tests write only to the injected temp directory", async () => {
  const { service, rootDir } = makeService();
  const consultationId = "fixture-field-consult-temp";
  const link = await service.ensureLink({ consultationId });
  if (!link.ok) return;
  await service.startSurvey({
    consultationId,
    candidateStoreId: link.value.candidateStoreId,
  });
  assert.equal(rootDir.startsWith(os.tmpdir()) || rootDir.includes("frameone-field-surveys-"), true);
  assert.equal(fs.existsSync(path.join(rootDir, "links", `${consultationId}.json`)), true);
  const repoFieldRoot = path.join(repositoryRoot, "data/field-surveys");
  if (fs.existsSync(repoFieldRoot)) {
    const names = fs.readdirSync(repoFieldRoot, { recursive: true }).map(String);
    assert.equal(names.some((name) => name.includes("fixture-field-consult-temp")), false);
  }
});

test("16. path traversal and unsafe IDs are rejected without leaving storage root", async () => {
  const { service, rootDir } = makeService();
  const outsideMarker = path.join(rootDir, "outside-marker.txt");
  fs.writeFileSync(outsideMarker, "SAMPLE outside marker", "utf8");

  for (const badId of ["../../test", "..\\..\\test", "/test", "C:\\test", "a/b", "a\\b", ".."]) {
    assert.equal(isSafeFieldStorageKey(badId), false);
    const read = await service.readLink(badId);
    assert.equal(read.ok, false);
    if (!read.ok) assert.equal(read.code, "INVALID_DATA");
    const ensure = await service.ensureLink({ consultationId: badId });
    assert.equal(ensure.ok, false);
    if (!ensure.ok) assert.equal(ensure.code, "INVALID_DATA");
  }

  assert.equal(isSafeFieldStorageKey("sample-001"), true);
  assert.equal(isSafeFieldStorageKey("consult-1782978715998"), true);

  const badSurvey = await service.getSurvey("not-a-survey-id");
  assert.equal(badSurvey.ok, false);
  if (!badSurvey.ok) assert.equal(badSurvey.code, "INVALID_DATA");

  const escaped = resolveUnderFieldRoot(rootDir, "links", "..", "..", "outside-marker.txt");
  assert.equal(escaped.ok, false);
  if (!escaped.ok) assert.equal(escaped.code, "INVALID_DATA");

  const nested = resolveUnderFieldRoot(rootDir, "links", "sample-001.json");
  assert.equal(nested.ok, true);
  if (nested.ok) {
    assert.equal(nested.value.startsWith(path.resolve(rootDir)), true);
  }

  assert.equal(fs.readFileSync(outsideMarker, "utf8"), "SAMPLE outside marker");
  assert.equal(fs.existsSync(path.join(rootDir, "links", "test.json")), false);
});
