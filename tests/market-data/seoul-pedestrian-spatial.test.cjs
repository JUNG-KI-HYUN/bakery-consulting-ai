/* eslint-disable @typescript-eslint/no-require-imports -- Existing market-data CJS/TypeScript test-loader convention. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { after, test } = require("node:test");
const ts = require("typescript");

const originalLoader = require.extensions[".ts"];
require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  module._compile(output, filename);
};

const originalApiKey = process.env.SEOUL_OPEN_DATA_API_KEY;
const originalFetch = global.fetch;
const {
  fetchSeoulCrosswalkPage,
  fetchSeoulPedestrianNetworkPage,
} = require("../../lib/market-data/clients/seoul-pedestrian-spatial.ts");

after(() => {
  if (originalLoader) require.extensions[".ts"] = originalLoader;
  else delete require.extensions[".ts"];
  if (originalApiKey === undefined) delete process.env.SEOUL_OPEN_DATA_API_KEY;
  else process.env.SEOUL_OPEN_DATA_API_KEY = originalApiKey;
  global.fetch = originalFetch;
});

function requestParts(input) {
  const url = new URL(typeof input === "string" ? input : input.url);
  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  return {
    service: segments[2],
    startIndex: Number(segments[3]),
    endIndex: Number(segments[4]),
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

test("서울 보행 공간 API wrapper", async (context) => {
  await context.test("API key가 없으면 네트워크 호출 전에 거부한다", async () => {
    delete process.env.SEOUL_OPEN_DATA_API_KEY;
    let fetchCalled = false;
    global.fetch = async () => {
      fetchCalled = true;
      throw new Error("호출되면 안 됩니다.");
    };

    await assert.rejects(
      () => fetchSeoulPedestrianNetworkPage({ startIndex: 1, endIndex: 5 }),
      (error) => error.kind === "configuration",
    );
    assert.equal(fetchCalled, false);
  });

  await context.test("도보네트워크 정상 응답과 필드를 파싱한다", async () => {
    process.env.SEOUL_OPEN_DATA_API_KEY = "fixture-key-not-for-network";
    global.fetch = async (input) => {
      const request = requestParts(input);
      assert.deepEqual(request, {
        service: "TbTraficWlkNet",
        startIndex: 1,
        endIndex: 5,
      });
      return successResponse(request.service, [{
        NODE_TYPE: "노드",
        NODE_WKT: "POINT (1 2)",
        NODE_ID: 1001,
        NODE_TYPE_CD: "A",
        LNKG_WKT: "LINESTRING (1 2, 3 4)",
        LNKG_ID: 2001,
        LNKG_TYPE_CD: "B",
        BGNG_LNKG_ID: 2000,
        END_LNKG_ID: 2002,
        LNKG_LEN: "12.5",
        SGG_CD: "11000",
        SGG_NM: "예시구",
        EMD_CD: "11000101",
        EMD_NM: "예시동",
        EXPN_CAR_RD: "N",
        SBWY_NTW: "Y",
        BRG: "N",
        TNL: "N",
        OVRP: "N",
        CRSWK: "Y",
        PARK: "N",
        BLDG: "Y",
        WORK_DTTM: "20200101000000",
      }], 491082);
    };

    const page = await fetchSeoulPedestrianNetworkPage({
      startIndex: 1,
      endIndex: 5,
    });
    assert.equal(page.totalCount, 491082);
    assert.equal(page.source, "Seoul Open Data Plaza");
    assert.equal(page.sourceBasis, "2020 기준");
    assert.ok(Number.isFinite(Date.parse(page.fetchedAt)));
    assert.deepEqual(
      {
        nodeWkt: page.rows[0].nodeWkt,
        linkWkt: page.rows[0].linkWkt,
        nodeId: page.rows[0].nodeId,
        linkId: page.rows[0].linkId,
        linkLength: page.rows[0].linkLength,
        districtName: page.rows[0].districtName,
        administrativeDongName: page.rows[0].administrativeDongName,
        crosswalk: page.rows[0].crosswalk,
      },
      {
        nodeWkt: "POINT (1 2)",
        linkWkt: "LINESTRING (1 2, 3 4)",
        nodeId: "1001",
        linkId: "2001",
        linkLength: 12.5,
        districtName: "예시구",
        administrativeDongName: "예시동",
        crosswalk: "Y",
      },
    );
  });

  await context.test("횡단보도 응답의 빈 WKT와 행정 필드를 안전하게 파싱한다", async () => {
    global.fetch = async (input) => {
      const request = requestParts(input);
      assert.equal(request.service, "tbTraficCrsng");
      return successResponse(request.service, [{
        NODE_TYPE: "횡단보도",
        NODE_WKT: "POINT (5 6)",
        NODE_ID: 3001,
        NODE_TYPE_CD: "C",
        LNKG_WKT: "",
        LNKG_ID: null,
        LNKG_TYPE_CD: "",
        BGNG_LNKG_ID: null,
        END_LNKG_ID: null,
        LNKG_LEN: "",
        SGG_CD: "11000",
        SGG_NM: "예시구",
        EMD_CD: "11000101",
        EMD_NM: "예시동",
      }], 31080);
    };

    const page = await fetchSeoulCrosswalkPage({ startIndex: 1001, endIndex: 2000 });
    assert.equal(page.startIndex, 1001);
    assert.equal(page.endIndex, 2000);
    assert.equal(page.totalCount, 31080);
    assert.equal(page.rows[0].nodeWkt, "POINT (5 6)");
    assert.equal(page.rows[0].linkWkt, null);
    assert.equal(page.rows[0].linkId, null);
    assert.equal(page.rows[0].linkLength, null);
    assert.equal(page.rows[0].districtCode, "11000");
    assert.equal(page.rows[0].administrativeDongCode, "11000101");
  });

  await context.test("RESULT.CODE 오류를 API 오류로 전달한다", async () => {
    global.fetch = async () => Response.json({
      RESULT: { CODE: "ERROR-500", MESSAGE: "fixture failure" },
    });

    await assert.rejects(
      () => fetchSeoulCrosswalkPage({ startIndex: 1, endIndex: 5 }),
      (error) => error.kind === "api" && error.apiCode === "ERROR-500",
    );
  });

  await context.test("한 요청이 1000건을 초과하면 거부한다", async () => {
    let fetchCalled = false;
    global.fetch = async () => {
      fetchCalled = true;
      throw new Error("호출되면 안 됩니다.");
    };

    await assert.rejects(
      () => fetchSeoulPedestrianNetworkPage({ startIndex: 1, endIndex: 1001 }),
      (error) => error.kind === "validation",
    );
    assert.equal(fetchCalled, false);
  });
});
