import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const loadModule = createRequire(import.meta.url);
const previousLoader = loadModule.extensions[".ts"];
loadModule.extensions[".ts"] = (module, filename) => {
  const original = module.require.bind(module);
  module.require = (specifier) => original(
    specifier.startsWith("@/") ? path.join(repositoryRoot, specifier.slice(2)) : specifier,
  );
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText, filename);
};

after(() => {
  if (previousLoader) loadModule.extensions[".ts"] = previousLoader;
  else delete loadModule.extensions[".ts"];
});

const { ANALYSIS_CLUSTER_SCHEMA_VERSION } = loadModule(
  path.join(repositoryRoot, "lib/analysis-cluster/types.ts"),
);
const { validateAnalysisCluster } = loadModule(
  path.join(repositoryRoot, "lib/analysis-cluster/validation.ts"),
);

const STORE_A = "store_11111111-1111-4111-8111-111111111111";
const STORE_B = "store_22222222-2222-4222-8222-222222222222";
const RUN_A = "basic-location-run:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RUN_B = "basic-location-run:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function fixture(overrides = {}) {
  return {
    schemaVersion: ANALYSIS_CLUSTER_SCHEMA_VERSION,
    analysisClusterId: "analysis-cluster:seoul-review-001",
    label: "서울 후보 검토 묶음",
    analysisRunIds: [RUN_A],
    candidateStoreIds: [STORE_A],
    frameoneContext: {
      marketId: "SEOUL-MARKET-001",
      submarketId: "SEOUL-SUBMARKET-001",
      nodeId: "SEOUL-NODE-001",
    },
    createdAt: "2026-10-30T00:00:00.000Z",
    ...overrides,
  };
}

function expectSuccess(input) {
  const result = validateAnalysisCluster(input);
  assert.equal(result.ok, true, result.ok ? undefined : result.errors.join("\n"));
  return result.value;
}

function expectFailure(input, pattern) {
  const result = validateAnalysisCluster(input);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), pattern);
}

test("1. Candidate 1개 Cluster를 reference로 보존한다", () => {
  const cluster = expectSuccess(fixture());
  assert.deepEqual(cluster.candidateStoreIds, [STORE_A]);
});

test("2. Candidate N개 Cluster를 원래 순서로 보존한다", () => {
  const cluster = expectSuccess(fixture({ candidateStoreIds: [STORE_A, STORE_B] }));
  assert.deepEqual(cluster.candidateStoreIds, [STORE_A, STORE_B]);
});

test("3. Analysis Run N개를 원래 순서로 보존한다", () => {
  const cluster = expectSuccess(fixture({ analysisRunIds: [RUN_A, RUN_B] }));
  assert.deepEqual(cluster.analysisRunIds, [RUN_A, RUN_B]);
});

test("4. Cluster 두 개는 독립 identity와 reference 배열을 가진다", () => {
  const first = expectSuccess(fixture());
  const second = expectSuccess(fixture({
    analysisClusterId: "analysis-cluster:seoul-review-002",
    analysisRunIds: [RUN_B],
    candidateStoreIds: [STORE_B],
  }));
  assert.notEqual(first.analysisClusterId, second.analysisClusterId);
  assert.notDeepEqual(first.candidateStoreIds, second.candidateStoreIds);
});

test("5. malformed Candidate ID를 거부한다", () => {
  expectFailure(fixture({ candidateStoreIds: ["STORE-20261030-001"] }), /candidateStoreIds\[0\]/);
});

test("6. Candidate duplicate를 거부한다", () => {
  expectFailure(fixture({ candidateStoreIds: [STORE_A, STORE_A] }), /중복 ID/);
});

test("7. Analysis Run duplicate를 거부한다", () => {
  expectFailure(fixture({ analysisRunIds: [RUN_A, RUN_A] }), /중복 ID/);
});

test("8. 빈 analysisClusterId를 거부한다", () => {
  expectFailure(fixture({ analysisClusterId: "   " }), /analysisClusterId/);
});

test("9. 빈 label을 거부한다", () => {
  expectFailure(fixture({ label: "   " }), /label/);
});

test("10. 빈 FRAMEONE context reference를 거부한다", () => {
  expectFailure(fixture({ frameoneContext: { marketId: "" } }), /frameoneContext\.marketId/);
});

test("11. geometry, coordinates, grade, decision 필드는 V1에서 거부한다", () => {
  for (const key of ["geometry", "centerLat", "centerLng", "siteGrade", "decision"]) {
    expectFailure({ ...fixture(), [key]: "forbidden" }, new RegExp(key));
  }
  const cluster = expectSuccess(fixture());
  assert.deepEqual(Object.keys(cluster).sort(), [
    "analysisClusterId",
    "analysisRunIds",
    "candidateStoreIds",
    "createdAt",
    "frameoneContext",
    "label",
    "schemaVersion",
  ]);
});

test("12. validator는 입력을 mutate하지 않고 readonly 결과를 만든다", () => {
  const input = fixture({ candidateStoreIds: [STORE_A, STORE_B] });
  const before = structuredClone(input);
  const cluster = expectSuccess(input);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(cluster), true);
  assert.equal(Object.isFrozen(cluster.candidateStoreIds), true);
  assert.equal(Object.isFrozen(cluster.analysisRunIds), true);
  assert.equal(Object.isFrozen(cluster.frameoneContext), true);
});

test("13. Market/Submarket/Node reference는 Cluster identity와 분리된다", () => {
  const cluster = expectSuccess(fixture({
    analysisClusterId: "analysis-cluster:independent-identity",
    frameoneContext: { marketId: "MARKET-A", submarketId: "SUBMARKET-A", nodeId: "NODE-A" },
  }));
  assert.equal(cluster.analysisClusterId, "analysis-cluster:independent-identity");
  assert.deepEqual(cluster.frameoneContext, {
    marketId: "MARKET-A",
    submarketId: "SUBMARKET-A",
    nodeId: "NODE-A",
  });
  assert.notEqual(cluster.analysisClusterId, cluster.frameoneContext.marketId);
});
