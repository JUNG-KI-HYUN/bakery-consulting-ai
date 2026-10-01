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
    module.require = (specifier) => originalRequire(specifier.startsWith("@/") ? path.join(repositoryRoot, specifier.slice(2)) : specifier);
    module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, filename);
  };
  return () => {
    if (previousLoader) loadModule.extensions[".ts"] = previousLoader;
    else delete loadModule.extensions[".ts"];
  };
}

function request(url, method, body) {
  return new Request(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

test("Candidate Store Core는 Case와 Analysis Run을 검증하며 runtime file에 격리된다", async (t) => {
  const previous = {
    cases: process.env.FRAMEONE_CASES_FILE,
    candidates: process.env.FRAMEONE_CANDIDATES_FILE,
    runs: process.env.FRAMEONE_ANALYSIS_RUNS_FILE,
  };
  const tempParent = fs.realpathSync(os.tmpdir());
  const tempRoot = fs.mkdtempSync(path.join(tempParent, "frameone-candidate-store-"));
  const casesFile = path.join(tempRoot, "cases.json");
  const candidatesFile = path.join(tempRoot, "candidates.json");
  const runsFile = path.join(tempRoot, "analysis-runs.json");
  process.env.FRAMEONE_CASES_FILE = casesFile;
  process.env.FRAMEONE_CANDIDATES_FILE = candidatesFile;
  process.env.FRAMEONE_ANALYSIS_RUNS_FILE = runsFile;
  const restoreLoader = installTypeScriptLoader();

  try {
    const cases = loadModule(path.join(repositoryRoot, "app/api/cases/route.ts"));
    const candidates = loadModule(path.join(repositoryRoot, "app/api/candidates/route.ts"));
    const candidateDetail = loadModule(path.join(repositoryRoot, "app/api/candidates/[candidateId]/route.ts"));
    const caseA = await (await cases.POST(request("http://localhost/api/cases", "POST", { name: "Case A", clientName: "Sample A" }))).json();
    const caseB = await (await cases.POST(request("http://localhost/api/cases", "POST", { name: "Case B", clientName: "Sample B" }))).json();
    let candidateA;

    await t.test("Candidate list starts empty for one Case", async () => {
      const response = await candidates.GET(new Request(`http://localhost/api/candidates?caseId=${caseA.caseId}`));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), []);
      assert.deepEqual(JSON.parse(fs.readFileSync(candidatesFile, "utf8")), []);
    });

    await t.test("direct Case creation preserves missing values instead of zero", async () => {
      const response = await candidates.POST(request("http://localhost/api/candidates", "POST", {
        caseId: caseA.caseId,
        label: "후보 A",
        address: "서울시 테스트 주소 A",
        monthlyRentWon: 4_500_000,
        parkingStatus: "UNKNOWN",
        source: "CASE_DIRECT",
      }));
      assert.equal(response.status, 201);
      candidateA = await response.json();
      assert.match(candidateA.candidateId, /^candidate-[0-9a-f-]+$/);
      assert.equal(candidateA.caseId, caseA.caseId);
      assert.equal(candidateA.status, "REVIEWING");
      assert.equal(candidateA.currentAskingTerms.monthlyRentWon, 4_500_000);
      assert.equal(Object.hasOwn(candidateA.currentAskingTerms, "depositWon"), false);
      assert.deepEqual(candidateA.analysisLinks, []);
    });

    await t.test("multiple candidates accumulate in the same Case", async () => {
      const response = await candidates.POST(request("http://localhost/api/candidates", "POST", {
        caseId: caseA.caseId,
        label: "후보 B",
        source: "CASE_DIRECT",
      }));
      assert.equal(response.status, 201);
      const list = await (await candidates.GET(new Request(`http://localhost/api/candidates?caseId=${caseA.caseId}`))).json();
      assert.deepEqual(list.map((item) => item.label), ["후보 A", "후보 B"]);
      assert.notEqual(list[0].candidateId, list[1].candidateId);
    });

    await t.test("Candidate list is isolated by Case", async () => {
      await candidates.POST(request("http://localhost/api/candidates", "POST", { caseId: caseB.caseId, label: "다른 Case 후보", source: "CASE_DIRECT" }));
      const listA = await (await candidates.GET(new Request(`http://localhost/api/candidates?caseId=${caseA.caseId}`))).json();
      const listB = await (await candidates.GET(new Request(`http://localhost/api/candidates?caseId=${caseB.caseId}`))).json();
      assert.equal(listA.length, 2);
      assert.equal(listB.length, 1);
      assert.ok(listA.every((item) => item.caseId === caseA.caseId));
    });

    await t.test("Candidate detail and update keep identity and existing values", async () => {
      const params = { params: Promise.resolve({ candidateId: candidateA.candidateId }) };
      const detailResponse = await candidateDetail.GET(new Request("http://localhost"), params);
      assert.equal(detailResponse.status, 200);
      const updateResponse = await candidateDetail.PATCH(request("http://localhost", "PATCH", { status: "SHORTLISTED", depositWon: 100_000_000 }), params);
      assert.equal(updateResponse.status, 200);
      const updated = await updateResponse.json();
      assert.equal(updated.candidateId, candidateA.candidateId);
      assert.equal(updated.status, "SHORTLISTED");
      assert.equal(updated.currentAskingTerms.depositWon, 100_000_000);
      assert.equal(updated.currentAskingTerms.monthlyRentWon, 4_500_000);
      assert.equal(updated.createdAt, candidateA.createdAt);
    });

    await t.test("unknown Case is rejected", async () => {
      const response = await candidates.POST(request("http://localhost/api/candidates", "POST", { caseId: "case-missing", label: "잘못된 후보", source: "CASE_DIRECT" }));
      assert.equal(response.status, 404);
      assert.match((await response.json()).message, /Case/);
    });

    await t.test("invalid and missing Analysis Run links are rejected", async () => {
      const invalid = await candidates.POST(request("http://localhost/api/candidates", "POST", { caseId: caseA.caseId, label: "잘못된 Run", source: "MARKET_ANALYSIS", linkedAnalysisRunId: "draft-target" }));
      assert.equal(invalid.status, 400);
      const missing = await candidates.POST(request("http://localhost/api/candidates", "POST", { caseId: caseA.caseId, label: "없는 Run", source: "MARKET_ANALYSIS", linkedAnalysisRunId: "basic-location-run:99999999-9999-4999-8999-999999999999" }));
      assert.equal(missing.status, 400);
      assert.match((await missing.json()).message, /Analysis Run/);
    });

    await t.test("Market Workspace handoff without a persisted run stays unlinked", async () => {
      const response = await candidates.POST(request("http://localhost/api/candidates", "POST", {
        caseId: caseB.caseId,
        label: "Workspace 후보",
        source: "MARKET_WORKSPACE",
      }));
      assert.equal(response.status, 201);
      const created = await response.json();
      assert.equal(created.source, "MARKET_WORKSPACE");
      assert.deepEqual(created.analysisLinks, []);
    });

    await t.test("valid Analysis Run is linked with its persisted target snapshot", async () => {
      const runId = "basic-location-run:11111111-1111-4111-8111-111111111111";
      const timestamp = "2026-10-01T01:00:00.000Z";
      fs.writeFileSync(runsFile, `${JSON.stringify({
        schemaVersion: "frameone.analysis-run-registry.v1",
        runs: [{
          schemaVersion: "frameone.analysis-run-snapshot.v1",
          analysisRunId: runId,
          targetSnapshot: {
            analysisRunId: runId,
            label: "Market 후보 위치",
            address: "서울시 테스트 주소",
            latitude: 37.5,
            longitude: 127,
            radiusM: 500,
            source: "map",
            explorationSnapshot: { marketId: null, marketName: null, submarketId: null, submarketName: null, nodeId: null, nodeName: null },
            officialReference: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          createdAt: timestamp,
          updatedAt: timestamp,
          sections: {},
        }],
      }, null, 2)}\n`, "utf8");
      const response = await candidates.POST(request("http://localhost/api/candidates", "POST", {
        caseId: caseA.caseId,
        label: "Market 후보",
        address: "서울시 테스트 주소",
        source: "MARKET_ANALYSIS",
        linkedAnalysisRunId: runId,
      }));
      assert.equal(response.status, 201);
      const created = await response.json();
      assert.equal(created.analysisLinks.length, 1);
      assert.equal(created.analysisLinks[0].analysisRunId, runId);
      assert.equal(created.analysisLinks[0].targetSnapshot.address, "서울시 테스트 주소");
    });

    await t.test("repository reload reads persisted candidates", async () => {
      const repositoryPath = path.join(repositoryRoot, "lib/candidates/candidate-repository.ts");
      delete loadModule.cache[loadModule.resolve(repositoryPath)];
      const freshRepository = loadModule(repositoryPath);
      const reloaded = await freshRepository.getCandidateStore(candidateA.candidateId);
      assert.equal(reloaded.candidateId, candidateA.candidateId);
      assert.equal(reloaded.status, "SHORTLISTED");
    });
  } finally {
    if (previous.cases === undefined) delete process.env.FRAMEONE_CASES_FILE; else process.env.FRAMEONE_CASES_FILE = previous.cases;
    if (previous.candidates === undefined) delete process.env.FRAMEONE_CANDIDATES_FILE; else process.env.FRAMEONE_CANDIDATES_FILE = previous.candidates;
    if (previous.runs === undefined) delete process.env.FRAMEONE_ANALYSIS_RUNS_FILE; else process.env.FRAMEONE_ANALYSIS_RUNS_FILE = previous.runs;
    restoreLoader();
    const resolved = path.resolve(tempRoot);
    assert.equal(path.dirname(resolved), tempParent);
    assert.match(path.basename(resolved), /^frameone-candidate-store-/);
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
