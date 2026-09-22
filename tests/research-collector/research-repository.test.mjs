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
    module.require = (specifier) => originalRequire(specifier.startsWith("@/")
      ? path.join(repositoryRoot, specifier.slice(2))
      : specifier);
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    module._compile(output, filename);
  };
  return () => {
    if (previousLoader) loadModule.extensions[".ts"] = previousLoader;
    else delete loadModule.extensions[".ts"];
  };
}

function fixtureRecord(id, verificationStatus = "CONFIRMED") {
  return {
    schemaVersion: "frameone.lease-research-record.v1.2",
    recordId: id,
    source: {
      sourceUrl: `https://example.invalid/${id}`,
      sourceName: "fixture source",
      sourceType: "ONLINE_LISTING",
      collectedAt: "2026-09-20T00:00:00.000Z",
      pageTitle: "fixture",
    },
    property: {
      addressRaw: "서울 fixture로 1",
      address: "서울 fixture로 1",
      floor: "1",
      contractAreaM2: 60,
      contractAreaPyeong: 18.15,
      exclusiveAreaM2: 50,
      exclusiveAreaPyeong: 15.12,
    },
    lease: {
      depositAmount: 50_000_000,
      rentAmount: 4_500_000,
      managementFeeAmount: 100_000,
      premiumAmount: null,
      premiumStatus: "NEGOTIABLE",
      vatStatus: "UNKNOWN",
    },
    optional: {
      parking: "주차가능여부 가능 | 총주차대수 3773대 | 무료 2대 | 추가 주차 협의 가능",
      parkingAvailable: true,
      buildingTotalParkingSpaces: 3_773,
      includedParkingSpaces: 2,
      additionalParkingStatus: "NEGOTIABLE",
      moveIn: null,
      existingBusinessType: null,
      buildingName: "롯데월드타워",
    },
    quality: {
      verificationStatus,
      freshnessStatus: "CURRENT_30D",
      duplicateStatus: "NO_MATCH",
      warnings: [],
    },
    evidence: {
      raw: { rent: "450만원" },
      normalized: { rent: 4_500_000 },
      fieldStatus: { rent: "HUMAN_CONFIRMED" },
      excerpts: { rent: "월세 450만원" },
    },
    history: [],
  };
}

test("Research API는 CONFIRMED만 idempotent 저장하고 원문 Evidence와 상태 변경 이력을 보존한다", async () => {
  const originalCwd = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "frameone-research-repository-"));
  const restoreLoader = installTypeScriptLoader();
  try {
    process.chdir(tempRoot);
    const collection = loadModule(path.join(repositoryRoot, "app/api/research-records/route.ts"));
    const detail = loadModule(path.join(repositoryRoot, "app/api/research-records/[id]/route.ts"));
    const repository = loadModule(path.join(repositoryRoot, "lib/research/research-repository.ts"));

    for (const status of ["COLLECTED", "REVIEW_REQUIRED", "EXCLUDED"]) {
      const blocked = await collection.POST(new Request("http://localhost/api/research-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fixtureRecord(`blocked-${status}`, status)),
      }));
      assert.equal(blocked.status, 422);
      assert.match((await blocked.json()).message, /Only CONFIRMED/);
    }

    const confirmed = fixtureRecord("confirmed-1");
    const first = await collection.POST(new Request("http://localhost/api/research-records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(confirmed),
    }));
    assert.equal(first.status, 201);
    assert.equal((await first.json()).repositoryRecordId, "confirmed-1");

    const repeated = await collection.POST(new Request("http://localhost/api/research-records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(confirmed),
    }));
    assert.equal(repeated.status, 200);
    assert.equal((await repeated.json()).created, false);

    const records = await (await collection.GET()).json();
    assert.equal(records.length, 1);
    assert.equal(records[0].evidence.raw.rent, "450만원");
    assert.equal(records[0].optional.buildingTotalParkingSpaces, 3_773);
    assert.equal(records[0].optional.includedParkingSpaces, 2);
    assert.equal((await repository.listResearchRecords()).length, 1);
    assert.equal((await repository.getResearchRecord("confirmed-1")).recordId, "confirmed-1");

    const excluded = await detail.PATCH(new Request("http://localhost/api/research-records/confirmed-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationStatus: "EXCLUDED", changedAt: "2026-09-22T01:00:00.000Z" }),
    }), { params: Promise.resolve({ id: "confirmed-1" }) });
    assert.equal(excluded.status, 200);
    const excludedRecord = await excluded.json();
    assert.equal(excludedRecord.quality.verificationStatus, "EXCLUDED");
    assert.equal(excludedRecord.history.at(-1).previousValue, "CONFIRMED");

    const read = await detail.GET(new Request("http://localhost/api/research-records/confirmed-1"), {
      params: Promise.resolve({ id: "confirmed-1" }),
    });
    assert.equal(read.status, 200);
    assert.equal((await read.json()).quality.verificationStatus, "EXCLUDED");
  } finally {
    process.chdir(originalCwd);
    restoreLoader();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
