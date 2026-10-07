import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const loadModule = createRequire(import.meta.url);
const previousLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "server-only") return {};
  return previousLoad.call(this, request, parent, isMain);
};
const previousLoader = loadModule.extensions[".ts"];
loadModule.extensions[".ts"] = (module, filename) => {
  const originalRequire = module.require.bind(module);
  module.require = (specifier) =>
    originalRequire(
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
after(() => {
  Module._load = previousLoad;
  if (previousLoader) loadModule.extensions[".ts"] = previousLoader;
  else delete loadModule.extensions[".ts"];
});

const lib = (relative) => loadModule(path.join(repositoryRoot, relative));
const {
  buildCandidateDecisionEvidenceBundle,
  buildCandidateDecisionEvidenceBundleV2,
  CANDIDATE_DECISION_EVIDENCE_SCHEMA_VERSION,
  CANDIDATE_DECISION_EVIDENCE_V2_SCHEMA_VERSION,
} = lib("lib/decision-evidence/candidate-bundle.ts");
const { buildDecisionEvidenceBundle } = lib("lib/decision-evidence/build-bundle.ts");
const { createCandidateDecisionContext, createCandidateDecisionContextV2 } =
  lib("lib/decision-integration/create-context.ts");
const { CANDIDATE_LEASE_EVIDENCE_SCHEMA_VERSION } = lib("lib/lease-decision/types.ts");
const { buildCandidateLeaseDecisionEvidence } = lib("lib/lease-decision/decision-evidence-adapter.ts");
const { createEquipmentDefinition, createEquipmentInstance, createKnownEquipmentMm } =
  lib("lib/equipment/types.ts");
const { createEmptyLayout, createPillarElement } = lib("lib/space-fit/types.ts");
const { validateLayoutGeometry } = lib("lib/space-fit/element-geometry.ts");
const { createEmptyMeasurementSet, createKnownMm } = lib("lib/field/measurement.ts");
const { createCandidateStoreId, createSiteSurveyId } = lib("lib/field/identifiers.ts");
const { createAvailableResult, createGeometryBlockedResult } =
  lib("lib/market-data/basic-location/results.ts");
const { buildBasicLocationInterpretation } = lib("lib/market-data/basic-location/interpretation.ts");
const { buildCompetitionStructure } = lib("lib/market-data/competition-structure.ts");
const { competitionStructureLocationInput, createCompetitionLocationTarget } =
  lib("lib/market-data/competition-location.ts");
const { calculateEconomicFeasibility } = lib("lib/economic-feasibility/engine.ts");

const BUNDLE_SOURCE = fs.readFileSync(path.join(repositoryRoot, "lib/decision-evidence/candidate-bundle.ts"), "utf8");

// ---- fixtures (sample/demo only; not real customer, landlord, lease, or market data) ----

const NOW = "2026-09-22T18:00:00.000Z";
const GENERATED_AT = "2026-10-01T05:00:00.000Z";
const RUN_A = "basic-location-run:77777777-7777-4777-8777-777777777777";
const DEMO_SNAPSHOT_ID = "demo-lease-snapshot-001";
const DEMO_CAPTURED_AT = "2026-10-01T05:00:00.000Z";
const DEMO_OBSERVED_AT = "2026-09-20T10:00:00+09:00";
const CANDIDATE_LEASE_STAGES = new Set(["candidate-lease", "candidate-lease-binding"]);

function fieldFixture({ withPillarOverlap = false } = {}) {
  const def = createEquipmentDefinition({
    category: "OVEN",
    name: "fixture oven",
    dataStatus: "VERIFIED",
    createdAt: NOW,
    verifiedAt: NOW,
    source: { sourceType: "MANUFACTURER", sourceLabel: "fixture", verifiedAt: NOW },
    dimensions: { widthMm: createKnownEquipmentMm(900), depthMm: createKnownEquipmentMm(800) },
  });
  const measurement = {
    ...createEmptyMeasurementSet({
      surveyId: createSiteSurveyId(),
      candidateStoreId: createCandidateStoreId(),
      measuredAt: NOW,
      measuredBy: "field-staff",
    }),
    values: {
      roomWidthMm: createKnownMm(5800),
      roomDepthMm: createKnownMm(11200),
      frontageMm: createKnownMm(4000),
      ceilingHeightMm: createKnownMm(3100),
      entranceWidthMm: createKnownMm(1200),
      entranceHeightMm: createKnownMm(2200),
    },
  };
  let layout = createEmptyLayout({
    surveyId: measurement.surveyId,
    candidateStoreId: measurement.candidateStoreId,
    measurementId: measurement.measurementId,
    room: { shape: "RECTANGLE", widthMm: 5800, depthMm: 11200 },
    createdAt: NOW,
  });
  layout = Object.freeze({
    ...layout,
    equipmentInstances: Object.freeze([
      createEquipmentInstance({
        equipmentDefinitionId: def.equipmentDefinitionId,
        layoutId: layout.layoutId,
        xMm: 1000,
        yMm: 1000,
        rotationDeg: 0,
        createdAt: NOW,
      }),
    ]),
    ...(withPillarOverlap
      ? { elements: Object.freeze([createPillarElement({ xMm: 1200, yMm: 1200, widthMm: 500, heightMm: 500 })]) }
      : {}),
  });
  const bundle = buildDecisionEvidenceBundle({
    layout,
    definitions: [def],
    geometryWarnings: validateLayoutGeometry(layout, [def]),
    measurement,
    generatedAt: NOW,
  });
  return { bundle, layout };
}

const KAKAO_SOURCE = { sourceId: "SRC-KAKAO-LOCAL-MAP", sourceName: "fixture kakao", sourceType: "EXTERNAL_PLATFORM" };
const OFFICIAL_SOURCE = { sourceId: "SRC-SEOUL-STORES", sourceName: "fixture official", sourceType: "PUBLIC_DATA_OFFICIAL" };

function kakaoResult(runId = RUN_A) {
  return createAvailableResult({
    analysisRunId: runId,
    analysisLayer: "SURROUNDING_POI",
    analysisUnit: { type: "RADIUS_500M", id: `${runId}:target`, label: "분석 반경 500m" },
    metricKey: "kakao.nearby.bakery.returned_count",
    metricLabel: "Kakao 베이커리 검색 반환건수",
    value: 12,
    unit: "places",
    valueType: "OBSERVED_SOURCE_VALUE",
    primarySource: KAKAO_SOURCE,
    sourceReferences: [{ sourceId: KAKAO_SOURCE.sourceId, locator: "fixture#bakery", sourceVersion: null }],
    referenceDate: NOW,
    referencePeriod: null,
    confidence: "MEDIUM",
    confidenceReasons: [],
    limitations: [{ code: "SEARCH_NOT_CENSUS", message: "fixture 검색 결과이며 전수조사가 아닙니다.", severity: "CAUTION" }],
    fieldCheckRequired: true,
    fieldCheckKeys: ["COMPETITOR_OPEN_CHECK"],
    customerDisplayPolicy: "INTERNAL_ONLY",
    methodologyNote: null,
    updatedAt: NOW,
  });
}

function officialStoresResult(runId = RUN_A) {
  return createAvailableResult({
    analysisRunId: runId,
    analysisLayer: "DATA_EVIDENCE",
    analysisUnit: { type: "OFFICIAL_COMMERCIAL_AREA", id: "3110001", label: "fixture 공식상권" },
    metricKey: "official_commercial_area.stores.store_count",
    metricLabel: "공식상권 점포 수",
    value: 7,
    unit: "count",
    valueType: "OFFICIAL_VALUE",
    primarySource: OFFICIAL_SOURCE,
    sourceReferences: [{ sourceId: OFFICIAL_SOURCE.sourceId, locator: "fixture#stores", sourceVersion: null }],
    referenceDate: NOW,
    referencePeriod: "2026-Q2",
    confidence: "HIGH",
    confidenceReasons: [],
    limitations: [],
    fieldCheckRequired: false,
    fieldCheckKeys: [],
    customerDisplayPolicy: "INTERNAL_ONLY",
    methodologyNote: null,
    updatedAt: NOW,
  });
}

function livingResult(runId = RUN_A) {
  return createAvailableResult({
    analysisRunId: runId,
    analysisLayer: "DEMAND",
    analysisUnit: { type: "RADIUS_500M", id: `${runId}:living-population-radius`, label: "분석지점 반경 500m" },
    metricKey: "living_population.radius.hour.12",
    metricLabel: "12시 생활인구",
    value: 1234.5,
    unit: "persons",
    valueType: "CALCULATED_VALUE",
    primarySource: OFFICIAL_SOURCE,
    sourceReferences: [{ sourceId: OFFICIAL_SOURCE.sourceId, locator: "fixture#living", sourceVersion: null }],
    referenceDate: NOW,
    referencePeriod: "2026-09",
    confidence: "MEDIUM",
    confidenceReasons: [],
    limitations: [],
    fieldCheckRequired: false,
    fieldCheckKeys: [],
    customerDisplayPolicy: "INTERNAL_ONLY",
    methodologyNote: null,
    updatedAt: NOW,
  });
}

function blockedResult(runId = RUN_A) {
  return createGeometryBlockedResult({
    analysisRunId: runId,
    analysisLayer: "DEMAND",
    analysisUnit: { type: "FRAMEONE_MARKET", id: "fixture-market", label: "fixture market" },
    metricKey: "frameone.market.living_population",
    metricLabel: "FRAMEONE Market 생활인구",
    unit: null,
    primarySource: null,
    sourceReferences: [],
    referenceDate: null,
    referencePeriod: null,
    limitations: [{ code: "FRAMEONE_GEOMETRY_MISSING", message: "fixture geometry 없음", severity: "BLOCKING" }],
    fieldCheckRequired: false,
    fieldCheckKeys: [],
    customerDisplayPolicy: "INTERNAL_ONLY",
    methodologyNote: null,
    updatedAt: NOW,
  });
}

function competition(runId = RUN_A) {
  const target = createCompetitionLocationTarget({ analysisRunId: runId, latitude: 37.5, longitude: 127, radiusM: 500 });
  const places = Array.from({ length: 8 }, (_, index) => ({
    kakaoPlaceId: `fixture-${index}`,
    name: `fixture bakery ${index}`,
    phone: null,
    roadAddress: `fixture road ${index}`,
    addressName: null,
    latitude: 37.5 + index * 0.0002,
    longitude: 127,
    distanceM: 20 + index * 20,
    sourceCategoryId: "bakery",
    sourceCategoryLabel: "베이커리",
  }));
  const result = buildCompetitionStructure({
    ...competitionStructureLocationInput(target),
    generatedAt: NOW,
    categories: [{ id: "bakery", label: "베이커리", totalCount: places.length, places, error: null }],
    officialMarketData: null,
  });
  return { target, result };
}

function locationSource(runId = RUN_A) {
  const results = [kakaoResult(runId), officialStoresResult(runId), livingResult(runId), blockedResult(runId)];
  const { target, result } = competition(runId);
  return {
    results,
    interpretation: buildBasicLocationInterpretation({ analysisRunId: runId, results }),
    competitionTarget: target,
    competitionResult: result,
  };
}

function rentalResult() {
  return {
    schemaVersion: "frameone.rental-market-analysis.v1",
    filters: {},
    sampleCount: 3,
    sampleSufficiency: "REFERENCE_ONLY",
    selectedRecordIds: ["rec-a", "rec-b", "rec-c"],
    sourceComposition: { ONLINE_LISTING: 1, BROKER_CONFIRMED: 2 },
    referenceDate: "2026-09-01",
    deposit: { sampleCount: 3, median: 50_000_000, min: 30_000_000, max: 80_000_000 },
    rent: { sampleCount: 3, median: 3_000_000, min: 2_500_000, max: 3_500_000 },
    managementFee: { sampleCount: 0, median: null, min: null, max: null },
    rentPerExclusivePyeong: { sampleCount: 3, median: 200_000, min: 150_000, max: 250_000 },
    priceHistory: [],
    limitations: ["fixture 참고 표본"],
  };
}

function officialMarketData() {
  const observation = (metric, value, unit, sourceId) => ({
    sourceId,
    referencePeriod: "2025-Q4",
    geographyType: "official_market",
    geographyId: "3110002",
    geographyName: "fixture 공식상권",
    industryCode: "CS100005",
    industryName: "제과점",
    metric,
    value,
    unit,
    dataStatus: "available",
  });
  return {
    officialMarketCode: "3110002",
    officialMarketName: "fixture 공식상권",
    industryCode: "CS100005",
    industryName: "제과점",
    quarterCode: "20254",
    referencePeriod: "2025-Q4",
    sales: [observation("monthly_sales_amount", 120_000_000, "KRW", "SRC-SEOUL-SALES")],
    stores: [observation("store_count", 4, "count", "SRC-SEOUL-STORES")],
    dataStatus: "available",
  };
}

function economicResult() {
  const rental = rentalResult();
  return calculateEconomicFeasibility({
    plan: {
      expectedTicket: 10_000,
      operatingDaysPerMonth: 25,
      salesScenario: { conservativeDailyTransactions: 80, baseDailyTransactions: 100, upsideDailyTransactions: 120 },
      variableCostRates: {
        materialCostRate: 0.3,
        packagingCostRate: 0.05,
        cardFeeRate: 0.02,
        deliveryVariableRate: 0.03,
        otherVariableRate: 0.01,
      },
      fixedMonthlyCosts: {
        laborMonthly: 6_000_000,
        rentMonthly: 3_000_000,
        managementFeeMonthly: 500_000,
        utilitiesMonthly: 500_000,
        marketingMonthly: 200_000,
        posAccountingMonthly: 100_000,
        insuranceMonthly: 200_000,
        otherFixedMonthly: 300_000,
        deliveryFixedMonthly: 200_000,
      },
      rentPlanning: { targetRentBurdenRate: 0.1 },
    },
    officialMarketData: officialMarketData(),
    rentalMarketResult: rental,
    rentalMarketScopeConfirmation: {
      status: "CONFIRMED",
      officialAreaId: "3110002",
      selectedRecordIds: rental.selectedRecordIds,
      basis: "fixture",
    },
    generatedAt: "2026-09-23T10:00:00.000Z",
  });
}

function demoEvidence(overrides = {}) {
  return {
    verificationStatus: "UNKNOWN",
    sourceType: "OWNER_STATEMENT",
    confirmationRequirement: "DOCUMENT_REQUIRED",
    sourceRef: { opaqueSourceId: "demo-interview-ref-001" },
    observedAt: DEMO_OBSERVED_AT,
    ...overrides,
  };
}

const unknownValue = () => ({ status: "UNKNOWN", value: null, evidence: null });
const notConfirmed = () => ({ status: "NOT_CONFIRMED", evidence: null });
const consentNotConfirmed = () => ({ status: "NOT_CONFIRMED", evidence: null, consentAuthority: "UNKNOWN" });
const directConsent = (status, evidence = demoEvidence()) => ({ status, evidence, consentAuthority: "DIRECT_AUTHORITY" });
const knownValue = (value, evidence = demoEvidence()) => ({ status: "KNOWN", value, evidence });
const withEvidence = (status) => ({ status, evidence: demoEvidence() });

function minimalSnapshot(candidateStoreId, snapshotId = DEMO_SNAPSHOT_ID) {
  return {
    schemaVersion: CANDIDATE_LEASE_EVIDENCE_SCHEMA_VERSION,
    snapshotId,
    candidateStoreId,
    capturedAt: DEMO_CAPTURED_AT,
    leaseTerms: {
      depositAmount: unknownValue(),
      monthlyRentAmount: unknownValue(),
      managementFeeAmount: unknownValue(),
      vatTreatment: notConfirmed(),
      premiumAmount: unknownValue(),
      premiumStatus: notConfirmed(),
      leaseTermMonths: unknownValue(),
      rentFreeMonths: unknownValue(),
      constructionPeriodDays: unknownValue(),
      handoverDate: unknownValue(),
    },
    contractConditions: {
      businessUseRestriction: notConfirmed(),
      subleaseRestriction: notConfirmed(),
      managementRegulation: notConfirmed(),
      restorationScope: notConfirmed(),
      repairResponsibility: notConfirmed(),
      permitFailureCondition: notConfirmed(),
      conditionPrecedent: notConfirmed(),
      specialClauseStatus: notConfirmed(),
      writtenConfirmationStatus: notConfirmed(),
      renewalCondition: notConfirmed(),
    },
    landlordConsents: {
      bakeryManufacturingUse: consentNotConfirmed(),
      exhaust: consentNotConfirmed(),
      electricalUpgrade: consentNotConfirmed(),
      signage: consentNotConfirmed(),
      construction: consentNotConfirmed(),
    },
    createsRisk: false,
    createsVerdict: false,
    createsScore: false,
  };
}

function richSnapshot(candidateStoreId, snapshotId = DEMO_SNAPSHOT_ID) {
  const s = minimalSnapshot(candidateStoreId, snapshotId);
  s.leaseTerms.depositAmount = knownValue(30_000_000);
  s.leaseTerms.monthlyRentAmount = knownValue(
    2_500_000,
    demoEvidence({ sourceType: "DOCUMENT", verificationStatus: "VERIFIED", confirmationRequirement: "NONE" }),
  );
  s.leaseTerms.leaseTermMonths = knownValue(60);
  s.contractConditions.businessUseRestriction = withEvidence("RESTRICTION_PRESENT");
  s.contractConditions.restorationScope = withEvidence("INCLUDED");
  s.landlordConsents.exhaust = directConsent("REFUSED");
  s.landlordConsents.bakeryManufacturingUse = directConsent("GRANTED");
  return s;
}

const V1_BINDINGS = (field, rental, economic) => ({
  candidateStoreId: field.layout.candidateStoreId,
  createdAt: NOW,
  locationBinding: { analysisRunId: RUN_A },
  leaseBinding: { selectedResearchRecordIds: [...rental.selectedRecordIds], referenceDate: rental.referenceDate },
  economicBinding: { generatedAt: economic.metadata.generatedAt, engineVersion: economic.metadata.engineVersion },
  fieldBinding: { surveyId: field.layout.surveyId, layoutId: field.layout.layoutId },
});

function contextV1For(field) {
  const created = createCandidateDecisionContext(V1_BINDINGS(field, rentalResult(), economicResult()));
  assert.equal(created.ok, true, created.message);
  return created.value;
}

function contextV2For(field, overrides = {}) {
  const created = createCandidateDecisionContextV2({
    ...V1_BINDINGS(field, rentalResult(), economicResult()),
    candidateLeaseBinding: { snapshotId: DEMO_SNAPSHOT_ID },
    ...overrides,
  });
  assert.equal(created.ok, true, created.message);
  return created.value;
}

function sharedInput(field) {
  return {
    generatedAt: GENERATED_AT,
    fieldBundle: field.bundle,
    locationSource: locationSource(),
    rentalMarketResult: rentalResult(),
    economicResult: economicResult(),
  };
}

function v1Input(field = fieldFixture()) {
  return { context: contextV1For(field), ...sharedInput(field) };
}

function v2Input({ field = fieldFixture(), contextOverrides = {}, snapshot, ...rest } = {}) {
  return {
    context: contextV2For(field, contextOverrides),
    ...sharedInput(field),
    candidateLeaseSnapshot: snapshot === undefined ? richSnapshot(field.layout.candidateStoreId) : snapshot,
    ...rest,
  };
}

function allItems(bundle) {
  return [
    ...bundle.observedFacts,
    ...bundle.observedConstraints,
    ...bundle.missingInformation,
    ...bundle.expertReviewItems,
    ...bundle.geometryIssues,
  ];
}

const isCandidateLeaseItem = (item) => CANDIDATE_LEASE_STAGES.has(item.sourceRef?.stageId);
const candidateLeaseItems = (bundle) => allItems(bundle).filter(isCandidateLeaseItem);
const withoutCandidateLease = (items) => items.filter((item) => !isCandidateLeaseItem(item));
const ids = (items) => items.map((item) => item.id);
const byIdSuffix = (items, suffix) => items.find((item) => item.id.endsWith(`|${suffix}`));

function collectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => collectKeys(item, keys));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

function assertSingleIntegrationGap(bundle, key) {
  const items = candidateLeaseItems(bundle);
  assert.equal(items.length, 1, `exactly one candidate lease item for ${key}`);
  const [gap] = items;
  assert.equal(gap.id, `LEASE|MISSING_INFORMATION|LEASE|${key}`);
  assert.equal(gap.sourceDomain, "LEASE");
  assert.equal(gap.category, "LEASE");
  assert.equal(gap.bucket, "MISSING_INFORMATION");
  assert.equal(gap.importance, "CORE");
  assert.equal(gap.nature, "INTEGRATION_STATE");
  assert.ok(bundle.missingInformation.includes(gap));
  assert.equal(bundle.domainEvidence.candidateLease, null);
  return gap;
}

// ---- tests ----

test("8. a valid candidate lease snapshot connects to the V2 bundle", () => {
  const input = v2Input();
  const bundle = buildCandidateDecisionEvidenceBundleV2(input);
  assert.equal(bundle.schemaVersion, "candidate-decision-evidence-v2");
  assert.equal(bundle.schemaVersion, CANDIDATE_DECISION_EVIDENCE_V2_SCHEMA_VERSION);
  assert.equal(bundle.candidateStoreId, input.context.candidateStoreId);
  assert.deepEqual(bundle.decisionContext, input.context);
  const expected = buildCandidateLeaseDecisionEvidence({ snapshot: input.candidateLeaseSnapshot });
  assert.equal(expected.ok, true);
  assert.deepEqual(bundle.domainEvidence.candidateLease, expected.value);
  assert.equal(bundle.domainEvidence.candidateLease.snapshotId, DEMO_SNAPSHOT_ID);
  assert.equal(candidateLeaseItems(bundle).length, 25);
  assert.equal(candidateLeaseItems(bundle).some((item) => item.nature === "INTEGRATION_STATE"), false);
});

test("9. candidateLeaseBinding null produces one CORE integration gap and no per-field items", () => {
  const field = fieldFixture();
  const bundle = buildCandidateDecisionEvidenceBundleV2(v2Input({ field, contextOverrides: { candidateLeaseBinding: null } }));
  const gap = assertSingleIntegrationGap(bundle, "candidate-lease-binding-absent");
  assert.match(gap.description, /사용하지 않았습니다/);
  const noSnapshot = buildCandidateDecisionEvidenceBundleV2(
    v2Input({ field, contextOverrides: { candidateLeaseBinding: null }, snapshot: null }),
  );
  assert.doesNotMatch(assertSingleIntegrationGap(noSnapshot, "candidate-lease-binding-absent").description, /사용하지 않았습니다/);
});

test("10. snapshot absent produces one CORE integration gap and no UNKNOWN per-field items", () => {
  const bundle = buildCandidateDecisionEvidenceBundleV2(v2Input({ snapshot: null }));
  assertSingleIntegrationGap(bundle, "candidate-lease-snapshot-absent");
  assert.equal(bundle.missingInformation.some((item) => item.sourceRef?.stageId === "candidate-lease"), false);
});

test("11. candidateStoreId mismatch produces one CORE integration gap", () => {
  const bundle = buildCandidateDecisionEvidenceBundleV2(v2Input({ snapshot: richSnapshot(createCandidateStoreId()) }));
  assertSingleIntegrationGap(bundle, "candidate-lease-candidate-store-mismatch");
});

test("12. snapshotId mismatch produces one CORE integration gap", () => {
  const field = fieldFixture();
  const bundle = buildCandidateDecisionEvidenceBundleV2(
    v2Input({ field, snapshot: richSnapshot(field.layout.candidateStoreId, "demo-lease-snapshot-other") }),
  );
  assertSingleIntegrationGap(bundle, "candidate-lease-snapshot-mismatch");
});

test("12b. both identity mismatches are reported and neither throws", () => {
  const bundle = buildCandidateDecisionEvidenceBundleV2(
    v2Input({ snapshot: richSnapshot(createCandidateStoreId(), "demo-lease-snapshot-other") }),
  );
  assert.deepEqual(ids(candidateLeaseItems(bundle)).sort(), [
    "LEASE|MISSING_INFORMATION|LEASE|candidate-lease-candidate-store-mismatch",
    "LEASE|MISSING_INFORMATION|LEASE|candidate-lease-snapshot-mismatch",
  ]);
  assert.equal(bundle.domainEvidence.candidateLease, null);
});

test("13. invalid snapshot produces one CORE integration gap", () => {
  const field = fieldFixture();
  const cases = [
    (s) => { s.leaseTerms.monthlyRentAmount = knownValue(-1); },
    (s) => { s.schemaVersion = "candidate-lease-evidence-v0"; },
    (s) => { s.landlordConsents.exhaust = { status: "REFUSED", evidence: null, consentAuthority: "RELAYED" }; },
    (s) => { s.verdict = "demo"; },
  ];
  for (const mutate of cases) {
    const snapshot = richSnapshot(field.layout.candidateStoreId);
    mutate(snapshot);
    const bundle = buildCandidateDecisionEvidenceBundleV2(v2Input({ field, snapshot }));
    const gap = assertSingleIntegrationGap(bundle, "candidate-lease-snapshot-invalid");
    assert.match(gap.description, /어떤 값도 evidence로 사용하지 않았습니다/);
  }
  const notAnObject = buildCandidateDecisionEvidenceBundleV2(v2Input({ field, snapshot: "demo" }));
  assertSingleIntegrationGap(notAnObject, "candidate-lease-snapshot-invalid");
});

test("14. invalid or mismatched snapshot evidence is never merged", () => {
  const field = fieldFixture();
  const invalid = richSnapshot(field.layout.candidateStoreId);
  invalid.leaseTerms.leaseTermMonths = knownValue(0);
  const inputs = [
    v2Input({ field, snapshot: invalid }),
    v2Input({ field, snapshot: richSnapshot(createCandidateStoreId()) }),
    v2Input({ field, snapshot: richSnapshot(field.layout.candidateStoreId, "demo-lease-snapshot-other") }),
  ];
  for (const input of inputs) {
    const bundle = buildCandidateDecisionEvidenceBundleV2(input);
    assert.equal(allItems(bundle).some((item) => item.sourceRef?.stageId === "candidate-lease"), false);
    assert.equal(bundle.observedConstraints.some((item) => item.sourceDomain === "LEASE"), false);
    assert.equal(bundle.domainEvidence.candidateLease, null);
  }
});

test("15. valid candidate lease observedFacts are merged", () => {
  const input = v2Input();
  const bundle = buildCandidateDecisionEvidenceBundleV2(input);
  const source = buildCandidateLeaseDecisionEvidence({ snapshot: input.candidateLeaseSnapshot }).value;
  assert.ok(source.observedFacts.length > 0);
  const merged = new Map(bundle.observedFacts.map((item) => [item.id, item]));
  for (const item of source.observedFacts) assert.deepEqual(merged.get(item.id), item, item.id);
  assert.equal(bundle.observedFacts.filter(isCandidateLeaseItem).length, source.observedFacts.length);
  assert.ok(byIdSuffix(bundle.observedFacts, "candidate-term-monthly-rent"));
  assert.ok(byIdSuffix(bundle.observedFacts, "candidate-consent-bakery-manufacturing-use"));
});

test("16. valid candidate lease constraints (REFUSED, RESTRICTION_PRESENT) are merged", () => {
  const bundle = buildCandidateDecisionEvidenceBundleV2(v2Input());
  const exhaust = byIdSuffix(bundle.observedConstraints, "candidate-consent-exhaust");
  const businessUse = byIdSuffix(bundle.observedConstraints, "candidate-condition-business-use-restriction");
  assert.equal(exhaust.bucket, "OBSERVED_CONSTRAINT");
  assert.equal(businessUse.bucket, "OBSERVED_CONSTRAINT");
  assert.deepEqual(
    ids(bundle.observedConstraints.filter((item) => item.sourceDomain === "LEASE")).sort(),
    ids(bundle.domainEvidence.candidateLease.observedConstraints).sort(),
  );
});

test("17. valid candidate lease missing items are merged (CORE missing is visible, no RiskFinding)", () => {
  const field = fieldFixture();
  const bundle = buildCandidateDecisionEvidenceBundleV2(v2Input({ field, snapshot: minimalSnapshot(field.layout.candidateStoreId) }));
  const rent = byIdSuffix(bundle.missingInformation, "candidate-term-monthly-rent");
  const exhaust = byIdSuffix(bundle.missingInformation, "candidate-consent-exhaust");
  assert.equal(rent.importance, "CORE");
  assert.equal(exhaust.importance, "CORE");
  assert.equal(bundle.domainEvidence.candidateLease.missingInformation.length, 25);
  for (const item of bundle.domainEvidence.candidateLease.missingInformation) {
    assert.ok(bundle.missingInformation.includes(item), item.id);
  }
  const keys = collectKeys(bundle);
  for (const key of ["findings", "riskFindings", "findingId", "ruleId", "resolutionStatus"]) {
    assert.equal(keys.has(key), false, key);
  }
});

test("18. candidate lease expertReviewItems are merged (currently empty)", () => {
  const input = v2Input();
  const bundle = buildCandidateDecisionEvidenceBundleV2(input);
  assert.deepEqual(bundle.domainEvidence.candidateLease.expertReviewItems, []);
  const v1 = buildCandidateDecisionEvidenceBundle(v1Input());
  assert.equal(bundle.expertReviewItems.length, v1.expertReviewItems.length);
  assert.equal(bundle.expertReviewItems.some(isCandidateLeaseItem), false);
});

test("19. candidate lease creates no geometry issues", () => {
  const field = fieldFixture({ withPillarOverlap: true });
  assert.ok(field.bundle.geometryIssues.length > 0);
  const bundle = buildCandidateDecisionEvidenceBundleV2(v2Input({ field }));
  assert.deepEqual(ids(bundle.geometryIssues).sort(), ids(field.bundle.geometryIssues).sort());
  assert.equal(bundle.geometryIssues.some((item) => item.sourceDomain === "LEASE"), false);
});

function v1AndV2(field = fieldFixture()) {
  return {
    v1: buildCandidateDecisionEvidenceBundle(v1Input(field)),
    v2: buildCandidateDecisionEvidenceBundleV2(v2Input({ field })),
  };
}

test("20. Rental Market `lease` domain is identical to V1", () => {
  const { v1, v2 } = v1AndV2();
  assert.deepEqual(v2.domainEvidence.lease, v1.domainEvidence.lease);
  assert.deepEqual(v2.domainEvidence.lease.referenceNumericSummaries, v1.domainEvidence.lease.referenceNumericSummaries);
  const marketLease = (bundle) => allItems(bundle).filter((item) => item.sourceDomain === "LEASE" && !isCandidateLeaseItem(item));
  assert.deepEqual(marketLease(v2), marketLease(v1));
});

test("21. Economic domain is identical to V1", () => {
  const { v1, v2 } = v1AndV2();
  assert.deepEqual(v2.domainEvidence.economic, v1.domainEvidence.economic);
});

test("22. Location domain is identical to V1", () => {
  const { v1, v2 } = v1AndV2();
  assert.deepEqual(v2.domainEvidence.location, v1.domainEvidence.location);
});

test("23. FIELD domain is identical to V1, and non-candidate-lease buckets match V1 exactly", () => {
  const { v1, v2 } = v1AndV2(fieldFixture({ withPillarOverlap: true }));
  assert.deepEqual(v2.domainEvidence.field, v1.domainEvidence.field);
  for (const bucket of ["observedFacts", "observedConstraints", "missingInformation", "expertReviewItems", "geometryIssues"]) {
    assert.deepEqual(withoutCandidateLease(v2[bucket]), v1[bucket], bucket);
  }
});

test("23b. summary is recomputed from merged buckets including candidate lease items", () => {
  const { v1, v2 } = v1AndV2();
  for (const bucket of ["observedFacts", "observedConstraints", "missingInformation", "expertReviewItems", "geometryIssues"]) {
    assert.equal(v2.summary[bucket], v2[bucket].length, bucket);
  }
  assert.equal(v2.summary.coreMissing, v2.missingInformation.filter((item) => item.importance === "CORE").length);
  const lease = v2.domainEvidence.candidateLease;
  assert.equal(v2.summary.observedConstraints, v1.summary.observedConstraints + lease.observedConstraints.length);
  assert.equal(v2.summary.observedFacts, v1.summary.observedFacts + lease.observedFacts.length);
  assert.equal(v2.summary.missingInformation, v1.summary.missingInformation + lease.missingInformation.length);
  assert.equal(
    v2.summary.coreMissing,
    v1.summary.coreMissing + lease.missingInformation.filter((item) => item.importance === "CORE").length,
  );
  const absent = buildCandidateDecisionEvidenceBundleV2(v2Input({ contextOverrides: { candidateLeaseBinding: null } }));
  assert.equal(absent.summary.coreMissing, v1.summary.coreMissing + 1);
  assert.equal(Object.hasOwn(v2.summary, "score"), false);
});

test("24. V2 output is deterministic", () => {
  const input = v2Input();
  const first = buildCandidateDecisionEvidenceBundleV2(input);
  const second = buildCandidateDecisionEvidenceBundleV2(input);
  assert.deepEqual(first, second);
  assert.deepEqual(ids(first.missingInformation), ids(second.missingInformation));
  assert.deepEqual(ids(first.observedConstraints), ids(second.observedConstraints));
});

test("25. inputs (including the snapshot) are not mutated or frozen", () => {
  const input = v2Input();
  const before = JSON.stringify(input);
  buildCandidateDecisionEvidenceBundleV2(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(input.candidateLeaseSnapshot), false);
  assert.equal(Object.isFrozen(input.candidateLeaseSnapshot.landlordConsents.exhaust), false);
  assert.equal(Object.isFrozen(input.rentalMarketResult), false);
});

test("26. V2 output is frozen", () => {
  const bundle = buildCandidateDecisionEvidenceBundleV2(v2Input());
  const lease = bundle.domainEvidence.candidateLease;
  for (const value of [
    bundle,
    bundle.domainEvidence,
    bundle.summary,
    bundle.decisionContext,
    bundle.decisionContext.candidateLeaseBinding,
    bundle.observedFacts,
    bundle.observedConstraints,
    bundle.missingInformation,
    lease,
    lease.typedState,
    lease.typedState.landlordConsents.exhaust,
    lease.typedState.leaseTerms.monthlyRentAmount.evidence,
    ...candidateLeaseItems(bundle),
  ]) {
    assert.equal(Object.isFrozen(value), true);
  }
});

test("27. V2 output is JSON serializable", () => {
  const bundle = buildCandidateDecisionEvidenceBundleV2(v2Input());
  const serialized = JSON.stringify(bundle);
  const parsed = JSON.parse(serialized);
  assert.equal(parsed.schemaVersion, CANDIDATE_DECISION_EVIDENCE_V2_SCHEMA_VERSION);
  assert.equal(parsed.domainEvidence.candidateLease.typedState.landlordConsents.exhaust.status, "REFUSED");
  assert.equal(serialized.includes("NaN"), false);
  assert.equal(serialized.includes("Infinity"), false);
});

test("28-30. no Risk, Verdict, or Score in V2 output", () => {
  const cases = [
    v2Input(),
    v2Input({ contextOverrides: { candidateLeaseBinding: null } }),
    v2Input({ snapshot: null }),
    v2Input({ snapshot: richSnapshot(createCandidateStoreId()) }),
    v2Input({ snapshot: "demo" }),
  ];
  const forbiddenKeys = [
    "risk", "riskScore", "totalRiskScore", "verdict", "recommendation", "approval", "approved",
    "hardFail", "hardBlocker", "score", "grade", "finalStatus", "contractAllowed", "blockingDecision", "contractDecision",
  ];
  const forbiddenPhrases = /추천|보류|위험|안전|계약\s*가능|계약\s*불가|Risk|Verdict/;
  for (const input of cases) {
    const bundle = buildCandidateDecisionEvidenceBundleV2(input);
    assert.equal(bundle.createsRisk, false);
    assert.equal(bundle.createsVerdict, false);
    assert.equal(bundle.createsScore, false);
    if (bundle.domainEvidence.candidateLease) {
      assert.equal(bundle.domainEvidence.candidateLease.createsRisk, false);
      assert.equal(bundle.domainEvidence.candidateLease.createsVerdict, false);
      assert.equal(bundle.domainEvidence.candidateLease.createsScore, false);
    }
    const keys = collectKeys(bundle);
    for (const key of forbiddenKeys) assert.equal(keys.has(key), false, key);
    for (const item of candidateLeaseItems(bundle)) {
      assert.doesNotMatch(`${item.title} ${item.description}`, forbiddenPhrases, item.id);
    }
  }
});

test("33. typedState is preserved and readable without description parsing", () => {
  const input = v2Input();
  const bundle = buildCandidateDecisionEvidenceBundleV2(input);
  const state = bundle.domainEvidence.candidateLease.typedState;
  assert.deepEqual(state, buildCandidateLeaseDecisionEvidence({ snapshot: input.candidateLeaseSnapshot }).value.typedState);
  assert.equal(state.landlordConsents.exhaust.status, "REFUSED");
  assert.equal(state.landlordConsents.exhaust.consentAuthority, "DIRECT_AUTHORITY");
  assert.equal(state.landlordConsents.exhaust.evidence.observedAt, DEMO_OBSERVED_AT);
  assert.equal(state.contractConditions.businessUseRestriction.status, "RESTRICTION_PRESENT");
  assert.equal(state.leaseTerms.monthlyRentAmount.status, "KNOWN");
  assert.equal(state.leaseTerms.monthlyRentAmount.value, 2_500_000);
  assert.equal(state.leaseTerms.depositAmount.status, "KNOWN");
  assert.equal(state.leaseTerms.handoverDate.status, "UNKNOWN");
  assert.equal(state.leaseTerms.handoverDate.value, null);
});

test("34. market lease and candidate lease remain separate domains", () => {
  const bundle = buildCandidateDecisionEvidenceBundleV2(v2Input());
  assert.deepEqual(Object.keys(bundle.domainEvidence), ["field", "location", "lease", "candidateLease", "economic"]);
  assert.equal(Object.hasOwn(bundle.domainEvidence.lease, "typedState"), false);
  assert.equal(Object.hasOwn(bundle.domainEvidence.candidateLease, "referenceNumericSummaries"), false);
  const marketIds = new Set(ids([
    ...bundle.domainEvidence.lease.observedFacts,
    ...bundle.domainEvidence.lease.missingInformation,
    ...bundle.domainEvidence.lease.expertReviewItems,
  ]));
  for (const item of candidateLeaseItems(bundle)) assert.equal(marketIds.has(item.id), false, item.id);
  const allIds = ids(allItems(bundle));
  assert.equal(new Set(allIds).size, allIds.length);
});

test("V1 reproducibility: V1 schema, keys, and output are unchanged by V2", () => {
  assert.equal(CANDIDATE_DECISION_EVIDENCE_SCHEMA_VERSION, "candidate-decision-evidence-v1");
  const field = fieldFixture();
  const input = v1Input(field);
  const v1 = buildCandidateDecisionEvidenceBundle(input);
  assert.equal(v1.schemaVersion, "candidate-decision-evidence-v1");
  assert.deepEqual(Object.keys(v1.domainEvidence), ["field", "location", "lease", "economic"]);
  assert.equal(Object.hasOwn(v1.domainEvidence, "candidateLease"), false);
  assert.equal(Object.hasOwn(v1.decisionContext, "candidateLeaseBinding"), false);
  assert.equal(candidateLeaseItems(v1).length, 0);
  assert.equal(allItems(v1).some((item) => item.id.includes("|candidate-")), false);

  // An extra candidateLeaseSnapshot key is ignored by the V1 builder.
  const withSnapshot = buildCandidateDecisionEvidenceBundle({
    ...input,
    candidateLeaseSnapshot: richSnapshot(field.layout.candidateStoreId),
  });
  assert.deepEqual(withSnapshot, v1);
});

test("Version isolation: V1 builder rejects a V2 context and V2 builder rejects a V1 context", () => {
  const field = fieldFixture();
  assert.throws(
    () => buildCandidateDecisionEvidenceBundle({ ...sharedInput(field), context: contextV2For(field) }),
    /CandidateDecisionContext가 올바르지 않습니다/,
  );
  assert.throws(
    () => buildCandidateDecisionEvidenceBundleV2({ ...sharedInput(field), context: contextV1For(field), candidateLeaseSnapshot: null }),
    /CandidateDecisionContextV2가 올바르지 않습니다/,
  );
  assert.throws(
    () => buildCandidateDecisionEvidenceBundleV2(v2Input({ field, generatedAt: " " })),
    /generatedAt/,
  );
});

test("Version isolation: V1 builder source does not know candidate lease", () => {
  const start = BUNDLE_SOURCE.indexOf("export function buildCandidateDecisionEvidenceBundle(");
  const end = BUNDLE_SOURCE.indexOf("export const CANDIDATE_DECISION_EVIDENCE_V2_SCHEMA_VERSION");
  assert.ok(start > 0 && end > start);
  const v1Builder = BUNDLE_SOURCE.slice(start, end);
  assert.equal(/candidateLease|CandidateLease/.test(v1Builder), false);
  assert.match(v1Builder, /validateCandidateDecisionContext\(/);
  assert.doesNotMatch(v1Builder, /validateCandidateDecisionContextV2/);
});
