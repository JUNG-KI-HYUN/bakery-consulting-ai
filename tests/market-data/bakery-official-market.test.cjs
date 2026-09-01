const assert = require("node:assert/strict");
const fs = require("node:fs");
const { after, test } = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  module._compile(output, filename);
};

const {
  fetchBakerySalesForOfficialMarket,
  fetchBakeryStoresForOfficialMarket,
  findLatestCommonSeoulMarketQuarter,
  getBakeryOfficialMarketData,
} = require("../../lib/market-data/services/bakery-official-market.ts");

const SALES_SERVICE = "VwsmTrdarSelngQq";
const STORES_SERVICE = "VwsmTrdarStorQq";
const TEST_MARKET_CODE = "3110002";
const TEST_QUARTER_CODE = "20261";
const previousApiKey = process.env.SEOUL_OPEN_DATA_API_KEY;

process.env.SEOUL_OPEN_DATA_API_KEY = "test-key-not-for-network";

after(() => {
  if (previousApiKey === undefined) {
    delete process.env.SEOUL_OPEN_DATA_API_KEY;
  } else {
    process.env.SEOUL_OPEN_DATA_API_KEY = previousApiKey;
  }
});

function parseRequest(input) {
  const url = new URL(typeof input === "string" ? input : input.url);
  const segments = url.pathname
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);

  return {
    service: segments[2],
    start: Number(segments[3]),
    end: Number(segments[4]),
    params: segments.slice(5),
  };
}

function successResponse(service, rows, totalCount = rows.length) {
  return Response.json({
    [service]: {
      list_total_count: totalCount,
      RESULT: { CODE: "INFO-000", MESSAGE: "정상 처리되었습니다." },
      row: rows,
    },
  });
}

function noDataResponse() {
  return Response.json({
    RESULT: { CODE: "INFO-200", MESSAGE: "해당하는 데이터가 없습니다." },
  });
}

function salesRow(overrides = {}) {
  return {
    STDR_YYQU_CD: TEST_QUARTER_CODE,
    TRDAR_CD: TEST_MARKET_CODE,
    TRDAR_CD_NM: "테스트 공식상권",
    SVC_INDUTY_CD: "CS100005",
    SVC_INDUTY_CD_NM: "제과점",
    THSMON_SELNG_AMT: 1000,
    THSMON_SELNG_CO: 10,
    ...overrides,
  };
}

function storesRow(overrides = {}) {
  return {
    STDR_YYQU_CD: TEST_QUARTER_CODE,
    TRDAR_CD: TEST_MARKET_CODE,
    TRDAR_CD_NM: "테스트 공식상권",
    SVC_INDUTY_CD: "CS100005",
    SVC_INDUTY_CD_NM: "제과점",
    SIMILR_INDUTY_STOR_CO: 9,
    STOR_CO: 7,
    FRC_STOR_CO: 2,
    OPBIZ_RT: 0,
    OPBIZ_STOR_CO: 0,
    CLSBIZ_RT: 1.5,
    CLSBIZ_STOR_CO: 1,
    ...overrides,
  };
}

async function withMockFetch(handler, run) {
  const originalFetch = global.fetch;
  global.fetch = async (input, init) => handler(parseRequest(input), init);

  try {
    return await run();
  } finally {
    global.fetch = originalFetch;
  }
}

function recentQuarterCodes(count) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year").value);
  const month = Number(parts.find((part) => part.type === "month").value);
  const quarter = Math.floor((month - 1) / 3) + 1;

  return Array.from({ length: count }, (_, offset) => {
    const index = year * 4 + quarter - 1 - offset;
    return `${Math.floor(index / 4)}${(index % 4) + 1}`;
  });
}

test("SALES는 전체 페이지를 순회한 뒤 공식상권과 CS100005를 필터한다", async () => {
  const requests = [];

  await withMockFetch(
    (request) => {
      requests.push(request);
      assert.equal(request.service, SALES_SERVICE);
      assert.deepEqual(request.params, [TEST_QUARTER_CODE]);

      if (request.start === 1) {
        return successResponse(
          SALES_SERVICE,
          [
            salesRow({ TRDAR_CD: "3999999" }),
            salesRow({ SVC_INDUTY_CD: "CS100001" }),
          ],
          1001,
        );
      }

      return successResponse(
        SALES_SERVICE,
        [salesRow({ THSMON_SELNG_AMT: 0, THSMON_SELNG_CO: null })],
        1001,
      );
    },
    async () => {
      const observations = await fetchBakerySalesForOfficialMarket(
        TEST_MARKET_CODE,
        TEST_QUARTER_CODE,
      );

      assert.deepEqual(
        requests.map(({ start, end }) => [start, end]),
        [
          [1, 1000],
          [1001, 1001],
        ],
      );
      assert.equal(observations.length, 2);
      assert.ok(
        observations.every(
          (item) =>
            item.geographyId === TEST_MARKET_CODE &&
            item.industryCode === "CS100005",
        ),
      );

      const amount = observations.find(
        (item) => item.metric === "monthly_sales_amount",
      );
      const count = observations.find(
        (item) => item.metric === "monthly_sales_count",
      );
      assert.deepEqual(
        { value: amount.value, dataStatus: amount.dataStatus },
        { value: 0, dataStatus: "available" },
      );
      assert.deepEqual(
        { value: count.value, dataStatus: count.dataStatus },
        { value: null, dataStatus: "missing" },
      );

      const otherMarket = await fetchBakerySalesForOfficialMarket(
        "3110003",
        TEST_QUARTER_CODE,
      );
      assert.deepEqual(otherMarket, []);
      assert.equal(requests.length, 2);
    },
  );
});

test("STORES는 quarterCode와 marketCode를 전달하고 CS100005만 변환한다", async () => {
  await withMockFetch(
    (request) => {
      assert.equal(request.service, STORES_SERVICE);
      assert.deepEqual(request.params, [TEST_QUARTER_CODE, TEST_MARKET_CODE]);
      return successResponse(STORES_SERVICE, [
        storesRow(),
        storesRow({ SVC_INDUTY_CD: "CS100001" }),
      ]);
    },
    async () => {
      const observations = await fetchBakeryStoresForOfficialMarket(
        TEST_MARKET_CODE,
        TEST_QUARTER_CODE,
      );

      assert.equal(observations.length, 7);
      assert.ok(
        observations.every((item) => item.industryCode === "CS100005"),
      );
      const openingRate = observations.find(
        (item) => item.metric === "opening_rate",
      );
      assert.deepEqual(
        { value: openingRate.value, dataStatus: openingRate.dataStatus },
        { value: 0, dataStatus: "available" },
      );
    },
  );
});

test("최신 공통분기는 INFO-200을 건너뛰고 양쪽 데이터가 있는 분기를 찾는다", async () => {
  const candidates = recentQuarterCodes(3);
  const targetQuarter = candidates[2];
  const requests = [];

  await withMockFetch(
    (request) => {
      requests.push(request);
      const quarterCode = request.params[0];
      if (quarterCode !== targetQuarter) {
        return noDataResponse();
      }

      return successResponse(request.service, [{}], 1);
    },
    async () => {
      const result = await findLatestCommonSeoulMarketQuarter();
      assert.equal(result.quarterCode, targetQuarter);
      assert.equal(
        requests.filter((request) => request.service === STORES_SERVICE).length,
        1,
      );
    },
  );
});

test("통합 상태는 available, partial, missing을 구분한다", async (context) => {
  async function loadWithMode(mode) {
    const quarterByMode = {
      available: "20254",
      partial: "20253",
      missing: "20252",
    };
    const quarterCode = quarterByMode[mode];

    return withMockFetch(
      (request) => {
        if (mode === "missing") {
          return noDataResponse();
        }
        if (request.service === SALES_SERVICE) {
          return successResponse(SALES_SERVICE, [
            salesRow({ STDR_YYQU_CD: quarterCode }),
          ]);
        }
        return successResponse(
          STORES_SERVICE,
          mode === "partial"
            ? []
            : [storesRow({ STDR_YYQU_CD: quarterCode })],
          mode === "partial" ? 0 : 1,
        );
      },
      () =>
        getBakeryOfficialMarketData({
          marketCode: TEST_MARKET_CODE,
          quarterCode,
        }),
    );
  }

  await context.test("available", async () => {
    assert.equal((await loadWithMode("available")).dataStatus, "available");
  });
  await context.test("partial", async () => {
    assert.equal((await loadWithMode("partial")).dataStatus, "partial");
  });
  await context.test("missing", async () => {
    const result = await loadWithMode("missing");
    assert.equal(result.dataStatus, "missing");
    assert.deepEqual(result.sales, []);
    assert.deepEqual(result.stores, []);
  });
});

test("실패한 SALES 분기 응답은 캐시하지 않는다", async () => {
  const quarterCode = "20244";
  let requestCount = 0;

  await withMockFetch(
    (request) => {
      requestCount += 1;
      if (requestCount === 1) {
        return noDataResponse();
      }
      return successResponse(SALES_SERVICE, [
        salesRow({ STDR_YYQU_CD: quarterCode }),
      ]);
    },
    async () => {
      await assert.rejects(
        () =>
          fetchBakerySalesForOfficialMarket(TEST_MARKET_CODE, quarterCode),
        (error) => error.apiCode === "INFO-200",
      );

      const observations = await fetchBakerySalesForOfficialMarket(
        TEST_MARKET_CODE,
        quarterCode,
      );
      assert.equal(observations.length, 2);
      assert.equal(requestCount, 2);
    },
  );
});

test("잘못된 공식상권 코드는 네트워크 호출 전에 거부한다", async () => {
  let fetchCalled = false;

  await withMockFetch(
    () => {
      fetchCalled = true;
      throw new Error("호출되면 안 됩니다.");
    },
    async () => {
      await assert.rejects(
        () =>
          getBakeryOfficialMarketData({
            marketCode: "FRAMEONE-MARKET-001",
            quarterCode: TEST_QUARTER_CODE,
          }),
        (error) => error.kind === "validation",
      );
      assert.equal(fetchCalled, false);
    },
  );
});
