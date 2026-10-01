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

const check = (state = "UNKNOWN", verificationStatus = "NOT_CHECKED", sourceType) => ({
  state,
  verificationStatus,
  ...(sourceType ? { sourceType } : {}),
});

test("Bakery Facility Assessment는 Candidate 소유권과 blocker 의미를 보존한다", async (t) => {
  const previous = {
    cases: process.env.FRAMEONE_CASES_FILE,
    candidates: process.env.FRAMEONE_CANDIDATES_FILE,
    facility: process.env.FRAMEONE_CANDIDATE_FACILITY_FILE,
  };
  const tempParent = fs.realpathSync(os.tmpdir());
  const tempRoot = fs.mkdtempSync(path.join(tempParent, "frameone-facility-assessment-"));
  process.env.FRAMEONE_CASES_FILE = path.join(tempRoot, "cases.json");
  process.env.FRAMEONE_CANDIDATES_FILE = path.join(tempRoot, "candidates.json");
  process.env.FRAMEONE_CANDIDATE_FACILITY_FILE = path.join(tempRoot, "facility-assessments.json");
  const restoreLoader = installTypeScriptLoader();

  try {
    const cases = loadModule(path.join(repositoryRoot, "app/api/cases/route.ts"));
    const candidates = loadModule(path.join(repositoryRoot, "app/api/candidates/route.ts"));
    const facility = loadModule(path.join(repositoryRoot, "app/api/candidates/[candidateId]/facility-assessment/route.ts"));
    const risk = loadModule(path.join(repositoryRoot, "lib/candidates/bakery-facility-risk.ts"));
    const caseA = await (await cases.POST(request("http://localhost/api/cases", "POST", { name: "시설검토 Case A", clientName: "Sample" }))).json();
    const caseB = await (await cases.POST(request("http://localhost/api/cases", "POST", { name: "시설검토 Case B", clientName: "Sample" }))).json();
    const candidateA = await (await candidates.POST(request("http://localhost/api/candidates", "POST", { caseId: caseA.caseId, label: "시설 후보 A", source: "CASE_DIRECT" }))).json();
    const candidateB = await (await candidates.POST(request("http://localhost/api/candidates", "POST", { caseId: caseB.caseId, label: "시설 후보 B", source: "CASE_DIRECT" }))).json();
    const paramsA = { params: Promise.resolve({ candidateId: candidateA.candidateId }) };
    let assessmentA;
    let updatedAssessmentA;

    await t.test("assessment create and read preserve UNKNOWN without false defaults", async () => {
      const response = await facility.POST(request("http://localhost", "POST", {
        caseId: caseA.caseId,
        checks: { exhaust: check() },
      }), paramsA);
      assert.equal(response.status, 201);
      assessmentA = await response.json();
      assert.match(assessmentA.assessmentId, /^facility-assessment-/);
      assert.deepEqual(assessmentA.checks.exhaust, { state: "UNKNOWN", verificationStatus: "NOT_CHECKED" });
      assert.equal(Object.hasOwn(assessmentA.checks, "electricity"), false);
      assert.equal(assessmentA.revisions.length, 1);
      assert.deepEqual(assessmentA.revisions[0].checks, assessmentA.checks);

      const read = await facility.GET(new Request(`http://localhost?caseId=${caseA.caseId}`), paramsA);
      assert.equal(read.status, 200);
      assert.equal((await read.json()).assessmentId, assessmentA.assessmentId);
    });

    await t.test("partial update preserves existing checks and reload persistence", async () => {
      const response = await facility.PATCH(request("http://localhost", "PATCH", {
        caseId: caseA.caseId,
        checks: { electricity: { ...check("FEASIBLE", "VERIFIED", "FIELD"), note: "현장 분전반 확인", observedAt: "2026-10-01" } },
      }), paramsA);
      assert.equal(response.status, 200);
      const updated = await response.json();
      updatedAssessmentA = updated;
      assert.deepEqual(updated.checks.exhaust, assessmentA.checks.exhaust);
      assert.equal(updated.checks.electricity.state, "FEASIBLE");
      assert.equal(updated.createdAt, assessmentA.createdAt);
      assert.equal(updated.revisions.length, 2);
      assert.deepEqual(updated.revisions[0].checks, assessmentA.checks);
      assert.equal(Object.hasOwn(updated.revisions[0].checks, "electricity"), false);

      const repositoryPath = path.join(repositoryRoot, "lib/candidates/bakery-facility-assessment-repository.ts");
      delete loadModule.cache[loadModule.resolve(repositoryPath)];
      const freshRepository = loadModule(repositoryPath);
      const reloaded = await freshRepository.getBakeryFacilityAssessment(candidateA.candidateId, caseA.caseId);
      assert.equal(reloaded.checks.electricity.note, "현장 분전반 확인");
      assert.equal(reloaded.revisions.length, 2);
    });

    await t.test("identical PATCH is idempotent and meaningful PATCH appends one revision", async () => {
      const identical = await facility.PATCH(request("http://localhost", "PATCH", {
        caseId: caseA.caseId,
        checks: { electricity: { ...check("FEASIBLE", "VERIFIED", "FIELD"), note: "현장 분전반 확인", observedAt: "2026-10-01" } },
      }), paramsA);
      assert.equal(identical.status, 200);
      const unchanged = await identical.json();
      assert.equal(unchanged.revisions.length, 2);
      assert.equal(unchanged.updatedAt, updatedAssessmentA.updatedAt);

      await new Promise((resolve) => setTimeout(resolve, 2));
      const meaningful = await facility.PATCH(request("http://localhost", "PATCH", {
        caseId: caseA.caseId,
        checks: { exhaust: check("UNKNOWN", "FIELD_CHECK_REQUIRED") },
      }), paramsA);
      assert.equal(meaningful.status, 200);
      const changed = await meaningful.json();
      assert.equal(changed.revisions.length, 3);
      assert.notEqual(changed.updatedAt, unchanged.updatedAt);
      assert.deepEqual(changed.revisions[1].checks, updatedAssessmentA.checks);
    });

    await t.test("candidate ownership, invalid candidate and Case isolation are enforced", async () => {
      const wrongCase = await facility.GET(new Request(`http://localhost?caseId=${caseB.caseId}`), paramsA);
      assert.equal(wrongCase.status, 404);
      const invalid = await facility.POST(request("http://localhost", "POST", { caseId: caseA.caseId, checks: {} }), { params: Promise.resolve({ candidateId: "candidate-missing" }) });
      assert.equal(invalid.status, 404);
      const own = await facility.POST(request("http://localhost", "POST", { caseId: caseB.caseId, checks: { drainage: check() } }), { params: Promise.resolve({ candidateId: candidateB.candidateId }) });
      assert.equal(own.status, 201);
      assert.notEqual((await own.json()).assessmentId, assessmentA.assessmentId);
    });

    await t.test("new Assessment starts with only unresolved checks", () => {
      const summary = risk.calculateBakeryFacilityRiskSummary({ checks: {} });
      assert.equal(summary.hardBlockers.length, 0);
      assert.equal(summary.conditionalBlockers.length, 0);
      assert.equal(summary.unresolvedChecks.length, 11);
      assert.equal(summary.verifiedCount, 0);
    });

    await t.test("UNKNOWN and NOT_CHECKED are unresolved, never Conditional", () => {
      const summary = risk.calculateBakeryFacilityRiskSummary({ checks: { exhaust: check() } });
      assert.equal(summary.hardBlockers.length, 0);
      assert.equal(summary.conditionalBlockers.length, 0);
      assert.ok(summary.unresolvedChecks.some((item) => item.key === "exhaust"));
      assert.ok(summary.nextActions.some((item) => item.includes("배기")));
    });

    await t.test("FEASIBLE with expert confirmation required remains unresolved", () => {
      const summary = risk.calculateBakeryFacilityRiskSummary({ checks: { electricity: check("FEASIBLE", "EXPERT_CONFIRM_REQUIRED") } });
      assert.equal(summary.hardBlockers.length, 0);
      assert.equal(summary.conditionalBlockers.length, 0);
      assert.ok(summary.unresolvedChecks.some((item) => item.key === "electricity"));
      assert.equal(summary.verifiedCount, 0);
    });

    await t.test("CONDITIONAL is counted once and may retain its confirmation action", () => {
      const summary = risk.calculateBakeryFacilityRiskSummary({ checks: {
        electricity: { ...check("CONDITIONAL", "EXPERT_CONFIRM_REQUIRED"), note: "전기 증설 필요" },
      } });
      assert.deepEqual(summary.conditionalBlockers.map((item) => item.key), ["electricity"]);
      assert.equal(summary.unresolvedChecks.some((item) => item.key === "electricity"), false);
      assert.match(summary.conditionalBlockers[0].nextAction, /전문가 확인/);
      assert.ok(summary.nextActions.some((item) => item.includes("전문가 확인")));
    });

    await t.test("confirmed physical impossibility creates deterministic Hard Blockers", () => {
      for (const key of ["exhaust", "electricity", "drainage", "equipmentIngress", "manufacturingSpace"]) {
        const summary = risk.calculateBakeryFacilityRiskSummary({ checks: { [key]: check("NOT_FEASIBLE", "VERIFIED", "FIELD") } });
        assert.ok(summary.hardBlockers.some((item) => item.key === key), key);
      }
    });

    await t.test("confirmed refusal for required work creates a Hard Blocker", () => {
      const confirmed = risk.calculateBakeryFacilityRiskSummary({ checks: { landlordConsent: check("NOT_FEASIBLE", "VERIFIED", "LANDLORD") } });
      assert.deepEqual(confirmed.hardBlockers.map((item) => item.key), ["landlordConsent"]);
      const userClaim = risk.calculateBakeryFacilityRiskSummary({ checks: { landlordConsent: check("NOT_FEASIBLE", "VERIFIED", "USER_INPUT") } });
      assert.equal(userClaim.hardBlockers.length, 0);
    });

    await t.test("legal use impossibility requires expert or authority source", () => {
      const authority = risk.calculateBakeryFacilityRiskSummary({ checks: { buildingUsePermit: check("NOT_FEASIBLE", "VERIFIED", "AUTHORITY") } });
      assert.deepEqual(authority.hardBlockers.map((item) => item.key), ["buildingUsePermit"]);
      const unconfirmed = risk.calculateBakeryFacilityRiskSummary({ checks: { buildingUsePermit: check("NOT_FEASIBLE", "AUTHORITY_CONFIRM_REQUIRED", "USER_INPUT") } });
      assert.equal(unconfirmed.hardBlockers.length, 0);
      assert.ok(unconfirmed.nextActions.some((item) => item.includes("관할기관 확인")));
    });

    await t.test("expert confirmation remains unresolved and Hard can coexist", () => {
      const summary = risk.calculateBakeryFacilityRiskSummary({ checks: {
        exhaust: check("NOT_FEASIBLE", "VERIFIED", "FIELD"),
        electricity: check("UNKNOWN", "EXPERT_CONFIRM_REQUIRED"),
      } });
      assert.ok(summary.hardBlockers.some((item) => item.key === "exhaust"));
      assert.ok(summary.unresolvedChecks.some((item) => item.key === "electricity"));
      assert.equal(summary.conditionalBlockers.some((item) => item.key === "electricity"), false);
      assert.ok(summary.nextActions.some((item) => item.includes("전문가 확인")));
    });

    await t.test("legacy Risk V1 remains separate and unchanged", () => {
      const legacy = fs.readFileSync(path.join(repositoryRoot, "lib/diagnosis/calculateRisk.ts"), "utf8");
      const repository = fs.readFileSync(path.join(repositoryRoot, "lib/candidates/bakery-facility-assessment-repository.ts"), "utf8");
      assert.match(legacy, /export function calculateRisk/);
      assert.match(legacy, /let score = 0/);
      assert.doesNotMatch(repository, /calculateRisk/);
    });
  } finally {
    if (previous.cases === undefined) delete process.env.FRAMEONE_CASES_FILE; else process.env.FRAMEONE_CASES_FILE = previous.cases;
    if (previous.candidates === undefined) delete process.env.FRAMEONE_CANDIDATES_FILE; else process.env.FRAMEONE_CANDIDATES_FILE = previous.candidates;
    if (previous.facility === undefined) delete process.env.FRAMEONE_CANDIDATE_FACILITY_FILE; else process.env.FRAMEONE_CANDIDATE_FACILITY_FILE = previous.facility;
    restoreLoader();
    const resolved = path.resolve(tempRoot);
    assert.equal(path.dirname(resolved), tempParent);
    assert.match(path.basename(resolved), /^frameone-facility-assessment-/);
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
