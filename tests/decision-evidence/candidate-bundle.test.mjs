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
const { buildCandidateDecisionEvidenceBundle, CANDIDATE_DECISION_EVIDENCE_SCHEMA_VERSION } =
  lib("lib/decision-evidence/candidate-bundle.ts");
const { createDecisionEvidenceItem } = lib("lib/decision-evidence/helpers.ts");
const { buildDecisionEvidenceBundle } = lib("lib/decision-evidence/build-bundle.ts");
const { createCandidateDecisionContext } = lib("lib/decision-integration/create-context.ts");
const { createEquipmentDefinition, createEquipmentInstance, createKnownEquipmentMm } =
  lib("lib/equipment/types.ts");
const { createEmptyLayout, createPillarElement } = lib("lib/space-fit/types.ts");
const { validateLayoutGeometry } = lib("lib/space-fit/element-geometry.ts");
const { createEmptyMeasurementSet, createKnownMm } = lib("lib/field/measurement.ts");
const { createCandidateStoreId, createSiteSurveyId } = lib("lib/field/identifiers.ts");
const { createLayoutId } = lib("lib/space-fit/identifiers.ts");
const { createAvailableResult, createGeometryBlockedResult } =
  lib("lib/market-data/basic-location/results.ts");
const { buildBasicLocationInterpretation } = lib("lib/market-data/basic-location/interpretation.ts");
const { buildCompetitionStructure } = lib("lib/market-data/competition-structure.ts");
const { competitionStructureLocationInput, createCompetitionLocationTarget } =
  lib("lib/market-data/competition-location.ts");
const { calculateEconomicFeasibility } = lib("lib/economic-feasibility/engine.ts");

// ---- fixtures (sample/demo only; not real customer or market data) ----

const NOW = "2026-09-22T18:00:00.000Z";
const GENERATED_AT = "2026-10-01T05:00:00.000Z";
const RUN_A = "basic-location-run:77777777-7777-4777-8777-777777777777";
const RUN_B = "basic-location-run:88888888-8888-4888-8888-888888888888";

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

const OFFICIAL_SOURCE = { sourceId: "SRC-SEOUL-STORES", sourceName: "fixture official", sourceType: "PUBLIC_DATA_OFFICIAL" };

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

function rentalResult(overrides = {}) {
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
    ...overrides,
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

function economicResult({ lowSalesHighRent = false } = {}) {
  const rental = rentalResult();
  return calculateEconomicFeasibility({
    plan: {
      expectedTicket: 10_000,
      operatingDaysPerMonth: 25,
      salesScenario: lowSalesHighRent
        ? { conservativeDailyTransactions: 10, baseDailyTransactions: 15, upsideDailyTransactions: 20 }
        : { conservativeDailyTransactions: 80, baseDailyTransactions: 100, upsideDailyTransactions: 120 },
      variableCostRates: {
        materialCostRate: 0.3,
        packagingCostRate: 0.05,
        cardFeeRate: 0.02,
        deliveryVariableRate: 0.03,
        otherVariableRate: 0.01,
      },
      fixedMonthlyCosts: {
        laborMonthly: 6_000_000,
        rentMonthly: lowSalesHighRent ? 9_000_000 : 3_000_000,
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

function contextFor({ field, overrides = {} }) {
  const rental = rentalResult();
  const economic = economicResult();
  const created = createCandidateDecisionContext({
    candidateStoreId: field.layout.candidateStoreId,
    createdAt: NOW,
    locationBinding: { analysisRunId: RUN_A },
    leaseBinding: { selectedResearchRecordIds: [...rental.selectedRecordIds], referenceDate: rental.referenceDate },
    economicBinding: { generatedAt: economic.metadata.generatedAt, engineVersion: economic.metadata.engineVersion },
    fieldBinding: { surveyId: field.layout.surveyId, layoutId: field.layout.layoutId },
    ...overrides,
  });
  assert.equal(created.ok, true, created.message);
  return created.value;
}

function standardInput({ field = fieldFixture(), contextOverrides = {}, ...rest } = {}) {
  return {
    context: contextFor({ field, overrides: contextOverrides }),
    generatedAt: GENERATED_AT,
    fieldBundle: field.bundle,
    locationSource: locationSource(),
    rentalMarketResult: rentalResult(),
    economicResult: economicResult(),
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

const domains = (items) => new Set(items.map((item) => item.sourceDomain));
const byIdSuffix = (items, suffix) => items.find((item) => item.id.endsWith(`|${suffix}`));
const FIELD_DOMAINS = new Set(["FIELD", "TECHNICAL_CHECK", "SPACE_FIT", "EQUIPMENT"]);

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

// ---- tests ----

test("1. all domains with normal input produce a candidate bundle", () => {
  const bundle = buildCandidateDecisionEvidenceBundle(standardInput());
  assert.equal(bundle.schemaVersion, CANDIDATE_DECISION_EVIDENCE_SCHEMA_VERSION);
  assert.equal(bundle.schemaVersion, "candidate-decision-evidence-v1");
  assert.ok(bundle.observedFacts.length > 0);
  assert.equal(bundle.summary.observedFacts, bundle.observedFacts.length);
  assert.equal(bundle.summary.missingInformation, bundle.missingInformation.length);
  assert.equal(
    bundle.summary.coreMissing,
    bundle.missingInformation.filter((item) => item.importance === "CORE").length,
  );
});

test("2. candidateStoreId comes from the context", () => {
  const input = standardInput();
  const bundle = buildCandidateDecisionEvidenceBundle(input);
  assert.equal(bundle.candidateStoreId, input.context.candidateStoreId);
  assert.equal(bundle.decisionContext.candidateStoreId, input.context.candidateStoreId);
  assert.deepEqual(bundle.decisionContext, input.context);
});

test("3. FIELD, Location, Lease, and Economic evidence all reach the top level", () => {
  const bundle = buildCandidateDecisionEvidenceBundle(standardInput());
  const present = domains(allItems(bundle));
  for (const domain of ["LOCATION", "LEASE", "ECONOMIC"]) assert.ok(present.has(domain), domain);
  assert.ok([...present].some((domain) => FIELD_DOMAINS.has(domain)));
  assert.equal(byIdSuffix(bundle.missingInformation, "field-binding-absent"), undefined);
});

test("4. domain-native metadata is preserved in domainEvidence", () => {
  const input = standardInput();
  const bundle = buildCandidateDecisionEvidenceBundle(input);
  const { field, location, lease, economic } = bundle.domainEvidence;
  assert.equal(field.surveyId, input.fieldBundle.surveyId);
  assert.deepEqual(field.observedFacts, input.fieldBundle.observedFacts);
  assert.ok(location.referenceLimitations.length > 0);
  assert.ok(location.referenceNextChecks.length > 0);
  assert.equal(location.referenceCompetition.analysisRunId, RUN_A);
  assert.ok(location.observedFacts.some((item) => item.locationReference));
  assert.deepEqual(lease.referenceLimitations, input.rentalMarketResult.limitations);
  assert.equal(lease.referenceNumericSummaries.managementFee.median, null);
  assert.ok(economic.referenceProvenance.length > 0);
  assert.ok(Array.isArray(economic.referenceValidation.errors));
  assert.ok(Object.keys(economic.referenceNullableNumbers).length > 0);
});

test("4-1. Economic referenceRentPlanning reaches domainEvidence unchanged", () => {
  const input = standardInput();
  const bundle = buildCandidateDecisionEvidenceBundle(input);
  const source = input.economicResult.rentalMarketReference;
  assert.deepEqual(bundle.domainEvidence.economic.referenceRentPlanning, {
    plannedRent: source.plannedRent,
    baseRentCeiling: source.baseRentCeiling,
    plannedRentToCeiling: source.plannedRentToCeiling,
  });
});

test("5. exact duplicate item ids are deduped and nothing else", () => {
  const field = fieldFixture();
  const duplicate = field.bundle.observedFacts[0];
  const bundle = buildCandidateDecisionEvidenceBundle(standardInput({
    field,
    fieldBundle: { ...field.bundle, observedFacts: [duplicate, duplicate, ...field.bundle.observedFacts] },
  }));
  assert.equal(bundle.observedFacts.filter((item) => item.id === duplicate.id).length, 1);
  const ids = allItems(bundle).map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("6. same description from different sourceDomains is not deduped", () => {
  const field = fieldFixture();
  const leaseOnly = buildCandidateDecisionEvidenceBundle(standardInput({ field }));
  const leaseFact = leaseOnly.observedFacts.find((item) => item.sourceDomain === "LEASE");
  const mirror = createDecisionEvidenceItem({
    sourceDomain: "FIELD",
    bucket: "OBSERVED_FACT",
    category: "MEASUREMENT",
    key: "fixture-mirror",
    title: leaseFact.title,
    description: leaseFact.description,
  });
  const bundle = buildCandidateDecisionEvidenceBundle(standardInput({
    field,
    fieldBundle: { ...field.bundle, observedFacts: [...field.bundle.observedFacts, mirror] },
  }));
  const same = bundle.observedFacts.filter((item) => item.description === leaseFact.description);
  assert.deepEqual(same.map((item) => item.sourceDomain).sort(), ["FIELD", "LEASE"]);
});

function assertFieldExcluded(bundle, key) {
  const gap = byIdSuffix(bundle.missingInformation, key);
  assert.ok(gap, key);
  assert.equal(gap.sourceDomain, "FIELD");
  assert.equal(gap.bucket, "MISSING_INFORMATION");
  assert.equal(gap.nature, "INTEGRATION_STATE");
  assert.equal(bundle.domainEvidence.field, null);
  assert.equal(allItems(bundle).some((item) => FIELD_DOMAINS.has(item.sourceDomain) && item.nature !== "INTEGRATION_STATE"), false);
  assert.equal(bundle.observedConstraints.length, 0);
  assert.equal(bundle.geometryIssues.length, 0);
}

test("7. FIELD candidateStore mismatch excludes field evidence", () => {
  const field = fieldFixture();
  const bundle = buildCandidateDecisionEvidenceBundle(standardInput({
    field,
    contextOverrides: { candidateStoreId: createCandidateStoreId() },
  }));
  assertFieldExcluded(bundle, "field-candidate-store-mismatch");
});

test("8. FIELD survey mismatch excludes field evidence", () => {
  const field = fieldFixture();
  const bundle = buildCandidateDecisionEvidenceBundle(standardInput({
    field,
    contextOverrides: { fieldBinding: { surveyId: createSiteSurveyId(), layoutId: field.layout.layoutId } },
  }));
  assertFieldExcluded(bundle, "field-survey-mismatch");
});

test("9. FIELD layout mismatch excludes field evidence", () => {
  const field = fieldFixture();
  const bundle = buildCandidateDecisionEvidenceBundle(standardInput({
    field,
    contextOverrides: { fieldBinding: { surveyId: field.layout.surveyId, layoutId: createLayoutId() } },
  }));
  assertFieldExcluded(bundle, "field-layout-mismatch");
});

test("10. fieldBinding null ignores a supplied field bundle", () => {
  const bundle = buildCandidateDecisionEvidenceBundle(standardInput({ contextOverrides: { fieldBinding: null } }));
  assertFieldExcluded(bundle, "field-binding-absent");
  assert.match(byIdSuffix(bundle.missingInformation, "field-binding-absent").description, /사용하지 않았습니다/);
});

test("11. layoutId null is layout-not-started missing information, not risk", () => {
  const field = fieldFixture();
  const bundle = buildCandidateDecisionEvidenceBundle(standardInput({
    field,
    contextOverrides: { fieldBinding: { surveyId: field.layout.surveyId, layoutId: null } },
  }));
  assertFieldExcluded(bundle, "field-layout-not-started");
  assert.match(byIdSuffix(bundle.missingInformation, "field-layout-not-started").description, /SPACE FIT layout이 아직 연결되지 않았습니다/);
  assert.equal(bundle.createsRisk, false);
});

test("12. Location binding null keeps location adapter semantics", () => {
  const bundle = buildCandidateDecisionEvidenceBundle(standardInput({ contextOverrides: { locationBinding: null } }));
  const gap = byIdSuffix(bundle.missingInformation, "location-binding-absent");
  assert.equal(gap.sourceDomain, "LOCATION");
  assert.equal(gap.nature, "INTEGRATION_STATE");
  assert.equal(bundle.observedFacts.some((item) => item.sourceDomain === "LOCATION"), false);
});

test("12b. missing location source creates LOCATION missing without fabricated results", () => {
  const bundle = buildCandidateDecisionEvidenceBundle(standardInput({ locationSource: null }));
  assert.equal(byIdSuffix(bundle.missingInformation, "basic-location-results-absent").sourceDomain, "LOCATION");
  assert.equal(byIdSuffix(bundle.missingInformation, "competition-structure-absent").sourceDomain, "LOCATION");
  assert.equal(bundle.observedFacts.some((item) => item.sourceDomain === "LOCATION"), false);
  assert.equal(bundle.domainEvidence.location.referenceCompetition, null);
});

test("13. Location stale run stays an integration gap", () => {
  const bundle = buildCandidateDecisionEvidenceBundle(standardInput({ locationSource: locationSource(RUN_B) }));
  assert.equal(byIdSuffix(bundle.missingInformation, "basic-location-result-run-mismatch").nature, "INTEGRATION_STATE");
  assert.equal(byIdSuffix(bundle.missingInformation, "competition-target-run-mismatch").nature, "INTEGRATION_STATE");
  assert.equal(bundle.observedFacts.some((item) => item.sourceDomain === "LOCATION"), false);
});

test("14. Lease binding mismatch keeps lease adapter semantics", () => {
  const bundle = buildCandidateDecisionEvidenceBundle(standardInput({
    contextOverrides: { leaseBinding: { selectedResearchRecordIds: ["rec-other"], referenceDate: null } },
  }));
  const gap = byIdSuffix(bundle.missingInformation, "selected-record-ids-mismatch");
  assert.equal(gap.sourceDomain, "LEASE");
  assert.equal(gap.nature, "INTEGRATION_STATE");
});

test("15. Economic generatedAt mismatch keeps economic adapter semantics", () => {
  const bundle = buildCandidateDecisionEvidenceBundle(standardInput({
    contextOverrides: { economicBinding: { generatedAt: "1999-01-01T00:00:00.000Z", engineVersion: "economic-feasibility-v1" } },
  }));
  const gap = byIdSuffix(bundle.missingInformation, "generated-at-mismatch");
  assert.equal(gap.sourceDomain, "ECONOMIC");
  assert.equal(gap.nature, "INTEGRATION_STATE");
});

test("16. UNKNOWN and null values are not converted to 0", () => {
  const bundle = buildCandidateDecisionEvidenceBundle(standardInput());
  const blocked = bundle.missingInformation.find((item) => item.locationReference?.status === "BLOCKED");
  assert.equal(blocked.locationReference.value, null);
  assert.equal(blocked.locationReference.valueType, "UNKNOWN");
  const fee = bundle.domainEvidence.lease.referenceNumericSummaries.managementFee;
  assert.deepEqual(fee, { sampleCount: 0, median: null, min: null, max: null });
  for (const item of allItems(bundle).filter((entry) => ["LOCATION", "LEASE", "ECONOMIC"].includes(entry.sourceDomain))) {
    assert.equal(item.description.includes("null"), false, item.id);
  }
});

test("17. Location riskSignals create no constraint or risk", () => {
  const input = standardInput();
  assert.ok(input.locationSource.interpretation.riskSignals.length > 0);
  const bundle = buildCandidateDecisionEvidenceBundle(input);
  assert.equal(bundle.observedConstraints.some((item) => item.sourceDomain === "LOCATION"), false);
  assert.equal(collectKeys(bundle).has("riskSignals"), false);
});

test("18-19. sales below BEP and planned rent ABOVE ceiling create no constraint or risk", () => {
  const economic = economicResult({ lowSalesHighRent: true });
  assert.ok(economic.scenarios.base.monthlySales < economic.bep.monthlyBepSales);
  assert.equal(economic.rentalMarketReference.plannedRentToCeiling, "ABOVE");
  const bundle = buildCandidateDecisionEvidenceBundle(standardInput({
    economicResult: economic,
    contextOverrides: { economicBinding: { generatedAt: economic.metadata.generatedAt, engineVersion: economic.metadata.engineVersion } },
  }));
  assert.ok(bundle.observedFacts.some((item) => item.sourceDomain === "ECONOMIC"));
  assert.equal(bundle.observedConstraints.some((item) => item.sourceDomain === "ECONOMIC"), false);
  assert.ok(bundle.observedConstraints.every((item) => FIELD_DOMAINS.has(item.sourceDomain)));
  assert.equal(bundle.createsRisk, false);
});

test("20. competition observation count creates no risk", () => {
  const bundle = buildCandidateDecisionEvidenceBundle(standardInput());
  assert.equal(bundle.domainEvidence.location.referenceCompetition.uniqueObservedCandidateCount, 8);
  assert.equal(bundle.observedConstraints.some((item) => item.category === "COMPETITION"), false);
  assert.equal(bundle.geometryIssues.some((item) => item.sourceDomain === "LOCATION"), false);
});

test("21. geometry issues come only from the FIELD bundle", () => {
  const field = fieldFixture({ withPillarOverlap: true });
  assert.ok(field.bundle.geometryIssues.length > 0);
  const bundle = buildCandidateDecisionEvidenceBundle(standardInput({ field }));
  assert.deepEqual(
    bundle.geometryIssues.map((item) => item.id).sort(),
    field.bundle.geometryIssues.map((item) => item.id).sort(),
  );
  assert.ok(bundle.geometryIssues.every((item) => FIELD_DOMAINS.has(item.sourceDomain)));
});

test("22. expert review items are only those produced by existing adapters", () => {
  const input = standardInput();
  const bundle = buildCandidateDecisionEvidenceBundle(input);
  const expected = [
    ...input.fieldBundle.expertReviewItems,
    ...bundle.domainEvidence.location.expertReviewItems,
    ...bundle.domainEvidence.lease.expertReviewItems,
    ...bundle.domainEvidence.economic.expertReviewItems,
  ].map((item) => item.id).sort();
  assert.deepEqual(bundle.expertReviewItems.map((item) => item.id).sort(), expected);
});

test("23. ordering is deterministic and independent of call", () => {
  const input = standardInput();
  const first = buildCandidateDecisionEvidenceBundle(input);
  const second = buildCandidateDecisionEvidenceBundle(input);
  assert.deepEqual(first, second);
  assert.deepEqual(first.missingInformation.map((item) => item.id), second.missingInformation.map((item) => item.id));
});

test("24. inputs are not mutated or frozen", () => {
  const input = standardInput();
  const fieldBundleCopy = { ...input.fieldBundle, observedFacts: [...input.fieldBundle.observedFacts] };
  const rental = rentalResult();
  const mutableInput = { ...input, fieldBundle: fieldBundleCopy, rentalMarketResult: rental };
  const before = JSON.stringify(mutableInput);
  buildCandidateDecisionEvidenceBundle(mutableInput);
  assert.equal(JSON.stringify(mutableInput), before);
  assert.equal(Object.isFrozen(fieldBundleCopy), false);
  assert.equal(Object.isFrozen(fieldBundleCopy.observedFacts), false);
  assert.equal(Object.isFrozen(rental), false);
  assert.equal(Object.isFrozen(rental.deposit), false);
});

test("25. bundle is JSON serializable", () => {
  const bundle = buildCandidateDecisionEvidenceBundle(standardInput());
  const serialized = JSON.stringify(bundle);
  assert.doesNotThrow(() => JSON.parse(serialized));
  assert.equal(serialized.includes("NaN"), false);
  assert.equal(serialized.includes("Infinity"), false);
});

test("26-28. createsRisk, createsScore, createsVerdict are false", () => {
  const bundle = buildCandidateDecisionEvidenceBundle(standardInput());
  assert.equal(bundle.createsRisk, false);
  assert.equal(bundle.createsScore, false);
  assert.equal(bundle.createsVerdict, false);
  const forbiddenKeys = ["risk", "riskScore", "totalRiskScore", "verdict", "recommendation", "approval", "hardFail", "blockingDecision", "contractDecision"];
  const keys = collectKeys(bundle);
  for (const key of forbiddenKeys) assert.equal(keys.has(key), false, key);
});

test("29. no new judgement phrases in unified integration items", () => {
  const cases = [
    standardInput({ contextOverrides: { fieldBinding: null } }),
    standardInput({ fieldBundle: null }),
    (() => {
      const field = fieldFixture();
      return standardInput({ field, contextOverrides: { fieldBinding: { surveyId: field.layout.surveyId, layoutId: null } } });
    })(),
    (() => {
      const field = fieldFixture();
      return standardInput({ field, contextOverrides: { candidateStoreId: createCandidateStoreId() } });
    })(),
  ];
  const forbidden = /추천|보류|위험|안전|계약\s*가능|계약\s*불가|Risk|Verdict/;
  for (const input of cases) {
    const bundle = buildCandidateDecisionEvidenceBundle(input);
    for (const item of bundle.missingInformation.filter((entry) => entry.id.startsWith("FIELD|") && entry.nature === "INTEGRATION_STATE")) {
      assert.doesNotMatch(`${item.title} ${item.description}`, forbidden, item.id);
    }
  }
  const absent = buildCandidateDecisionEvidenceBundle(standardInput({ fieldBundle: null }));
  assert.ok(byIdSuffix(absent.missingInformation, "field-bundle-absent"));
});

test("30. generatedAt is the caller value, not a domain timestamp", () => {
  const bundle = buildCandidateDecisionEvidenceBundle(standardInput());
  assert.equal(bundle.generatedAt, GENERATED_AT);
  assert.notEqual(bundle.generatedAt, bundle.domainEvidence.field.generatedAt);
  assert.throws(() => buildCandidateDecisionEvidenceBundle(standardInput({ generatedAt: " " })), /generatedAt/);
});
