import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const react = require("react");
let activeFixture;

// Small deterministic hook fixture for the actual component's handlers/effects.
// No browser SDK, external network, production data or new test framework is used here.
function slot(create) {
  const index = activeFixture.cursor++;
  if (!(index in activeFixture.slots)) activeFixture.slots[index] = create();
  return activeFixture.slots[index];
}
const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const hooks = {
  ...react,
  useState(initial) {
    const owner = activeFixture;
    const state = slot(() => {
      const state = { value: typeof initial === "function" ? initial() : initial };
      // React setters keep their identity across parent/child rerenders.
      state.setValue = (update) => {
        const next = typeof update === "function" ? update(state.value) : update;
        if (!Object.is(state.value, next)) { state.value = next; owner.dirty = true; }
      };
      return state;
    });
    return [state.value, state.setValue];
  },
  useRef(initial) { return slot(() => ({ current: initial })); },
  useMemo(factory, deps) {
    const state = slot(() => ({}));
    if (!same(state.deps, deps)) { state.value = factory(); state.deps = deps; }
    return state.value;
  },
  useCallback(callback, deps) { return hooks.useMemo(() => callback, deps); },
  useEffect(effect, deps) {
    const state = slot(() => ({}));
    if (!same(state.deps, deps)) {
      activeFixture.effects.push(() => { state.cleanup?.(); state.cleanup = effect(); });
      state.deps = deps;
    }
  },
};
const previousLoaders = new Map([".ts", ".tsx"].map((ext) => [ext, require.extensions[ext]]));
for (const ext of previousLoaders.keys()) {
  require.extensions[ext] = (module, filename) => {
    const original = module.require.bind(module);
    module.require = (specifier) => specifier === "react" ? hooks : original(
      specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : specifier,
    );
    module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, filename);
  };
}
const { default: KakaoBaseMap } = require(path.join(root, "app/markets/KakaoBaseMap.tsx"));
const { default: MarketsExplorer } = require(path.join(root, "app/markets/MarketsExplorer.tsx"));
const { default: MarketSpatialViewer } = require(path.join(root, "app/markets/MarketSpatialViewer.tsx"));
const { default: MarketAnalysisSummary } = require(path.join(root, "app/markets/MarketAnalysisSummary.tsx"));
const { findRelatedOfficialMarkets } = require(path.join(root, "lib/market-data/official-market-spatial-relation.ts"));
const originalKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
const originalFetch = global.fetch;
const originalWindow = global.window;
const originalObserver = global.ResizeObserver;
after(() => {
  for (const [ext, loader] of previousLoaders) {
    if (loader) require.extensions[ext] = loader;
    else delete require.extensions[ext];
  }
  if (originalKey === undefined) delete process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  else process.env.NEXT_PUBLIC_KAKAO_MAP_KEY = originalKey;
  global.fetch = originalFetch;
  if (originalWindow === undefined) delete global.window;
  else global.window = originalWindow;
  if (originalObserver === undefined) delete global.ResizeObserver;
  else global.ResizeObserver = originalObserver;
});

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object" || !tree.props) return [];
  return [tree, ...nodes(tree.props.children)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join("");
  return node && typeof node === "object" ? text(node.props?.children) : String(node ?? "");
}
function fixture(component, props) {
  const instance = {
    cursor: 0, slots: [], effects: [], dirty: true, tree: null, props,
    render() {
      activeFixture = instance; this.cursor = 0; this.dirty = false;
      this.tree = component(this.props);
      for (const node of nodes(this.tree)) if (node.props.ref && typeof node.props.ref === "object") node.props.ref.current ??= { isConnected: true, scrollIntoView() {}, focus() {} };
      for (const effect of this.effects.splice(0)) effect();
    },
    async flush() {
      for (let i = 0; i < 20; i++) {
        if (this.dirty) this.render();
        await new Promise((resolve) => setImmediate(resolve));
        if (!this.dirty) return;
      }
      throw new Error("Fixture did not settle");
    },
    find(predicate) { const node = nodes(this.tree).find(predicate); assert.ok(node, "Fixture element must exist"); return node; },
    button(label) { return this.find((node) => node.type === "button" && text(node) === label); },
    dispose() { for (const state of this.slots) state.cleanup?.(); },
  };
  return instance;
}

function installMapFixture() {
  process.env.NEXT_PUBLIC_KAKAO_MAP_KEY = "fixture-key-not-for-network";
  const listeners = new Map();
  const maps = [], markers = [], circles = [], polygons = [], requests = [];
  let failGeocode = false;
  class LatLng { constructor(lat, lng) { this.lat = lat; this.lng = lng; } getLat() { return this.lat; } getLng() { return this.lng; } }
  class Overlay { constructor(options) { this.options = options; } setMap(map) { this.map = map; } }
  global.window = { setTimeout, kakao: { maps: {
    load: (callback) => callback(), LatLng,
    Map: class { constructor() { maps.push(this); } setCenter(center) { this.center = center; } relayout() {} },
    Marker: class extends Overlay { constructor(options) { super(options); markers.push(this); } },
    Circle: class extends Overlay { constructor(options) { super(options); circles.push(this); } },
    Polygon: class extends Overlay { constructor(options) { super(options); polygons.push(this); } },
    InfoWindow: class { close() {} open() {} setContent() {} },
    event: {
      addListener(target, name, callback) { if (!listeners.has(target)) listeners.set(target, new Map()); listeners.get(target).set(name, callback); },
      removeListener(target, name) { listeners.get(target)?.delete(name); },
    },
  } } };
  global.ResizeObserver = class { observe() {} disconnect() {} };
  global.fetch = async (input) => {
    const url = new URL(input, "http://fixture.invalid"); requests.push(url);
    if (url.pathname === "/api/markets/geocode") return Response.json(
      failGeocode ? { message: "fixture failure" } : { latitude: 37.5, longitude: 127.1, resolvedAddress: "fixture resolved address" },
      { status: failGeocode ? 422 : 200 },
    );
    assert.equal(url.pathname, "/api/markets/nearby-places");
    return Response.json({ categories: ["bakery", "confectionery", "cafe"].map((id) => ({ id, totalCount: 0, places: [] })) });
  };
  return { maps, markers, circles, polygons, requests, LatLng,
    failGeocode() { failGeocode = true; },
    emit(target, name, event) { listeners.get(target)?.get(name)?.(event); },
  };
}

test("markets CASE A, C–I: explicit target analysis preserves map events and execution snapshots", async (t) => {
  const sdk = installMapFixture();
  let officialSelections = 0;
  const view = fixture(KakaoBaseMap, {
    marketName: "fixture market A", selectedOfficialMarketCode: null,
    onSelectOfficialMarket: () => { officialSelections++; },
    officialMarketPolygons: [{ featureIndex: 0, officialMarketCode: "fixture-only", geometry: { type: "Polygon", coordinates: [[[127, 37], [127.01, 37], [127, 37.01], [127, 37]]] } }],
  });
  try {
    await view.flush();
    view.find((node) => node.props.id === "kakao-map-sdk").props.onReady();
    await view.flush();
    await t.test("CASE A: initial map is visible and no result zero is rendered", () => {
      assert.ok(text(view.tree).includes("분석 기준 위치"));
      assert.ok(!nodes(view.tree).some((node) => node.props.id === "nearby-place-title"));
      assert.ok(!view.find((node) => node.props["aria-label"] === "서울 중심 Kakao 기본 지도").props.className.includes("hidden"));
      assert.equal(sdk.requests.length, 0);
    });
    await t.test("CASE I: viewing map without an address never starts analysis", async () => {
      assert.equal(view.button("이 위치 상세분석").props.disabled, true);
      assert.equal(sdk.requests.length, 0);
    });
    await t.test("CASE C: address search locates one draft point but does not analyze", async () => {
      view.find((node) => node.props.id === "candidate-store-address").props.onChange({ target: { value: "fixture input address" } });
      await view.flush(); view.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); await view.flush();
      assert.equal(sdk.requests[0].searchParams.get("address"), "fixture input address");
      assert.equal(sdk.markers.at(-1).options.title, "분석 기준 위치");
      assert.equal(sdk.markers.at(-1).options.zIndex, 20);
      assert.equal(sdk.circles.length, 0);
      assert.equal(sdk.requests.filter((url) => url.pathname.endsWith("nearby-places")).length, 0);
    });
    await t.test("CASE D: only explicit point analysis produces a 500m execution and results", async () => {
      view.button("이 위치 상세분석").props.onClick(); await view.flush();
      assert.equal(sdk.circles.at(-1).options.radius, 500);
      assert.equal(sdk.requests.at(-1).pathname, "/api/markets/nearby-places");
      assert.equal(sdk.requests.at(-1).searchParams.get("lat"), "37.5");
      assert.ok(text(view.find((node) => node.props["aria-label"] === "현재 분석")).includes("선택 지점 주변 주소 · fixture resolved address"));
      assert.ok(nodes(view.tree).some((node) => node.props.id === "nearby-place-title"));
    });
    await t.test("CASE E: draft 300m/market changes leave current 500m snapshot until explicit analysis", async () => {
      const requestCount = sdk.requests.length;
      view.button("분석조건 변경").props.onClick(); view.button("300m").props.onClick();
      view.props = { ...view.props, marketName: "fixture market B" }; view.dirty = true; await view.flush();
      const current = text(view.find((node) => node.props["aria-label"] === "현재 분석"));
      assert.ok(current.includes("fixture market A · 500m"));
      assert.equal(sdk.requests.length, requestCount);
      view.button("이 위치 상세분석").props.onClick(); await view.flush();
      assert.equal(sdk.requests.at(-1).searchParams.get("radius"), "300");
      assert.equal(sdk.circles.at(-1).options.radius, 300);
    });
    await t.test("CASE F: map click selects a candidate; only analyze commits the point", async () => {
      const requestCount = sdk.requests.length;
      sdk.emit(sdk.maps[0], "click", { latLng: new sdk.LatLng(37.51, 127.11) }); await view.flush();
      assert.equal(sdk.requests.length, requestCount);
      assert.equal(sdk.markers.at(-1).options.title, "분석 기준 위치");
      view.button("이 위치 상세분석").props.onClick(); await view.flush();
      assert.equal(sdk.requests.at(-1).searchParams.get("lat"), "37.51");
    });
    await t.test("CASE G: pan and tab switches do not alter analysis point, radius or results", async () => {
      const requestCount = sdk.requests.length, circle = sdk.circles.at(-1);
      const mapContainerRef = view.find((node) => node.props["aria-label"] === "서울 중심 Kakao 기본 지도").props.ref;
      sdk.emit(sdk.maps[0], "dragend"); sdk.emit(sdk.maps[0], "center_changed");
      for (const mode of ["competition", "hidden", "briefing"]) {
        view.props = { ...view.props, view: mode }; view.dirty = true; await view.flush();
        assert.equal(view.find((node) => node.props["aria-label"] === "서울 중심 Kakao 기본 지도").props.ref, mapContainerRef);
      }
      assert.equal(sdk.requests.length, requestCount); assert.equal(sdk.circles.at(-1), circle);
    });
    await t.test("CASE H: polygon click selects one draft point and suppresses the bubbled map click", async () => {
      const requestCount = sdk.requests.length, markerCount = sdk.markers.length;
      sdk.emit(sdk.polygons[0], "click", { latLng: new sdk.LatLng(37.55, 127.15) });
      sdk.emit(sdk.maps[0], "click", { latLng: new sdk.LatLng(37.6, 127.2) }); await view.flush();
      assert.equal(officialSelections, 1); assert.equal(sdk.requests.length, requestCount); assert.equal(sdk.markers.length, markerCount + 1);
      assert.equal(sdk.markers.at(-1).options.position.getLat(), 37.55);
    });
    await t.test("failed replacement address does not analyze a previous candidate", async () => {
      sdk.failGeocode(); view.button("분석조건 변경").props.onClick();
      view.find((node) => node.props.id === "candidate-store-address").props.onChange({ target: { value: "fixture invalid address" } });
      await view.flush(); const count = sdk.requests.filter((url) => url.pathname.endsWith("nearby-places")).length;
      view.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); await view.flush();
      assert.equal(sdk.requests.filter((url) => url.pathname.endsWith("nearby-places")).length, count);
      assert.ok(nodes(view.tree).some((node) => node.props.role === "alert"));
    });
  } finally { view.dispose(); }
});

test("STEP 6 CASE A-C/J/K/R: final tabs, default setup, navigation and empty states are safe", async () => {
  const submarket = (marketId, id, name) => ({ parentMarketId: marketId, submarketId: id, name, administrativeDong: null, status: "text_only", nodes: [] });
  const market = (id, submarkets) => ({ marketId: id, name: id, gu: "fixture district", geometryStatus: "text_only", researchPriority: "A", bakeryMarketImportance: "A", submarkets });
  const view = fixture(MarketsExplorer, { hierarchy: { districts: [{ districtId: "fixture-district", name: "fixture district", markets: [
    market("fixture-A", [submarket("fixture-A", "fixture-A-1", "fixture A 첫 하위상권"), submarket("fixture-A", "fixture-A-2", "fixture A 둘째 하위상권")]),
    market("fixture-B", [submarket("fixture-B", "fixture-B-1", "fixture B 유일 하위상권")]),
  ] }] } });
  await view.flush();
  const spatial = () => view.find((node) => node.type === MarketSpatialViewer);
  const selector = view.find((node) => node.type === "select" && node.props.value === "fixture-A");
  const briefing = view.find((node) => node.props["aria-label"] === "선택 상권 기본 브리핑");
  assert.ok(nodes(view.tree).indexOf(briefing) < nodes(view.tree).indexOf(spatial()));
  assert.doesNotMatch(renderToStaticMarkup(briefing), /text_only|geometryStatus|경계 상태/);
  assert.ok(view.button("fixture A 첫 하위상권"));
  assert.ok(view.button("fixture A 둘째 하위상권"));
  view.button("fixture A 첫 하위상권").props.onClick(); await view.flush();
  assert.equal(spatial().props.selectedSubmarket.submarketId, "fixture-A-1");
  assert.ok(renderToStaticMarkup(view.tree).includes("fixture-A &gt; fixture A 첫 하위상권 기본 정보"));
  selector.props.onChange({ target: { value: "fixture-B" } }); await view.flush();
  assert.equal(spatial().props.selectedMarket.marketId, "fixture-B");
  assert.equal(spatial().props.selectedSubmarket, null);
  assert.ok(view.button("fixture B 유일 하위상권"));
  assert.ok(!nodes(view.tree).some((node) => node.type === "button" && text(node) === "fixture A 첫 하위상권"));
  const labels = ["분석 설정", "종합 진단", "경쟁 환경", "데이터 근거"];
  assert.deepEqual([...new Set(nodes(view.tree).filter((node) => node.type === "button" && labels.includes(text(node))).map(text))], labels);
  assert.ok(view.button("분석 설정").props["aria-current"]);
  assert.doesNotMatch(text(view.tree), /브리핑|상권지도|경쟁점|공공데이터/);
  for (const [label, id] of [["종합 진단", "market-map"], ["경쟁 환경", "competition"], ["데이터 근거", "public-data"], ["분석 설정", "briefing"]]) {
    view.button(label).props.onClick(); await view.flush(); assert.equal(spatial().props.activeTab, id);
    if (label === "종합 진단") assert.ok(renderToStaticMarkup(view.tree).includes("먼저 분석 설정에서 지도 분석지점을 선택하고 분석을 실행해 주세요."));
    if (label === "데이터 근거") assert.ok(text(view.tree).includes("분석 실행 후 데이터 근거를 확인할 수 있습니다."));
  }
  const rendered = renderToStaticMarkup(view.tree);
  assert.ok(rendered.includes("overflow-x-auto"));
  assert.ok(rendered.includes("shrink-0"));
});

test("CASE J structural check: target controls stack on narrow screens with 44px actions", async () => {
  installMapFixture();
  const view = fixture(KakaoBaseMap, { officialMarketPolygons: [], selectedOfficialMarketCode: null, onSelectOfficialMarket() {} });
  await view.flush();
  const html = renderToStaticMarkup(view.tree);
  assert.ok(html.includes("flex flex-col gap-2 sm:flex-row"));
  for (const label of ["주소로 위치 찾기", "300m", "500m", "이 위치 상세분석"]) assert.ok(view.button(label).props.className.includes("min-h-11"));
  assert.ok(html.includes("지도 범례"));
  assert.ok(html.includes("서울시 공식통계 경계"));
  view.dispose();
});

test("analysis mode CASE 1/6/8/9/16: MARKET_AREA uses only verified FRAMEONE hierarchy metadata", async () => {
  const market = {
    marketId: "fixture-area", name: "fixture 권역", gu: "fixture 구", geometryStatus: "text_only",
    researchPriority: "A", bakeryMarketImportance: "S",
    submarkets: [
      { parentMarketId: "fixture-area", submarketId: "sm-1", name: "sm 1", administrativeDong: null, status: "text_only", nodes: [{ nodeId: "n-1", parentSubmarketId: "sm-1", type: "anchor", name: "n 1", address: null, latitude: null, longitude: null, sourceId: null }] },
      { parentMarketId: "fixture-area", submarketId: "sm-2", name: "sm 2", administrativeDong: null, status: "text_only", nodes: [{ nodeId: "n-2", parentSubmarketId: "sm-2", type: "street", name: "n 2", address: null, latitude: null, longitude: null, sourceId: null }] },
    ],
  };
  const view = fixture(MarketsExplorer, { hierarchy: { schemaVersion: "fixture", checkedAt: "fixture", city: "fixture", districts: [{ districtId: "d", name: "fixture 구", markets: [market] }] } });
  const spatial = () => view.find((node) => node.props.marketSelector !== undefined);
  try {
    await view.flush();
    assert.equal(spatial().props.pointSelectionEnabled, true);
    view.button("권역 분석").props.onClick(); await view.flush();
    assert.equal(spatial().props.pointSelectionEnabled, false);
    let rendered = renderToStaticMarkup(view.tree);
    assert.ok(rendered.includes("FRAMEONE 권역 geometry가 확인되지 않아 지도 Polygon을 표시하지 않습니다."));
    assert.ok(rendered.includes("포함 Submarket") && rendered.includes("2개") && rendered.includes("포함 Node"));
    assert.ok(!nodes(view.tree).some((node) => node.type === "button" && ["fixture 권역 분석 보기", "권역 진단 보기"].includes(text(node))));
    view.button("종합진단 보기").props.onClick(); await view.flush();
    rendered = renderToStaticMarkup(view.tree);
    assert.ok(rendered.includes("fixture 권역 권역 진단"));
    assert.ok(rendered.includes("상세 소비·생활인구 분석은 데이터 연결 후 제공"));
    assert.ok(rendered.includes("서울시 공식상권 통계, Kakao 검색결과 또는 겹치는 공간단위를 FRAMEONE 권역 전체 값으로 합산하지 않습니다."));
    assert.doesNotMatch(rendered, /월 추정매출|공식상권 전체 월|Kakao 장소검색/);
    view.find((node) => typeof node.type === "function" && node.type.name === "MarketAreaAnalysisSummary").props.onEditConditions(); await view.flush();
    assert.ok(renderToStaticMarkup(view.tree).includes("현재 권역 분석"));
    assert.ok(!nodes(view.tree).some((node) => node.type === "button" && text(node) === "권역 진단 보기"));
    view.button("위치 상세분석").props.onClick(); await view.flush();
    assert.equal(spatial().props.pointSelectionEnabled, true);
  } finally { view.dispose(); }
});

test("analysis mode CASE 2/3/4/5/7/14: point selection is disabled for area mode and explicit for detail mode", async () => {
  const sdk = installMapFixture();
  let selections = 0, executions = 0;
  const view = fixture(KakaoBaseMap, {
    pointSelectionEnabled: false, marketName: "fixture 권역", selectedOfficialMarketCode: null,
    onSelectOfficialMarket() { selections++; }, onAnalysisExecuted() { executions++; },
    officialMarketPolygons: [{ featureIndex: 0, officialMarketCode: "fixture-official", geometry: { type: "Polygon", coordinates: [[[127, 37], [127.01, 37], [127, 37.01], [127, 37]]] } }],
  });
  try {
    await view.flush(); view.find((node) => node.props.id === "kakao-map-sdk").props.onReady(); await view.flush();
    sdk.emit(sdk.maps[0], "click", { latLng: new sdk.LatLng(37.5, 127.1) });
    sdk.emit(sdk.polygons[0], "click", { latLng: new sdk.LatLng(37.51, 127.11) }); await view.flush();
    assert.equal(sdk.markers.length, 0); assert.equal(selections, 0); assert.equal(executions, 0);
    view.props = { ...view.props, pointSelectionEnabled: true }; view.dirty = true; await view.flush();
    sdk.emit(sdk.polygons.at(-1), "click", { latLng: new sdk.LatLng(37.51, 127.11) });
    sdk.emit(sdk.maps[0], "click", { latLng: new sdk.LatLng(37.6, 127.2) }); await view.flush();
    assert.equal(sdk.markers.length, 1); assert.equal(selections, 1); assert.equal(executions, 0);
    view.button("이 위치 상세분석").props.onClick(); await view.flush();
    assert.equal(executions, 1);
  } finally { view.dispose(); }
});

test("runtime regression CASE 1-5: semantic Context equality stops feedback while real primitive changes propagate", async () => {
  installMapFixture();
  const source = JSON.parse(fs.readFileSync(path.join(root, "data/seoul-market/v1.1-final/09_GEO/OFFICIAL_SEOUL_MARKETS.geojson"), "utf8"));
  global.fetch = async (input) => input.includes("spatial-layers")
    ? Response.json(source)
    : Response.json({ marketId: "fixture-market", verificationStatus: "candidate", manualReviewRequired: true, officialMarketCandidates: [], administrativeDongCandidates: [], livingGridCandidates: [] });
  const hierarchy = { schemaVersion: "fixture", checkedAt: "fixture", city: "fixture", districts: [{
    districtId: "fixture-district", name: "fixture district", markets: [{
      marketId: "fixture-market", name: "fixture market", gu: "fixture district", geometryStatus: "text_only",
      researchPriority: "A", bakeryMarketImportance: "A", submarkets: [{
        parentMarketId: "fixture-market", submarketId: "fixture-submarket", name: "fixture submarket",
        administrativeDong: null, status: "text_only", nodes: [],
      }],
    }],
  }] };
  const explorer = fixture(MarketsExplorer, { hierarchy });
  let viewer, lastContext = null, emissions = 0;
  try {
    await explorer.flush();
    const childProps = () => explorer.find((node) => node.type === MarketSpatialViewer).props;
    const parentCallback = childProps().onAnalysisContextChange;
    const relay = (context) => { emissions++; lastContext = context; parentCallback(context); };
    viewer = fixture(MarketSpatialViewer, { ...childProps(), onAnalysisContextChange: relay });
    await viewer.flush();
    assert.equal(explorer.dirty, true);
    await explorer.flush();

    const emittedAfterInitialSettle = emissions;
    viewer.props = { ...childProps(), onAnalysisContextChange: relay }; viewer.dirty = true;
    await viewer.flush();
    assert.equal(emissions, emittedAfterInitialSettle);
    assert.equal(explorer.dirty, false);

    parentCallback(structuredClone(lastContext));
    assert.equal(explorer.dirty, false);

    viewer.props = { ...viewer.props, selectedSubmarket: { submarketId: "fixture-submarket-2", submarketName: "fixture submarket 2", geometryStatus: "text_only" } };
    viewer.dirty = true; await viewer.flush();
    assert.ok(emissions > emittedAfterInitialSettle);
    assert.equal(lastContext.frameone.selectedSubmarketId, "fixture-submarket-2");
    await explorer.flush();

    const executed = structuredClone(lastContext);
    executed.target = { source: "map", confirmedAddress: null, analysisPoint: { latitude: 37.5, longitude: 127.1 }, executedRadiusMeters: 500 };
    parentCallback(executed); assert.equal(explorer.dirty, true); await explorer.flush();
    parentCallback(structuredClone(executed)); assert.equal(explorer.dirty, false);
    const radiusChanged = structuredClone(executed); radiusChanged.target.executedRadiusMeters = 300;
    parentCallback(radiusChanged); assert.equal(explorer.dirty, true); await explorer.flush();
    assert.ok(renderToStaticMarkup(explorer.tree).includes("상권 Context가 변경되었습니다."));
  } finally { viewer?.dispose(); explorer.dispose(); }
});

test("STEP 2 CASE H/I/J/K/L: actual map handlers share executed spatial calculation, retain manual selection and pan state", async () => {
  const sdk = installMapFixture();
  const geometry = { type: "Polygon", coordinates: [[[127.1045, 37.49], [127.106, 37.49], [127.106, 37.52], [127.1045, 37.52], [127.1045, 37.49]]] };
  const inputs = [{ marketCode: "fixture-only", marketName: "fixture only", geometry }];
  let executed = null, selections = 0;
  const view = fixture(KakaoBaseMap, {
    officialMarketPolygons: [{ featureIndex: 0, officialMarketCode: "fixture-only", geometry }],
    selectedOfficialMarketCode: "fixture-only", onSelectOfficialMarket() { selections++; },
    onAnalysisExecuted(value) { executed = value; },
  });
  const relation = () => findRelatedOfficialMarkets(executed, inputs);
  try {
    await view.flush(); view.find((node) => node.props.id === "kakao-map-sdk").props.onReady(); await view.flush();
    assert.equal(relation(), null); // I
    view.find((node) => node.props.id === "candidate-store-address").props.onChange({ target: { value: "fixture address" } });
    await view.flush(); view.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); await view.flush();
    assert.equal(relation(), null);
    view.button("이 위치 상세분석").props.onClick(); await view.flush();
    assert.equal(relation().results[0].relation, "RADIUS_OVERLAP"); // J
    const snapshot = executed;
    view.button("분석조건 변경").props.onClick(); view.button("300m").props.onClick(); await view.flush();
    assert.equal(executed, snapshot); assert.equal(relation().results[0].analysisRadiusMeters, 500); // L
    view.button("이 위치 상세분석").props.onClick(); await view.flush();
    assert.equal(relation().results[0].relation, "OUTSIDE");
    sdk.emit(sdk.polygons[0], "click", { latLng: new sdk.LatLng(37.5, 127.1) });
    sdk.emit(sdk.maps[0], "click", { latLng: new sdk.LatLng(37.6, 127.2) }); await view.flush(); // same-event bubble is suppressed
    assert.equal(selections, 1); assert.equal(view.props.selectedOfficialMarketCode, "fixture-only");
    assert.equal(relation().radiusOverlapMarkets.length, 0); assert.equal(relation().insideMarkets.length, 0); // H
    view.button("이 위치 상세분석").props.onClick(); await view.flush();
    assert.equal(relation().results[0].relation, "OUTSIDE"); // K: same point/radius as geocode
    view.button("분석조건 변경").props.onClick(); view.button("500m").props.onClick(); await view.flush();
    view.button("이 위치 상세분석").props.onClick(); await view.flush();
    assert.equal(relation().results[0].relation, "RADIUS_OVERLAP");
    const beforePan = executed, requests = sdk.requests.length;
    sdk.emit(sdk.maps[0], "dragend"); sdk.emit(sdk.maps[0], "center_changed"); await view.flush();
    assert.equal(executed, beforePan); assert.equal(sdk.requests.length, requests);
  } finally { view.dispose(); }
});

test("STEP 2 viewer: all official geometries independent of crosswalk; manual OUTSIDE warning and neutral state", async () => {
  installMapFixture();
  const source = JSON.parse(fs.readFileSync(path.join(root, "data/seoul-market/v1.1-final/09_GEO/OFFICIAL_SEOUL_MARKETS.geojson"), "utf8"));
  const requests = [];
  global.fetch = async (url) => {
    requests.push(url);
    if (url.includes("spatial-layers")) return Response.json(source);
    assert.ok(url.includes("crosswalk"));
    return Response.json({ marketId: "fixture-market", verificationStatus: "candidate", manualReviewRequired: true, officialMarketCandidates: [], administrativeDongCandidates: [], livingGridCandidates: [] });
  };
  const view = fixture(MarketSpatialViewer, { selectedMarket: { marketId: "fixture-market", marketName: "fixture market", geometryStatus: "text_only" }, selectedSubmarket: null, activeTab: "briefing", marketSelector: null, onOpenMarketMap() {} });
  const map = () => view.find((node) => node.type === KakaoBaseMap);
  const html = () => renderToStaticMarkup(view.tree);
  try {
    await view.flush();
    assert.ok(html().includes("분석지점을 먼저 선택해 주세요."));
    assert.equal(map().props.officialMarketPolygons.length, 0); // crosswalk empty
    const index = source.features.findIndex((f) => f.properties.official_area_code === "3120231");
    const [longitude, latitude] = source.features[index].geometry.coordinates[0][0];
    map().props.onAnalysisExecuted({ source: "map", confirmedAddress: null, analysisPoint: { longitude, latitude }, analysisRadiusMeters: 500 }); await view.flush();
    assert.ok(html().includes("가락시장 · 분석지점 포함")); // compact selector, not limited to candidates
    assert.ok(html().includes("상세 근거 보기"));
    assert.ok(html().includes("서울시 공식통계 연결"));
    assert.ok(html().includes("서울시 통계 참고상권"));
    assert.ok(!html().includes("참고자료 선택"));
    assert.equal(map().props.selectedOfficialMarketCode, null); // no auto-selection
    map().props.onSelectOfficialMarket(0); await view.flush();
    assert.equal(map().props.selectedOfficialMarketCode, source.features[0].properties.official_area_code);
    assert.ok(html().includes("별도 참고자료로만 확인하세요."));
    assert.ok(html().includes("분석지점 실제매출이나 분석반경 자체의 통계가 아닙니다."));
    assert.ok(!requests.some((url) => url.includes("bakery-data")));
    view.props = { ...view.props, activeTab: "public-data" }; view.dirty = true; await view.flush();
    assert.ok(html().includes("별도 참고자료로만 확인하세요."));
  } finally { view.dispose(); }
});

test("STEP 3: real map/viewer state produces one context across target edits, requests and reference selections", async () => {
  const sdk = installMapFixture();
  const mapFetch = global.fetch;
  const source = JSON.parse(fs.readFileSync(path.join(root, "data/seoul-market/v1.1-final/09_GEO/OFFICIAL_SEOUL_MARKETS.geojson"), "utf8"));
  const contexts = [], nearbyRequests = [], publicRequests = [];
  global.fetch = async (input, options) => {
    const url = new URL(input, "http://fixture.invalid");
    if (url.pathname.includes("spatial-layers")) return Response.json(source);
    if (url.pathname.endsWith("crosswalk")) return Response.json({ marketId: url.searchParams.get("marketId"), verificationStatus: "candidate", manualReviewRequired: true, officialMarketCandidates: [], administrativeDongCandidates: [], livingGridCandidates: [] });
    if (url.pathname.endsWith("nearby-places")) return new Promise((resolve) => nearbyRequests.push({ resolve, signal: options.signal }));
    if (url.pathname.endsWith("bakery-data")) return new Promise((resolve) => publicRequests.push({ resolve, signal: options.signal, code: url.searchParams.get("marketCode") }));
    return mapFetch(input, options);
  };
  const viewer = fixture(MarketSpatialViewer, {
    selectedMarket: { marketId: "fixture-frameone-A", marketName: "fixture FRAMEONE A", geometryStatus: "text_only" },
    selectedSubmarket: { submarketId: "fixture-submarket-A", submarketName: "fixture submarket A", geometryStatus: "text_only" },
    activeTab: "briefing", marketSelector: null,
    onOpenMarketMap() {}, onAnalysisContextChange(context) { contexts.push(context); },
  });
  const mapProps = () => viewer.find((node) => node.type === KakaoBaseMap).props;
  const context = () => contexts.at(-1);
  let map;
  async function flush() {
    await viewer.flush();
    map.props = mapProps(); map.dirty = true;
    await map.flush(); await viewer.flush();
  }
  function resolveNearby(request, payload, status = 200) {
    request.resolve(Response.json(payload, { status }));
  }
  function publicPayload(request, dataStatus) {
    // Synthetic observations attributed to the selected source code solely for this fixture.
    const sampleObservation = (metric, value, sourceId) => ({
      sourceId, referencePeriod: "2026-Q2", geographyType: "official_market", geographyId: request.code,
      industryCode: "CS100005", metric, value, unit: sourceId === "SRC-SEOUL-SALES" ? "KRW" : "count", dataStatus: "available",
    });
    return { officialMarketCode: request.code, officialMarketName: "fixture official name",
      industryCode: "CS100005", industryName: "fixture bakery", quarterCode: "20262", referencePeriod: "2026-Q2", dataStatus,
      sales: dataStatus === "available" ? [sampleObservation("monthly_sales_amount", 1234, "SRC-SEOUL-SALES")] : [],
      stores: dataStatus === "missing" ? [] : [sampleObservation("store_count", 3, "SRC-SEOUL-STORES")],
    };
  }
  try {
    await viewer.flush(); map = fixture(KakaoBaseMap, mapProps()); await flush();
    assert.equal(context().target, null); assert.equal(context().kakaoNearby.bakery, null);
    map.find((node) => node.props.id === "kakao-map-sdk").props.onReady(); await flush();
    map.find((node) => node.props.id === "candidate-store-address").props.onChange({ target: { value: "fixture input address" } });
    await flush(); map.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); await flush();
    assert.equal(context().target, null);
    map.button("이 위치 상세분석").props.onClick(); await flush();
    assert.deepEqual(context().target, { source: "map", confirmedAddress: null, analysisPoint: { longitude: 127.1, latitude: 37.5 }, executedRadiusMeters: 500 });
    assert.equal(context().kakaoNearby.status, "loading"); assert.equal(context().kakaoNearby.bakery, null);
    resolveNearby(nearbyRequests.at(-1), { categories: ["bakery", "confectionery", "cafe"].map((id) => ({ id, totalCount: 0, places: [] })) });
    await flush(); assert.equal(context().kakaoNearby.status, "success"); assert.equal(context().kakaoNearby.bakery.totalCount, 0);

    const addressContext = context();
    map.button("분석조건 변경").props.onClick(); map.button("300m").props.onClick();
    map.find((node) => node.props.id === "candidate-store-address").props.onChange({ target: { value: "fixture edited address" } });
    sdk.emit(sdk.maps[0], "click", { latLng: new sdk.LatLng(37.51, 127.11) });
    await flush(); assert.equal(context(), addressContext);
    for (const activeTab of ["competition", "public-data", "market-map", "briefing"]) {
      viewer.props = { ...viewer.props, activeTab }; viewer.dirty = true; await flush();
      assert.equal(context(), addressContext);
    }
    sdk.emit(sdk.maps[0], "dragend"); sdk.emit(sdk.maps[0], "center_changed"); await flush();
    assert.equal(context(), addressContext); assert.equal(nearbyRequests.length, 1);

    // Use an actual source polygon vertex for multiple real relations, not invented geometry.
    const garakIndex = source.features.findIndex((feature) => feature.properties.official_area_code === "3120231");
    const [longitude, latitude] = source.features[garakIndex].geometry.coordinates[0][0];
    sdk.emit(sdk.maps[0], "click", { latLng: new sdk.LatLng(latitude, longitude) }); await flush();
    map.button("이 위치 상세분석").props.onClick(); await flush();
    assert.equal(context().target.source, "map"); assert.equal(context().target.confirmedAddress, null);
    assert.equal(context().target.executedRadiusMeters, 300);
    assert.equal(context().kakaoNearby.bakery, null); // previous successful response cleared atomically
    const staleNearby = nearbyRequests.at(-1);
    // Invoke a replacement execution directly while the previous fixture promise is pending.
    map.button("500m").props.onClick(); await flush(); map.button("이 위치 상세분석").props.onClick(); await flush();
    assert.equal(staleNearby.signal.aborted, true);
    resolveNearby(staleNearby, { categories: [{ id: "bakery", totalCount: 999, places: [] }] }); await flush();
    assert.equal(context().kakaoNearby.status, "loading"); assert.equal(context().kakaoNearby.bakery, null);
    resolveNearby(nearbyRequests.at(-1), { categories: [
      { id: "bakery", totalCount: 0, places: [], error: "fixture category failure" },
      { id: "confectionery", totalCount: 11, places: [] }, { id: "cafe", totalCount: 63, places: [] },
    ] }); await flush();
    assert.equal(context().kakaoNearby.status, "error"); assert.equal(context().kakaoNearby.bakery.totalCount, null);
    assert.equal(context().kakaoNearby.confectionery.totalCount, 11); assert.equal(context().kakaoNearby.cafe.totalCount, 63);
    assert.equal(context().target.executedRadiusMeters, 500);
    assert.ok(context().officialMarkets.relatedMarkets.some((item) => item.relation === "INSIDE"));
    assert.ok(context().officialMarkets.relatedMarkets.some((item) => item.relation === "RADIUS_OVERLAP"));
    assert.equal(context().officialMarkets.manuallySelected, null);
    const related = context().officialMarkets.relatedMarkets;

    viewer.props = {
      ...viewer.props,
      selectedMarket: { marketId: "fixture-frameone-B", marketName: "fixture FRAMEONE B", geometryStatus: "text_only" },
      selectedSubmarket: { submarketId: "fixture-submarket-B", submarketName: "fixture submarket B", geometryStatus: "text_only" },
    }; viewer.dirty = true; await flush();
    assert.equal(context().frameone.selectedMarketId, "fixture-frameone-A");
    assert.equal(context().frameone.selectedSubmarketId, "fixture-submarket-A");
    assert.deepEqual(context().target.analysisPoint, { longitude, latitude });
    assert.deepEqual(context().officialMarkets.relatedMarkets, related);

    mapProps().onSelectOfficialMarket(0); await flush();
    assert.equal(context().officialMarkets.manuallySelected.spatialRelation.relation, "OUTSIDE");
    assert.deepEqual(context().officialMarkets.relatedMarkets, related);
    const loadButton = () => viewer.button("제과점 데이터 확인");
    for (const dataStatus of ["available", "partial", "missing"]) {
      loadButton().props.onClick(); await flush();
      assert.equal(context().publicData.requestStatus, "loading"); assert.equal(context().publicData.status, null);
      const request = publicRequests.at(-1), payload = publicPayload(request, dataStatus);
      request.resolve(Response.json(payload)); await flush();
      assert.equal(context().publicData.status, dataStatus);
      assert.deepEqual(context().publicData.selectedOfficialMarketData, payload);
      assert.equal(context().officialMarkets.manuallySelected.spatialRelation.relation, "OUTSIDE");
      if (dataStatus === "available") {
        const completedContext = context();
        const nearbyCount = nearbyRequests.length, publicCount = publicRequests.length;
        for (const activeTab of ["competition", "public-data", "market-map", "briefing"]) {
          viewer.props = { ...viewer.props, activeTab }; viewer.dirty = true; await flush();
          assert.equal(context(), completedContext);
          assert.equal(context().officialMarkets.manuallySelected.spatialRelation.relation, "OUTSIDE");
          assert.equal(context().publicData.selectedOfficialMarketData, completedContext.publicData.selectedOfficialMarketData);
        }
        assert.equal(nearbyRequests.length, nearbyCount); assert.equal(publicRequests.length, publicCount);
      }
    }
    loadButton().props.onClick(); await flush();
    publicRequests.at(-1).resolve(Response.json({ message: "fixture Seoul failure" }, { status: 502 })); await flush();
    assert.equal(context().publicData.requestStatus, "error"); assert.equal(context().publicData.status, null);
    assert.equal(context().publicData.error, "fixture Seoul failure");
    assert.equal(context().officialMarkets.status, "success");

    loadButton().props.onClick(); await flush();
    const stalePublic = publicRequests.at(-1), firstNewContext = contexts.length;
    mapProps().onSelectOfficialMarket(garakIndex); await flush();
    assert.equal(stalePublic.signal.aborted, true);
    assert.ok(contexts.slice(firstNewContext).every((item) => item.publicData.requestStatus === "idle" && item.publicData.selectedOfficialMarketData === null));
    stalePublic.resolve(Response.json(publicPayload(stalePublic, "available"))); await flush();
    assert.equal(context().publicData.requestStatus, "idle"); assert.equal(context().publicData.selectedOfficialMarketData, null);
    assert.equal(context().officialMarkets.manuallySelected.marketCode, "3120231");
    assert.deepEqual(context().officialMarkets.relatedMarkets, related);

    map.button("이 위치 상세분석").props.onClick(); await flush();
    resolveNearby(nearbyRequests.at(-1), { message: "fixture nearby transport failure" }, 502); await flush();
    assert.equal(context().kakaoNearby.status, "error"); assert.equal(context().kakaoNearby.cafe, null);
    assert.equal(context().kakaoNearby.error, "fixture nearby transport failure");
    assert.deepEqual(addressContext.target, { source: "map", confirmedAddress: null, analysisPoint: { longitude: 127.1, latitude: 37.5 }, executedRadiusMeters: 500 });
  } finally { map?.dispose(); viewer.dispose(); }
});

test("STEP 6 CASE D-I/L-Q/S-T: tabs reuse Context, requests, map, selection, public data and staff mode", async () => {
  const sdk = installMapFixture();
  const mapFetch = global.fetch;
  const source = JSON.parse(fs.readFileSync(path.join(root, "data/seoul-market/v1.1-final/09_GEO/OFFICIAL_SEOUL_MARKETS.geojson"), "utf8"));
  global.fetch = async (input, options) => input.includes("spatial-layers") ? Response.json(source) : mapFetch(input, options);
  const explorer = fixture(MarketsExplorer, { hierarchy: { districts: [] } });
  let viewer, map;
  const viewerProps = () => explorer.find((node) => node.type === MarketSpatialViewer).props;
  const mapProps = () => viewer.find((node) => node.type === KakaoBaseMap).props;
  const summaryNode = () => explorer.find((node) => node.type === MarketAnalysisSummary);
  const summaryHtml = () => renderToStaticMarkup(summaryNode());
  async function flush() {
    for (let round = 0; round < 3; round++) {
      await explorer.flush();
      viewer.props = viewerProps(); viewer.dirty = true; await viewer.flush();
      map.props = mapProps(); map.dirty = true; await map.flush();
    }
  }
  try {
    await explorer.flush(); viewer = fixture(MarketSpatialViewer, viewerProps()); await viewer.flush();
    map = fixture(KakaoBaseMap, mapProps()); await flush();
    assert.equal(viewerProps().activeTab, "briefing");
    assert.equal(map.props.analysisSummary, null);
    map.find((node) => node.props.id === "kakao-map-sdk").props.onReady(); await flush();
    map.find((node) => node.props.id === "candidate-store-address").props.onChange({ target: { value: "fixture address" } });
    await flush(); map.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); await flush();
    assert.equal(sdk.requests.filter((request) => request.pathname.endsWith("nearby-places")).length, 0);
    map.button("이 위치 상세분석").props.onClick(); await flush();
    const requestCount = sdk.requests.length, mapInstance = sdk.maps[0];
    const completedMapHtml = renderToStaticMarkup(map.tree);
    assert.ok(completedMapHtml.includes("분석 완료"));
    assert.ok(completedMapHtml.includes("종합 진단 보기"));
    assert.ok(completedMapHtml.includes("중복정규화"));
    assert.ok(completedMapHtml.includes("공식 점포 수나 전체 영업점 수가 아닙니다"));
    assert.doesNotMatch(completedMapHtml, /지도 표시 \d+곳<\/span>/);
    map.button("종합 진단 보기").props.onClick(); await flush();
    assert.equal(viewerProps().activeTab, "market-map");
    assert.equal(sdk.requests.length, requestCount);
    const executedContext = summaryNode().props.context;
    assert.ok(summaryHtml().includes("지도 선택 위치")); assert.ok(summaryHtml().includes("지도 선택 · 반경 500m"));
    assert.equal(summaryNode().props.viewMode, "customer");
    assert.doesNotMatch(summaryHtml(), /직원용 검증정보|market-analysis-context-v1|latitude|longitude/);
    summaryNode().props.onViewModeChange("staff"); await flush();
    assert.equal(summaryNode().props.viewMode, "staff"); assert.match(summaryHtml(), /직원용 검증정보|market-analysis-context-v1/);
    for (const label of ["경쟁 환경", "데이터 근거", "종합 진단"]) {
      explorer.button(label).props.onClick(); await flush();
      assert.equal(sdk.maps.length, 1); assert.equal(sdk.maps[0], mapInstance);
      assert.equal(sdk.requests.length, requestCount);
    }
    explorer.button("데이터 근거").props.onClick(); await flush();
    const explorerNodes = nodes(explorer.tree);
    const evidenceNode = explorer.find((node) => typeof node.type === "function" && node.type.name === "CurrentAnalysisEvidence");
    const hierarchyNode = explorer.find((node) => node.type === "details" && text(node).includes("전체 FRAMEONE 상권 계층 · 내부 상세정보"));
    const evidenceHtml = renderToStaticMarkup(evidenceNode);
    assert.ok(explorerNodes.indexOf(evidenceNode) < explorerNodes.indexOf(hierarchyNode));
    assert.ok(evidenceHtml.includes("SALES/STORES 기준분기"));
    assert.ok(evidenceHtml.includes("SRC-SEOUL-SALES"));
    explorer.button("종합 진단").props.onClick(); await flush();
    assert.equal(summaryNode().props.viewMode, "staff"); assert.equal(summaryNode().props.context, executedContext);
    assert.ok(summaryHtml().includes("지도 선택 위치"));
    assert.equal(map.tree.props["aria-hidden"], true);
    assert.ok(map.tree.props.className.includes("hidden"));
    assert.ok(nodes(map.tree).some((node) => node.props["aria-label"] === "서울 중심 Kakao 기본 지도"));
    summaryNode().props.onEditConditions(); await flush();
    assert.equal(viewerProps().activeTab, "briefing");
    assert.ok(!map.find((node) => node.props["aria-labelledby"] === "analysis-point-title").props.className.includes("hidden"));
    map.button("300m").props.onClick();
    map.find((node) => node.props.id === "candidate-store-address").props.onChange({ target: { value: "fixture edited draft" } });
    await flush(); explorer.button("종합 진단").props.onClick(); await flush();
    assert.equal(summaryNode().props.context, executedContext); assert.ok(summaryHtml().includes("지도 선택 · 반경 500m"));
    assert.equal(sdk.requests.length, requestCount);
    explorer.button("분석 설정").props.onClick(); await flush();
    sdk.emit(mapInstance, "click", { latLng: new sdk.LatLng(37.51, 127.11) }); await flush();
    map.button("이 위치 상세분석").props.onClick(); await flush();
    explorer.button("종합 진단").props.onClick(); await flush();
    assert.ok(summaryHtml().includes("지도 선택 위치")); assert.ok(summaryHtml().includes("지도 선택 · 반경 300m"));
    assert.ok(summaryHtml().includes("37.51"));
    summaryNode().props.onViewModeChange("customer"); await flush();
    assert.ok(!summaryHtml().includes("37.51"));
    assert.equal(summaryNode().props.context.target.confirmedAddress, null);
    assert.equal(executedContext.target.executedRadiusMeters, 500);
    const pointDetailContext = summaryNode().props.context;
    explorer.button("분석 설정").props.onClick(); await flush();
    explorer.button("권역 분석").props.onClick(); await flush();
    assert.equal(map.props.pointSelectionEnabled, false);
    const markerCount = sdk.markers.length;
    sdk.emit(mapInstance, "click", { latLng: new sdk.LatLng(37.7, 127.3) }); await flush();
    assert.equal(sdk.markers.length, markerCount);
    explorer.button("종합 진단").props.onClick(); await flush();
    const areaHtml = renderToStaticMarkup(explorer.tree);
    assert.ok(areaHtml.includes("먼저 분석 설정에서 FRAMEONE 주요상권을 선택하고 권역 분석을 실행해 주세요.")); assert.ok(!areaHtml.includes("37.51"));
    explorer.find((node) => typeof node.type === "function" && node.type.name === "MarketAreaAnalysisSummary").props.onEditConditions(); await flush();
    explorer.button("위치 상세분석").props.onClick(); await flush();
    explorer.button("종합 진단").props.onClick(); await flush();
    assert.equal(summaryNode().props.context, pointDetailContext);
  } finally { map?.dispose(); viewer?.dispose(); explorer.dispose(); }
});
