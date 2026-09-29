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

function installTypeScriptLoader() {
  const previousLoader = loadModule.extensions[".ts"];
  loadModule.extensions[".ts"] = (module, filename) => {
    const originalRequire = module.require.bind(module);
    module.require = (specifier) => originalRequire(
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
  return () => {
    if (previousLoader) loadModule.extensions[".ts"] = previousLoader;
    else delete loadModule.extensions[".ts"];
  };
}

test("Case 전용 repository와 API는 실제 프로젝트 데이터에서 격리된다", async (t) => {
  const originalCasesFile = process.env.FRAMEONE_CASES_FILE;
  const tempParent = fs.realpathSync(os.tmpdir());
  const tempRoot = fs.mkdtempSync(path.join(tempParent, "frameone-case-backbone-"));
  const casesFile = path.join(tempRoot, "data", "cases.json");
  const restoreLoader = installTypeScriptLoader();
  process.env.FRAMEONE_CASES_FILE = casesFile;

  try {
    assert.notEqual(path.resolve(tempRoot), path.resolve(repositoryRoot));
    const collection = loadModule(path.join(repositoryRoot, "app/api/cases/route.ts"));
    const detail = loadModule(path.join(repositoryRoot, "app/api/cases/[caseId]/route.ts"));
    let created;

    await t.test("empty Case list starts as an empty array", async () => {
      const response = await collection.GET();
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), []);
      assert.deepEqual(JSON.parse(fs.readFileSync(casesFile, "utf8")), []);
    });

    await t.test("Case create adds timestamps and empty future reference arrays", async () => {
      const response = await collection.POST(new Request("http://localhost/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "성수 베이커리 프로젝트",
          clientName: "테스트 고객",
          bakeryType: "제조 중심",
          preferredArea: "성수",
          budgetMin: 100_000_000,
          budgetMax: 200_000_000,
          targetOpeningDate: "2027-03-01",
        }),
      }));
      assert.equal(response.status, 201);
      created = await response.json();
      assert.match(created.caseId, /^case-[0-9a-f-]+$/);
      assert.equal(created.lifecycleStage, "EXPLORING");
      assert.equal(created.status, "ACTIVE");
      assert.deepEqual(created.analysisRunIds, []);
      assert.deepEqual(created.consultationIds, []);
      assert.equal(created.createdAt, created.updatedAt);
    });

    await t.test("Case list and detail return the created record", async () => {
      const list = await (await collection.GET()).json();
      assert.equal(list.length, 1);
      assert.equal(list[0].caseId, created.caseId);
      const response = await detail.GET(new Request(`http://localhost/api/cases/${created.caseId}`), {
        params: Promise.resolve({ caseId: created.caseId }),
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).name, "성수 베이커리 프로젝트");
    });

    await t.test("Case update changes editable fields without replacing references or createdAt", async () => {
      const response = await detail.PATCH(new Request(`http://localhost/api/cases/${created.caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "성수 베이커리 계약 검토", lifecycleStage: "LEASE_REVIEW" }),
      }), { params: Promise.resolve({ caseId: created.caseId }) });
      assert.equal(response.status, 200);
      const updated = await response.json();
      assert.equal(updated.name, "성수 베이커리 계약 검토");
      assert.equal(updated.lifecycleStage, "LEASE_REVIEW");
      assert.equal(updated.status, "ACTIVE");
      assert.equal(updated.createdAt, created.createdAt);
      assert.deepEqual(updated.analysisRunIds, []);
      assert.deepEqual(updated.consultationIds, []);
      assert.ok(Date.parse(updated.updatedAt) >= Date.parse(created.updatedAt));
    });

    await t.test("invalid input returns 400 and does not create or mutate a Case", async () => {
      const invalidCreate = await collection.POST(new Request("http://localhost/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "", clientName: "고객" }),
      }));
      assert.equal(invalidCreate.status, 400);
      assert.match((await invalidCreate.json()).message, /Case 이름/);

      const invalidUpdate = await detail.PATCH(new Request(`http://localhost/api/cases/${created.caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lifecycleStage: "UNKNOWN", budgetMin: 20, budgetMax: 10 }),
      }), { params: Promise.resolve({ caseId: created.caseId }) });
      assert.equal(invalidUpdate.status, 400);
      assert.equal((await (await collection.GET()).json()).length, 1);
    });

    await t.test("unknown Case returns 404 for detail and update", async () => {
      const missingGet = await detail.GET(new Request("http://localhost/api/cases/missing"), {
        params: Promise.resolve({ caseId: "missing" }),
      });
      assert.equal(missingGet.status, 404);
      const missingPatch = await detail.PATCH(new Request("http://localhost/api/cases/missing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "없는 Case" }),
      }), { params: Promise.resolve({ caseId: "missing" }) });
      assert.equal(missingPatch.status, 404);
    });

    await t.test("storage corruption returns a controlled 500 response", async () => {
      fs.writeFileSync(casesFile, "{invalid", "utf8");
      const response = await collection.GET();
      assert.equal(response.status, 500);
      assert.match((await response.json()).message, /저장소/);
    });
  } finally {
    if (originalCasesFile === undefined) delete process.env.FRAMEONE_CASES_FILE;
    else process.env.FRAMEONE_CASES_FILE = originalCasesFile;
    restoreLoader();
    const resolvedTempRoot = path.resolve(tempRoot);
    assert.equal(path.dirname(resolvedTempRoot), tempParent);
    assert.match(path.basename(resolvedTempRoot), /^frameone-case-backbone-/);
    fs.rmSync(resolvedTempRoot, { recursive: true, force: true });
  }
});
