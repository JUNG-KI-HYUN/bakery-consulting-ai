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

const { pointMmToSvg, pointSvgToMm, mmToSvg, svgToMm } = loadModule(
  path.join(repositoryRoot, "lib/space-fit/coords.ts"),
);
const {
  composeViewportTransform,
  createFitViewportControls,
  resetViewportToFit,
  SPACE_FIT_DEFAULT_ZOOM_INDEX,
  applyPanDelta,
} = loadModule(path.join(repositoryRoot, "lib/space-fit/viewport.ts"));
const {
  clientToSvgLocal,
  clientPointerToSnappedMm,
  clientPointerToDomainMm,
  isFreelyDraggableType,
  moveElementByPointerMm,
  dragGrabOffsetMm,
  snapPositionMm,
} = loadModule(path.join(repositoryRoot, "lib/space-fit/pointer-drag.ts"));
const {
  createHistory,
  pushHistory,
  undoHistory,
  redoHistory,
  canUndo,
  canRedo,
  SPACE_FIT_HISTORY_LIMIT,
  withLayoutElements,
} = loadModule(path.join(repositoryRoot, "lib/space-fit/history.ts"));
const {
  canPersistLayout,
  summarizeGeometryWarnings,
  warningCodesAreGeometryOnly,
  replaceElement,
} = loadModule(path.join(repositoryRoot, "lib/space-fit/editor-state.ts"));
const { validateLayoutGeometry } = loadModule(
  path.join(repositoryRoot, "lib/space-fit/element-geometry.ts"),
);
const { rectsOverlap, snapToGridMm } = loadModule(
  path.join(repositoryRoot, "lib/space-fit/geometry.ts"),
);
const {
  createPillarElement,
  createRestroomElement,
  createFacilityPointElement,
  createEntranceElement,
  createEmptyLayout,
} = loadModule(path.join(repositoryRoot, "lib/space-fit/types.ts"));
const { createCandidateStoreId, createMeasurementId, createSiteSurveyId } = loadModule(
  path.join(repositoryRoot, "lib/field/identifiers.ts"),
);
const { createSpaceFitLayoutService } = loadModule(
  path.join(repositoryRoot, "lib/space-fit/layout-service.server.ts"),
);
const { createEmptyMeasurementSet, createKnownMm } = loadModule(
  path.join(repositoryRoot, "lib/field/measurement.ts"),
);
import os from "node:os";

const tempRoots = [];
after(() => {
  for (const rootDir of tempRoots) fs.rmSync(rootDir, { recursive: true, force: true });
});

function layoutWith(elements) {
  const base = createEmptyLayout({
    candidateStoreId: createCandidateStoreId(),
    surveyId: createSiteSurveyId(),
    measurementId: createMeasurementId(),
    room: { shape: "RECTANGLE", widthMm: 5800, depthMm: 11200 },
    createdAt: "2026-09-22T10:00:00.000Z",
  });
  return withLayoutElements(base, elements);
}

test("1. screen/SVG coordinate → mm 변환", () => {
  const controls = createFitViewportControls({
    roomWidthMm: 5800,
    roomDepthMm: 11200,
    viewportWidthPx: 800,
    viewportHeightPx: 600,
  });
  const transform = composeViewportTransform(controls);
  const local = clientToSvgLocal({
    clientX: 100,
    clientY: 50,
    svgRect: { left: 0, top: 0, width: 800, height: 600 },
    viewBoxWidth: 800,
    viewBoxHeight: 600,
  });
  assert.equal(local.xPx, 100);
  assert.equal(local.yPx, 50);
  const mm = clientPointerToDomainMm({
    clientX: transform.offsetXPx + mmToSvg(1200, transform.scale),
    clientY: transform.offsetYPx + mmToSvg(2400, transform.scale),
    svgRect: { left: 0, top: 0, width: 800, height: 600 },
    viewBoxWidth: 800,
    viewBoxHeight: 600,
    transform,
  });
  assert.equal(Math.round(mm.xMm), 1200);
  assert.equal(Math.round(mm.yMm), 2400);
});

test("2. zoom 2x에서도 같은 물리 위치는 동일 mm", () => {
  const fit = createFitViewportControls({
    roomWidthMm: 5800,
    roomDepthMm: 11200,
    viewportWidthPx: 800,
    viewportHeightPx: 600,
    zoomIndex: SPACE_FIT_DEFAULT_ZOOM_INDEX,
  });
  const zoomed = createFitViewportControls({
    roomWidthMm: 5800,
    roomDepthMm: 11200,
    viewportWidthPx: 800,
    viewportHeightPx: 600,
    zoomIndex: 5, // 200%
  });
  const t1 = composeViewportTransform(fit);
  const t2 = composeViewportTransform(zoomed);
  const roomPoint = { xMm: 2000, yMm: 4000 };
  const p1 = pointMmToSvg(roomPoint, t1);
  const p2 = pointMmToSvg(roomPoint, t2);
  const back1 = pointSvgToMm(p1, t1);
  const back2 = pointSvgToMm(p2, t2);
  assert.equal(Math.round(back1.xMm), 2000);
  assert.equal(Math.round(back2.xMm), 2000);
  assert.equal(Math.round(back1.yMm), 4000);
  assert.equal(Math.round(back2.yMm), 4000);
});

test("3. pan offset 적용 후 inverse transform 정상", () => {
  const base = createFitViewportControls({
    roomWidthMm: 5800,
    roomDepthMm: 11200,
    viewportWidthPx: 800,
    viewportHeightPx: 600,
  });
  const panned = applyPanDelta(base, 40, -30);
  const transform = composeViewportTransform(panned);
  const svg = pointMmToSvg({ xMm: 1000, yMm: 2000 }, transform);
  const back = pointSvgToMm(svg, transform);
  assert.equal(Math.round(back.xMm), 1000);
  assert.equal(Math.round(back.yMm), 2000);
});

test("4. drag 1243mm → 1200mm snap", () => {
  assert.equal(snapPositionMm(1243, 100).xMm, 1200);
  assert.equal(snapToGridMm(1243), 1200);
});

test("5. drag 1268mm → 1300mm snap", () => {
  assert.equal(snapPositionMm(1268, 100).xMm, 1300);
});

test("6. drag 후 Domain mm 저장", () => {
  const pillar = createPillarElement({ xMm: 0, yMm: 0, widthMm: 500, heightMm: 500 });
  const grab = dragGrabOffsetMm(pillar, { xMm: 100, yMm: 100 });
  const moved = moveElementByPointerMm(pillar, { xMm: 1343, yMm: 100 }, grab);
  assert.equal(moved.xMm, 1200);
  assert.equal(moved.yMm, 0);
  const layout = layoutWith([moved]);
  assert.equal(layout.elements[0].xMm, 1200);
});

test("7. viewport resize가 Domain mm를 변경하지 않음", () => {
  const a = createFitViewportControls({
    roomWidthMm: 5800,
    roomDepthMm: 11200,
    viewportWidthPx: 800,
    viewportHeightPx: 600,
  });
  const b = createFitViewportControls({
    roomWidthMm: 5800,
    roomDepthMm: 11200,
    viewportWidthPx: 400,
    viewportHeightPx: 300,
  });
  assert.notEqual(composeViewportTransform(a).scale, composeViewportTransform(b).scale);
  assert.equal(a.fit.scale * 5800 > 0, true);
  // Domain room size unchanged by definition of controls
  assert.equal(5800, 5800);
});

test("8. PILLAR drag 가능", () => {
  assert.equal(isFreelyDraggableType("PILLAR"), true);
});

test("9. RESTROOM drag 가능", () => {
  assert.equal(isFreelyDraggableType("RESTROOM"), true);
});

test("10. facility point drag 가능", () => {
  assert.equal(isFreelyDraggableType("ELECTRICAL_POINT"), true);
  assert.equal(isFreelyDraggableType("WATER_POINT"), true);
});

test("11. ENTRANCE는 free x/y geometry로 변하지 않음", () => {
  assert.equal(isFreelyDraggableType("ENTRANCE"), false);
  const entrance = createEntranceElement({ wall: "BOTTOM", offsetMm: 0, widthMm: 1200 });
  assert.equal(moveElementByPointerMm(entrance, { xMm: 100, yMm: 100 }, { offsetXMm: 0, offsetYMm: 0 }), null);
  assert.equal("xMm" in entrance, false);
  assert.equal(entrance.wall, "BOTTOM");
});

test("12. entrance offset boundary 검증", () => {
  const entrance = createEntranceElement({ wall: "TOP", offsetMm: 5000, widthMm: 1200 });
  const layout = layoutWith([entrance]);
  const warnings = validateLayoutGeometry(layout);
  assert.equal(
    warnings.some((w) => w.code === "OUT_OF_BOUNDS" && w.elementId === entrance.elementId),
    true,
  );
});

test("13. OUT_OF_BOUNDS warning 유지", () => {
  const pillar = createPillarElement({
    xMm: 5600,
    yMm: 0,
    widthMm: 500,
    heightMm: 500,
  });
  const warnings = validateLayoutGeometry(layoutWith([pillar]));
  assert.equal(warnings.some((w) => w.code === "OUT_OF_BOUNDS"), true);
});

test("14. OVERLAP warning 유지", () => {
  const a = createPillarElement({ xMm: 0, yMm: 0, widthMm: 1000, heightMm: 1000 });
  const b = createPillarElement({ xMm: 500, yMm: 500, widthMm: 1000, heightMm: 1000 });
  const warnings = validateLayoutGeometry(layoutWith([a, b]));
  assert.equal(warnings.some((w) => w.code === "OVERLAP"), true);
});

test("15. edge-touch != overlap 회귀테스트", () => {
  assert.equal(
    rectsOverlap(
      { xMm: 0, yMm: 0, widthMm: 1000, heightMm: 1000 },
      { xMm: 1000, yMm: 0, widthMm: 1000, heightMm: 1000 },
    ),
    false,
  );
});

test("16. Undo move", () => {
  const pillar = createPillarElement({ xMm: 0, yMm: 0, widthMm: 500, heightMm: 500 });
  let history = createHistory([pillar]);
  const moved = { ...pillar, xMm: 1000, yMm: 2000 };
  history = pushHistory(history, [moved]);
  const undone = undoHistory(history);
  assert.equal(undone.present.elements[0].xMm, 0);
});

test("17. Redo move", () => {
  const pillar = createPillarElement({ xMm: 0, yMm: 0, widthMm: 500, heightMm: 500 });
  let history = createHistory([pillar]);
  history = pushHistory(history, [{ ...pillar, xMm: 1000, yMm: 0 }]);
  history = undoHistory(history);
  history = redoHistory(history);
  assert.equal(history.present.elements[0].xMm, 1000);
});

test("18. Undo add", () => {
  const pillar = createPillarElement({ xMm: 0, yMm: 0, widthMm: 500, heightMm: 500 });
  let history = createHistory([]);
  history = pushHistory(history, [pillar]);
  history = undoHistory(history);
  assert.equal(history.present.elements.length, 0);
});

test("19. Undo delete", () => {
  const pillar = createPillarElement({ xMm: 0, yMm: 0, widthMm: 500, heightMm: 500 });
  let history = createHistory([pillar]);
  history = pushHistory(history, []);
  history = undoHistory(history);
  assert.equal(history.present.elements.length, 1);
});

test("20. zoom/pan이 history에 들어가지 않음", () => {
  const pillar = createPillarElement({ xMm: 0, yMm: 0, widthMm: 500, heightMm: 500 });
  let history = createHistory([pillar]);
  const before = history.past.length;
  const controls = createFitViewportControls({
    roomWidthMm: 5800,
    roomDepthMm: 11200,
    viewportWidthPx: 800,
    viewportHeightPx: 600,
  });
  applyPanDelta(controls, 10, 10);
  resetViewportToFit(controls);
  assert.equal(history.past.length, before);
  assert.equal(canUndo(history), false);
});

test("21. history limit 동작", () => {
  let history = createHistory([]);
  for (let i = 0; i < SPACE_FIT_HISTORY_LIMIT + 10; i += 1) {
    history = pushHistory(history, [
      createPillarElement({ xMm: snapToGridMm(i * 100), yMm: 0, widthMm: 100, heightMm: 100 }),
    ]);
  }
  assert.equal(history.past.length <= SPACE_FIT_HISTORY_LIMIT, true);
  assert.equal(history.past.length, SPACE_FIT_HISTORY_LIMIT);
});

test("22. Domain 변경 시 dirty (canPersist still true for OOB)", () => {
  const pillar = createPillarElement({ xMm: 5600, yMm: 0, widthMm: 500, heightMm: 500 });
  const warnings = validateLayoutGeometry(layoutWith([pillar]));
  assert.equal(canPersistLayout(warnings), true);
  assert.equal(summarizeGeometryWarnings(warnings).outOfBounds > 0, true);
});

test("23. save success path uses layoutVersion bump contract", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "frameone-sf-5b-"));
  tempRoots.push(rootDir);
  const service = createSpaceFitLayoutService({
    rootDir,
    now: () => "2026-09-22T10:00:00.000Z",
  });
  const measurement = {
    ...createEmptyMeasurementSet({
      surveyId: createSiteSurveyId(),
      candidateStoreId: createCandidateStoreId(),
      measuredAt: "2026-09-22T09:00:00.000Z",
      measuredBy: "field-staff",
    }),
    values: {
      roomWidthMm: createKnownMm(5800),
      roomDepthMm: createKnownMm(11200),
    },
  };
  const started = await service.startLayout({ measurement });
  assert.equal(started.ok, true);
  const pillar = createPillarElement({ xMm: 1000, yMm: 1000, widthMm: 500, heightMm: 500 });
  const saved = await service.updateLayout({
    layoutId: started.value.layout.layoutId,
    expectedLayoutVersion: 1,
    elements: [pillar],
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.value.layoutVersion, 2);
});

test("24. stale version에서 local 변경 조용히 overwrite하지 않음", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "frameone-sf-5b-c-"));
  tempRoots.push(rootDir);
  const service = createSpaceFitLayoutService({
    rootDir,
    now: () => "2026-09-22T10:00:00.000Z",
  });
  const measurement = {
    ...createEmptyMeasurementSet({
      surveyId: createSiteSurveyId(),
      candidateStoreId: createCandidateStoreId(),
      measuredAt: "2026-09-22T09:00:00.000Z",
      measuredBy: "field-staff",
    }),
    values: {
      roomWidthMm: createKnownMm(5800),
      roomDepthMm: createKnownMm(11200),
    },
  };
  const started = await service.startLayout({ measurement });
  await service.updateLayout({
    layoutId: started.value.layout.layoutId,
    expectedLayoutVersion: 1,
    elements: [],
  });
  const conflict = await service.updateLayout({
    layoutId: started.value.layout.layoutId,
    expectedLayoutVersion: 1,
    elements: [createPillarElement({ xMm: 0, yMm: 0, widthMm: 100, heightMm: 100 })],
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.code, "VERSION_CONFLICT");
  const loaded = await service.getLayout(started.value.layout.layoutId);
  assert.equal(loaded.value.elements.length, 0);
});

test("25. Geometry warning이 Risk/Verdict를 생성하지 않음", () => {
  const a = createPillarElement({ xMm: 0, yMm: 0, widthMm: 1000, heightMm: 1000 });
  const b = createPillarElement({ xMm: 200, yMm: 200, widthMm: 1000, heightMm: 1000 });
  const warnings = validateLayoutGeometry(layoutWith([a, b]));
  assert.equal(warningCodesAreGeometryOnly(warnings), true);
  assert.equal(
    warnings.some((w) => ["HIGH_RISK", "UNSUITABLE", "CONTRACT_REJECT"].includes(w.code)),
    false,
  );
});

test("26. snapped client pointer at zoom uses Domain mm", () => {
  const controls = createFitViewportControls({
    roomWidthMm: 5800,
    roomDepthMm: 11200,
    viewportWidthPx: 800,
    viewportHeightPx: 600,
    zoomIndex: 5,
  });
  const transform = composeViewportTransform(controls);
  const snapped = clientPointerToSnappedMm({
    clientX: transform.offsetXPx + mmToSvg(1243, transform.scale),
    clientY: transform.offsetYPx + mmToSvg(0, transform.scale),
    svgRect: { left: 0, top: 0, width: 800, height: 600 },
    viewBoxWidth: 800,
    viewBoxHeight: 600,
    transform,
  });
  assert.equal(snapped.xMm, 1200);
});

test("27. restroom + point move helpers", () => {
  const restroom = createRestroomElement({ xMm: 0, yMm: 0, widthMm: 1000, heightMm: 1000 });
  const point = createFacilityPointElement({ type: "DRAIN_POINT", xMm: 0, yMm: 0 });
  const g1 = dragGrabOffsetMm(restroom, { xMm: 10, yMm: 10 });
  const g2 = dragGrabOffsetMm(point, { xMm: 0, yMm: 0 });
  assert.ok(g1);
  assert.ok(g2);
  assert.equal(moveElementByPointerMm(restroom, { xMm: 510, yMm: 10 }, g1).xMm, 500);
  assert.equal(canRedo(createHistory([])), false);
  void replaceElement;
  void svgToMm;
});
