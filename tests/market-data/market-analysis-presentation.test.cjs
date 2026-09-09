/* eslint-disable @typescript-eslint/no-require-imports -- Existing market-data TypeScript test-loader convention. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, test } = require("node:test");
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");

const root = path.resolve(__dirname, "../..");
const loaders = new Map([".ts", ".tsx"].map((ext) => [ext, require.extensions[ext]]));
for (const ext of loaders.keys()) require.extensions[ext] = (module, filename) => {
  const original = module.require.bind(module);
  module.require = (specifier) => original(specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : specifier);
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
};
after(() => {
  for (const [ext, loader] of loaders) {
    if (loader) require.extensions[ext] = loader;
    else delete require.extensions[ext];
  }
});
const { buildMarketAnalysisContext: buildContext } = require("../../lib/market-data/market-analysis-context.ts");
const { buildMarketSummaryPresentation: present } = require("../../lib/market-data/market-analysis-presentation.ts");
const { default: Summary } = require("../../app/markets/MarketAnalysisSummary.tsx");
const html = (context) => renderToStaticMarkup(createElement(Summary, { context, onEditConditions() {} }));
const htmlMode = (context, viewMode) => renderToStaticMarkup(createElement(Summary, { context, viewMode, onEditConditions() {} }));

// All names, points and observations below are synthetic test fixtures, not real business data.
function relation(code, value) {
  return { marketCode: `fixture-${code}`, marketName: `예시 ${code} 상권`, relation: value, analysisRadiusMeters: 500 };
}
function observation(metric, value, sourceId = "SRC-SEOUL-STORES", dataStatus = "available") {
  return { sourceId, referencePeriod: "2026-Q2", geographyType: "official_market", geographyId: "fixture-inside",
    industryCode: "CS100005", metric, value, unit: metric === "monthly_sales_amount" ? "KRW" : "count", dataStatus };
}
function fixtureInput() {
  return {
    executedAnalysis: { source: "address", confirmedAddress: "예시 확인주소", analysisPoint: { longitude: 127, latitude: 37.5 }, analysisRadiusMeters: 500 },
    selectedFrameoneMarket: { marketId: "fixture-frameone", marketName: "예시 FRAMEONE 주요상권" },
    kakaoNearby: { status: "success", error: null, response: { categories: ["bakery", "confectionery", "cafe"].map((id, index) => ({
      id, totalCount: [11, 11, 63][index], places: Array.from({ length: index === 2 ? 15 : 11 }, (_, i) => ({
        id: `fixture-place-${i}`, categoryId: id, categoryLabel: "예시 카테고리", name: `예시 장소 ${i}`,
        address: "예시 장소 주소", longitude: 127, latitude: 37.5, distanceM: 10,
      })),
    })) } },
    officialMarkets: { status: "success", error: null,
      results: [relation("inside", "INSIDE"), ...[1, 2, 3].map((i) => relation(`overlap${i}`, "RADIUS_OVERLAP")), relation("outside", "OUTSIDE")],
      manuallySelected: { marketCode: "fixture-inside", marketName: "예시 inside 상권" },
    },
    publicData: { requestStatus: "success", requestedOfficialMarketCode: "fixture-inside", error: null,
      data: { officialMarketCode: "fixture-inside", officialMarketName: "예시 inside 상권", industryCode: "CS100005", industryName: "제과점",
        quarterCode: "20262", referencePeriod: "2026-Q2", dataStatus: "available",
        sales: [observation("monthly_sales_amount", 130218275, "SRC-SEOUL-SALES"), observation("monthly_sales_count", 11603, "SRC-SEOUL-SALES")],
        stores: [observation("similar_industry_store_count", 7), observation("store_count", 4), observation("franchise_store_count", 3), observation("opening_store_count", 0), observation("closing_store_count", 0)],
      },
    },
  };
}
function context(change = () => {}) { const input = fixtureInput(); change(input); return buildContext(input); }
function manualFixture(code) {
  return context((input) => {
    input.officialMarkets.manuallySelected = { marketCode: `fixture-${code}`, marketName: `예시 ${code} 상권` };
    input.publicData.requestedOfficialMarketCode = `fixture-${code}`;
    input.publicData.data.officialMarketCode = `fixture-${code}`; input.publicData.data.officialMarketName = `예시 ${code} 상권`;
    for (const item of [...input.publicData.data.sales, ...input.publicData.data.stores]) item.geographyId = `fixture-${code}`;
  });
}

test("presentation CASE A: pre-analysis renders only neutral instruction, no zero or result cards", () => {
  for (const value of [null, context((input) => { input.executedAnalysis = null; })]) {
    assert.equal(present(value).status, "empty");
    const rendered = html(value);
    assert.ok(rendered.includes("먼저 분석 설정에서 후보점포 분석을 실행해 주세요."));
    assert.doesNotMatch(rendered, /0곳|0원|데이터 없음|월 추정매출|주변 경쟁환경|500m/);
  }
});
test("presentation CASE B: address + FRAMEONE + executed 500m in summary header and location", () => {
  const rendered = html(context());
  for (const expected of ["예시 확인주소", "예시 FRAMEONE 주요상권", "500m", "주소 분석", "분석조건 변경", "내부 업무분류"]) assert.ok(rendered.includes(expected));
});
test("presentation CASE C: map with null address displays safe label without raw coordinates", () => {
  const value = context((input) => { input.executedAnalysis.source = "map"; input.executedAnalysis.confirmedAddress = null; });
  assert.equal(present(value).target.address, "지도 선택 위치");
  const rendered = html(value); assert.ok(rendered.includes("지도 분석"));
  assert.doesNotMatch(rendered, /37\.5|127|latitude|longitude/);
});
test("presentation CASE D: draft radius/address do not affect executed context", () => {
  const input = fixtureInput(), value = buildContext(input), before = html(value);
  input.radiusM = 300; input.candidateAddress = "예시 미실행 주소";
  assert.equal(html(buildContext(input)), before);
  assert.equal(present(value).target.radius, "500m");
});
test("presentation CASE E: Kakao categories separately show total vs returned count", () => {
  const result = present(context());
  assert.deepEqual(result.nearby.categories.map((item) => item.value), ["11곳", "11곳", "63곳"]);
  assert.equal(result.nearby.categories[2].detail, "반환된 장소 15곳");
  assert.doesNotMatch(JSON.stringify(result.nearby), /85곳|지도 표시/);
});
test("presentation CASE F: successful Kakao zero is displayed as an actual zero", () => {
  const value = context((input) => { input.kakaoNearby.response.categories[0].totalCount = 0; input.kakaoNearby.response.categories[0].places = []; });
  assert.equal(present(value).nearby.categories[0].value, "0곳");
});
test("presentation CASE G: category and transport errors never turn into zero", () => {
  let value = context((input) => { input.kakaoNearby.status = "error"; input.kakaoNearby.response.categories[0].error = "fixture error"; input.kakaoNearby.response.categories[0].totalCount = 0; });
  let result = present(value);
  assert.equal(result.nearby.categories[0].value, "조회 실패 · 재확인 필요");
  assert.equal(result.nearby.categories[0].detail, null); assert.equal(result.nearby.categories[1].value, "11곳");
  value = context((input) => { input.kakaoNearby = { status: "error", response: null, error: "fixture transport error" }; });
  result = present(value); assert.ok(result.nearby.categories.every((item) => item.value === "조회 실패 · 재확인 필요"));
});
test("presentation CASE H: one INSIDE and three OVERLAP groups stay separate", () => {
  const result = present(context());
  assert.deepEqual(result.spatial.inside, ["예시 inside 상권"]);
  assert.deepEqual(result.spatial.overlaps, ["예시 overlap1 상권", "예시 overlap2 상권", "예시 overlap3 상권"]);
  assert.ok(result.interpretation.reference.some((line) => line.includes("3개 공식상권")));
});
test("presentation CASE I: multiple INSIDE and OVERLAP results have no truncation", () => {
  const result = present(context((input) => { input.officialMarkets.results.push(relation("inside2", "INSIDE"), relation("overlap4", "RADIUS_OVERLAP")); }));
  assert.equal(result.spatial.inside.length, 2); assert.equal(result.spatial.overlaps.length, 4);
});
test("presentation CASE J: manual INSIDE is separately named as statistical geography", () => {
  const result = present(context());
  assert.equal(result.spatial.manual.relation, "후보점포 포함");
  assert.equal(result.statistics.market, "예시 inside 상권"); assert.equal(result.statistics.warning, null);
  assert.ok(html(context()).includes("통계 기준 공식상권"));
});
test("presentation CASE K: manual overlap statistics carry reference-selection warning", () => {
  const result = present(manualFixture("overlap1"));
  assert.equal(result.spatial.manual.relation, "분석반경 교차");
  assert.ok(result.statistics.warning.includes("직원이 참고 선택한 ‘예시 overlap1 상권’"));
  assert.deepEqual(result.spatial.inside, ["예시 inside 상권"]);
});
test("presentation CASE L: manual OUTSIDE never becomes a contained market", () => {
  const value = manualFixture("outside"), result = present(value);
  assert.equal(result.spatial.manual.relation, "직접 공간관계 없음");
  assert.ok(result.spatial.manual.description.includes("통계 참고 공식상권"));
  assert.ok(result.statistics.warning.includes("직접 포함된 공식상권 통계와 다를 수 있습니다"));
  assert.deepEqual(result.spatial.inside, ["예시 inside 상권"]);
});
test("presentation CASE M: available statistics display geography, quarter and seven source metrics", () => {
  const result = present(context()), rendered = html(context());
  assert.equal(result.statistics.status, "자료 확인"); assert.equal(result.statistics.period, "2026년 2분기 기준");
  assert.equal(result.statistics.metrics.length, 7);
  assert.ok(rendered.includes("130,218,275원")); assert.ok(rendered.includes("11,603건"));
});
test("presentation CASE N: partial keeps available rows and missing source is not checked", () => {
  const result = present(context((input) => { input.publicData.data.dataStatus = "partial"; input.publicData.data.sales = []; }));
  assert.equal(result.statistics.status, "일부 자료 확인"); assert.equal(result.statistics.metrics.length, 5);
  assert.equal(result.sources.find((item) => item.name === "서울시 SALES").status, "해당 기준 자료 없음");
  assert.equal(result.sources.find((item) => item.name === "서울시 STORES").status, "자료 확인");
});
test("presentation CASE O: missing statistics contain no synthetic zero metrics", () => {
  const result = present(context((input) => { input.publicData.data.dataStatus = "missing"; input.publicData.data.sales = []; input.publicData.data.stores = []; }));
  assert.equal(result.statistics.status, "해당 기준 자료 없음"); assert.deepEqual(result.statistics.metrics, []);
});
test("presentation CASE P: valid zero displayed, suppressed zero/null never presented as a measurement", () => {
  let result = present(context());
  assert.equal(result.statistics.metrics.find((item) => item.metric === "opening_store_count").value, "0개");
  result = present(context((input) => { input.publicData.data.stores[0].value = null; input.publicData.data.stores[3].dataStatus = "suppressed"; }));
  assert.equal(result.statistics.metrics.find((item) => item.metric === "similar_industry_store_count").value, "자료 없음");
  assert.equal(result.statistics.metrics.find((item) => item.metric === "opening_store_count").value, "비공개 자료");
  assert.equal(result.sources.find((item) => item.name === "서울시 STORES").status, "일부 수치 확인");
});
test("presentation CASE Q: three store metrics are independent, without an aggregate field", () => {
  const metrics = present(context()).statistics.metrics.filter((item) => ["similar_industry_store_count", "store_count", "franchise_store_count"].includes(item.metric));
  assert.deepEqual(metrics.map((item) => item.value), ["7개", "4개", "3개"]);
  assert.doesNotMatch(JSON.stringify(metrics), /14개|합계|총합/);
});
test("presentation CASE R: sales retain estimated label and adjacent official geography disclaimer", () => {
  const result = present(context()), rendered = html(context());
  assert.equal(result.statistics.metrics[0].label, "공식상권 전체 월 추정매출");
  assert.ok(rendered.includes("서울시 공식상권 단위의 추정통계입니다."));
  assert.ok(rendered.includes("후보점포 자체의 예상매출이나 500m 분석반경 통계가 아닙니다."));
  assert.ok(!result.statistics.metrics.some((item) => item.label.includes("예상매출")));
});
test("presentation CASE S: no overall competitor count; category overlap disclaimer visible", () => {
  const result = present(context());
  assert.deepEqual(Object.keys(result.nearby), ["status", "categories"]);
  assert.ok(html(context()).includes("단순 합산하지 않습니다"));
  assert.ok(html(context()).includes("공식 사업체 수와 다를 수 있습니다"));
});
test("presentation CASE T: main summary never renders source IDs, raw enums, coordinates or new verdicts", () => {
  const rendered = html(manualFixture("outside"));
  assert.doesNotMatch(rendered, /manual_review|text_only|fixture-inside|SRC-SEOUL|INSIDE|OUTSIDE|RADIUS_OVERLAP|UNKNOWN|추천|조건부 추천|보류|위험|경쟁이 매우 치열|창업하기 좋은/);
});
test("presentation: API failure and missing/unknown spatial relation remain independent", () => {
  let result = present(context((input) => { input.publicData.requestStatus = "error"; input.publicData.data = null; }));
  assert.equal(result.statistics.status, "조회 실패 · 재확인 필요");
  assert.deepEqual(result.spatial.inside, ["예시 inside 상권"]);
  result = present(context((input) => { input.officialMarkets.status = "error"; input.officialMarkets.results = null; }));
  assert.equal(result.spatial.status, "조회 실패 · 재확인 필요"); assert.equal(result.statistics.status, "자료 확인");
  result = present(context((input) => { input.officialMarkets.results = [relation("unknown", "UNKNOWN")]; }));
  assert.deepEqual(result.spatial.unknown, ["예시 unknown 상권"]);
  assert.equal(result.spatial.status, "일부 공간관계 확인 필요");
});
test("presentation: idle, loading, incomplete categories, absent selection and no intersections have neutral states", () => {
  for (const status of ["idle", "loading"]) {
    const result = present(context((input) => { input.kakaoNearby.status = status; input.kakaoNearby.response = null; input.publicData.requestStatus = status; input.publicData.data = null; }));
    assert.ok(result.nearby.categories.every((item) => item.value === (status === "loading" ? "조회 중" : "조회 전")));
    assert.equal(result.statistics.status, status === "loading" ? "조회 중" : "통계 조회 전");
  }
  const result = present(context((input) => { input.officialMarkets.results = []; input.officialMarkets.manuallySelected = null; input.kakaoNearby.response.categories.pop(); }));
  assert.equal(result.statistics.status, "통계 기준 공식상권 선택 필요"); assert.deepEqual(result.spatial.inside, []);
  assert.equal(result.nearby.categories[2].value, "자료 확인 필요");
  assert.equal(result.nearby.status, "일부 자료 확인");
});
test("presentation: deterministic output does not mutate frozen Context", () => {
  const value = context(), before = JSON.stringify(value), first = present(value);
  assert.deepEqual(present(value), first); assert.equal(JSON.stringify(value), before);
  assert.equal(Object.isFrozen(value.publicData.selectedOfficialMarketData), true);
});

test("STEP 5 CASE A-I: customer mode is default and structurally excludes staff-only identifiers", () => {
  const value = manualFixture("outside");
  const result = present(value);
  assert.equal(result.viewMode, "customer");
  assert.equal(result.staffDetails, null);
  assert.deepEqual(result.spatial.inside, ["예시 inside 상권"]);
  assert.equal(result.spatial.manual.relation, "직접 공간관계 없음");
  assert.equal(result.statistics.status, "자료 확인");
  const rendered = html(value);
  assert.ok(rendered.includes("상담용 보기")); assert.ok(rendered.includes("직원용 상세"));
  assert.ok(rendered.includes("통계 참고 공식상권"));
  assert.ok(!rendered.includes("직원 참고선택"));
  assert.match(rendered, /상담용 보기<\/button>/);
  assert.doesNotMatch(rendered, /직원용 검증정보|fixture-frameone|fixture-outside|SRC-SEOUL|INSIDE|OUTSIDE|RADIUS_OVERLAP|market-analysis-context-v1|37\.5|127/);
});

test("STEP 5 CASE J-N: staff mode adds raw Context facts without replacing customer presentation", () => {
  const value = manualFixture("outside");
  const customer = present(value, "customer"), staff = present(value, "staff");
  assert.equal(staff.viewMode, "staff"); assert.ok(staff.staffDetails);
  assert.deepEqual(staff.target, customer.target);
  assert.deepEqual(staff.nearby, customer.nearby);
  assert.deepEqual(staff.spatial, customer.spatial);
  assert.deepEqual(staff.statistics.metrics.map((item) => item.value), customer.statistics.metrics.map((item) => item.value));
  assert.equal(customer.statistics.metrics[0].label, "공식상권 전체 월 추정매출");
  assert.equal(staff.statistics.metrics[0].label, "월 추정매출");
  assert.equal(staff.staffDetails.target.frameoneMarketId, "fixture-frameone");
  assert.deepEqual(staff.staffDetails.target, {
    frameoneMarketId: "fixture-frameone", source: "address", latitude: 37.5, longitude: 127, executedRadiusMeters: 500,
  });
  assert.deepEqual(staff.staffDetails.kakao.categories.map((item) => [item.id, item.status, item.totalCount, item.returnedCount]), [
    ["bakery", "success", 11, 11], ["confectionery", "success", 11, 11], ["cafe", "success", 63, 15],
  ]);
  assert.ok(staff.staffDetails.officialMarkets.relatedMarkets.some((item) => item.marketCode === "fixture-inside" && item.relation === "INSIDE"));
  assert.deepEqual(staff.staffDetails.officialMarkets.manuallySelected, {
    selectionType: "manual", marketCode: "fixture-outside", marketName: "예시 outside 상권", relation: "OUTSIDE", analysisRadiusMeters: 500,
  });
  assert.equal(staff.staffDetails.publicData.officialMarketCode, "fixture-outside");
  assert.equal(staff.staffDetails.publicData.dataStatus, "available");
  assert.ok(staff.staffDetails.publicData.observations.some((item) => item.sourceId === "SRC-SEOUL-SALES" && item.metric === "monthly_sales_amount"));
  const rendered = htmlMode(value, "staff");
  assert.ok(rendered.includes("직원 참고선택"));
  assert.ok(rendered.includes("오류 없음"));
  assert.ok(!rendered.includes("requestError</dt><dd class=\"mt-1\"><span class=\"break-all font-mono text-xs text-slate-700\">미확인"));
});

test("stabilization: actual request failures keep failure policy and never become no-error", () => {
  const value = context((input) => {
    input.kakaoNearby = { status: "error", response: null, error: "fixture transport error" };
    input.publicData.requestStatus = "error";
    input.publicData.error = "fixture Seoul failure";
    input.publicData.data = null;
  });
  const result = present(value, "staff");
  const rendered = htmlMode(value, "staff");
  assert.equal(result.nearby.status, "조회 실패 · 재확인 필요");
  assert.equal(result.statistics.status, "조회 실패 · 재확인 필요");
  assert.ok(rendered.includes("fixture transport error"));
  assert.ok(rendered.includes("fixture Seoul failure"));
});

test("STEP 5 CASE O-T: modes preserve zero, missing/error distinctions, no aggregates, verdicts or mutation", () => {
  const value = context((input) => {
    input.kakaoNearby.response.categories[0].totalCount = 0;
    input.kakaoNearby.response.categories[0].places = [];
    input.publicData.data.dataStatus = "partial";
    input.publicData.data.stores[0].dataStatus = "suppressed";
    input.publicData.data.stores[0].value = null;
  });
  const before = JSON.stringify(value);
  const customer = present(value, "customer"), staff = present(value, "staff");
  assert.equal(customer.nearby.categories[0].value, "0곳");
  assert.equal(customer.statistics.status, "일부 자료 확인");
  assert.equal(customer.statistics.metrics.find((item) => item.metric === "similar_industry_store_count").value, "비공개 자료");
  assert.equal(staff.staffDetails.kakao.categories[0].totalCount, 0);
  assert.equal(staff.staffDetails.publicData.observations.find((item) => item.metric === "similar_industry_store_count").dataStatus, "suppressed");
  assert.doesNotMatch(JSON.stringify(customer), /85곳|14개|추천|조건부 추천|창업하기 좋은/);
  assert.doesNotMatch(JSON.stringify(staff), /85곳|14개|조건부 추천|창업하기 좋은/);
  assert.equal(JSON.stringify(value), before);
});
