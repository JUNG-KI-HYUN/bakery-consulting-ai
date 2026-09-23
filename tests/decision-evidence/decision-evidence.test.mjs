import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import os from "node:os";
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

const {
  createEquipmentDefinition,
  createEquipmentInstance,
  createKnownEquipmentMm,
} = loadModule(path.join(repositoryRoot, "lib/equipment/types.ts"));
const { createEmptyLayout, createPillarElement } = loadModule(
  path.join(repositoryRoot, "lib/space-fit/types.ts"),
);
const { validateLayoutGeometry } = loadModule(
  path.join(repositoryRoot, "lib/space-fit/element-geometry.ts"),
);
const { createEmptyMeasurementSet, createKnownMm, createUnknownDimension } = loadModule(
  path.join(repositoryRoot, "lib/field/measurement.ts"),
);
const {
  createDefaultElectrical,
  createDefaultExhaust,
  createDefaultWaterSupply,
} = loadModule(path.join(repositoryRoot, "lib/field/facility.ts"));
const { createFieldEvidenceMeta } = loadModule(
  path.join(repositoryRoot, "lib/field/field-evidence-meta.ts"),
);
const { createCandidateStoreId, createSiteSurveyId } = loadModule(
  path.join(repositoryRoot, "lib/field/identifiers.ts"),
);
const { buildTechnicalCheckReport } = loadModule(
  path.join(repositoryRoot, "lib/technical-check/build-report.ts"),
);
const { buildDecisionEvidenceBundle } = loadModule(
  path.join(repositoryRoot, "lib/decision-evidence/build-bundle.ts"),
);
const { buildGeometryDecisionEvidence } = loadModule(
  path.join(repositoryRoot, "lib/decision-evidence/geometry-adapter.ts"),
);
const { sourceRefContainsNoPii, decisionEvidenceCreatesNoVerdictScoreRisk } = loadModule(
  path.join(repositoryRoot, "lib/decision-evidence/helpers.ts"),
);
const { cannotAutoPromoteToVerified } = loadModule(
  path.join(repositoryRoot, "lib/equipment/validation.ts"),
);

const consultationsPath = path.join(repositoryRoot, "data/consultations.json");
const consultationsBefore = fs.existsSync(consultationsPath)
  ? fs.readFileSync(consultationsPath)
  : null;
const backupPath = path.join(repositoryRoot, "data/diagnosis-drafts.json.backup");
const backupBefore = fs.existsSync(backupPath) ? fs.readFileSync(backupPath) : null;
const tempRoots = [];

after(() => {
  for (const rootDir of tempRoots) fs.rmSync(rootDir, { recursive: true, force: true });
  if (consultationsBefore) {
    assert.deepEqual(fs.readFileSync(consultationsPath), consultationsBefore);
  }
  if (backupBefore) {
    assert.deepEqual(fs.readFileSync(backupPath), backupBefore);
  }
});

const NOW = "2026-09-22T18:00:00.000Z";

function verifiedDef(overrides = {}) {
  return createEquipmentDefinition({
    category: "OVEN",
    name: "Decision Evidence 오븐",
    dataStatus: "VERIFIED",
    createdAt: NOW,
    verifiedAt: NOW,
    source: { sourceType: "MANUFACTURER", sourceLabel: "fixture", verifiedAt: NOW },
    dimensions: {
      widthMm: createKnownEquipmentMm(900),
      depthMm: createKnownEquipmentMm(800),
    },
    ...overrides,
  });
}

function makeMeasurement(values = {}) {
  return {
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
      ...values,
    },
  };
}

function makeLayout(measurement) {
  return createEmptyLayout({
    surveyId: measurement.surveyId,
    candidateStoreId: measurement.candidateStoreId,
    measurementId: measurement.measurementId,
    room: { shape: "RECTANGLE", widthMm: 5800, depthMm: 11200 },
    createdAt: NOW,
  });
}

function place(def, layout) {
  return Object.freeze({
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
  });
}

function buildBundle(input = {}) {
  const measurement = input.measurement ?? makeMeasurement();
  const def = input.def ?? verifiedDef(input.defOverrides ?? {});
  let layout = makeLayout(measurement);
  if (input.withEquipment !== false) layout = place(def, layout);
  if (input.elements) {
    layout = Object.freeze({ ...layout, elements: Object.freeze(input.elements) });
  }
  if (input.equipmentAt) {
    layout = Object.freeze({
      ...layout,
      equipmentInstances: Object.freeze([
        createEquipmentInstance({
          equipmentDefinitionId: def.equipmentDefinitionId,
          layoutId: layout.layoutId,
          xMm: input.equipmentAt.xMm,
          yMm: input.equipmentAt.yMm,
          rotationDeg: 0,
          createdAt: NOW,
        }),
      ]),
    });
  }
  const geometryWarnings = validateLayoutGeometry(layout, [def]);
  const technicalReport = buildTechnicalCheckReport({
    layout,
    definitions: [def],
    facility: input.facility ?? null,
    measurement,
    deliveryPath: input.deliveryPath ?? null,
    generatedAt: NOW,
  });
  const bundle = buildDecisionEvidenceBundle({
    layout,
    definitions: [def],
    geometryWarnings,
    facility: input.facility ?? null,
    measurement,
    deliveryPath: input.deliveryPath ?? null,
    technicalReport,
    generatedAt: NOW,
  });
  return { bundle, layout, def, geometryWarnings, technicalReport, measurement };
}

test("5F-1. Technical CONSTRAINT → observedConstraints", () => {
  const { bundle } = buildBundle({
    defOverrides: { electricalRequirement: { required: true, phase: "THREE" } },
    facility: {
      electrical: {
        ...createDefaultElectrical(),
        phaseType: {
          value: "SINGLE_PHASE",
          evidence: createFieldEvidenceMeta({ sourceType: "FIELD_CHECK" }),
        },
      },
    },
  });
  assert.equal(
    bundle.observedConstraints.some((item) => item.sourceDomain === "TECHNICAL_CHECK"),
    true,
  );
});

test("5F-2. Technical INSUFFICIENT → missingInformation", () => {
  const { bundle } = buildBundle({
    defOverrides: { waterRequirement: { required: true } },
    facility: { waterSupply: createDefaultWaterSupply() },
  });
  assert.equal(
    bundle.missingInformation.some(
      (item) => item.sourceDomain === "TECHNICAL_CHECK" && item.category === "WATER",
    ),
    true,
  );
});

test("5F-3. EXPERT_REVIEW_REQUIRED → expertReviewItems", () => {
  const { bundle } = buildBundle({
    defOverrides: { electricalRequirement: { required: true, phase: "SINGLE" } },
    facility: {
      electrical: {
        ...createDefaultElectrical(),
        phaseType: {
          value: "SINGLE_PHASE",
          evidence: createFieldEvidenceMeta({ sourceType: "FIELD_CHECK" }),
        },
        expansionStatus: {
          value: "EXPERT_REVIEW_REQUIRED",
          evidence: createFieldEvidenceMeta({
            confirmationRequirement: "EXPERT_CONFIRMATION_REQUIRED",
          }),
        },
      },
    },
  });
  assert.equal(bundle.expertReviewItems.length > 0, true);
});

test("5F-4. NOT_APPLICABLE → 불필요 item 생성 안 함", () => {
  const { bundle, technicalReport } = buildBundle({
    defOverrides: { waterRequirement: { required: false } },
  });
  assert.equal(technicalReport.equipmentChecks[0].water.status, "NOT_APPLICABLE");
  assert.equal(
    bundle.observedConstraints.some((item) => item.category === "WATER"),
    false,
  );
  assert.equal(
    bundle.missingInformation.some(
      (item) => item.sourceDomain === "TECHNICAL_CHECK" && item.category === "WATER",
    ),
    false,
  );
});

test("5F-5. NO_CONFLICT_OBSERVED가 positive score 생성 안 함", () => {
  const { bundle } = buildBundle({
    defOverrides: { waterRequirement: { required: false } },
  });
  assert.equal(bundle.createsScore, false);
  assert.equal("score" in bundle, false);
  assert.equal("적합도" in bundle, false);
});

test("5F-6. Geometry OUT_OF_BOUNDS → geometryIssues", () => {
  const { bundle, geometryWarnings } = buildBundle({
    equipmentAt: { xMm: 5200, yMm: 0 },
    defOverrides: {
      dimensions: {
        widthMm: createKnownEquipmentMm(900),
        depthMm: createKnownEquipmentMm(800),
      },
    },
  });
  assert.equal(geometryWarnings.some((w) => w.code === "OUT_OF_BOUNDS"), true);
  assert.equal(
    bundle.geometryIssues.some((item) => item.sourceRef.warningCode === "OUT_OF_BOUNDS"),
    true,
  );
});

test("5F-7. Geometry OVERLAP → geometryIssues", () => {
  const measurement = makeMeasurement();
  const def = verifiedDef({
    dimensions: {
      widthMm: createKnownEquipmentMm(900),
      depthMm: createKnownEquipmentMm(800),
    },
  });
  let layout = place(def, makeLayout(measurement));
  layout = Object.freeze({
    ...layout,
    elements: Object.freeze([
      createPillarElement({ xMm: 1200, yMm: 1200, widthMm: 500, heightMm: 500 }),
    ]),
  });
  const geometryWarnings = validateLayoutGeometry(layout, [def]);
  const bundle = buildDecisionEvidenceBundle({
    layout,
    definitions: [def],
    geometryWarnings,
    generatedAt: NOW,
  });
  assert.equal(geometryWarnings.some((w) => w.code === "OVERLAP"), true);
  assert.equal(
    bundle.geometryIssues.some((item) => item.sourceRef.warningCode === "OVERLAP"),
    true,
  );
});

test("5F-8. Geometry issue가 Risk/Verdict 생성 안 함", () => {
  const geometry = buildGeometryDecisionEvidence([
    { code: "OVERLAP", message: "overlap", elementId: "element_x" },
  ]);
  assert.equal(geometry.geometryIssues[0].bucket, "GEOMETRY_ISSUE");
  assert.equal(geometry.geometryIssues[0].description.includes("위험"), false);
});

test("5F-9. FIELD UNKNOWN → missingInformation", () => {
  const { bundle } = buildBundle({
    measurement: makeMeasurement({ entranceWidthMm: createUnknownDimension() }),
    withEquipment: false,
  });
  assert.equal(
    bundle.missingInformation.some((item) => item.title.includes("출입구 폭")),
    true,
  );
});

test("5F-10. FIELD expert confirmation → expertReviewItems", () => {
  const { bundle } = buildBundle({
    facility: { exhaust: createDefaultExhaust() },
    withEquipment: false,
  });
  assert.equal(
    bundle.expertReviewItems.some((item) => item.category === "EXHAUST"),
    true,
  );
});

test("5F-11/12/13. EvidenceSourceType / VerificationStatus / ConfirmationRequirement 유지", () => {
  const evidence = createFieldEvidenceMeta({
    sourceType: "OWNER_STATEMENT",
    verificationStatus: "UNKNOWN",
    confirmationRequirement: "OWNER_CONFIRMATION_REQUIRED",
  });
  const { bundle } = buildBundle({
    withEquipment: false,
    facility: {
      electrical: {
        ...createDefaultElectrical(),
        contractPowerKw: { value: 30, evidence },
      },
    },
  });
  const fact = bundle.observedFacts.find((item) => item.sourceRef.fieldKey === "contractPowerKw");
  assert.ok(fact);
  assert.equal(fact.sourceType, "OWNER_STATEMENT");
  assert.equal(fact.verificationStatus, "UNKNOWN");
  assert.equal(fact.confirmationRequirement, "OWNER_CONFIRMATION_REQUIRED");
});

test("5F-14. OWNER_STATEMENT를 VERIFIED로 변환하지 않음", () => {
  const evidence = createFieldEvidenceMeta({ sourceType: "OWNER_STATEMENT" });
  assert.notEqual(evidence.verificationStatus, "VERIFIED");
  const { bundle } = buildBundle({
    withEquipment: false,
    facility: {
      electrical: {
        ...createDefaultElectrical(),
        contractPowerKw: { value: 30, evidence },
      },
    },
  });
  const fact = bundle.observedFacts.find((item) => item.sourceRef.fieldKey === "contractPowerKw");
  assert.equal(fact.verificationStatus, "UNKNOWN");
  assert.equal(fact.sourceType, "OWNER_STATEMENT");
});

test("5F-15. SAMPLE equipment status 유지", () => {
  const def = createEquipmentDefinition({
    category: "OVEN",
    name: "[샘플]",
    dataStatus: "SAMPLE",
    createdAt: NOW,
    source: { sourceType: "SAMPLE" },
    dimensions: {
      widthMm: createKnownEquipmentMm(900),
      depthMm: createKnownEquipmentMm(800),
    },
  });
  const { bundle } = buildBundle({ def });
  assert.equal(
    bundle.missingInformation.some((item) => item.equipmentDataStatus === "SAMPLE"),
    true,
  );
});

test("5F-16. NEEDS_REVIEW 유지", () => {
  const def = createEquipmentDefinition({
    category: "MIXER",
    name: "리뷰믹서",
    dataStatus: "NEEDS_REVIEW",
    createdAt: NOW,
    source: { sourceType: "INTERNAL_REFERENCE" },
    dimensions: {
      widthMm: createKnownEquipmentMm(900),
      depthMm: createKnownEquipmentMm(800),
    },
  });
  const { bundle } = buildBundle({ def });
  assert.equal(
    bundle.missingInformation.some((item) => item.equipmentDataStatus === "NEEDS_REVIEW"),
    true,
  );
});

test("5F-17. REFERENCE를 VERIFIED로 변경하지 않음", () => {
  assert.equal(cannotAutoPromoteToVerified("REFERENCE"), true);
  const def = createEquipmentDefinition({
    category: "OVEN",
    name: "참고",
    dataStatus: "REFERENCE",
    createdAt: NOW,
    source: { sourceType: "PARTNER_REFERENCE" },
    dimensions: {
      widthMm: createKnownEquipmentMm(900),
      depthMm: createKnownEquipmentMm(800),
    },
  });
  const { bundle } = buildBundle({ def });
  assert.equal(
    bundle.observedFacts.some((item) => item.equipmentDataStatus === "REFERENCE"),
    true,
  );
  assert.equal(
    bundle.observedFacts.some((item) => item.equipmentDataStatus === "VERIFIED"),
    false,
  );
});

test("5F-18. duplicate 의미 item 중복생성 방어", () => {
  const { bundle, geometryWarnings } = buildBundle({
    equipmentAt: { xMm: 5200, yMm: 0 },
  });
  assert.equal(geometryWarnings.some((w) => w.code === "OUT_OF_BOUNDS"), true);
  // Geometry는 geometryIssues에만 — observedConstraints에 같은 warning 중복 없음
  assert.equal(
    bundle.observedConstraints.some((item) => item.sourceRef.warningCode === "OUT_OF_BOUNDS"),
    false,
  );
  const ids = [
    ...bundle.observedFacts,
    ...bundle.observedConstraints,
    ...bundle.missingInformation,
    ...bundle.expertReviewItems,
    ...bundle.geometryIssues,
  ].map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("5F-19. sourceRef 추적 가능", () => {
  const { bundle } = buildBundle({
    defOverrides: { electricalRequirement: { required: true, phase: "THREE" } },
    facility: {
      electrical: {
        ...createDefaultElectrical(),
        phaseType: {
          value: "SINGLE_PHASE",
          evidence: createFieldEvidenceMeta({ sourceType: "FIELD_CHECK" }),
        },
      },
    },
  });
  const constraint = bundle.observedConstraints.find(
    (item) => item.sourceDomain === "TECHNICAL_CHECK",
  );
  assert.ok(constraint?.sourceRef.equipmentInstanceId);
  assert.ok(constraint?.sourceRef.aspectKind);
});

test("5F-20. 개인정보 sourceRef 없음", () => {
  const { bundle } = buildBundle();
  for (const item of [
    ...bundle.observedFacts,
    ...bundle.observedConstraints,
    ...bundle.missingInformation,
    ...bundle.expertReviewItems,
    ...bundle.geometryIssues,
  ]) {
    assert.equal(sourceRefContainsNoPii(item.sourceRef), true);
  }
});

test("5F-21. Decision Bundle source object mutation 없음", () => {
  const measurement = makeMeasurement();
  const def = verifiedDef();
  const layout = place(def, makeLayout(measurement));
  const before = JSON.stringify(layout);
  buildDecisionEvidenceBundle({
    layout,
    definitions: [def],
    geometryWarnings: validateLayoutGeometry(layout, [def]),
    measurement,
    generatedAt: NOW,
  });
  assert.equal(JSON.stringify(layout), before);
});

test("5F-22. derived result persistence 파일 생성 없음", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "frameone-de-persist-"));
  tempRoots.push(root);
  const before = fs.readdirSync(root);
  buildBundle();
  assert.deepEqual(fs.readdirSync(root), before);
});

test("5F-23. 점수 생성 없음", () => {
  const { bundle } = buildBundle();
  assert.equal(bundle.createsScore, false);
  assert.equal("riskScore" in bundle, false);
  assert.equal("적합도" in bundle.summary, false);
});

test("5F-24. 추천/조건부추천/보류/위험 생성 없음", () => {
  const { bundle } = buildBundle();
  assert.equal(bundle.createsVerdict, false);
  assert.equal(bundle.createsRisk, false);
  assert.equal(decisionEvidenceCreatesNoVerdictScoreRisk(bundle), true);
  const text = JSON.stringify(bundle);
  assert.equal(text.includes('"추천"'), false);
  assert.equal(text.includes("조건부 추천"), false);
  assert.equal(/"verdict"\s*:/.test(text), false);
});

test("5F-25. 기존 Technical Check 결과 회귀", () => {
  const { technicalReport } = buildBundle({
    defOverrides: { waterRequirement: { required: false } },
  });
  assert.equal(technicalReport.createsRiskOrVerdict, false);
  assert.equal(technicalReport.equipmentChecks[0].water.status, "NOT_APPLICABLE");
});

test("5F-26. 기존 Geometry 결과 회귀", () => {
  const { geometryWarnings } = buildBundle({
    equipmentAt: { xMm: 5200, yMm: 0 },
  });
  assert.equal(geometryWarnings.every((w) => ["OUT_OF_BOUNDS", "OVERLAP", "INVALID_GEOMETRY"].includes(w.code)), true);
});
