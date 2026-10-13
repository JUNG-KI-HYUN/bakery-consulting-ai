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
      assert.equal(created.targetOpeningDate, "2027-03-01");
      assert.equal(created.customerProfile, undefined);
      assert.equal(created.frameoneRecommendation, undefined);
      assert.equal(created.createdAt, created.updatedAt);
    });

    await t.test("legacy Case without consultation profiles loads", async () => {
      const response = await detail.GET(new Request(`http://localhost/api/cases/${created.caseId}`), {
        params: Promise.resolve({ caseId: created.caseId }),
      });
      assert.equal(response.status, 200);
      const loaded = await response.json();
      assert.equal(loaded.customerProfile, undefined);
      assert.equal(loaded.frameoneRecommendation, undefined);
    });

    await t.test("CUSTOMER profile saves and reloads without FRAMEONE fallback", async () => {
      const customerProfile = {
        brandName: "프레임원 베이커리 2호 Pilot",
        totalAvailableCapitalWon: 100_000_000,
        ownerWorksInStore: true,
        ownerRoles: ["제조", "운영"],
        conceptPreference: "동네 제조형 베이커리 희망",
        preferredAreaMinPyeong: 30,
        preferredAreaMaxPyeong: 40,
        directManufacturing: true,
        coffeeSales: false,
        hallPreference: "소규모 홀 희망",
        deliveryPreference: "초기에는 미운영",
        employeePlan: "대표 포함 3명",
        targetMonthlyOwnerIncomeWon: 4_000_000,
        loanPreference: "정책자금 검토 희망",
        equipmentSupportNeeded: "장비 구성 상담 필요",
        taxLaborPmNeeded: "필요",
        longTermPlan: "2호점은 운영 안정화 후 검토",
      };
      const response = await detail.PATCH(new Request(`http://localhost/api/cases/${created.caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferredArea: "성수동 우선 / 대안지역 제안 가능",
          customerProfile,
        }),
      }), { params: Promise.resolve({ caseId: created.caseId }) });
      assert.equal(response.status, 200);
      const saved = await response.json();
      assert.deepEqual(saved.customerProfile, customerProfile);
      assert.equal(saved.customerProfile.brandName, "프레임원 베이커리 2호 Pilot");
      assert.equal(saved.customerProfile.totalAvailableCapitalWon, 100_000_000);
      assert.equal(saved.customerProfile.preferredAreaMinPyeong, 30);
      assert.equal(saved.customerProfile.preferredAreaMaxPyeong, 40);
      assert.equal(saved.preferredArea, "성수동 우선 / 대안지역 제안 가능");
      assert.equal(saved.frameoneRecommendation, undefined);

      const loaded = await detail.GET(new Request(`http://localhost/api/cases/${created.caseId}`), {
        params: Promise.resolve({ caseId: created.caseId }),
      });
      const reloaded = await loaded.json();
      assert.deepEqual(reloaded.customerProfile, customerProfile);
      assert.equal(reloaded.preferredArea, "성수동 우선 / 대안지역 제안 가능");
      assert.equal(reloaded.frameoneRecommendation, undefined);
    });

    await t.test("FRAMEONE recommendation and capital plan save and reload without CUSTOMER mixing", async () => {
      const frameoneRecommendation = {
        recommendedConcept: "제조형 + 테이크아웃 중심",
        recommendedMonthlyRentMaxWon: 3_500_000,
        recommendedAreaMinPyeong: 30,
        recommendedAreaMaxPyeong: 35,
        recommendedSeatMin: 8,
        recommendedSeatMax: 12,
        staffingRecommendation: "대표 포함 3명",
        capitalPlan: {
          operatingReserveWon: 20_000_000,
          preOpeningInvestmentLimitWon: 120_000_000,
          depositBudgetWon: 30_000_000,
          equipmentBudgetWon: 25_000_000,
          fitoutBudgetWon: 40_000_000,
          openingCostBudgetWon: 10_000_000,
          premiumBudgetWon: 0,
        },
        premiumPolicy: "0원 우선",
        facilityStrategy: "전기·배기 현장 확인 후 확정",
        recommendationNotes: "시장 및 시설 조사 결과에 따라 재검토",
      };
      const response = await detail.PATCH(new Request(`http://localhost/api/cases/${created.caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameoneRecommendation }),
      }), { params: Promise.resolve({ caseId: created.caseId }) });
      assert.equal(response.status, 200);
      const saved = await response.json();
      assert.deepEqual(saved.frameoneRecommendation, frameoneRecommendation);
      assert.equal(saved.frameoneRecommendation.recommendedMonthlyRentMaxWon, 3_500_000);
      assert.equal(saved.frameoneRecommendation.capitalPlan.depositBudgetWon, 30_000_000);
      const loaded = await detail.GET(new Request(`http://localhost/api/cases/${created.caseId}`), {
        params: Promise.resolve({ caseId: created.caseId }),
      });
      const reloaded = await loaded.json();
      assert.deepEqual(reloaded.frameoneRecommendation, frameoneRecommendation);
      assert.equal(reloaded.frameoneRecommendation.recommendedMonthlyRentMaxWon, 3_500_000);
      assert.equal(reloaded.customerProfile.conceptPreference, "동네 제조형 베이커리 희망");
      assert.equal(reloaded.customerProfile.brandName, "프레임원 베이커리 2호 Pilot");
      assert.equal(reloaded.customerProfile.totalAvailableCapitalWon, 100_000_000);
      assert.equal(reloaded.customerProfile.preferredAreaMinPyeong, 30);
      assert.equal(reloaded.customerProfile.preferredAreaMaxPyeong, 40);
      assert.equal(reloaded.preferredArea, "성수동 우선 / 대안지역 제안 가능");
      assert.notEqual(reloaded.customerProfile.conceptPreference, reloaded.frameoneRecommendation.recommendedConcept);
      assert.equal(reloaded.customerProfile.targetMonthlyOwnerIncomeWon, 4_000_000);
      assert.equal(reloaded.frameoneRecommendation.capitalPlan.preOpeningInvestmentLimitWon, 120_000_000);
    });

    await t.test("opening date saves, serializes and reloads as the same calendar date", async () => {
      const response = await detail.PATCH(new Request(`http://localhost/api/cases/${created.caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetOpeningDate: "2026-12-15" }),
      }), { params: Promise.resolve({ caseId: created.caseId }) });
      assert.equal(response.status, 200);
      const saved = await response.json();
      assert.equal(saved.targetOpeningDate, "2026-12-15");

      const serialized = JSON.parse(fs.readFileSync(casesFile, "utf8"));
      assert.equal(serialized.find((item) => item.caseId === created.caseId).targetOpeningDate, "2026-12-15");

      const loaded = await detail.GET(new Request(`http://localhost/api/cases/${created.caseId}`), {
        params: Promise.resolve({ caseId: created.caseId }),
      });
      const reloaded = await loaded.json();
      assert.equal(reloaded.targetOpeningDate, "2026-12-15");
      assert.equal(reloaded.name, created.name);
      assert.equal(reloaded.clientName, created.clientName);
      assert.equal(reloaded.preferredArea, "성수동 우선 / 대안지역 제안 가능");
      assert.equal(reloaded.budgetMin, created.budgetMin);
      assert.equal(reloaded.budgetMax, created.budgetMax);
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
