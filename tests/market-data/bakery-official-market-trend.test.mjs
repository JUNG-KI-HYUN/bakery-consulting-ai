import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const loaders = new Map(
  [".ts", ".tsx"].map((extension) => [extension, require.extensions[extension]]),
);
for (const extension of loaders.keys()) {
  require.extensions[extension] = (module, filename) => {
    const original = module.require.bind(module);
    module.require = (specifier) =>
      original(specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : specifier);
    module._compile(
      ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: {
          esModuleInterop: true,
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
      filename,
    );
  };
}

const previousApiKey = process.env.SEOUL_OPEN_DATA_API_KEY;
process.env.SEOUL_OPEN_DATA_API_KEY = "fixture-key-not-for-network";
const {
  buildBakeryOfficialMarketTrend,
  getBakeryOfficialMarketData,
  getBakeryOfficialMarketTrend,
} = require(path.join(root, "lib/market-data/services/bakery-official-market.ts"));
const { buildMarketAnalysisContext } = require(path.join(
  root,
  "lib/market-data/market-analysis-context.ts",
));
const { default: OfficialMarketTrend } = require(path.join(
  root,
  "app/markets/OfficialMarketTrend.tsx",
));
const originalFetch = global.fetch;

after(() => {
  for (const [extension, loader] of loaders) {
    if (loader) require.extensions[extension] = loader;
    else delete require.extensions[extension];
  }
  global.fetch = originalFetch;
  if (previousApiKey === undefined) delete process.env.SEOUL_OPEN_DATA_API_KEY;
  else process.env.SEOUL_OPEN_DATA_API_KEY = previousApiKey;
});

function observation(metric, value, dataStatus = "available") {
  return {
    sourceId: metric === "monthly_sales_amount" ? "SRC-SEOUL-SALES" : "SRC-SEOUL-STORES",
    referencePeriod: "2026-Q1",
    geographyType: "official_market",
    geographyId: "3110002",
    geographyName: "예시 공식상권",
    industryCode: "CS100005",
    industryName: "제과점",
    metric,
    value,
    unit: metric === "monthly_sales_amount" ? "KRW" : "count",
    dataStatus,
  };
}

function period(quarterCode, sales, stores, overrides = {}) {
  const year = quarterCode.slice(0, 4);
  const quarter = quarterCode.slice(4);
  return {
    officialMarketCode: "3110002",
    officialMarketName: "예시 공식상권",
    industryCode: "CS100005",
    industryName: "제과점",
    quarterCode,
    referencePeriod: `${year}-Q${quarter}`,
    sales: sales === undefined ? [] : [observation("monthly_sales_amount", sales)],
    stores: stores === undefined ? [] : [observation("store_count", stores)],
    dataStatus:
      sales === undefined && stores === undefined
        ? "missing"
        : sales === undefined || stores === undefined
          ? "partial"
          : "available",
    ...overrides,
  };
}

function trend(data) {
  return buildBakeryOfficialMarketTrend("3110002", data);
}

test("CASE 1: 최근 네 공통분기를 시간순으로 반환한다", () => {
  const result = trend([
    period("20262", 140, 14),
    period("20254", 120, 12),
    period("20253", 110, 11),
    period("20261", 130, 13),
    period("20252", 100, 10),
  ]);
  assert.deepEqual(result.periods.map((item) => item.quarterCode), [
    "20253", "20254", "20261", "20262",
  ]);
});

test("CASE 2: 존재하는 분기만 반환하고 제한된 탐색으로 가짜 분기를 만들지 않는다", async () => {
  let requests = 0;
  global.fetch = async () => {
    requests += 1;
    return Response.json({
      RESULT: { CODE: "INFO-200", MESSAGE: "fixture no data" },
    });
  };
  const result = await getBakeryOfficialMarketTrend({
    marketCode: "3110002",
    latestData: period("20304", 90, 9),
  });
  assert.deepEqual(result.periods.map((item) => item.quarterCode), ["20304"]);
  assert.equal(requests, 14);
});

test("CASE 3-4: 실제 0과 missing/null을 구분한다", () => {
  const result = trend([
    period("20254", 0, 0),
    period("20261", null, undefined, {
      sales: [observation("monthly_sales_amount", null, "missing")],
      dataStatus: "partial",
    }),
  ]);
  assert.equal(result.periods[0].estimatedSalesAmount, 0);
  assert.equal(result.periods[0].storeCount, 0);
  assert.equal(result.periods[1].estimatedSalesAmount, null);
  assert.equal(result.periods[1].storeCount, null);
});

test("CASE 5: API 실패는 실제 0 결과로 변환되지 않는다", async () => {
  global.fetch = async () =>
    Response.json({ RESULT: { CODE: "ERROR-500", MESSAGE: "fixture failure" } });
  await assert.rejects(() =>
    getBakeryOfficialMarketTrend({
      marketCode: "3110002",
      latestData: period("20304", 0, 0),
    }),
  );
});

test("CASE 6: 연속 분기의 QoQ와 점포수 증감을 계산한다", () => {
  const result = trend([
    period("20254", 100, 10),
    period("20261", 125, 13),
  ]);
  assert.equal(result.periods[1].salesQoqRate, 25);
  assert.equal(result.periods[1].storeCountDelta, 3);
});

test("CASE 7: 이전 값이 0이면 QoQ를 계산하지 않는다", () => {
  const result = trend([period("20254", 0, 0), period("20261", 10, 1)]);
  assert.equal(result.periods[1].salesQoqRate, null);
});

test("CASE 8: 이전 값이 missing이면 QoQ를 계산하지 않는다", () => {
  const result = trend([
    period("20254", undefined, 9),
    period("20261", 100, 10),
  ]);
  assert.equal(result.periods[1].salesQoqRate, null);
});

test("CASE 9: partial 분기는 있는 metric만 보존한다", () => {
  const result = trend([period("20261", 100, undefined)]);
  assert.equal(result.periods[0].estimatedSalesAmount, 100);
  assert.equal(result.periods[0].storeCount, null);
  assert.equal(result.periods[0].dataStatus, "partial");
});

test("CASE 10: 기존 current-quarter 서비스 계약을 유지한다", async () => {
  global.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const service = url.pathname.split("/").filter(Boolean)[2];
    const row = service === "VwsmTrdarSelngQq"
      ? {
          STDR_YYQU_CD: "20401", TRDAR_CD: "3110002", TRDAR_CD_NM: "예시 공식상권",
          SVC_INDUTY_CD: "CS100005", SVC_INDUTY_CD_NM: "제과점", THSMON_SELNG_AMT: 10,
        }
      : {
          STDR_YYQU_CD: "20401", TRDAR_CD: "3110002", TRDAR_CD_NM: "예시 공식상권",
          SVC_INDUTY_CD: "CS100005", SVC_INDUTY_CD_NM: "제과점", STOR_CO: 1,
        };
    return Response.json({
      [service]: {
        list_total_count: 1,
        RESULT: { CODE: "INFO-000", MESSAGE: "ok" },
        row: [row],
      },
    });
  };
  const result = await getBakeryOfficialMarketData({
    marketCode: "3110002",
    quarterCode: "20401",
  });
  assert.equal(result.officialTrend, undefined);
  assert.ok(Array.isArray(result.sales));
  assert.ok(Array.isArray(result.stores));
});

test("CASE 11-15: 근거 화면 문구와 기존 화면 경계를 유지한다", () => {
  const result = trend([
    period("20254", 1000000, 10),
    period("20261", 1200000, 12),
  ]);
  const rendered = renderToStaticMarkup(
    createElement(OfficialMarketTrend, { trend: result }),
  );
  assert.match(rendered, /서울 공식상권 추정통계 추이/);
  assert.match(rendered, /예시 공식상권/);
  assert.match(rendered, /최근 기준 2026년 1분기/);
  assert.match(rendered, /서울시 공식상권 기준 추정통계입니다/);
  assert.match(rendered, /분석지점의 예상매출을 의미하지 않습니다/);
  assert.match(rendered, /Kakao 반경검색 결과와 기준이 다릅니다/);
  assert.doesNotMatch(rendered, /경쟁점.*12|추천|계약 금지|성공 가능성|위험 판정/);

  const current = {
    ...period("20261", 1200000, 12),
    officialTrend: result,
  };
  const context = buildMarketAnalysisContext({
    executedAnalysis: {
      source: "address",
      confirmedAddress: "예시 확인주소",
      analysisPoint: { longitude: 127, latitude: 37.5 },
      analysisRadiusMeters: 500,
    },
    selectedFrameoneMarket: null,
    kakaoNearby: { status: "idle", response: null, error: null },
    officialMarkets: {
      status: "success",
      error: null,
      results: [],
      manuallySelected: {
        marketCode: "3110002",
        marketName: "예시 공식상권",
      },
    },
    publicData: {
      requestStatus: "success",
      requestedOfficialMarketCode: "3110002",
      data: current,
      error: null,
    },
  });
  assert.deepEqual(
    context.publicData.selectedOfficialMarketData.officialTrend,
    result,
  );
  assert.equal(context.kakaoNearby.bakery, null);
});
