import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

interface CsvRecord {
  [key: string]: string;
}

interface MarketHierarchyFile {
  districts: Array<{
    markets: Array<{ marketId: string }>;
  }>;
}

interface CrosswalkData {
  marketIds: Set<string>;
  officialMarketRows: CsvRecord[];
  administrativeDongRows: CsvRecord[];
}

let crosswalkDataPromise: Promise<CrosswalkData> | null = null;

function parseCsv(text: string): CsvRecord[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === "," && !quoted) {
      row.push(field);
      field = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      row.push(field);
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += character;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [rawHeaders, ...dataRows] = rows;
  if (!rawHeaders) {
    return [];
  }
  const headers = rawHeaders.map((header) => header.replace(/^\uFEFF/, ""));

  return dataRows.map((values) =>
    Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""]),
    ),
  );
}

async function loadCrosswalkData() {
  if (crosswalkDataPromise) {
    return crosswalkDataPromise;
  }

  const dataRoot = path.join(
    process.cwd(),
    "data",
    "seoul-market",
    "v1.1-final",
  );

  crosswalkDataPromise = Promise.all([
    readFile(path.join(dataRoot, "MARKET_HIERARCHY.json"), "utf8"),
    readFile(
      path.join(dataRoot, "09_GEO", "MARKET_OFFICIAL_CROSSWALK.csv"),
      "utf8",
    ),
    readFile(
      path.join(dataRoot, "09_GEO", "MARKET_ADMIN_DONG_CROSSWALK.csv"),
      "utf8",
    ),
  ]).then(([hierarchyText, officialText, administrativeDongText]) => {
    const hierarchy = JSON.parse(hierarchyText) as MarketHierarchyFile;
    const officialMarketRows = parseCsv(officialText);
    const administrativeDongRows = parseCsv(administrativeDongText);

    if (
      officialMarketRows.some((row) => row.relation_type !== "manual_review") ||
      administrativeDongRows.some(
        (row) => row.relation_type !== "manual_review",
      )
    ) {
      throw new Error("승인되지 않은 Crosswalk 관계 유형이 포함되어 있습니다.");
    }

    return {
      marketIds: new Set(
        hierarchy.districts.flatMap((district) =>
          district.markets.map((market) => market.marketId),
        ),
      ),
      officialMarketRows,
      administrativeDongRows,
    };
  });

  crosswalkDataPromise.catch(() => {
    crosswalkDataPromise = null;
  });
  return crosswalkDataPromise;
}

export async function GET(request: Request) {
  const marketId = new URL(request.url).searchParams.get("marketId")?.trim();
  if (!marketId) {
    return Response.json({ message: "Market ID가 필요합니다." }, { status: 400 });
  }

  try {
    const data = await loadCrosswalkData();
    if (!data.marketIds.has(marketId)) {
      return Response.json(
        { message: "canonical hierarchy에 없는 Market ID입니다." },
        { status: 404 },
      );
    }

    const officialMarketCandidates = data.officialMarketRows
      .filter((row) => row.market_id === marketId)
      .map((row) => ({
        referenceId: row.official_area_code,
        referenceName: row.official_area_name || null,
        referenceType: row.official_area_type || null,
        relationType: row.relation_type,
        confidence: row.confidence || null,
        sourceId: row.source_id || null,
        geometryVersion: row.geometry_version || null,
        sourceDate: row.checked_at || null,
        matchBasis: row.match_basis || null,
        spatialOverlapValidated:
          Boolean(row.overlap_area_m2) &&
          Boolean(row.market_overlap_ratio) &&
          Boolean(row.official_overlap_ratio),
      }));

    const administrativeDongCandidates = data.administrativeDongRows
      .filter((row) => row.market_id === marketId)
      .map((row) => ({
        referenceId: row.adm_cd,
        referenceName: row.adm_nm || null,
        referenceType: null,
        relationType: row.relation_type,
        confidence: row.confidence || null,
        sourceId: row.source_id || null,
        geometryVersion: row.geometry_version || null,
        sourceDate: null,
        matchBasis: null,
        spatialOverlapValidated: Boolean(row.overlap_ratio),
      }));

    return Response.json(
      {
        marketId,
        verificationStatus: "candidate",
        manualReviewRequired: true,
        officialMarketCandidates,
        administrativeDongCandidates,
        livingGridCandidates: [],
      },
      {
        headers: {
          "Cache-Control": "private, max-age=300",
        },
      },
    );
  } catch (error) {
    console.error(`[market-crosswalk:${marketId}] 로딩 실패`, error);
    return Response.json(
      { message: "Crosswalk 후보를 안전하게 불러올 수 없습니다." },
      { status: 422 },
    );
  }
}
