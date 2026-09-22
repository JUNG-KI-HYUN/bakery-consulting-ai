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
  createUnknownEquipmentDimension,
} = loadModule(path.join(repositoryRoot, "lib/equipment/types.ts"));
const { createLayoutId } = loadModule(
  path.join(repositoryRoot, "lib/space-fit/identifiers.ts"),
);
const { createEmptyLayout } = loadModule(
  path.join(repositoryRoot, "lib/space-fit/types.ts"),
);
const { createEmptyMeasurementSet, createKnownMm, createUnknownDimension } = loadModule(
  path.join(repositoryRoot, "lib/field/measurement.ts"),
);
const {
  createDefaultElectrical,
  createDefaultWaterSupply,
  createDefaultDrainage,
  createDefaultExhaust,
} = loadModule(path.join(repositoryRoot, "lib/field/facility.ts"));
const { createDefaultDeliveryPath, createFieldEvidenceMeta } = (() => {
  const space = loadModule(path.join(repositoryRoot, "lib/field/space-equipment.ts"));
  const evidence = loadModule(path.join(repositoryRoot, "lib/field/field-evidence-meta.ts"));
  return {
    createDefaultDeliveryPath: space.createDefaultDeliveryPath,
    createFieldEvidenceMeta: evidence.createFieldEvidenceMeta,
  };
})();
const { checkEquipmentElectrical, summarizeKnownEquipmentPower } = loadModule(
  path.join(repositoryRoot, "lib/technical-check/electrical.ts"),
);
const {
  checkEquipmentWater,
  checkEquipmentDrainage,
  checkEquipmentExhaust,
} = loadModule(path.join(repositoryRoot, "lib/technical-check/utilities.ts"));
const {
  checkEquipmentDelivery,
  selectDeliveryRouteWidths,
  computeObservedBottleneckWidthMm,
} = loadModule(path.join(repositoryRoot, "lib/technical-check/delivery.ts"));
const {
  buildTechnicalCheckReport,
  technicalStatusIsNotRiskVerdict,
} = loadModule(path.join(repositoryRoot, "lib/technical-check/build-report.ts"));
const { validateLayoutGeometry } = loadModule(
  path.join(repositoryRoot, "lib/space-fit/element-geometry.ts"),
);
const { createSpaceFitLayoutService } = loadModule(
  path.join(repositoryRoot, "lib/space-fit/layout-service.server.ts"),
);
const { createCandidateStoreId, createSiteSurveyId } = loadModule(
  path.join(repositoryRoot, "lib/field/identifiers.ts"),
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

const NOW = "2026-09-22T17:00:00.000Z";

function verifiedDef(overrides = {}) {
  return createEquipmentDefinition({
    category: "OVEN",
    name: "기술검토 테스트 오븐",
    dataStatus: "VERIFIED",
    createdAt: NOW,
    verifiedAt: NOW,
    source: {
      sourceType: "MANUFACTURER",
      sourceLabel: "fixture",
      verifiedAt: NOW,
    },
    dimensions: {
      widthMm: createKnownEquipmentMm(900),
      depthMm: createKnownEquipmentMm(800),
      heightMm: createKnownEquipmentMm(1800),
    },
    rotationAllowed: true,
    ...overrides,
  });
}

function sampleDef(overrides = {}) {
  return createEquipmentDefinition({
    category: "OVEN",
    name: "[샘플] 기술검토",
    dataStatus: "SAMPLE",
    createdAt: NOW,
    limitation: "개발용 샘플",
    source: { sourceType: "SAMPLE", sourceLabel: "fixture" },
    dimensions: {
      widthMm: createKnownEquipmentMm(900),
      depthMm: createKnownEquipmentMm(800),
    },
    ...overrides,
  });
}

function makeMeasurement(values = {}) {
  const surveyId = createSiteSurveyId();
  const candidateStoreId = createCandidateStoreId();
  return {
    ...createEmptyMeasurementSet({
      surveyId,
      candidateStoreId,
      measuredAt: NOW,
      measuredBy: "field-staff",
    }),
    values: { ...values },
  };
}

function makeLayout(overrides = {}) {
  const measurement = makeMeasurement({
    roomWidthMm: createKnownMm(5800),
    roomDepthMm: createKnownMm(11200),
  });
  return createEmptyLayout({
    surveyId: measurement.surveyId,
    candidateStoreId: measurement.candidateStoreId,
    measurementId: measurement.measurementId,
    room: { shape: "RECTANGLE", widthMm: 5800, depthMm: 11200 },
    createdAt: NOW,
    ...overrides,
  });
}

function instanceFor(def, layoutId = createLayoutId()) {
  return createEquipmentInstance({
    equipmentDefinitionId: def.equipmentDefinitionId,
    layoutId,
    xMm: 0,
    yMm: 0,
    rotationDeg: 0,
    createdAt: NOW,
  });
}

test("5E-1. water required=false → NOT_APPLICABLE", () => {
  const def = verifiedDef({ waterRequirement: { required: false } });
  const result = checkEquipmentWater({ definition: def, waterSupply: createDefaultWaterSupply() });
  assert.equal(result.status, "NOT_APPLICABLE");
});

test("5E-2. water required=true + FIELD unknown → INSUFFICIENT_DATA", () => {
  const def = verifiedDef({ waterRequirement: { required: true } });
  const result = checkEquipmentWater({ definition: def, waterSupply: createDefaultWaterSupply() });
  assert.equal(result.status, "INSUFFICIENT_DATA");
});

test("5E-3. drain required=false → NOT_APPLICABLE", () => {
  const def = verifiedDef({ drainRequirement: { required: false } });
  const result = checkEquipmentDrainage({
    definition: def,
    drainage: createDefaultDrainage(),
  });
  assert.equal(result.status, "NOT_APPLICABLE");
});

test("5E-4. exhaust required + route unknown → INSUFFICIENT_DATA", () => {
  const def = verifiedDef({ exhaustRequirement: { required: true } });
  const result = checkEquipmentExhaust({
    definition: def,
    exhaust: createDefaultExhaust(),
  });
  assert.equal(result.status, "INSUFFICIENT_DATA");
});

test("5E-5. explicit phase mismatch → CONSTRAINT_OBSERVED", () => {
  const def = verifiedDef({
    electricalRequirement: { required: true, phase: "THREE" },
  });
  const electrical = {
    ...createDefaultElectrical(),
    phaseType: {
      value: "SINGLE_PHASE",
      evidence: createFieldEvidenceMeta({ sourceType: "FIELD_CHECK" }),
    },
  };
  const result = checkEquipmentElectrical({ definition: def, electrical });
  assert.equal(result.status, "CONSTRAINT_OBSERVED");
  assert.match(result.message, /전원/);
  assert.equal(result.message.includes("설치 가능"), false);
});

test("5E-6. FIELD phase unknown → INSUFFICIENT_DATA", () => {
  const def = verifiedDef({
    electricalRequirement: { required: true, phase: "THREE" },
  });
  const result = checkEquipmentElectrical({
    definition: def,
    electrical: createDefaultElectrical(),
  });
  assert.equal(result.status, "INSUFFICIENT_DATA");
});

test("5E-7/8. known equipment power sum + unknown count", () => {
  const a = verifiedDef({
    electricalRequirement: { required: true, powerKw: 10 },
  });
  const b = verifiedDef({
    electricalRequirement: { required: true, powerKw: 14.5 },
  });
  const c = verifiedDef({
    electricalRequirement: { required: true },
  });
  const layoutId = createLayoutId();
  const instances = [instanceFor(a, layoutId), instanceFor(b, layoutId), instanceFor(c, layoutId)];
  const map = new Map([
    [a.equipmentDefinitionId, a],
    [b.equipmentDefinitionId, b],
    [c.equipmentDefinitionId, c],
  ]);
  const summary = summarizeKnownEquipmentPower({
    instances,
    definitions: map,
    electrical: {
      ...createDefaultElectrical(),
      contractPowerKw: {
        value: 40,
        evidence: createFieldEvidenceMeta({ sourceType: "FIELD_CHECK" }),
      },
    },
  });
  assert.equal(summary.knownEquipmentPowerKw, 24.5);
  assert.equal(summary.unknownPowerEquipmentCount, 1);
  assert.equal(summary.arithmeticStatus, null);
});

test("5E-9. known power sum > contract → CONSTRAINT_OBSERVED", () => {
  const a = verifiedDef({
    electricalRequirement: { required: true, powerKw: 20 },
  });
  const b = verifiedDef({
    electricalRequirement: { required: true, powerKw: 22 },
  });
  const layoutId = createLayoutId();
  const summary = summarizeKnownEquipmentPower({
    instances: [instanceFor(a, layoutId), instanceFor(b, layoutId)],
    definitions: new Map([
      [a.equipmentDefinitionId, a],
      [b.equipmentDefinitionId, b],
    ]),
    electrical: {
      ...createDefaultElectrical(),
      contractPowerKw: {
        value: 30,
        evidence: createFieldEvidenceMeta({ sourceType: "FIELD_CHECK" }),
      },
    },
  });
  assert.equal(summary.arithmeticStatus, "CONSTRAINT_OBSERVED");
  assert.equal(/사용\s*불가/.test(summary.arithmeticMessage), false);
  assert.equal(/증설\s*불가/.test(summary.arithmeticMessage), false);
  assert.match(summary.arithmeticMessage, /최종 판단이 아닙니다/);});

test("5E-10. known power sum <= contract → 전기 충분 verdict 없음", () => {
  const a = verifiedDef({
    electricalRequirement: { required: true, powerKw: 10 },
  });
  const summary = summarizeKnownEquipmentPower({
    instances: [instanceFor(a)],
    definitions: new Map([[a.equipmentDefinitionId, a]]),
    electrical: {
      ...createDefaultElectrical(),
      contractPowerKw: {
        value: 30,
        evidence: createFieldEvidenceMeta({ sourceType: "FIELD_CHECK" }),
      },
    },
  });
  assert.equal(summary.arithmeticStatus, null);
  assert.equal(summary.arithmeticMessage, null);
  assert.match(summary.expertDisclaimer, /전문가/);
});

test("5E-11. minimum delivery width unknown → INSUFFICIENT_DATA", () => {
  const def = verifiedDef({
    minimumDeliveryWidthMm: createUnknownEquipmentDimension(),
  });
  const measurement = makeMeasurement({
    entranceWidthMm: createKnownMm(1200),
  });
  const deliveryPath = {
    ...createDefaultDeliveryPath(),
    primaryDeliveryMethod: {
      value: "GROUND_DIRECT",
      evidence: createFieldEvidenceMeta(),
    },
  };
  const result = checkEquipmentDelivery({ definition: def, measurement, deliveryPath });
  assert.equal(result.status, "INSUFFICIENT_DATA");
});

test("5E-12. entrance width unknown → INSUFFICIENT_DATA", () => {
  const def = verifiedDef({
    minimumDeliveryWidthMm: createKnownEquipmentMm(900),
  });
  const measurement = makeMeasurement({
    entranceWidthMm: createUnknownDimension(),
  });
  const deliveryPath = {
    ...createDefaultDeliveryPath(),
    primaryDeliveryMethod: {
      value: "GROUND_DIRECT",
      evidence: createFieldEvidenceMeta(),
    },
  };
  const result = checkEquipmentDelivery({ definition: def, measurement, deliveryPath });
  assert.equal(result.status, "INSUFFICIENT_DATA");
});

test("5E-13. equipment min width > bottleneck → CONSTRAINT_OBSERVED", () => {
  const def = verifiedDef({
    minimumDeliveryWidthMm: createKnownEquipmentMm(1000),
  });
  const measurement = makeMeasurement({
    entranceWidthMm: createKnownMm(850),
  });
  const deliveryPath = {
    ...createDefaultDeliveryPath(),
    primaryDeliveryMethod: {
      value: "GROUND_DIRECT",
      evidence: createFieldEvidenceMeta(),
    },
    stairTurning: {
      value: "NO_CONSTRAINT_OBSERVED",
      evidence: createFieldEvidenceMeta(),
    },
    intermediateDoorCorridor: {
      value: "NO_CONSTRAINT_OBSERVED",
      evidence: createFieldEvidenceMeta(),
    },
  };
  const result = checkEquipmentDelivery({ definition: def, measurement, deliveryPath });
  assert.equal(result.status, "CONSTRAINT_OBSERVED");
  assert.match(result.message, /좁/);
  assert.equal(result.message.includes("반입 불가"), false);
});

test("5E-14. equipment min width < bottleneck → 반입 가능 생성 안 함", () => {
  const def = verifiedDef({
    minimumDeliveryWidthMm: createKnownEquipmentMm(900),
    dimensions: {
      widthMm: createKnownEquipmentMm(900),
      depthMm: createKnownEquipmentMm(800),
      heightMm: createKnownEquipmentMm(1500),
    },
  });
  const measurement = makeMeasurement({
    entranceWidthMm: createKnownMm(1200),
    entranceHeightMm: createKnownMm(2200),
  });
  const deliveryPath = {
    ...createDefaultDeliveryPath(),
    primaryDeliveryMethod: {
      value: "GROUND_DIRECT",
      evidence: createFieldEvidenceMeta({
        verificationStatus: "VERIFIED",
        sourceType: "FIELD_CHECK",
      }),
    },
    stairTurning: {
      value: "NO_CONSTRAINT_OBSERVED",
      evidence: createFieldEvidenceMeta(),
    },
    intermediateDoorCorridor: {
      value: "NO_CONSTRAINT_OBSERVED",
      evidence: createFieldEvidenceMeta(),
    },
  };
  const result = checkEquipmentDelivery({ definition: def, measurement, deliveryPath });
  assert.equal(["NO_CONFLICT_OBSERVED", "EXPERT_REVIEW_REQUIRED"].includes(result.status), true);
  assert.equal(/반입\s*가능/.test(result.message), false);
});

test("5E-15. equipment height > entrance height → CONSTRAINT_OBSERVED", () => {
  const def = verifiedDef({
    minimumDeliveryWidthMm: createKnownEquipmentMm(800),
    dimensions: {
      widthMm: createKnownEquipmentMm(900),
      depthMm: createKnownEquipmentMm(800),
      heightMm: createKnownEquipmentMm(2400),
    },
  });
  const measurement = makeMeasurement({
    entranceWidthMm: createKnownMm(1200),
    entranceHeightMm: createKnownMm(2000),
  });
  const deliveryPath = {
    ...createDefaultDeliveryPath(),
    primaryDeliveryMethod: {
      value: "GROUND_DIRECT",
      evidence: createFieldEvidenceMeta(),
    },
    stairTurning: {
      value: "NO_CONSTRAINT_OBSERVED",
      evidence: createFieldEvidenceMeta(),
    },
    intermediateDoorCorridor: {
      value: "NO_CONSTRAINT_OBSERVED",
      evidence: createFieldEvidenceMeta(),
    },
  };
  const result = checkEquipmentDelivery({ definition: def, measurement, deliveryPath });
  assert.equal(result.status, "CONSTRAINT_OBSERVED");
  assert.match(result.message, /높이/);
  assert.equal(/반입\s*불가/.test(result.message), false);
});

test("5E-16. GROUND_DIRECT route width 계산", () => {
  const measurement = makeMeasurement({
    entranceWidthMm: createKnownMm(1100),
    corridorWidthMm: createKnownMm(900),
  });
  const route = selectDeliveryRouteWidths({
    method: "GROUND_DIRECT",
    measurement,
  });
  assert.deepEqual([...route.widthsMm], [1100]);
  assert.equal(computeObservedBottleneckWidthMm(route.widthsMm), 1100);
});

test("5E-17. STAIRS route bottleneck 계산", () => {
  const measurement = makeMeasurement({
    entranceWidthMm: createKnownMm(1200),
    corridorWidthMm: createKnownMm(1000),
    stairWidthMm: createKnownMm(850),
  });
  const route = selectDeliveryRouteWidths({ method: "STAIRS", measurement });
  assert.equal(computeObservedBottleneckWidthMm(route.widthsMm), 850);
  assert.equal(route.missingExpected, false);
});

test("5E-18. ELEVATOR route bottleneck 계산", () => {
  const measurement = makeMeasurement({
    entranceWidthMm: createKnownMm(1200),
    corridorWidthMm: createKnownMm(1100),
    elevatorDoorWidthMm: createKnownMm(900),
  });
  const route = selectDeliveryRouteWidths({ method: "ELEVATOR", measurement });
  assert.equal(computeObservedBottleneckWidthMm(route.widthsMm), 900);
});

test("5E-19. UNKNOWN delivery method → INSUFFICIENT_DATA", () => {
  const def = verifiedDef({
    minimumDeliveryWidthMm: createKnownEquipmentMm(900),
  });
  const result = checkEquipmentDelivery({
    definition: def,
    measurement: makeMeasurement({ entranceWidthMm: createKnownMm(1200) }),
    deliveryPath: createDefaultDeliveryPath(),
  });
  assert.equal(result.status, "INSUFFICIENT_DATA");
});

test("5E-20. stair turning constraint 반영", () => {
  const def = verifiedDef({
    minimumDeliveryWidthMm: createKnownEquipmentMm(800),
  });
  const measurement = makeMeasurement({
    entranceWidthMm: createKnownMm(1200),
    stairWidthMm: createKnownMm(1100),
  });
  const deliveryPath = {
    ...createDefaultDeliveryPath(),
    primaryDeliveryMethod: {
      value: "STAIRS",
      evidence: createFieldEvidenceMeta(),
    },
    stairTurning: {
      value: "CONSTRAINT_OBSERVED",
      evidence: createFieldEvidenceMeta(),
    },
  };
  const result = checkEquipmentDelivery({ definition: def, measurement, deliveryPath });
  assert.equal(result.status, "CONSTRAINT_OBSERVED");
  assert.match(result.message, /회전|중간/);
});

test("5E-21. SAMPLE equipment로 확정 technical result 생성 금지", () => {
  const def = sampleDef({
    waterRequirement: { required: true },
    electricalRequirement: { required: true, phase: "THREE", powerKw: 20 },
  });
  assert.equal(
    checkEquipmentWater({ definition: def, waterSupply: createDefaultWaterSupply() }).status,
    "INSUFFICIENT_DATA",
  );
  assert.equal(
    checkEquipmentElectrical({
      definition: def,
      electrical: {
        ...createDefaultElectrical(),
        phaseType: {
          value: "SINGLE_PHASE",
          evidence: createFieldEvidenceMeta(),
        },
      },
    }).status,
    "INSUFFICIENT_DATA",
  );
});

test("5E-22. NEEDS_REVIEW 상태 유지", () => {
  const def = createEquipmentDefinition({
    category: "MIXER",
    name: "리뷰 필요 믹서",
    dataStatus: "NEEDS_REVIEW",
    createdAt: NOW,
    source: { sourceType: "INTERNAL_REFERENCE" },
    minimumDeliveryWidthMm: createKnownEquipmentMm(1000),
    dimensions: {
      widthMm: createKnownEquipmentMm(900),
      depthMm: createKnownEquipmentMm(800),
    },
  });
  const result = checkEquipmentDelivery({
    definition: def,
    measurement: makeMeasurement({ entranceWidthMm: createKnownMm(800) }),
    deliveryPath: {
      ...createDefaultDeliveryPath(),
      primaryDeliveryMethod: {
        value: "GROUND_DIRECT",
        evidence: createFieldEvidenceMeta(),
      },
      stairTurning: {
        value: "NO_CONSTRAINT_OBSERVED",
        evidence: createFieldEvidenceMeta(),
      },
      intermediateDoorCorridor: {
        value: "NO_CONSTRAINT_OBSERVED",
        evidence: createFieldEvidenceMeta(),
      },
    },
  });
  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.equal(def.dataStatus, "NEEDS_REVIEW");
});

test("5E-23. REFERENCE가 VERIFIED로 승격 안 됨", () => {
  assert.equal(cannotAutoPromoteToVerified("REFERENCE"), true);
  const def = createEquipmentDefinition({
    category: "OVEN",
    name: "참고 오븐",
    dataStatus: "REFERENCE",
    createdAt: NOW,
    source: { sourceType: "PARTNER_REFERENCE" },
  });
  assert.equal(def.dataStatus, "REFERENCE");
});

test("5E-24. FIELD evidence source가 자동 VERIFIED 안 됨", () => {
  const evidence = createFieldEvidenceMeta({ sourceType: "OWNER_STATEMENT" });
  assert.notEqual(evidence.verificationStatus, "VERIFIED");
  assert.equal(evidence.sourceType, "OWNER_STATEMENT");
});

test("5E-25. TechnicalCheckReport가 source Domain을 mutation하지 않음", () => {
  const def = verifiedDef({ waterRequirement: { required: false } });
  const layout = makeLayout();
  const frozenLayout = Object.freeze({
    ...layout,
    equipmentInstances: Object.freeze([instanceFor(def, layout.layoutId)]),
  });
  const before = JSON.stringify(frozenLayout);
  buildTechnicalCheckReport({
    layout: frozenLayout,
    definitions: [def],
    facility: { waterSupply: createDefaultWaterSupply() },
    measurement: null,
    deliveryPath: null,
    generatedAt: NOW,
  });
  assert.equal(JSON.stringify(frozenLayout), before);
});

test("5E-26. Technical result persistence 파일 생성 안 함", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "frameone-tech-persist-"));
  tempRoots.push(root);
  const before = fs.readdirSync(root);
  const def = verifiedDef({ waterRequirement: { required: false } });
  const layout = makeLayout();
  buildTechnicalCheckReport({
    layout: Object.freeze({
      ...layout,
      equipmentInstances: Object.freeze([instanceFor(def, layout.layoutId)]),
    }),
    definitions: [def],
    generatedAt: NOW,
  });
  assert.deepEqual(fs.readdirSync(root), before);
});

test("5E-27. Geometry warning과 Technical status 별도", () => {
  const def = verifiedDef({
    dimensions: {
      widthMm: createKnownEquipmentMm(900),
      depthMm: createKnownEquipmentMm(800),
    },
    waterRequirement: { required: false },
  });
  const base = makeLayout();
  const inst = createEquipmentInstance({
    equipmentDefinitionId: def.equipmentDefinitionId,
    layoutId: base.layoutId,
    xMm: 5200,
    yMm: 0,
    rotationDeg: 0,
    createdAt: NOW,
  });
  const layout2 = Object.freeze({
    ...base,
    equipmentInstances: Object.freeze([inst]),
  });
  const geometry = validateLayoutGeometry(layout2, [def]);
  const report = buildTechnicalCheckReport({
    layout: layout2,
    definitions: [def],
    generatedAt: NOW,
  });
  assert.equal(geometry.some((w) => w.code === "OUT_OF_BOUNDS"), true);
  assert.equal(report.geometrySeparated, true);
  assert.equal(report.createsRiskOrVerdict, false);
  assert.equal(report.equipmentChecks[0].water.status, "NOT_APPLICABLE");
});

test("5E-28. Technical status가 Risk/Verdict 생성하지 않음", () => {
  for (const status of [
    "NO_CONFLICT_OBSERVED",
    "CONSTRAINT_OBSERVED",
    "INSUFFICIENT_DATA",
    "EXPERT_REVIEW_REQUIRED",
    "NOT_APPLICABLE",
  ]) {
    assert.equal(technicalStatusIsNotRiskVerdict(status), true);
  }
});

test("5E-29. 기존 equipmentInstances 없는 Layout 회귀", () => {
  const layout = makeLayout();
  assert.equal(layout.equipmentInstances, undefined);
  const report = buildTechnicalCheckReport({
    layout,
    definitions: [],
    generatedAt: NOW,
  });
  assert.equal(report.equipmentChecks.length, 0);
  assert.equal(report.powerSummary.knownEquipmentPowerKw, 0);
});

test("5E-30. 현재 Layout save/reload 회귀", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "frameone-tech-layout-"));
  tempRoots.push(rootDir);
  const service = createSpaceFitLayoutService({ rootDir, now: () => NOW });
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
    },
  };
  const started = await service.startLayout({ measurement });
  assert.equal(started.ok, true);
  const def = verifiedDef();
  const inst = instanceFor(def, started.value.layout.layoutId);
  const saved = await service.updateLayout({
    layoutId: started.value.layout.layoutId,
    expectedLayoutVersion: 1,
    elements: [],
    equipmentInstances: [inst],
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.value.layoutVersion, 2);
  const loaded = await service.getLayout(started.value.layout.layoutId);
  assert.equal(loaded.value.equipmentInstances.length, 1);
});
