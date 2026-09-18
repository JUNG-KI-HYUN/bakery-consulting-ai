/* eslint-disable @typescript-eslint/no-require-imports -- Existing market-data CJS/TypeScript test-loader convention. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { after, test } = require("node:test");
const ts = require("typescript");

const previousLoader = require.extensions[".ts"];
require.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
after(() => {
  if (previousLoader) require.extensions[".ts"] = previousLoader;
  else delete require.extensions[".ts"];
});

const {
  applyBasicLocationDisplayPolicy,
} = require("../../lib/market-data/basic-location/display-policy.ts");
const {
  collectBasicLocationResults,
} = require("../../lib/market-data/basic-location/result-collection.ts");
const {
  createAvailableResult,
  createUnavailableResult,
} = require("../../lib/market-data/basic-location/results.ts");
const {
  adaptAnalysisTargetResults,
} = require("../../lib/market-data/basic-location/adapters.ts");
const {
  createAnalysisRunSnapshot,
} = require("../../lib/market-data/basic-location/run.ts");

// SAMPLE fixtures only. They do not represent real locations, stores, sales or geometry.
const RUN_A = "basic-location-run:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RUN_B = "basic-location-run:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const UPDATED_AT = "2026-09-15T02:00:00.000Z";

function availableResult({
  runId = RUN_A,
  metricKey,
  unitId = "SAMPLE-MARKET",
  policy = "CUSTOMER_READY",
  limitations = [],
  statusValue = 1,
}) {
  return createAvailableResult({
    analysisRunId: runId,
    analysisLayer: "DATA_EVIDENCE",
    analysisUnit: { type: "FRAMEONE_MARKET", id: unitId, label: `Sample ${unitId}` },
    metricKey,
    metricLabel: `Sample ${metricKey}`,
    value: statusValue,
    unit: "count",
    valueType: "CANONICAL_VALUE",
    primarySource: null,
    sourceReferences: [],
    referenceDate: "2026-09-15",
    referencePeriod: null,
    confidence: "HIGH",
    confidenceReasons: [{ code: "SAMPLE_ONLY", message: "Sample fixture." }],
    limitations,
    fieldCheckRequired: false,
    fieldCheckKeys: [],
    customerDisplayPolicy: policy,
    methodologyNote: null,
    updatedAt: UPDATED_AT,
  });
}

function unavailableResult(metricKey, policy = "HIDDEN") {
  return createUnavailableResult({
    analysisRunId: RUN_A,
    analysisLayer: "COMPETITION",
    analysisUnit: { type: "OFFICIAL_COMMERCIAL_AREA", id: "0000000", label: "Sample Official Area" },
    metricKey,
    metricLabel: `Sample ${metricKey}`,
    unit: "count",
    primarySource: null,
    sourceReferences: [],
    referenceDate: null,
    referencePeriod: "2026-Q1",
    limitations: [{ code: "SAMPLE_SOURCE_ERROR", message: "Sample failure.", severity: "CAUTION" }],
    missingReason: "SOURCE_ERROR",
    fieldCheckRequired: false,
    fieldCheckKeys: [],
    customerDisplayPolicy: policy,
    methodologyNote: "Sample Source failure.",
    updatedAt: UPDATED_AT,
  });
}

function groups(overrides = {}) {
  return {
    target: [],
    frameone: [],
    blocked: [],
    kakao: [],
    officialRelation: [],
    officialStats: [],
    demand: [],
    ...overrides,
  };
}

test("Slice 4A: multiple adapter groups are collected in the fixed group order", () => {
  const target = availableResult({ metricKey: "target" });
  const frameone = availableResult({ metricKey: "frameone" });
  const blocked = unavailableResult("blocked");
  const kakao = availableResult({ metricKey: "kakao" });
  const relation = availableResult({ metricKey: "relation" });
  const stats = availableResult({ metricKey: "stats" });
  const demand = availableResult({ metricKey: "demand" });
  const result = collectBasicLocationResults({
    analysisRunId: RUN_A,
    resultGroups: groups({ target: [target], frameone: [frameone], blocked: [blocked], kakao: [kakao], officialRelation: [relation], officialStats: [stats], demand: [demand] }),
  });
  assert.deepEqual(result, [target, frameone, blocked, kakao, relation, stats, demand]);
});

test("Slice 4A: matching analysisRunId Results are accepted", () => {
  const result = availableResult({ metricKey: "matching-run" });
  assert.deepEqual(collectBasicLocationResults({ analysisRunId: RUN_A, resultGroups: groups({ target: [result] }) }), [result]);
});

test("Slice 4A: a mismatched analysisRunId is rejected rather than removed or rewritten", () => {
  const result = availableResult({ runId: RUN_B, metricKey: "other-run" });
  assert.throws(
    () => collectBasicLocationResults({ analysisRunId: RUN_A, resultGroups: groups({ kakao: [result] }) }),
    /analysisRunId.*일치하지 않습니다/,
  );
  assert.equal(result.analysisRunId, RUN_B);
});

test("Slice 4A: duplicate resultId is rejected without deduplication", () => {
  const result = availableResult({ metricKey: "duplicate" });
  assert.throws(
    () => collectBasicLocationResults({ analysisRunId: RUN_A, resultGroups: groups({ target: [result], officialStats: [result] }) }),
    /resultId.*중복/,
  );
});

test("Slice 4A: duplicate metricKey is allowed when resultId differs", () => {
  const first = availableResult({ metricKey: "shared", unitId: "UNIT-A" });
  const second = availableResult({ metricKey: "shared", unitId: "UNIT-B" });
  const result = collectBasicLocationResults({ analysisRunId: RUN_A, resultGroups: groups({ target: [first], frameone: [second] }) });
  assert.equal(result.length, 2);
  assert.notEqual(result[0].resultId, result[1].resultId);
});

test("Slice 4A: empty Result groups are valid and retain explicit run identity", () => {
  const result = collectBasicLocationResults({ analysisRunId: RUN_A, resultGroups: groups() });
  assert.deepEqual(result, []);
  assert.equal(Object.isFrozen(result), true);
});

test("Slice 4A: adapter order inside each group remains deterministic", () => {
  const first = availableResult({ metricKey: "first" });
  const second = availableResult({ metricKey: "second" });
  const input = { analysisRunId: RUN_A, resultGroups: groups({ kakao: [first, second] }) };
  assert.deepEqual(collectBasicLocationResults(input).map((item) => item.metricKey), ["first", "second"]);
  assert.deepEqual(collectBasicLocationResults(input).map((item) => item.metricKey), ["first", "second"]);
});

test("Slice 4A: collection does not mutate input arrays or Result objects", () => {
  const result = availableResult({ metricKey: "immutable-input" });
  const target = [result];
  const before = structuredClone(result);
  collectBasicLocationResults({ analysisRunId: RUN_A, resultGroups: groups({ target }) });
  assert.deepEqual(target, [result]);
  assert.deepEqual(result, before);
});

test("Slice 4A: the returned Result array is shallow-frozen", () => {
  const result = availableResult({ metricKey: "frozen-output" });
  const output = collectBasicLocationResults({ analysisRunId: RUN_A, resultGroups: groups({ target: [result] }) });
  assert.equal(Object.isFrozen(output), true);
  assert.throws(() => output.push(result), TypeError);
});

test("Slice 4A: status, confidence and policy survive collection unchanged", () => {
  const result = availableResult({ metricKey: "preserved", policy: "INTERNAL_ONLY" });
  const output = collectBasicLocationResults({ analysisRunId: RUN_A, resultGroups: groups({ frameone: [result] }) })[0];
  assert.equal(output, result);
  assert.equal(output.status, "AVAILABLE");
  assert.equal(output.confidence, "HIGH");
  assert.equal(output.customerDisplayPolicy, "INTERNAL_ONLY");
});

test("Slice 4A: partial Source failure Results remain independent in one collection", () => {
  const sales = availableResult({ metricKey: "sales" });
  const stores = unavailableResult("stores");
  const output = collectBasicLocationResults({ analysisRunId: RUN_A, resultGroups: groups({ officialStats: [sales, stores] }) });
  assert.equal(output[0].status, "AVAILABLE");
  assert.equal(output[1].status, "NOT_AVAILABLE");
  assert.equal(output[1].missingReason, "SOURCE_ERROR");
});

test("Slice 4A: STAFF displays CUSTOMER_READY", () => {
  assert.equal(applyBasicLocationDisplayPolicy([availableResult({ metricKey: "staff-ready" })], "STAFF").length, 1);
});

test("Slice 4A: STAFF displays CUSTOMER_WITH_NOTE without changing its policy", () => {
  const result = availableResult({ metricKey: "staff-note", policy: "CUSTOMER_WITH_NOTE" });
  const output = applyBasicLocationDisplayPolicy([result], "STAFF");
  assert.equal(output.length, 1);
  assert.equal(output[0].requiresNote, false);
  assert.equal(output[0].result.customerDisplayPolicy, "CUSTOMER_WITH_NOTE");
});

test("Slice 4A: STAFF displays INTERNAL_ONLY", () => {
  assert.equal(applyBasicLocationDisplayPolicy([availableResult({ metricKey: "staff-internal", policy: "INTERNAL_ONLY" })], "STAFF").length, 1);
});

test("Slice 4A: STAFF hides HIDDEN", () => {
  assert.equal(applyBasicLocationDisplayPolicy([availableResult({ metricKey: "staff-hidden", policy: "HIDDEN" })], "STAFF").length, 0);
});

test("Slice 4A: CUSTOMER displays CUSTOMER_READY without a required note", () => {
  const output = applyBasicLocationDisplayPolicy([availableResult({ metricKey: "customer-ready" })], "CUSTOMER");
  assert.equal(output.length, 1);
  assert.equal(output[0].requiresNote, false);
});

test("Slice 4A: CUSTOMER displays CUSTOMER_WITH_NOTE and requires a preserved limitation", () => {
  const limitation = { code: "SAMPLE_NOTE", message: "Sample customer note.", severity: "CAUTION" };
  const result = availableResult({ metricKey: "customer-note", policy: "CUSTOMER_WITH_NOTE", limitations: [limitation] });
  const output = applyBasicLocationDisplayPolicy([result], "CUSTOMER");
  assert.equal(output.length, 1);
  assert.equal(output[0].requiresNote, true);
  assert.equal(output[0].result.limitations[0].code, "SAMPLE_NOTE");
  assert.equal(output[0].result, result);
});

test("Slice 4A: CUSTOMER hides INTERNAL_ONLY", () => {
  assert.equal(applyBasicLocationDisplayPolicy([availableResult({ metricKey: "customer-internal", policy: "INTERNAL_ONLY" })], "CUSTOMER").length, 0);
});

test("Slice 4A: CUSTOMER hides HIDDEN", () => {
  assert.equal(applyBasicLocationDisplayPolicy([availableResult({ metricKey: "customer-hidden", policy: "HIDDEN" })], "CUSTOMER").length, 0);
});

test("Slice 4A: display policy does not hide a non-available Result when its policy permits display", () => {
  const result = unavailableResult("customer-source-error", "CUSTOMER_WITH_NOTE");
  const output = applyBasicLocationDisplayPolicy([result], "CUSTOMER");
  assert.equal(output.length, 1);
  assert.equal(output[0].result.status, "NOT_AVAILABLE");
  assert.equal(output[0].requiresNote, true);
});

test("Slice 4A: display policy leaves source Results unchanged and freezes wrappers", () => {
  const result = availableResult({ metricKey: "policy-immutable" });
  const before = structuredClone(result);
  const output = applyBasicLocationDisplayPolicy([result], "CUSTOMER");
  assert.deepEqual(result, before);
  assert.equal(Object.isFrozen(output), true);
  assert.equal(Object.isFrozen(output[0]), true);
  assert.equal(output[0].result, result);
});

test("Slice 4A: CUSTOMER_WITH_NOTE without limitations is rejected for CUSTOMER", () => {
  const result = availableResult({ metricKey: "missing-note", policy: "CUSTOMER_WITH_NOTE" });
  assert.throws(
    () => applyBasicLocationDisplayPolicy([result], "CUSTOMER"),
    /고객용 limitation이 필요합니다/,
  );
});

test("Slice 4A.1: existing target address Result satisfies the customer note contract", () => {
  const snapshot = createAnalysisRunSnapshot({
    target: { source: "address", confirmedAddress: "Sample address", latitude: 37.5, longitude: 127, radiusMeters: 300 },
    frameone: { marketId: "SAMPLE-MARKET", marketName: "Sample Market" },
  }, {
    randomUUID: () => "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    now: () => new Date(UPDATED_AT),
  });
  const address = adaptAnalysisTargetResults(snapshot).find((item) => item.metricKey === "analysis.target.confirmed_address");
  assert.equal(address.customerDisplayPolicy, "CUSTOMER_WITH_NOTE");
  assert.ok(address.limitations.some(
    (item) => item.code === "ANALYSIS_ADDRESS_NOT_BUILDING_VERIFICATION",
  ));
  assert.doesNotThrow(() => applyBasicLocationDisplayPolicy([address], "CUSTOMER"));
});
