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

const { isEquipmentInstanceId } = loadModule(
  path.join(repositoryRoot, "lib/equipment/identifiers.ts"),
);
const {
  createEquipmentDefinition,
  createKnownEquipmentMm,
  createUnknownEquipmentDimension,
} = loadModule(path.join(repositoryRoot, "lib/equipment/types.ts"));
const { getEquipmentFootprint } = loadModule(
  path.join(repositoryRoot, "lib/equipment/footprint.ts"),
);
const {
  canPlaceEquipmentOnLayout,
  createPlacedEquipmentInstance,
  equipmentDataStatusLabel,
  equipmentFootprintRect,
  moveEquipmentInstance,
  rotateEquipmentInstance,
} = loadModule(path.join(repositoryRoot, "lib/equipment/placement.ts"));
const {
  equipmentDataStatusIsNotRiskVerdict,
  validateEquipmentInstanceForDefinition,
} = loadModule(path.join(repositoryRoot, "lib/equipment/validation.ts"));
const { createEquipmentDefinitionService } = loadModule(
  path.join(repositoryRoot, "lib/equipment/definition-service.server.ts"),
);
const { createLayoutId } = loadModule(
  path.join(repositoryRoot, "lib/space-fit/identifiers.ts"),
);
const {
  createEmptyLayout,
  createPillarElement,
  createRestroomElement,
  createFacilityPointElement,
} = loadModule(path.join(repositoryRoot, "lib/space-fit/types.ts"));
const { parseSpaceFitLayout } = loadModule(
  path.join(repositoryRoot, "lib/space-fit/layout-record.ts"),
);
const { validateLayoutGeometry } = loadModule(
  path.join(repositoryRoot, "lib/space-fit/element-geometry.ts"),
);
const { validateEquipmentGeometry } = loadModule(
  path.join(repositoryRoot, "lib/space-fit/equipment-geometry.ts"),
);
const { snapToGridMm } = loadModule(path.join(repositoryRoot, "lib/space-fit/geometry.ts"));
const {
  createHistory,
  createHistoryFromLayout,
  pushHistory,
  undoHistory,
  redoHistory,
  snapshotFromLayout,
  withLayoutEquipment,
} = loadModule(path.join(repositoryRoot, "lib/space-fit/history.ts"));
const {
  clientPointerToDomainMm,
  clientPointerToSnappedMm,
} = loadModule(path.join(repositoryRoot, "lib/space-fit/pointer-drag.ts"));
const {
  composeViewportTransform,
  createFitViewportControls,
  applyPanDelta,
} = loadModule(path.join(repositoryRoot, "lib/space-fit/viewport.ts"));
const { createSpaceFitLayoutService } = loadModule(
  path.join(repositoryRoot, "lib/space-fit/layout-service.server.ts"),
);
const { createEmptyMeasurementSet, createKnownMm } = loadModule(
  path.join(repositoryRoot, "lib/field/measurement.ts"),
);
const { createCandidateStoreId, createSiteSurveyId } = loadModule(
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

const NOW = "2026-09-22T15:00:00.000Z";
const ROOM = { shape: "RECTANGLE", widthMm: 5800, depthMm: 11200 };

function knownDef(overrides = {}) {
  return createEquipmentDefinition({
    category: "OVEN",
    name: "[샘플] 배치 테스트 오븐",
    dataStatus: "SAMPLE",
    createdAt: NOW,
    rotationAllowed: true,
    limitation: "개발용 샘플. 실제 제품 사양이 아님",
    source: { sourceType: "SAMPLE", sourceLabel: "phase5d fixture" },
    dimensions: {
      widthMm: createKnownEquipmentMm(900),
      depthMm: createKnownEquipmentMm(800),
    },
    ...overrides,
  });
}

function baseLayout(overrides = {}) {
  return createEmptyLayout({
    surveyId: createSiteSurveyId(),
    candidateStoreId: createCandidateStoreId(),
    measurementId: createEmptyMeasurementSet({
      surveyId: createSiteSurveyId(),
      candidateStoreId: createCandidateStoreId(),
      measuredAt: NOW,
      measuredBy: "field-staff",
    }).measurementId,
    room: ROOM,
    createdAt: NOW,
    ...overrides,
  });
}

function startService(prefix) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(rootDir);
  const service = createSpaceFitLayoutService({
    rootDir,
    now: () => NOW,
  });
  return { rootDir, service };
}

async function startLayout(service) {
  const measurement = {
    ...createEmptyMeasurementSet({
      surveyId: createSiteSurveyId(),
      candidateStoreId: createCandidateStoreId(),
      measuredAt: NOW,
      measuredBy: "field-staff",
    }),
    values: {
      roomWidthMm: createKnownMm(ROOM.widthMm),
      roomDepthMm: createKnownMm(ROOM.depthMm),
    },
  };
  const started = await service.startLayout({ measurement });
  assert.equal(started.ok, true);
  return started.value.layout;
}

test("5D-1. Definition 선택 → Instance 생성", () => {
  const def = knownDef();
  const layoutId = createLayoutId();
  const created = createPlacedEquipmentInstance({
    definition: def,
    layoutId,
    xMm: 1000,
    yMm: 2000,
    createdAt: NOW,
  });
  assert.equal(created.ok, true);
  assert.equal(created.instance.equipmentDefinitionId, def.equipmentDefinitionId);
  assert.equal(created.instance.xMm, 1000);
  assert.equal(created.instance.yMm, 2000);
  assert.equal(created.instance.rotationDeg, 0);
});

test("5D-2. Instance stable ID equipment_instance_<uuid>", () => {
  const created = createPlacedEquipmentInstance({
    definition: knownDef(),
    layoutId: createLayoutId(),
    xMm: 0,
    yMm: 0,
    createdAt: NOW,
  });
  assert.equal(created.ok, true);
  assert.equal(isEquipmentInstanceId(created.instance.equipmentInstanceId), true);
  assert.match(created.instance.equipmentInstanceId, /^equipment_instance_[0-9a-f-]{36}$/i);
});

test("5D-3. Instance가 Definition ID만 참조", () => {
  const def = knownDef({
    manufacturer: "Acme",
    model: "X1",
    electricalRequirement: { powerKw: 12 },
  });
  const created = createPlacedEquipmentInstance({
    definition: def,
    layoutId: createLayoutId(),
    xMm: 100,
    yMm: 100,
    createdAt: NOW,
  });
  assert.equal(created.ok, true);
  assert.equal(created.instance.equipmentDefinitionId, def.equipmentDefinitionId);
  assert.equal("widthMm" in created.instance, false);
  assert.equal("depthMm" in created.instance, false);
  assert.equal("heightMm" in created.instance, false);
  assert.equal("powerKw" in created.instance, false);
  assert.equal("manufacturer" in created.instance, false);
  assert.equal("model" in created.instance, false);
  assert.equal("source" in created.instance, false);
  assert.equal("dataStatus" in created.instance, false);
});

test("5D-4. Definition 전체를 Instance에 복사하지 않음", () => {
  const def = knownDef({ manufacturer: "Acme", model: "X1" });
  const created = createPlacedEquipmentInstance({
    definition: def,
    layoutId: createLayoutId(),
    xMm: 0,
    yMm: 0,
    createdAt: NOW,
  });
  const keys = Object.keys(created.instance);
  assert.deepEqual(
    keys.sort(),
    [
      "createdAt",
      "equipmentDefinitionId",
      "equipmentInstanceId",
      "layoutId",
      "rotationDeg",
      "schemaVersion",
      "updatedAt",
      "xMm",
      "yMm",
    ].sort(),
  );
});

test("5D-5. UNKNOWN dimensions → 배치 차단", () => {
  const def = knownDef({
    dimensions: {
      widthMm: createUnknownEquipmentDimension(),
      depthMm: createKnownEquipmentMm(800),
    },
  });
  assert.equal(canPlaceEquipmentOnLayout(def).ok, false);
  const created = createPlacedEquipmentInstance({
    definition: def,
    layoutId: createLayoutId(),
    xMm: 0,
    yMm: 0,
    createdAt: NOW,
  });
  assert.equal(created.ok, false);
  assert.match(created.message, /치수가 확인되지 않아/);
});

test("5D-6. SAMPLE known dimensions → 배치 가능 · SAMPLE 유지", () => {
  const def = knownDef({ dataStatus: "SAMPLE" });
  assert.equal(canPlaceEquipmentOnLayout(def).ok, true);
  const created = createPlacedEquipmentInstance({
    definition: def,
    layoutId: createLayoutId(),
    xMm: 0,
    yMm: 0,
    createdAt: NOW,
  });
  assert.equal(created.ok, true);
  assert.equal(def.dataStatus, "SAMPLE");
  assert.match(equipmentDataStatusLabel(def.dataStatus), /SAMPLE/);
  assert.match(equipmentDataStatusLabel(def.dataStatus), /예시|실제 검토용 아님/);
});

test("5D-7. NEEDS_REVIEW known dimensions → 배치 가능 · review 유지", () => {
  const def = knownDef({
    dataStatus: "NEEDS_REVIEW",
    source: { sourceType: "INTERNAL_REFERENCE", sourceLabel: "draft" },
  });
  assert.equal(canPlaceEquipmentOnLayout(def).ok, true);
  assert.equal(def.dataStatus, "NEEDS_REVIEW");
  assert.match(equipmentDataStatusLabel(def.dataStatus), /규격 확인 필요/);
});

test("5D-8. 0° footprint", () => {
  const def = knownDef();
  const fp = getEquipmentFootprint(def, 0);
  assert.equal(fp.ok, true);
  assert.equal(fp.widthMm, 900);
  assert.equal(fp.depthMm, 800);
  const rect = equipmentFootprintRect(def, { xMm: 100, yMm: 200, rotationDeg: 0 });
  assert.deepEqual(rect, { xMm: 100, yMm: 200, widthMm: 900, heightMm: 800 });
});

test("5D-9. 90° footprint", () => {
  const def = knownDef({ rotationAllowed: true });
  const fp = getEquipmentFootprint(def, 90);
  assert.equal(fp.ok, true);
  assert.equal(fp.widthMm, 800);
  assert.equal(fp.depthMm, 900);
});

test("5D-10. rotationAllowed=false → 회전 거부", () => {
  const def = knownDef({ rotationAllowed: false });
  const created = createPlacedEquipmentInstance({
    definition: def,
    layoutId: createLayoutId(),
    xMm: 0,
    yMm: 0,
    createdAt: NOW,
  });
  const rotated = rotateEquipmentInstance(created.instance, def);
  assert.equal(rotated.ok, false);
  const validated = validateEquipmentInstanceForDefinition(
    { ...created.instance, rotationDeg: 90 },
    def,
  );
  assert.equal(validated.ok, false);
});

test("5D-11. equipment placement → 100mm snap", () => {
  const created = createPlacedEquipmentInstance({
    definition: knownDef(),
    layoutId: createLayoutId(),
    xMm: 145,
    yMm: 260,
    createdAt: NOW,
  });
  assert.equal(created.ok, true);
  assert.equal(created.instance.xMm, snapToGridMm(145));
  assert.equal(created.instance.yMm, snapToGridMm(260));
  assert.equal(created.instance.xMm % 100, 0);
  assert.equal(created.instance.yMm % 100, 0);
});

test("5D-12. equipment drag → Domain mm 유지", () => {
  const created = createPlacedEquipmentInstance({
    definition: knownDef(),
    layoutId: createLayoutId(),
    xMm: 1000,
    yMm: 2000,
    createdAt: NOW,
  });
  const moved = moveEquipmentInstance(created.instance, 1234, 2567);
  assert.equal(moved.xMm, 1200);
  assert.equal(moved.yMm, 2600);
  assert.equal(Number.isInteger(moved.xMm), true);
  assert.equal(Number.isInteger(moved.yMm), true);
});

test("5D-13. zoom/pan 후 drag coordinate 정상", () => {
  const fit = createFitViewportControls({
    roomWidthMm: ROOM.widthMm,
    roomDepthMm: ROOM.depthMm,
    viewportWidthPx: 800,
    viewportHeightPx: 600,
    zoomIndex: 0,
    panXPx: 0,
    panYPx: 0,
  });
  const zoomed = createFitViewportControls({
    roomWidthMm: ROOM.widthMm,
    roomDepthMm: ROOM.depthMm,
    viewportWidthPx: 800,
    viewportHeightPx: 600,
    zoomIndex: fit.zoomIndex + 2,
  });
  const panned = applyPanDelta(zoomed, 40, -30);
  const transform = composeViewportTransform(panned);
  const svgRect = { left: 10, top: 20, width: 800, height: 600 };
  const client = { clientX: 210, clientY: 320 };
  const domainA = clientPointerToDomainMm({
    ...client,
    svgRect,
    viewBoxWidth: 800,
    viewBoxHeight: 600,
    transform,
  });
  const snapped = clientPointerToSnappedMm({
    ...client,
    svgRect,
    viewBoxWidth: 800,
    viewBoxHeight: 600,
    transform,
  });
  assert.equal(Number.isFinite(domainA.xMm), true);
  assert.equal(Number.isFinite(domainA.yMm), true);
  assert.equal(snapped.xMm % 100, 0);
  assert.equal(snapped.yMm % 100, 0);
  const again = clientPointerToSnappedMm({
    ...client,
    svgRect,
    viewBoxWidth: 800,
    viewBoxHeight: 600,
    transform,
  });
  assert.deepEqual(again, snapped);
});

test("5D-14. room boundary OUT_OF_BOUNDS", () => {
  const def = knownDef();
  const created = createPlacedEquipmentInstance({
    definition: def,
    layoutId: createLayoutId(),
    xMm: 5200,
    yMm: 0,
    createdAt: NOW,
  });
  const layout = withLayoutEquipment(baseLayout(), [created.instance]);
  const warnings = validateEquipmentGeometry(layout, [def]);
  assert.equal(warnings.some((w) => w.code === "OUT_OF_BOUNDS"), true);
});

test("5D-15. pillar collision OVERLAP", () => {
  const def = knownDef();
  const created = createPlacedEquipmentInstance({
    definition: def,
    layoutId: createLayoutId(),
    xMm: 1000,
    yMm: 1000,
    createdAt: NOW,
  });
  const pillar = createPillarElement({
    xMm: 1200,
    yMm: 1200,
    widthMm: 500,
    heightMm: 500,
  });
  const layout = Object.freeze({
    ...baseLayout(),
    elements: Object.freeze([pillar]),
    equipmentInstances: Object.freeze([created.instance]),
  });
  const warnings = validateLayoutGeometry(layout, [def]);
  assert.equal(
    warnings.some(
      (w) =>
        w.code === "OVERLAP" &&
        (w.elementId === created.instance.equipmentInstanceId ||
          w.otherElementId === created.instance.equipmentInstanceId),
    ),
    true,
  );
});

test("5D-16. restroom collision OVERLAP", () => {
  const def = knownDef();
  const created = createPlacedEquipmentInstance({
    definition: def,
    layoutId: createLayoutId(),
    xMm: 2000,
    yMm: 2000,
    createdAt: NOW,
  });
  const restroom = createRestroomElement({
    xMm: 2200,
    yMm: 2200,
    widthMm: 800,
    heightMm: 800,
  });
  const layout = Object.freeze({
    ...baseLayout(),
    elements: Object.freeze([restroom]),
    equipmentInstances: Object.freeze([created.instance]),
  });
  const warnings = validateEquipmentGeometry(layout, [def]);
  assert.equal(warnings.some((w) => w.code === "OVERLAP"), true);
});

test("5D-17. equipment-equipment collision OVERLAP", () => {
  const def = knownDef();
  const a = createPlacedEquipmentInstance({
    definition: def,
    layoutId: createLayoutId(),
    xMm: 1000,
    yMm: 1000,
    createdAt: NOW,
  });
  const b = createPlacedEquipmentInstance({
    definition: def,
    layoutId: a.instance.layoutId,
    xMm: 1200,
    yMm: 1200,
    createdAt: NOW,
  });
  const layout = withLayoutEquipment(baseLayout({ layoutId: a.instance.layoutId }), [
    a.instance,
    b.instance,
  ]);
  const warnings = validateEquipmentGeometry(layout, [def]);
  assert.equal(warnings.some((w) => w.code === "OVERLAP"), true);
});

test("5D-18. edge touch ≠ overlap", () => {
  const def = knownDef();
  const a = createPlacedEquipmentInstance({
    definition: def,
    layoutId: createLayoutId(),
    xMm: 1000,
    yMm: 1000,
    createdAt: NOW,
  });
  // 900 wide at x=1000 → right edge 1900; neighbor starts at 1900
  const b = createPlacedEquipmentInstance({
    definition: def,
    layoutId: a.instance.layoutId,
    xMm: 1900,
    yMm: 1000,
    createdAt: NOW,
  });
  const layout = withLayoutEquipment(baseLayout({ layoutId: a.instance.layoutId }), [
    a.instance,
    b.instance,
  ]);
  const warnings = validateEquipmentGeometry(layout, [def]);
  assert.equal(warnings.some((w) => w.code === "OVERLAP"), false);
});

test("5D-19. facility point 겹침을 collision으로 오판하지 않음", () => {
  const def = knownDef();
  const created = createPlacedEquipmentInstance({
    definition: def,
    layoutId: createLayoutId(),
    xMm: 1000,
    yMm: 1000,
    createdAt: NOW,
  });
  const point = createFacilityPointElement({
    type: "ELECTRICAL_POINT",
    xMm: 1200,
    yMm: 1200,
  });
  const layout = Object.freeze({
    ...baseLayout(),
    elements: Object.freeze([point]),
    equipmentInstances: Object.freeze([created.instance]),
  });
  const warnings = validateLayoutGeometry(layout, [def]);
  assert.equal(
    warnings.some(
      (w) =>
        w.code === "OVERLAP" &&
        (w.elementId === created.instance.equipmentInstanceId ||
          w.otherElementId === created.instance.equipmentInstanceId),
    ),
    false,
  );
});

test("5D-20. add Undo", () => {
  const def = knownDef();
  const layout = baseLayout();
  let history = createHistoryFromLayout(layout);
  const created = createPlacedEquipmentInstance({
    definition: def,
    layoutId: layout.layoutId,
    xMm: 0,
    yMm: 0,
    createdAt: NOW,
  });
  history = pushHistory(history, {
    elements: layout.elements,
    equipmentInstances: [created.instance],
  });
  const undone = undoHistory(history);
  assert.equal(undone.present.equipmentInstances.length, 0);
});

test("5D-21. add Redo", () => {
  const def = knownDef();
  const layout = baseLayout();
  let history = createHistoryFromLayout(layout);
  const created = createPlacedEquipmentInstance({
    definition: def,
    layoutId: layout.layoutId,
    xMm: 0,
    yMm: 0,
    createdAt: NOW,
  });
  history = pushHistory(history, {
    elements: layout.elements,
    equipmentInstances: [created.instance],
  });
  history = undoHistory(history);
  history = redoHistory(history);
  assert.equal(history.present.equipmentInstances.length, 1);
  assert.equal(
    history.present.equipmentInstances[0].equipmentInstanceId,
    created.instance.equipmentInstanceId,
  );
});

test("5D-22. move Undo/Redo", () => {
  const def = knownDef();
  const created = createPlacedEquipmentInstance({
    definition: def,
    layoutId: createLayoutId(),
    xMm: 0,
    yMm: 0,
    createdAt: NOW,
  });
  let history = createHistory([], [created.instance]);
  const moved = moveEquipmentInstance(created.instance, 1000, 2000);
  history = pushHistory(history, { elements: [], equipmentInstances: [moved] });
  history = undoHistory(history);
  assert.equal(history.present.equipmentInstances[0].xMm, 0);
  history = redoHistory(history);
  assert.equal(history.present.equipmentInstances[0].xMm, 1000);
  assert.equal(history.present.equipmentInstances[0].yMm, 2000);
});

test("5D-23. rotate Undo/Redo", () => {
  const def = knownDef({ rotationAllowed: true });
  const created = createPlacedEquipmentInstance({
    definition: def,
    layoutId: createLayoutId(),
    xMm: 0,
    yMm: 0,
    createdAt: NOW,
  });
  let history = createHistory([], [created.instance]);
  const rotated = rotateEquipmentInstance(created.instance, def);
  assert.equal(rotated.ok, true);
  history = pushHistory(history, {
    elements: [],
    equipmentInstances: [rotated.instance],
  });
  history = undoHistory(history);
  assert.equal(history.present.equipmentInstances[0].rotationDeg, 0);
  history = redoHistory(history);
  assert.equal(history.present.equipmentInstances[0].rotationDeg, 90);
});

test("5D-24. delete Undo/Redo", () => {
  const created = createPlacedEquipmentInstance({
    definition: knownDef(),
    layoutId: createLayoutId(),
    xMm: 0,
    yMm: 0,
    createdAt: NOW,
  });
  let history = createHistory([], [created.instance]);
  history = pushHistory(history, { elements: [], equipmentInstances: [] });
  history = undoHistory(history);
  assert.equal(history.present.equipmentInstances.length, 1);
  history = redoHistory(history);
  assert.equal(history.present.equipmentInstances.length, 0);
});

test("5D-25. equipment change → dirty via domain snapshot change", () => {
  const layout = baseLayout();
  const before = snapshotFromLayout(layout);
  const created = createPlacedEquipmentInstance({
    definition: knownDef(),
    layoutId: layout.layoutId,
    xMm: 0,
    yMm: 0,
    createdAt: NOW,
  });
  const after = snapshotFromLayout(withLayoutEquipment(layout, [created.instance]));
  assert.notDeepEqual(before.equipmentInstances, after.equipmentInstances);
  assert.equal(after.equipmentInstances.length, 1);
});

test("5D-26/27. save/reload instances 유지 + layoutVersion +1", async () => {
  const { service } = startService("frameone-sf-5d-save-");
  const layout = await startLayout(service);
  const def = knownDef();
  const created = createPlacedEquipmentInstance({
    definition: def,
    layoutId: layout.layoutId,
    xMm: 1000,
    yMm: 2000,
    createdAt: NOW,
  });
  const saved = await service.updateLayout({
    layoutId: layout.layoutId,
    expectedLayoutVersion: layout.layoutVersion,
    elements: layout.elements,
    equipmentInstances: [created.instance],
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.value.layoutVersion, layout.layoutVersion + 1);
  assert.equal(saved.value.equipmentInstances.length, 1);
  assert.equal(
    saved.value.equipmentInstances[0].equipmentInstanceId,
    created.instance.equipmentInstanceId,
  );
  const loaded = await service.getLayout(layout.layoutId);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.value.equipmentInstances.length, 1);
  assert.equal(loaded.value.equipmentInstances[0].xMm, 1000);
});

test("5D-28. stale conflict → overwrite 없음", async () => {
  const { service } = startService("frameone-sf-5d-conflict-");
  const layout = await startLayout(service);
  const created = createPlacedEquipmentInstance({
    definition: knownDef(),
    layoutId: layout.layoutId,
    xMm: 0,
    yMm: 0,
    createdAt: NOW,
  });
  await service.updateLayout({
    layoutId: layout.layoutId,
    expectedLayoutVersion: 1,
    elements: [],
    equipmentInstances: [],
  });
  const conflict = await service.updateLayout({
    layoutId: layout.layoutId,
    expectedLayoutVersion: 1,
    elements: [],
    equipmentInstances: [created.instance],
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "VERSION_CONFLICT");
  const loaded = await service.getLayout(layout.layoutId);
  assert.equal((loaded.value.equipmentInstances ?? []).length, 0);
});

test("5D-29. 기존 equipmentInstances 없는 Layout 읽기", () => {
  const layout = baseLayout();
  assert.equal(layout.equipmentInstances, undefined);
  const parsed = parseSpaceFitLayout(layout);
  assert.notEqual(parsed, null);
  assert.equal(parsed.equipmentInstances, undefined);
  const warnings = validateLayoutGeometry(parsed, []);
  assert.equal(Array.isArray(warnings), true);
});

test("5D-30. missing Definition에서 가짜 footprint 생성 없음", () => {
  const orphan = createPlacedEquipmentInstance({
    definition: knownDef(),
    layoutId: createLayoutId(),
    xMm: 100,
    yMm: 100,
    createdAt: NOW,
  });
  const layout = withLayoutEquipment(baseLayout({ layoutId: orphan.instance.layoutId }), [
    orphan.instance,
  ]);
  const warnings = validateEquipmentGeometry(layout, []);
  assert.equal(warnings.some((w) => w.code === "INVALID_GEOMETRY"), true);
  assert.equal(
    warnings.every((w) => w.message.includes("찾을 수 없음") || w.code === "INVALID_GEOMETRY"),
    true,
  );
});

test("5D-31. Definition save와 Layout save 독립", async () => {
  const layoutRoot = fs.mkdtempSync(path.join(os.tmpdir(), "frameone-sf-5d-layout-"));
  const defRoot = fs.mkdtempSync(path.join(os.tmpdir(), "frameone-sf-5d-def-"));
  tempRoots.push(layoutRoot, defRoot);
  const layoutService = createSpaceFitLayoutService({ rootDir: layoutRoot, now: () => NOW });
  const defService = createEquipmentDefinitionService({ rootDir: defRoot, now: () => NOW });
  const def = knownDef();
  const savedDef = await defService.saveDefinition(def);
  assert.equal(savedDef.ok, true);
  const layout = await startLayout(layoutService);
  const created = createPlacedEquipmentInstance({
    definition: def,
    layoutId: layout.layoutId,
    xMm: 500,
    yMm: 500,
    createdAt: NOW,
  });
  const savedLayout = await layoutService.updateLayout({
    layoutId: layout.layoutId,
    expectedLayoutVersion: 1,
    elements: [],
    equipmentInstances: [created.instance],
  });
  assert.equal(savedLayout.ok, true);
  const defFiles = fs.readdirSync(path.join(defRoot, "definitions"));
  const layoutFiles = fs.readdirSync(path.join(layoutRoot, "layouts"));
  assert.equal(defFiles.some((name) => name.includes(def.equipmentDefinitionId)), true);
  assert.equal(layoutFiles.some((name) => name.includes(layout.layoutId)), true);
  assert.equal(
    defFiles.every((name) => !name.includes(layout.layoutId)),
    true,
  );
});

test("5D-32. SAMPLE/REFERENCE/VERIFIED 상태가 Risk/Verdict를 직접 만들지 않음", () => {
  for (const status of ["SAMPLE", "REFERENCE", "VERIFIED", "NEEDS_REVIEW"]) {
    assert.equal(equipmentDataStatusIsNotRiskVerdict(status), true);
  }
  const label = equipmentDataStatusLabel("VERIFIED");
  assert.match(label, /데이터 검증/);
  assert.equal(label.includes("적합"), false);
  assert.equal(label.includes("설치 가능"), false);
});
