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
const check = (state = "UNKNOWN", verificationStatus = "NOT_CHECKED", sourceType) => ({ state, verificationStatus, ...(sourceType ? { sourceType } : {}) });

test("Candidate Lease Assessment는 asking snapshot과 계약 Evidence를 독립 보존한다", async (t) => {
  const previous = {
    cases: process.env.FRAMEONE_CASES_FILE,
    candidates: process.env.FRAMEONE_CANDIDATES_FILE,
    facility: process.env.FRAMEONE_CANDIDATE_FACILITY_FILE,
    lease: process.env.FRAMEONE_CANDIDATE_LEASE_FILE,
  };
  const tempParent = fs.realpathSync(os.tmpdir());
  const tempRoot = fs.mkdtempSync(path.join(tempParent, "frameone-lease-assessment-"));
  process.env.FRAMEONE_CASES_FILE = path.join(tempRoot, "cases.json");
  process.env.FRAMEONE_CANDIDATES_FILE = path.join(tempRoot, "candidates.json");
  process.env.FRAMEONE_CANDIDATE_FACILITY_FILE = path.join(tempRoot, "facility-assessments.json");
  process.env.FRAMEONE_CANDIDATE_LEASE_FILE = path.join(tempRoot, "lease-assessments.json");
  const restoreLoader = installTypeScriptLoader();

  try {
    const cases = loadModule(path.join(repositoryRoot, "app/api/cases/route.ts"));
    const candidates = loadModule(path.join(repositoryRoot, "app/api/candidates/route.ts"));
    const candidateDetail = loadModule(path.join(repositoryRoot, "app/api/candidates/[candidateId]/route.ts"));
    const facility = loadModule(path.join(repositoryRoot, "app/api/candidates/[candidateId]/facility-assessment/route.ts"));
    const lease = loadModule(path.join(repositoryRoot, "app/api/candidates/[candidateId]/lease-assessment/route.ts"));
    const risk = loadModule(path.join(repositoryRoot, "lib/candidates/candidate-lease-risk.ts"));
    const caseA = await (await cases.POST(request("http://localhost/api/cases", "POST", { name: "Lease Case A", clientName: "Sample" }))).json();
    const caseB = await (await cases.POST(request("http://localhost/api/cases", "POST", { name: "Lease Case B", clientName: "Sample" }))).json();
    const candidateA = await (await candidates.POST(request("http://localhost/api/candidates", "POST", {
      caseId: caseA.caseId, label: "Lease 후보 A", source: "CASE_DIRECT",
      depositWon: 80_000_000, monthlyRentWon: 4_500_000, maintenanceFeeWon: 300_000, premiumWon: 20_000_000,
    }))).json();
    const candidateB = await (await candidates.POST(request("http://localhost/api/candidates", "POST", { caseId: caseB.caseId, label: "Lease 후보 B", source: "CASE_DIRECT" }))).json();
    const paramsA = { params: Promise.resolve({ candidateId: candidateA.candidateId }) };
    const facilityRecord = await (await facility.POST(request("http://localhost", "POST", { caseId: caseA.caseId, checks: { exhaust: check() } }), paramsA)).json();
    let leaseA;
    let updatedLeaseA;

    await t.test("create prefills Candidate asking terms and read returns the snapshot", async () => {
      const response = await lease.POST(request("http://localhost", "POST", { caseId: caseA.caseId, checks: {} }), paramsA);
      assert.equal(response.status, 201);
      leaseA = await response.json();
      assert.match(leaseA.assessmentId, /^lease-assessment-/);
      assert.deepEqual(leaseA.reviewedTerms, candidateA.currentAskingTerms);
      assert.equal(leaseA.revisions.length, 1);
      const read = await lease.GET(new Request(`http://localhost?caseId=${caseA.caseId}`), paramsA);
      assert.equal(read.status, 200);
      assert.equal((await read.json()).assessmentId, leaseA.assessmentId);
    });

    await t.test("Candidate asking terms changes do not mutate the reviewed snapshot", async () => {
      const candidateUpdate = await candidateDetail.PATCH(request("http://localhost", "PATCH", { monthlyRentWon: 5_000_000 }), paramsA);
      assert.equal(candidateUpdate.status, 200);
      assert.equal((await candidateUpdate.json()).currentAskingTerms.monthlyRentWon, 5_000_000);
      const read = await lease.GET(new Request(`http://localhost?caseId=${caseA.caseId}`), paramsA);
      assert.equal((await read.json()).reviewedTerms.monthlyRentWon, 4_500_000);
    });

    await t.test("partial update preserves terms and reload persistence", async () => {
      const response = await lease.PATCH(request("http://localhost", "PATCH", {
        caseId: caseA.caseId,
        reviewedTerms: { leaseTermMonths: 24, rentFreeMonths: 2, vatTreatment: "SEPARATE" },
        checks: { restorationScope: { ...check("CONDITIONAL", "DOCUMENT_CONFIRM_REQUIRED", "BROKER"), note: "원상복구 범위 명문화 필요" } },
      }), paramsA);
      assert.equal(response.status, 200);
      updatedLeaseA = await response.json();
      assert.equal(updatedLeaseA.reviewedTerms.monthlyRentWon, 4_500_000);
      assert.equal(updatedLeaseA.reviewedTerms.leaseTermMonths, 24);
      assert.equal(updatedLeaseA.checks.restorationScope.state, "CONDITIONAL");
      assert.equal(updatedLeaseA.revisions.length, 2);

      const repositoryPath = path.join(repositoryRoot, "lib/candidates/candidate-lease-assessment-repository.ts");
      delete loadModule.cache[loadModule.resolve(repositoryPath)];
      const freshRepository = loadModule(repositoryPath);
      const reloaded = await freshRepository.getCandidateLeaseAssessment(candidateA.candidateId, caseA.caseId);
      assert.equal(reloaded.reviewedTerms.rentFreeMonths, 2);

      const clearedResponse = await lease.PATCH(request("http://localhost", "PATCH", {
        caseId: caseA.caseId,
        reviewedTerms: { maintenanceFeeWon: null },
      }), paramsA);
      const clearedTerms = await clearedResponse.json();
      assert.equal(clearedResponse.status, 200);
      assert.equal(Object.hasOwn(clearedTerms.reviewedTerms, "maintenanceFeeWon"), false);
      updatedLeaseA = clearedTerms;
      assert.equal(reloaded.checks.restorationScope.note, "원상복구 범위 명문화 필요");
    });

    await t.test("identical PATCH is idempotent and meaningful PATCH appends a revision", async () => {
      const identicalPayload = {
        caseId: caseA.caseId,
        reviewedTerms: { leaseTermMonths: 24, rentFreeMonths: 2, vatTreatment: "SEPARATE" },
        checks: { restorationScope: { ...check("CONDITIONAL", "DOCUMENT_CONFIRM_REQUIRED", "BROKER"), note: "원상복구 범위 명문화 필요" } },
      };
      const unchanged = await (await lease.PATCH(request("http://localhost", "PATCH", identicalPayload), paramsA)).json();
      assert.equal(unchanged.revisions.length, 3);
      assert.equal(unchanged.updatedAt, updatedLeaseA.updatedAt);
      await new Promise((resolve) => setTimeout(resolve, 2));
      const changed = await (await lease.PATCH(request("http://localhost", "PATCH", {
        caseId: caseA.caseId,
        checks: { handoverCondition: check("UNKNOWN", "LANDLORD_CONFIRM_REQUIRED") },
      }), paramsA)).json();
      assert.equal(changed.revisions.length, 4);
      assert.notEqual(changed.updatedAt, unchanged.updatedAt);
      assert.deepEqual(changed.revisions[2].reviewedTerms, updatedLeaseA.reviewedTerms);
    });

    await t.test("Candidate ownership, invalid Candidate and Case isolation are enforced", async () => {
      assert.equal((await lease.GET(new Request(`http://localhost?caseId=${caseB.caseId}`), paramsA)).status, 404);
      assert.equal((await lease.POST(request("http://localhost", "POST", { caseId: caseA.caseId }), { params: Promise.resolve({ candidateId: "candidate-missing" }) })).status, 404);
      const malformed = await lease.POST(request("http://localhost", "POST", { caseId: caseB.caseId, checks: { restorationScope: check("INVALID", "NOT_CHECKED") } }), { params: Promise.resolve({ candidateId: candidateB.candidateId }) });
      assert.equal(malformed.status, 400);
      const own = await lease.POST(request("http://localhost", "POST", { caseId: caseB.caseId }), { params: Promise.resolve({ candidateId: candidateB.candidateId }) });
      assert.equal(own.status, 201);
      assert.notEqual((await own.json()).assessmentId, leaseA.assessmentId);
    });

    await t.test("new, UNKNOWN and NOT_CHECKED checks are unresolved rather than Conditional", () => {
      const initial = risk.calculateCandidateLeaseRiskSummary({ checks: {} });
      assert.deepEqual([initial.hardIssues.length, initial.conditionalIssues.length, initial.unresolvedChecks.length, initial.verifiedCount], [0, 0, 11, 0]);
      const unknown = risk.calculateCandidateLeaseRiskSummary({ checks: { restorationScope: check() } });
      assert.equal(unknown.conditionalIssues.length, 0);
      assert.ok(unknown.unresolvedChecks.some((item) => item.key === "restorationScope"));
    });

    await t.test("confirmed business-use prohibition is Hard while an unverified opinion is unresolved", () => {
      const confirmed = risk.calculateCandidateLeaseRiskSummary({ checks: { businessUseRestriction: check("UNACCEPTABLE", "VERIFIED", "DOCUMENT") } });
      assert.deepEqual(confirmed.hardIssues.map((item) => item.key), ["businessUseRestriction"]);
      const opinion = risk.calculateCandidateLeaseRiskSummary({ checks: { businessUseRestriction: check("UNACCEPTABLE", "DOCUMENT_CONFIRM_REQUIRED", "USER_INPUT") } });
      assert.equal(opinion.hardIssues.length, 0);
      assert.ok(opinion.unresolvedChecks.some((item) => item.key === "businessUseRestriction"));
    });

    await t.test("actual restoration condition is Conditional without double counting", () => {
      const summary = risk.calculateCandidateLeaseRiskSummary({ checks: {
        restorationScope: { ...check("CONDITIONAL", "DOCUMENT_CONFIRM_REQUIRED", "BROKER"), note: "철거범위 명문화 필요" },
      } });
      assert.deepEqual(summary.conditionalIssues.map((item) => item.key), ["restorationScope"]);
      assert.equal(summary.unresolvedChecks.some((item) => item.key === "restorationScope"), false);
      assert.match(summary.conditionalIssues[0].nextAction, /계약문서 확인/);
    });

    await t.test("Facility Assessment and legacy Risk V1 remain separate", async () => {
      const facilityRead = await facility.GET(new Request(`http://localhost?caseId=${caseA.caseId}`), paramsA);
      assert.equal((await facilityRead.json()).assessmentId, facilityRecord.assessmentId);
      const legacy = fs.readFileSync(path.join(repositoryRoot, "lib/diagnosis/calculateRisk.ts"), "utf8");
      const repository = fs.readFileSync(path.join(repositoryRoot, "lib/candidates/candidate-lease-assessment-repository.ts"), "utf8");
      assert.match(legacy, /export function calculateRisk/);
      assert.doesNotMatch(repository, /calculateRisk|rental-market|economic/);
    });
  } finally {
    if (previous.cases === undefined) delete process.env.FRAMEONE_CASES_FILE; else process.env.FRAMEONE_CASES_FILE = previous.cases;
    if (previous.candidates === undefined) delete process.env.FRAMEONE_CANDIDATES_FILE; else process.env.FRAMEONE_CANDIDATES_FILE = previous.candidates;
    if (previous.facility === undefined) delete process.env.FRAMEONE_CANDIDATE_FACILITY_FILE; else process.env.FRAMEONE_CANDIDATE_FACILITY_FILE = previous.facility;
    if (previous.lease === undefined) delete process.env.FRAMEONE_CANDIDATE_LEASE_FILE; else process.env.FRAMEONE_CANDIDATE_LEASE_FILE = previous.lease;
    restoreLoader();
    const resolved = path.resolve(tempRoot);
    assert.equal(path.dirname(resolved), tempParent);
    assert.match(path.basename(resolved), /^frameone-lease-assessment-/);
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
