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
  createEquipmentDefinitionId,
  isEquipmentDefinitionId,
  createEquipmentInstanceId,
  isEquipmentInstanceId,
} = loadModule(path.join(repositoryRoot, "lib/equipment/identifiers.ts"));
const {
  createEquipmentDefinition,
  createEquipmentInstance,
  createKnownEquipmentMm,
  createUnknownEquipmentDimension,
} = loadModule(path.join(repositoryRoot, "lib/equipment/types.ts"));
const {
  parseEquipmentDefinition,
  parseEquipmentInstance,
  validateEquipmentInstanceForDefinition,
  assertVerifiedEligibility,
  cannotAutoPromoteToVerified,
  equipmentDataStatusIsNotRiskVerdict,
} = loadModule(path.join(repositoryRoot, "lib/equipment/validation.ts"));
const { getEquipmentFootprint } = loadModule(
  path.join(repositoryRoot, "lib/equipment/footprint.ts"),
);
const {
  createEquipmentDefinitionService,
  resolveEquipmentDefinitionFilePath,
} = loadModule(path.join(repositoryRoot, "lib/equipment/definition-service.server.ts"));
const { createLayoutId } = loadModule(
  path.join(repositoryRoot, "lib/space-fit/identifiers.ts"),
);
const { createEmptyLayout } = loadModule(path.join(repositoryRoot, "lib/space-fit/types.ts"));
const { parseSpaceFitLayout } = loadModule(
  path.join(repositoryRoot, "lib/space-fit/layout-record.ts"),
);
const { createCandidateStoreId, createMeasurementId, createSiteSurveyId } = loadModule(
  path.join(repositoryRoot, "lib/field/identifiers.ts"),
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

function sampleDef(overrides = {}) {
  return createEquipmentDefinition({
    category: "OVEN",
    name: "[샘플] 테스트 오븐",
    dataStatus: "SAMPLE",
    createdAt: "2026-09-22T12:00:00.000Z",
    limitation: "개발용 샘플. 실제 제품 사양이 아님",
    source: { sourceType: "SAMPLE", sourceLabel: "test fixture" },
    ...overrides,
  });
}

test("1. equipment_<uuid> 생성", () => {
  const id = createEquipmentDefinitionId();
  assert.equal(isEquipmentDefinitionId(id), true);
  assert.match(id, /^equipment_[0-9a-f-]{36}$/i);
});

test("2. EquipmentDefinition과 Instance 분리", () => {
  const def = sampleDef({
    dimensions: {
      widthMm: createKnownEquipmentMm(900),
      depthMm: createKnownEquipmentMm(800),
    },
  });
  const layoutId = createLayoutId();
  const instance = createEquipmentInstance({
    equipmentDefinitionId: def.equipmentDefinitionId,
    layoutId,
    xMm: 100,
    yMm: 200,
    rotationDeg: 0,
    createdAt: "2026-09-22T12:00:00.000Z",
  });
  assert.equal("widthMm" in instance, false);
  assert.equal("depthMm" in instance, false);
  assert.equal(instance.equipmentDefinitionId, def.equipmentDefinitionId);
  assert.equal(isEquipmentInstanceId(instance.equipmentInstanceId), true);
});

test("3. Instance가 Definition ID를 참조", () => {
  const def = sampleDef();
  const instance = createEquipmentInstance({
    equipmentDefinitionId: def.equipmentDefinitionId,
    layoutId: createLayoutId(),
    xMm: 0,
    yMm: 0,
    rotationDeg: 0,
    createdAt: "2026-09-22T12:00:00.000Z",
  });
  assert.equal(instance.equipmentDefinitionId, def.equipmentDefinitionId);
});

test("4. width/depth/height UNKNOWN 허용", () => {
  const def = sampleDef({
    dimensions: {
      widthMm: createUnknownEquipmentDimension(),
      depthMm: createUnknownEquipmentDimension(),
      heightMm: createUnknownEquipmentDimension(),
    },
  });
  assert.equal(def.dimensions.widthMm.status, "UNKNOWN");
  assert.equal(parseEquipmentDefinition(def)?.dimensions.widthMm.status, "UNKNOWN");
});

test("5. UNKNOWN이 0으로 변환되지 않음", () => {
  const def = sampleDef({
    dimensions: { widthMm: createUnknownEquipmentDimension() },
  });
  assert.equal("mm" in def.dimensions.widthMm, false);
  assert.notEqual(def.dimensions.widthMm.mm, 0);
});

test("6. negative dimension 거부", () => {
  assert.throws(() => createKnownEquipmentMm(-100));
  assert.equal(
    parseEquipmentDefinition({
      ...sampleDef(),
      dimensions: { widthMm: { status: "KNOWN", mm: -1 } },
    }),
    null,
  );
});

test("7. NaN/Infinity 거부", () => {
  assert.throws(() => createKnownEquipmentMm(Number.NaN));
  assert.throws(() => createKnownEquipmentMm(Number.POSITIVE_INFINITY));
});

test("8. 0° footprint 정상", () => {
  const def = sampleDef({
    dimensions: {
      widthMm: createKnownEquipmentMm(900),
      depthMm: createKnownEquipmentMm(800),
    },
  });
  const footprint = getEquipmentFootprint(def, 0);
  assert.equal(footprint.ok, true);
  assert.equal(footprint.widthMm, 900);
  assert.equal(footprint.depthMm, 800);
});

test("9. 90° footprint width/depth swap", () => {
  const def = sampleDef({
    dimensions: {
      widthMm: createKnownEquipmentMm(900),
      depthMm: createKnownEquipmentMm(800),
    },
    rotationAllowed: true,
  });
  const footprint = getEquipmentFootprint(def, 90);
  assert.equal(footprint.ok, true);
  assert.equal(footprint.widthMm, 800);
  assert.equal(footprint.depthMm, 900);
});

test("10. dimension UNKNOWN이면 footprint unavailable", () => {
  const def = sampleDef({
    dimensions: {
      widthMm: createUnknownEquipmentDimension(),
      depthMm: createKnownEquipmentMm(800),
    },
  });
  const footprint = getEquipmentFootprint(def, 0);
  assert.equal(footprint.ok, false);
  assert.equal(footprint.code, "DIMENSION_UNKNOWN");
});

test("11. rotation not allowed → 90° 거부", () => {
  const def = sampleDef({ rotationAllowed: false });
  const instance = createEquipmentInstance({
    equipmentDefinitionId: def.equipmentDefinitionId,
    layoutId: createLayoutId(),
    xMm: 0,
    yMm: 0,
    rotationDeg: 90,
    createdAt: "2026-09-22T12:00:00.000Z",
  });
  const validated = validateEquipmentInstanceForDefinition(instance, def);
  assert.equal(validated.ok, false);
});

test("12. SAMPLE 생성 가능", () => {
  const def = sampleDef();
  assert.equal(def.dataStatus, "SAMPLE");
  assert.ok(parseEquipmentDefinition(def));
});

test("13. SAMPLE 자동 VERIFIED 금지", () => {
  assert.equal(cannotAutoPromoteToVerified("SAMPLE"), true);
  assert.equal(
    assertVerifiedEligibility({
      dataStatus: "VERIFIED",
      source: { sourceType: "SAMPLE" },
      verifiedAt: "2026-09-22T12:00:00.000Z",
    }).ok,
    false,
  );
});

test("14. REFERENCE 자동 VERIFIED 금지", () => {
  assert.equal(cannotAutoPromoteToVerified("REFERENCE"), true);
});

test("15. VERIFIED 기본 검증조건", () => {
  const ok = assertVerifiedEligibility({
    dataStatus: "VERIFIED",
    source: { sourceType: "MANUFACTURER", sourceLabel: "catalog" },
    verifiedAt: "2026-09-22T12:00:00.000Z",
  });
  assert.equal(ok.ok, true);
  const def = createEquipmentDefinition({
    category: "MIXER",
    name: "검증 믹서",
    dataStatus: "VERIFIED",
    createdAt: "2026-09-22T12:00:00.000Z",
    source: { sourceType: "MANUFACTURER", sourceLabel: "catalog" },
    verifiedAt: "2026-09-22T12:00:00.000Z",
  });
  assert.ok(parseEquipmentDefinition(def));
});

test("16. VERIFIED source 없음 → 거부", () => {
  assert.equal(
    assertVerifiedEligibility({
      dataStatus: "VERIFIED",
      verifiedAt: "2026-09-22T12:00:00.000Z",
    }).ok,
    false,
  );
  assert.equal(
    parseEquipmentDefinition({
      ...createEquipmentDefinition({
        category: "SINK",
        name: "싱크",
        dataStatus: "NEEDS_REVIEW",
        createdAt: "2026-09-22T12:00:00.000Z",
      }),
      dataStatus: "VERIFIED",
      verifiedAt: "2026-09-22T12:00:00.000Z",
    }),
    null,
  );
});

test("17. SAMPLE source를 VERIFIED로 사용 → 거부", () => {
  assert.equal(
    assertVerifiedEligibility({
      dataStatus: "VERIFIED",
      source: { sourceType: "SAMPLE" },
      verifiedAt: "2026-09-22T12:00:00.000Z",
    }).ok,
    false,
  );
});

test("18. minimumDeliveryWidth unknown 허용", () => {
  const def = sampleDef({
    minimumDeliveryWidthMm: createUnknownEquipmentDimension(),
  });
  assert.equal(def.minimumDeliveryWidthMm.status, "UNKNOWN");
  assert.ok(parseEquipmentDefinition(def));
});

test("19. electrical requirement unknown 허용", () => {
  const def = sampleDef({
    electricalRequirement: { required: "UNKNOWN", powerKw: null },
  });
  assert.equal(def.electricalRequirement.required, "UNKNOWN");
  assert.ok(parseEquipmentDefinition(def));
});

test("20. power negative 거부", () => {
  assert.equal(
    parseEquipmentDefinition({
      ...sampleDef(),
      electricalRequirement: { required: true, powerKw: -3 },
    }),
    null,
  );
});

test("21. clearance negative 거부", () => {
  assert.equal(
    parseEquipmentDefinition({
      ...sampleDef(),
      serviceClearance: { frontMm: -10 },
    }),
    null,
  );
});

test("22. 기존 Phase 5A Layout backward compatible", () => {
  const layout = createEmptyLayout({
    candidateStoreId: createCandidateStoreId(),
    surveyId: createSiteSurveyId(),
    measurementId: createMeasurementId(),
    room: { shape: "RECTANGLE", widthMm: 5800, depthMm: 11200 },
    createdAt: "2026-09-22T12:00:00.000Z",
  });
  const parsed = parseSpaceFitLayout(layout);
  assert.ok(parsed);
  assert.equal(parsed.equipmentInstances, undefined);
});

test("23. EquipmentDefinition 전체를 Layout에 복제하지 않음", () => {
  const layout = createEmptyLayout({
    candidateStoreId: createCandidateStoreId(),
    surveyId: createSiteSurveyId(),
    measurementId: createMeasurementId(),
    room: { shape: "RECTANGLE", widthMm: 5800, depthMm: 11200 },
    createdAt: "2026-09-22T12:00:00.000Z",
  });
  assert.equal(
    parseSpaceFitLayout({
      ...layout,
      equipmentDefinitions: [sampleDef()],
    }),
    null,
  );
  const def = sampleDef({
    dimensions: {
      widthMm: createKnownEquipmentMm(900),
      depthMm: createKnownEquipmentMm(800),
    },
    rotationAllowed: true,
  });
  const instance = createEquipmentInstance({
    equipmentDefinitionId: def.equipmentDefinitionId,
    layoutId: layout.layoutId,
    xMm: 0,
    yMm: 0,
    rotationDeg: 0,
    createdAt: "2026-09-22T12:00:00.000Z",
  });
  const withInstance = parseSpaceFitLayout({
    ...layout,
    equipmentInstances: [instance],
  });
  assert.ok(withInstance);
  assert.equal(withInstance.equipmentInstances.length, 1);
  assert.equal("widthMm" in withInstance.equipmentInstances[0], false);
});

test("24. Equipment dataStatus가 Risk/Verdict를 직접 생성하지 않음", () => {
  for (const status of ["VERIFIED", "REFERENCE", "SAMPLE", "NEEDS_REVIEW"]) {
    assert.equal(equipmentDataStatusIsNotRiskVerdict(status), true);
  }
});

test("25. path traversal/invalid equipment id 방어", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "frameone-eq-"));
  tempRoots.push(rootDir);
  const bad = resolveEquipmentDefinitionFilePath(rootDir, "../etc/passwd");
  assert.equal(bad.ok, false);
  const alsoBad = resolveEquipmentDefinitionFilePath(rootDir, "equipment_not-uuid");
  assert.equal(alsoBad.ok, false);
});

test("26. Definition persistence save/reload", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "frameone-eq-store-"));
  tempRoots.push(rootDir);
  const service = createEquipmentDefinitionService({
    rootDir,
    now: () => "2026-09-22T12:30:00.000Z",
  });
  const def = sampleDef({
    dimensions: {
      widthMm: createKnownEquipmentMm(1000),
      depthMm: createKnownEquipmentMm(700),
    },
  });
  const saved = await service.saveDefinition(def);
  assert.equal(saved.ok, true);
  const loaded = await service.getDefinition(def.equipmentDefinitionId);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.value.dimensions.widthMm.mm, 1000);
  assert.equal(loaded.value.dataStatus, "SAMPLE");
});

test("27. Instance parse rejects copied specs", () => {
  const layoutId = createLayoutId();
  const defId = createEquipmentDefinitionId();
  assert.equal(
    parseEquipmentInstance({
      schemaVersion: "equipment-instance-v1",
      equipmentInstanceId: createEquipmentInstanceId(),
      equipmentDefinitionId: defId,
      layoutId,
      xMm: 0,
      yMm: 0,
      rotationDeg: 0,
      createdAt: "2026-09-22T12:00:00.000Z",
      updatedAt: "2026-09-22T12:00:00.000Z",
      widthMm: 900,
    }),
    null,
  );
});

test("28. REFERENCE definition allowed without verifiedAt", () => {
  const def = createEquipmentDefinition({
    category: "PROOFER",
    name: "참고 발효기",
    dataStatus: "REFERENCE",
    createdAt: "2026-09-22T12:00:00.000Z",
    source: {
      sourceType: "PARTNER_REFERENCE",
      sourceLabel: "배베스토리 참고 — 제조사 공식과 구분",
    },
  });
  assert.ok(parseEquipmentDefinition(def));
});
