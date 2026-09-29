import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ActiveAnalysisTarget } from "./basic-location/run";
import { resolveActiveTargetOfficialReference } from "./active-official-reference";
import type { OfficialMarketSpatialInput } from "./official-market-spatial-relation";

interface OfficialFeatureCollection {
  features?: Array<{
    geometry?: unknown;
    properties?: {
      official_area_code?: unknown;
      official_area_name?: unknown;
      status?: unknown;
      output_crs?: unknown;
    };
  }>;
}

let officialInputsPromise: Promise<OfficialMarketSpatialInput[]> | null = null;

function loadOfficialInputs() {
  if (officialInputsPromise) return officialInputsPromise;
  const sourcePath = path.join(
    process.cwd(),
    "data",
    "seoul-market",
    "v1.1-final",
    "09_GEO",
    "OFFICIAL_SEOUL_MARKETS.geojson",
  );
  officialInputsPromise = readFile(sourcePath, "utf8").then((text) => {
    const collection = JSON.parse(text) as OfficialFeatureCollection;
    return (collection.features ?? []).flatMap((feature) => {
      const code = feature.properties?.official_area_code;
      const name = feature.properties?.official_area_name;
      if (
        typeof code !== "string" ||
        !/^\d+$/.test(code) ||
        typeof name !== "string" ||
        !name.trim() ||
        feature.properties?.status !== "validated" ||
        feature.properties?.output_crs !== "EPSG:4326" ||
        !feature.geometry
      ) {
        return [];
      }
      return [{ marketCode: code, marketName: name.trim(), geometry: feature.geometry }];
    });
  });
  officialInputsPromise.catch(() => {
    officialInputsPromise = null;
  });
  return officialInputsPromise;
}

/** URL references are hints only. Name and spatial relation always come from
 * the validated official Polygon and the current Active Target coordinates. */
export async function revalidateActiveTargetOfficialReference(
  target: ActiveAnalysisTarget | null,
): Promise<ActiveAnalysisTarget | null> {
  if (!target) return null;
  return resolveActiveTargetOfficialReference(target, await loadOfficialInputs());
}
