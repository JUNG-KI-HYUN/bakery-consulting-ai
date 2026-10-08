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
      assert.deepEqual(created.analysisRunLinks, []);
      assert.deepEqual(created.consultationIds, []);
      assert.equal(created.customerProfile, undefined);
      assert.equal(created.frameoneRecommendation, undefined);
      assert.equal(created.createdAt, created.updatedAt);
    });

    await t.test("customer input and FRAMEONE recommendation save and load without mixing", async () => {
      const customerProfile = {
        brandName: "테스트 베이커리",
        totalAvailableCapitalWon: 100_000_000,
        ownerWorksInStore: true,
        ownerRoles: ["운영", "판매"],
        targetMonthlyOwnerIncomeWon: 4_000_000,
        unknownBudgetItems: ["보증금", "권리금"],
      };
      const frameoneRecommendation = {
        recommendedConcept: "제조형 + 테이크아웃 중심",
        recommendedAreaMinPyeong: 30,
        recommendedAreaMaxPyeong: 35,
        capitalPlan: { depositBudgetWon: 30_000_000, premiumBudgetWon: 0 },
        premiumPolicy: "0원 우선",
      };
      const response = await detail.PATCH(new Request(`http://localhost/api/cases/${created.caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerProfile, frameoneRecommendation }),
      }), { params: Promise.resolve({ caseId: created.caseId }) });
      assert.equal(response.status, 200);
      const saved = await response.json();
      assert.deepEqual(saved.customerProfile, customerProfile);
      assert.deepEqual(saved.frameoneRecommendation, frameoneRecommendation);
      assert.equal(saved.customerProfile.unknownBudgetItems.includes("보증금"), true);
      assert.equal(saved.frameoneRecommendation.capitalPlan.depositBudgetWon, 30_000_000);
      const loaded = await detail.GET(new Request(`http://localhost/api/cases/${created.caseId}`), {
        params: Promise.resolve({ caseId: created.caseId }),
      });
      assert.deepEqual((await loaded.json()).frameoneRecommendation, frameoneRecommendation);
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
      assert.deepEqual(updated.analysisRunLinks, []);
      assert.deepEqual(updated.consultationIds, []);
      assert.ok(Date.parse(updated.updatedAt) >= Date.parse(created.updatedAt));
    });

    await t.test("canonical AnalysisRun snapshot은 중복 없이 append되고 과거 Run을 보존한다", async () => {
      const runA = {
        analysisRunId: "basic-location-run:11111111-1111-4111-8111-111111111111",
        label: "성수 테스트 위치",
        address: "서울시 성동구 테스트 주소",
        latitude: 37.5445,
        longitude: 127.056,
        radiusM: 300,
        officialMarketName: null,
        analyzedAt: "2026-10-01T01:00:00.000Z",
      };
      const link = (analysisRunLink) => detail.PATCH(new Request(`http://localhost/api/cases/${created.caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisRunLink }),
      }), { params: Promise.resolve({ caseId: created.caseId }) });

      const first = await link(runA);
      assert.equal(first.status, 200);
      const linkedA = await first.json();
      assert.deepEqual(linkedA.analysisRunIds, [runA.analysisRunId]);
      assert.equal(linkedA.analysisRunLinks[0].label, runA.label);
      assert.ok(Date.parse(linkedA.analysisRunLinks[0].linkedAt));

      const duplicate = await (await link(runA)).json();
      assert.deepEqual(duplicate.analysisRunIds, [runA.analysisRunId]);
      assert.equal(duplicate.analysisRunLinks.length, 1);
      assert.equal(duplicate.updatedAt, linkedA.updatedAt);

      const runB = {
        ...runA,
        analysisRunId: "basic-location-run:22222222-2222-4222-8222-222222222222",
        label: "성수 재분석 위치",
        radiusM: 500,
        analyzedAt: "2026-10-01T02:00:00.000Z",
      };
      const linkedB = await (await link(runB)).json();
      assert.deepEqual(linkedB.analysisRunIds, [runA.analysisRunId, runB.analysisRunId]);
      assert.deepEqual(linkedB.analysisRunLinks.map((item) => item.analysisRunId), [runA.analysisRunId, runB.analysisRunId]);
    });

    await t.test("Draft 또는 가짜 식별자는 AnalysisRun으로 저장하지 않는다", async () => {
      const response = await detail.PATCH(new Request(`http://localhost/api/cases/${created.caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisRunLink: {
          analysisRunId: "draft-location",
          label: null,
          address: null,
          latitude: 37.5,
          longitude: 127,
          radiusM: 300,
          officialMarketName: null,
          analyzedAt: "2026-10-01T01:00:00.000Z",
        } }),
      }), { params: Promise.resolve({ caseId: created.caseId }) });
      assert.equal(response.status, 400);
      assert.match((await response.json()).message, /analysisRunId/);
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
