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

const { createLayoutId, isLayoutId, createElementId } = loadModule(
  path.join(repositoryRoot, "lib/space-fit/identifiers.ts"),
);
const {
  snapToGridMm,
  isPointInsideRoom,
  isRectInsideRoom,
  rectsOverlap,
  validateElementPlacement,
} = loadModule(path.join(repositoryRoot, "lib/space-fit/geometry.ts"));
const { fitRoomToViewport, mmToSvg, svgToMm } = loadModule(
  path.join(repositoryRoot, "lib/space-fit/coords.ts"),
);
const { createLayoutFromMeasurement } = loadModule(
  path.join(repositoryRoot, "lib/space-fit/create-from-measurement.ts"),
);
const {
  createPillarElement,
  createFacilityPointElement,
  createRestroomElement,
} = loadModule(path.join(repositoryRoot, "lib/space-fit/types.ts"));
const { parseSpaceFitLayout } = loadModule(
  path.join(repositoryRoot, "lib/space-fit/layout-record.ts"),
);
const {
  createSpaceFitLayoutService,
  resolveLayoutFilePath,
} = loadModule(path.join(repositoryRoot, "lib/space-fit/layout-service.server.ts"));
const { createFieldSurveyService } = loadModule(
  path.join(repositoryRoot, "lib/field/field-survey-service.server.ts"),
);
const { createCandidateStoreId, createMeasurementId } = loadModule(
  path.join(repositoryRoot, "lib/field/identifiers.ts"),
);
const { createEmptyMeasurementSet, createKnownMm, createUnknownDimension } = loadModule(
  path.join(repositoryRoot, "lib/field/measurement.ts"),
);
const {
  createDefaultDeliveryPath,
  createDefaultProductionSalesSpace,
} = loadModule(path.join(repositoryRoot, "lib/field/space-equipment.ts"));
const { createFieldEvidenceMeta } = loadModule(
  path.join(repositoryRoot, "lib/field/field-evidence-meta.ts"),
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

function makeLayoutService() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "frameone-space-fit-"));
  tempRoots.push(rootDir);
  return {
    rootDir,
    service: createSpaceFitLayoutService({
      rootDir,
      now: () => "2026-09-22T08:00:00.000Z",
    }),
  };
}

function makeMeasurement(overrides = {}) {
  const surveyId = overrides.surveyId ?? `survey_${crypto.randomUUID()}`;
  const candidateStoreId = overrides.candidateStoreId ?? createCandidateStoreId();
  const base = createEmptyMeasurementSet({
    surveyId,
    candidateStoreId,
    measuredAt: "2026-09-22T07:00:00.000Z",
    measuredBy: "field-staff",
    measurementId: overrides.measurementId ?? createMeasurementId(),
  });
  return {
    ...base,
    values: {
      roomWidthMm: createKnownMm(5800),
      roomDepthMm: createKnownMm(11200),
      ceilingHeightMm: createKnownMm(3100),
      ...overrides.values,
    },
    structure: { ...base.structure, ...overrides.structure },
  };
}

test("1. layout_<uuid> 생성", () => {
  const id = createLayoutId();
  assert.equal(isLayoutId(id), true);
  assert.match(id, /^layout_[0-9a-f-]{36}$/i);
});

test("2. CandidateStore / Survey / Measurement 관계 유지", () => {
  const measurement = makeMeasurement();
  const result = createLayoutFromMeasurement({
    measurement,
    consultationId: "fixture-space-fit",
    createdAt: "2026-09-22T08:00:00.000Z",
  });
  assert.equal(result.ok, true);
  assert.equal(result.layout.candidateStoreId, measurement.candidateStoreId);
  assert.equal(result.layout.surveyId, measurement.surveyId);
  assert.equal(result.layout.measurementId, measurement.measurementId);
});

test("3. UNKNOWN room width/depth면 Layout 생성 불가", () => {
  const missing = createLayoutFromMeasurement({
    measurement: makeMeasurement({
      values: {
        roomWidthMm: createUnknownDimension(),
        roomDepthMm: createKnownMm(11200),
      },
    }),
    createdAt: "2026-09-22T08:00:00.000Z",
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "MISSING_ROOM_DIMENSIONS");
});

test("4. 5800mm가 Domain에서 5800 유지", () => {
  const result = createLayoutFromMeasurement({
    measurement: makeMeasurement(),
    createdAt: "2026-09-22T08:00:00.000Z",
  });
  assert.equal(result.ok, true);
  assert.equal(result.layout.room.widthMm, 5800);
  assert.equal(result.layout.room.depthMm, 11200);
});

test("5. screen resize가 Domain mm 변경하지 않음", () => {
  const roomWidthMm = 5800;
  const roomDepthMm = 11200;
  const a = fitRoomToViewport(roomWidthMm, roomDepthMm, 800, 600);
  const b = fitRoomToViewport(roomWidthMm, roomDepthMm, 400, 300);
  assert.notEqual(a.scale, b.scale);
  // Domain mm는 viewport와 독립. round-trip은 float scale 오차만 허용.
  assert.equal(Math.round(svgToMm(mmToSvg(roomWidthMm, a.scale), a.scale)), roomWidthMm);
  assert.equal(Math.round(svgToMm(mmToSvg(roomWidthMm, b.scale), b.scale)), roomWidthMm);
  assert.equal(Math.round(svgToMm(mmToSvg(roomDepthMm, a.scale), a.scale)), roomDepthMm);
});

test("6. snap 1243 → 1200", () => {
  assert.equal(snapToGridMm(1243), 1200);
});

test("7. snap 1268 → 1300", () => {
  assert.equal(snapToGridMm(1268), 1300);
});

test("8. rectangle room 내부 판정", () => {
  assert.equal(
    isRectInsideRoom({ xMm: 0, yMm: 0, widthMm: 1000, heightMm: 1000 }, { widthMm: 5800, depthMm: 11200 }),
    true,
  );
});

test("9. rectangle room 밖 판정", () => {
  assert.equal(
    isRectInsideRoom(
      { xMm: 5000, yMm: 0, widthMm: 1000, heightMm: 1000 },
      { widthMm: 5800, depthMm: 11200 },
    ),
    false,
  );
});

test("10. rectangle 실제 overlap 감지", () => {
  assert.equal(
    rectsOverlap(
      { xMm: 0, yMm: 0, widthMm: 1000, heightMm: 1000 },
      { xMm: 500, yMm: 500, widthMm: 1000, heightMm: 1000 },
    ),
    true,
  );
});

test("11. edge touch는 overlap 아님", () => {
  assert.equal(
    rectsOverlap(
      { xMm: 0, yMm: 0, widthMm: 1000, heightMm: 1000 },
      { xMm: 1000, yMm: 0, widthMm: 1000, heightMm: 1000 },
    ),
    false,
  );
});

test("12. point room 내부 판정", () => {
  assert.equal(isPointInsideRoom({ xMm: 2900, yMm: 5600 }, { widthMm: 5800, depthMm: 11200 }), true);
});

test("13. point room 밖 판정", () => {
  assert.equal(isPointInsideRoom({ xMm: 6000, yMm: 100 }, { widthMm: 5800, depthMm: 11200 }), false);
});

test("14. invalid geometry 거부", () => {
  const warnings = validateElementPlacement(
    { widthMm: 5800, depthMm: 11200 },
    [
      {
        elementId: "element_00000000-0000-4000-8000-000000000001",
        kind: "RECT",
        collideAsRect: true,
        rect: { xMm: 0, yMm: 0, widthMm: 0, heightMm: 100 },
      },
    ],
  );
  assert.equal(warnings.some((item) => item.code === "INVALID_GEOMETRY"), true);
});

test("15. FIELD measurement 값 임의 생성 없음", () => {
  const empty = createEmptyMeasurementSet({
    surveyId: `survey_${crypto.randomUUID()}`,
    candidateStoreId: createCandidateStoreId(),
    measuredAt: "2026-09-22T07:00:00.000Z",
    measuredBy: "field-staff",
  });
  const result = createLayoutFromMeasurement({
    measurement: empty,
    createdAt: "2026-09-22T08:00:00.000Z",
  });
  assert.equal(result.ok, false);
  assert.equal(empty.values.roomWidthMm, undefined);
});

test("16. pillar default fake size 자동저장 없음", () => {
  const result = createLayoutFromMeasurement({
    measurement: makeMeasurement({
      structure: { pillarPresence: "YES", pillarCount: 2 },
    }),
    createdAt: "2026-09-22T08:00:00.000Z",
  });
  assert.equal(result.ok, true);
  assert.equal(result.layout.elements.length, 0);
  assert.equal(
    result.layout.elements.some((el) => el.type === "PILLAR" && el.widthMm === 400),
    false,
  );
});

test("17. Layout 생성/저장/reload 동일", async () => {
  const { service } = makeLayoutService();
  const measurement = makeMeasurement();
  const started = await service.startLayout({ measurement, consultationId: "fixture-sf" });
  assert.equal(started.ok, true);
  const pillar = createPillarElement({ xMm: 1000, yMm: 2000, widthMm: 500, heightMm: 500 });
  const updated = await service.updateLayout({
    layoutId: started.value.layout.layoutId,
    expectedLayoutVersion: started.value.layout.layoutVersion,
    elements: [pillar],
  });
  assert.equal(updated.ok, true);
  const reloaded = await service.getLayout(started.value.layout.layoutId);
  assert.equal(reloaded.ok, true);
  assert.equal(reloaded.value.layoutVersion, 2);
  assert.equal(reloaded.value.elements.length, 1);
  assert.equal(reloaded.value.elements[0].elementId, pillar.elementId);
  assert.equal(reloaded.value.room.widthMm, 5800);
});

test("18. layoutVersion 증가", async () => {
  const { service } = makeLayoutService();
  const started = await service.startLayout({ measurement: makeMeasurement() });
  assert.equal(started.value.layout.layoutVersion, 1);
  const updated = await service.updateLayout({
    layoutId: started.value.layout.layoutId,
    expectedLayoutVersion: 1,
    elements: [],
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.value.layoutVersion, 2);
});

test("19. stale version conflict", async () => {
  const { service } = makeLayoutService();
  const started = await service.startLayout({ measurement: makeMeasurement() });
  await service.updateLayout({
    layoutId: started.value.layout.layoutId,
    expectedLayoutVersion: 1,
    elements: [],
  });
  const stale = await service.updateLayout({
    layoutId: started.value.layout.layoutId,
    expectedLayoutVersion: 1,
    elements: [],
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "VERSION_CONFLICT");
});

test("20. GET만으로 Layout 생성되지 않음", async () => {
  const { service } = makeLayoutService();
  const surveyId = `survey_${crypto.randomUUID()}`;
  const found = await service.findActiveLayoutForSurvey(surveyId);
  assert.equal(found.ok, true);
  assert.equal(found.value, null);
});

test("21. invalid layoutId/path traversal 거부", () => {
  const { rootDir } = makeLayoutService();
  const bad = resolveLayoutFilePath(rootDir, "../etc/passwd");
  assert.equal(bad.ok, false);
  assert.equal(bad.code, "INVALID_DATA");
  const alsoBad = resolveLayoutFilePath(rootDir, "layout_not-a-uuid");
  assert.equal(alsoBad.ok, false);
});

test("22. ProductionSalesSpaceObservation 중복저장 안 함", async () => {
  const { service, rootDir } = makeLayoutService();
  const measurement = makeMeasurement();
  const started = await service.startLayout({ measurement });
  assert.equal(started.ok, true);
  const raw = fs.readFileSync(
    path.join(rootDir, "layouts", `${started.value.layout.layoutId}.json`),
    "utf8",
  );
  const json = JSON.parse(raw);
  assert.equal("productionSalesSpace" in json, false);
  const space = createDefaultProductionSalesSpace();
  assert.ok(space.manufacturingSpace);
  const rejected = parseSpaceFitLayout({
    ...started.value.layout,
    productionSalesSpace: space,
  });
  assert.equal(rejected, null);
});

test("23. DeliveryPathObservation 중복저장 안 함", async () => {
  const { service, rootDir } = makeLayoutService();
  const started = await service.startLayout({ measurement: makeMeasurement() });
  const raw = fs.readFileSync(
    path.join(rootDir, "layouts", `${started.value.layout.layoutId}.json`),
    "utf8",
  );
  const json = JSON.parse(raw);
  assert.equal("deliveryPath" in json, false);
  const rejected = parseSpaceFitLayout({
    ...started.value.layout,
    deliveryPath: createDefaultDeliveryPath(),
  });
  assert.equal(rejected, null);
});

test("24. Geometry warning이 Risk/Verdict를 생성하지 않음", () => {
  const warnings = validateElementPlacement(
    { widthMm: 5800, depthMm: 11200 },
    [
      {
        elementId: createElementId(),
        kind: "RECT",
        collideAsRect: true,
        rect: { xMm: 0, yMm: 0, widthMm: 2000, heightMm: 2000 },
      },
      {
        elementId: createElementId(),
        kind: "RECT",
        collideAsRect: true,
        rect: { xMm: 1000, yMm: 1000, widthMm: 2000, heightMm: 2000 },
      },
    ],
  );
  assert.equal(warnings.some((item) => item.code === "OVERLAP"), true);
  assert.equal(
    warnings.every((item) => ["OUT_OF_BOUNDS", "OVERLAP", "INVALID_GEOMETRY"].includes(item.code)),
    true,
  );
  assert.equal(
    warnings.some((item) =>
      ["HIGH_RISK", "UNSUITABLE", "CONTRACT_REJECT", "VERDICT"].includes(item.code),
    ),
    false,
  );
});

test("25. Survey당 active Layout 재사용", async () => {
  const { service } = makeLayoutService();
  const measurement = makeMeasurement();
  const first = await service.startLayout({ measurement });
  const second = await service.startLayout({ measurement });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.value.created, false);
  assert.equal(second.value.layout.layoutId, first.value.layout.layoutId);
});

test("26. point OUT_OF_BOUNDS + facility point in pillar OVERLAP warning", () => {
  const pillarId = createElementId();
  const pointId = createElementId();
  const warnings = validateElementPlacement(
    { widthMm: 5800, depthMm: 11200 },
    [
      {
        elementId: pillarId,
        kind: "RECT",
        collideAsRect: true,
        rect: { xMm: 1000, yMm: 1000, widthMm: 500, heightMm: 500 },
      },
      {
        elementId: pointId,
        kind: "POINT",
        collideAsRect: false,
        point: { xMm: 1200, yMm: 1200 },
      },
      {
        elementId: createElementId(),
        kind: "POINT",
        collideAsRect: false,
        point: { xMm: 9000, yMm: 100 },
      },
    ],
  );
  assert.equal(warnings.some((w) => w.code === "OVERLAP" && w.elementId === pointId), true);
  assert.equal(warnings.some((w) => w.code === "OUT_OF_BOUNDS"), true);
});

test("27. FIELD survey service untouched by layout storage root", async () => {
  const fieldRoot = fs.mkdtempSync(path.join(os.tmpdir(), "frameone-field-sf-"));
  tempRoots.push(fieldRoot);
  const field = createFieldSurveyService({
    rootDir: fieldRoot,
    now: () => "2026-09-22T08:00:00.000Z",
  });
  const link = await field.ensureLink({
    consultationId: "fixture-sf-isolation",
    existingCandidateStoreId: createCandidateStoreId(),
  });
  assert.equal(link.ok, true);
  const started = await field.startSurvey({
    consultationId: "fixture-sf-isolation",
    candidateStoreId: link.value.candidateStoreId,
  });
  assert.equal(started.ok, true);
  assert.ok(fs.existsSync(path.join(fieldRoot, "surveys", `${started.value.survey.surveyId}.json`)));
  createFieldEvidenceMeta({ sourceType: "FIELD_CHECK" });
  createRestroomElement({ xMm: 0, yMm: 0, widthMm: 1000, heightMm: 1000 });
  createFacilityPointElement({ type: "WATER_POINT", xMm: 100, yMm: 100 });
});
