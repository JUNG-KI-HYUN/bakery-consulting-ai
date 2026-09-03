import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const loadModule = createRequire(import.meta.url);

// Reuse the existing node:test + TypeScript transpilation approach without build artifacts.
function installTypeScriptLoader() {
  const previousLoader = loadModule.extensions[".ts"];
  loadModule.extensions[".ts"] = (module, filename) => {
    const originalRequire = module.require.bind(module);
    module.require = (specifier) => originalRequire(
      specifier.startsWith("@/")
        ? path.join(repositoryRoot, specifier.slice(2))
        : specifier,
    );
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    module._compile(output, filename);
  };
  return () => {
    if (previousLoader) loadModule.extensions[".ts"] = previousLoader;
    else delete loadModule.extensions[".ts"];
  };
}

test("Evidence storage round-trip through existing consultation route handlers", async (t) => {
  const originalCwd = process.cwd();
  const tempParent = fs.realpathSync(os.tmpdir());
  const tempRoot = fs.mkdtempSync(path.join(tempParent, "frameone-evidence-round-trip-"));
  const restoreLoader = installTypeScriptLoader();

  try {
    // diagnosis-service captures cwd on import. Load it only after entering isolated storage.
    assert.notEqual(path.resolve(tempRoot), path.resolve(repositoryRoot));
    process.chdir(tempRoot);
    const collection = loadModule(path.join(repositoryRoot, "app/api/consultations/route.ts"));
    const detail = loadModule(path.join(repositoryRoot, "app/api/consultations/[id]/route.ts"));
    const diagnosis = loadModule(path.join(repositoryRoot, "app/api/consultations/[id]/diagnose/route.ts"));
    const { sampleConsultation } = loadModule(path.join(repositoryRoot, "lib/diagnosis/sample-data.ts"));
    const { buildDiagnosisResult } = loadModule(path.join(repositoryRoot, "lib/diagnosis/mockAiDiagnosis.ts"));
    const consultationsFile = path.join(tempRoot, "data/consultations.json");

    function fixtureRecord(id) {
      const record = structuredClone(sampleConsultation);
      record.consultation.id = `fixture-evidence-${id}`;
      record.consultation.title = `Evidence round-trip fixture ${id}`;
      assert.equal(record.consultation.sampleData, true);
      return record;
    }

    function fieldCheckFixture(id) {
      return {
        id: `fixture-field-check-${id}`,
        fieldPath: "facilityCheck.electricCapacity",
        assertedValue: 30,
        unit: "kW",
        valueType: "actual",
        verificationStatus: "VERIFIED",
        sourceType: "FIELD_CHECK",
        description: "Isolated fixture, not an actual facility observation",
        sourceRef: "fixture-source-document",
        sourceUrl: "https://example.invalid/fixture/source-document",
        observedAt: "2026-09-01T01:00:00.000Z",
        checkedAt: "2026-09-02T02:00:00.000Z",
        checkedBy: "fixture-reviewer",
        effectiveAt: "2026-09-01T00:00:00.000Z",
        expiresAt: "2026-09-30T00:00:00.000Z",
        createdAt: "2026-09-03T03:00:00.000Z",
        limitation: "Fixture only; does not establish facility feasibility",
      };
    }

    async function postRecord(record) {
      const response = await collection.POST(new Request("http://localhost/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      }));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), record);
    }

    async function readRecord(id) {
      const response = await detail.GET(new Request(`http://localhost/api/consultations/${id}`), {
        params: Promise.resolve({ id }),
      });
      assert.equal(response.status, 200);
      return response.json();
    }

    async function assertStored(record) {
      const id = record.consultation.id;
      assert.deepEqual(await readRecord(id), record);
      const response = await collection.GET();
      assert.equal(response.status, 200);
      const list = await response.json();
      assert.deepEqual(list.find((item) => item.consultation.id === id), record);
      const diskRecords = JSON.parse(fs.readFileSync(consultationsFile, "utf8"));
      assert.deepEqual(diskRecords.find((item) => item.consultation.id === id), record);
      assert.equal(diskRecords.filter((item) => item.consultation.id === id).length, 1);
    }

    // The existing POST contract replaces the whole record. Updates carry forward GET data.
    // These tests do not introduce partial-update/PATCH semantics or merge omitted fields.
    async function updateMemo(record, memo) {
      const current = await readRecord(record.consultation.id);
      const updated = { ...current, consultation: { ...current.consultation, memo } };
      await postRecord(updated);
      await assertStored(updated);
      assert.deepEqual(updated.evidence, record.evidence);
      assert.equal(updated.schemaVersion, record.schemaVersion);
      return updated;
    }

    await t.test("CASE A: legacy sample reads and the existing diagnosis flow remains unchanged", async () => {
      assert.equal(Object.hasOwn(sampleConsultation, "evidence"), false);
      assert.equal(Object.hasOwn(sampleConsultation, "schemaVersion"), false);
      await assertStored(sampleConsultation);
      const id = sampleConsultation.consultation.id;
      const response = await diagnosis.POST(new Request(`http://localhost/api/consultations/${id}/diagnose`, {
        method: "POST",
      }), { params: Promise.resolve({ id }) });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.ok(!Number.isNaN(Date.parse(result.generatedAt)));
      const expected = JSON.parse(JSON.stringify(buildDiagnosisResult(sampleConsultation)));
      expected.generatedAt = result.generatedAt;
      assert.deepEqual(result, expected);
      const drafts = JSON.parse(fs.readFileSync(path.join(tempRoot, "data/diagnosis-drafts.json.backup"), "utf8"));
      assert.deepEqual(drafts[0], result);
      await assertStored(sampleConsultation);
    });

    await t.test("CASE B: one FIELD_CHECK preserves numeric value, unit and all supplied metadata", async () => {
      const record = { ...fixtureRecord("b"), evidence: [fieldCheckFixture("b")] };
      await postRecord(record);
      await assertStored(record);
      await updateMemo(record, "Fixture B unrelated memo edit");
    });

    await t.test("CASE C: multiple sources preserve order and verified public estimates stay estimated", async () => {
      const record = {
        ...fixtureRecord("c"),
        evidence: [
          fieldCheckFixture("c"),
          { id: "fixture-owner", sourceType: "OWNER_STATEMENT", verificationStatus: "UNKNOWN" },
          { id: "fixture-public", sourceType: "PUBLIC_DATA", verificationStatus: "VERIFIED", valueType: "estimated", assertedValue: 100 },
        ],
      };
      await postRecord(record);
      await assertStored(record);
      await updateMemo(record, "Fixture C unrelated memo edit");
    });

    await t.test("CASE D: editing another field through full-record update retains evidence and version", async () => {
      const record = {
        ...fixtureRecord("d"),
        evidence: [fieldCheckFixture("d")],
        schemaVersion: "fixture-consultation-v1",
      };
      await postRecord(record);
      await assertStored(record);
      const updated = await updateMemo(record, "Fixture D changed memo only");
      assert.notEqual(updated.consultation.memo, record.consultation.memo);
    });

    await t.test("CASE E: minimal evidence receives no optional fields or automatic timestamps", async () => {
      const record = {
        ...fixtureRecord("e"),
        evidence: [{ id: "fixture-minimal", sourceType: "DOCUMENT", verificationStatus: "ESTIMATED" }],
      };
      await postRecord(record);
      await assertStored(record);
      await updateMemo(record, "Fixture E unrelated memo edit");
    });

    await t.test("CASE F: object and array snapshots retain all JSON value kinds through update", async () => {
      const record = {
        ...fixtureRecord("f"),
        evidence: [
          {
            id: "fixture-object", sourceType: "DOCUMENT", verificationStatus: "CONFLICTED",
            assertedValue: { text: "fixture", amount: 0, checked: false, missing: null, nested: [30, true, { value: "fixture" }] },
          },
          {
            id: "fixture-array", sourceType: "PHOTO", verificationStatus: "STALE",
            assertedValue: ["fixture", 0, false, null, [1, 2], { label: "fixture-object" }],
          },
        ],
      };
      await postRecord(record);
      await assertStored(record);
      await updateMemo(record, "Fixture F unrelated memo edit");
    });

    await t.test("CASE G: legacy records without evidence or schemaVersion stay without them", async () => {
      const record = fixtureRecord("g");
      await postRecord(record);
      await assertStored(record);
      const updated = await updateMemo(record, "Fixture G unrelated memo edit");
      assert.equal(Object.hasOwn(updated, "schemaVersion"), false);
      assert.equal(Object.hasOwn(updated, "evidence"), false);
    });

    await t.test("CASE H: a supplied schemaVersion is preserved without creating evidence", async () => {
      const record = { ...fixtureRecord("h"), schemaVersion: "fixture-consultation-v1.2" };
      await postRecord(record);
      await assertStored(record);
      const updated = await updateMemo(record, "Fixture H unrelated memo edit");
      assert.equal(Object.hasOwn(updated, "evidence"), false);
    });

    await t.test("CASE I: UNKNOWN, missing assertedValue and explicit null are not normalized", async () => {
      const record = {
        ...fixtureRecord("i"),
        evidence: [
          { id: "fixture-unknown-missing", sourceType: "CUSTOMER_INPUT", verificationStatus: "UNKNOWN" },
          { id: "fixture-unknown-null", sourceType: "OWNER_STATEMENT", verificationStatus: "UNKNOWN", assertedValue: null },
        ],
      };
      await postRecord(record);
      await assertStored(record);
      await updateMemo(record, "Fixture I unrelated memo edit");
    });

    await t.test("Full-record replacement still accepts explicit empty evidence and replaces other optional fields", async () => {
      const record = { ...fixtureRecord("replacement"), evidence: [fieldCheckFixture("replacement")] };
      await postRecord(record);
      const replacement = { ...await readRecord(record.consultation.id), evidence: [] };
      delete replacement.brandMarketing;
      await postRecord(replacement);
      await assertStored(replacement);
      assert.equal(Object.hasOwn(await readRecord(record.consultation.id), "brandMarketing"), false);
    });
  } finally {
    process.chdir(originalCwd);
    restoreLoader();
    // Delete only the exact mkdtemp directory, after confirming its resolved parent and prefix.
    assert.equal(path.dirname(fs.realpathSync(tempRoot)), tempParent);
    assert.ok(path.basename(tempRoot).startsWith("frameone-evidence-round-trip-"));
    fs.rmSync(tempRoot, { recursive: true, force: true });
    assert.equal(fs.existsSync(tempRoot), false);
  }
});
