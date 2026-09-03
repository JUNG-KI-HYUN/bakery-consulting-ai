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
    const state = slot(() => ({ value: typeof initial === "function" ? initial() : initial }));
    return [state.value, (update) => {
      const next = typeof update === "function" ? update(state.value) : update;
      if (!Object.is(state.value, next)) { state.value = next; owner.dirty = true; }
    }];
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
      for (const node of nodes(this.tree)) if (node.props.ref && typeof node.props.ref === "object") node.props.ref.current ??= {};
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
    await t.test("CASE A: initial target form precedes hidden map and no result zero is rendered", () => {
      assert.ok(text(view.tree).includes("분석 대상"));
      assert.ok(!nodes(view.tree).some((node) => node.props.id === "nearby-place-title"));
      assert.ok(view.find((node) => node.props["aria-busy"] !== undefined).props.className.includes("hidden"));
      assert.equal(sdk.requests.length, 0);
    });
    await t.test("CASE I: viewing map without an address never starts analysis", async () => {
      view.button("지도 보기").props.onClick(); await view.flush();
      assert.equal(view.button("후보점포 분석").props.disabled, true);
      assert.equal(view.button("이 위치 분석").props.disabled, true);
      assert.equal(sdk.requests.length, 0);
    });
    await t.test("CASE C: existing geocode positions candidate marker but locate-only does not analyze", async () => {
      view.find((node) => node.props.id === "candidate-store-address").props.onChange({ target: { value: "fixture input address" } });
      await view.flush(); view.button("위치 확인").props.onClick(); await view.flush();
      assert.equal(sdk.requests[0].searchParams.get("address"), "fixture input address");
      assert.equal(sdk.markers.at(-1).options.title, "후보점포");
      assert.equal(sdk.circles.length, 0);
    });
    await t.test("CASE D: address submit produces marker, 500m circle, REST request and results", async () => {
      view.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); await view.flush();
      assert.equal(sdk.circles.at(-1).options.radius, 500);
      assert.equal(sdk.requests.at(-1).pathname, "/api/markets/nearby-places");
      assert.equal(sdk.requests.at(-1).searchParams.get("lat"), "37.5");
      assert.ok(text(view.find((node) => node.props["aria-label"] === "현재 분석")).includes("fixture resolved address"));
      assert.ok(nodes(view.tree).some((node) => node.props.id === "nearby-place-title"));
    });
    await t.test("CASE E: draft 300m/market changes leave current 500m snapshot until explicit analysis", async () => {
      const requestCount = sdk.requests.length;
      view.button("분석조건 변경").props.onClick(); view.button("300m").props.onClick();
      view.props = { ...view.props, marketName: "fixture market B" }; view.dirty = true; await view.flush();
      const current = text(view.find((node) => node.props["aria-label"] === "현재 분석"));
      assert.ok(current.includes("fixture market A · 500m"));
      assert.equal(sdk.requests.length, requestCount);
      view.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); await view.flush();
      assert.equal(sdk.requests.at(-1).searchParams.get("radius"), "300");
      assert.equal(sdk.circles.at(-1).options.radius, 300);
    });
    await t.test("CASE F: map click selects a candidate; only analyze commits the point", async () => {
      const requestCount = sdk.requests.length;
      sdk.emit(sdk.maps[0], "click", { latLng: new sdk.LatLng(37.51, 127.11) }); await view.flush();
      assert.equal(sdk.requests.length, requestCount);
      assert.equal(sdk.markers.at(-1).options.title, "분석 위치 후보");
      view.button("이 위치 분석").props.onClick(); await view.flush();
      assert.equal(sdk.requests.at(-1).searchParams.get("lat"), "37.51");
    });
    await t.test("CASE G: pan and tab switches do not alter analysis point, radius or results", async () => {
      const requestCount = sdk.requests.length, circle = sdk.circles.at(-1);
      sdk.emit(sdk.maps[0], "dragend"); sdk.emit(sdk.maps[0], "center_changed");
      for (const mode of ["competition", "hidden", "briefing"]) { view.props = { ...view.props, view: mode }; view.dirty = true; await view.flush(); }
      assert.equal(sdk.requests.length, requestCount); assert.equal(sdk.circles.at(-1), circle);
    });
    await t.test("CASE H: polygon click suppresses bubbled map click without changing analysis", async () => {
      const requestCount = sdk.requests.length, markerCount = sdk.markers.length;
      sdk.emit(sdk.polygons[0], "click");
      sdk.emit(sdk.maps[0], "click", { latLng: new sdk.LatLng(37.6, 127.2) }); await view.flush();
      assert.equal(officialSelections, 1); assert.equal(sdk.requests.length, requestCount); assert.equal(sdk.markers.length, markerCount);
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

test("CASE B: briefing selector reuses District/Market state and existing tab identities", async () => {
  const market = (id) => ({ marketId: id, name: id, gu: "fixture district", geometryStatus: "text_only", researchPriority: "A", bakeryMarketImportance: "A", submarkets: [] });
  const view = fixture(MarketsExplorer, { hierarchy: { districts: [{ districtId: "fixture-district", name: "fixture district", markets: [market("fixture-A"), market("fixture-B")] }] } });
  await view.flush();
  const spatial = () => view.find((node) => node.props.marketSelector !== undefined);
  const selector = nodes(spatial().props.marketSelector).find((node) => node.type === "select");
  selector.props.onChange({ target: { value: "fixture-B" } }); await view.flush();
  assert.equal(spatial().props.selectedMarket.marketId, "fixture-B");
  assert.equal(spatial().props.selectedSubmarket, null);
  for (const [label, id] of [["상권지도", "market-map"], ["경쟁점", "competition"], ["공공데이터", "public-data"], ["브리핑", "briefing"]]) {
    view.button(label).props.onClick(); await view.flush(); assert.equal(spatial().props.activeTab, id);
  }
});

test("CASE J structural check: target controls stack on narrow screens with 44px actions", async () => {
  installMapFixture();
  const view = fixture(KakaoBaseMap, { officialMarketPolygons: [], selectedOfficialMarketCode: null, onSelectOfficialMarket() {} });
  await view.flush();
  const html = renderToStaticMarkup(view.tree);
  assert.ok(html.includes("flex flex-col gap-2 sm:flex-row"));
  for (const label of ["후보점포 분석", "위치 확인", "지도 보기", "300m", "500m", "이 위치 분석"]) assert.ok(view.button(label).props.className.includes("min-h-11"));
  view.dispose();
});
