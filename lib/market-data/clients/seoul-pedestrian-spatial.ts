import {
  requestSeoulOpenDataPage,
  type SeoulOpenDataPage,
  type SeoulOpenDataRow,
} from "./seoul-open-data";

const SEOUL_PEDESTRIAN_NETWORK_SERVICE = "TbTraficWlkNet";
const SEOUL_CROSSWALK_SERVICE = "tbTraficCrsng";

export const SEOUL_PEDESTRIAN_SPATIAL_SOURCE = {
  source: "Seoul Open Data Plaza",
  sourceBasis: "2020 기준",
} as const;

export interface SeoulPedestrianSpatialRequest {
  startIndex: number;
  endIndex: number;
  signal?: AbortSignal;
}

interface SeoulPedestrianBaseRow {
  nodeType: string | null;
  nodeWkt: string | null;
  nodeId: string | null;
  nodeTypeCode: string | null;
  linkWkt: string | null;
  linkId: string | null;
  linkTypeCode: string | null;
  beginningLinkId: string | null;
  endLinkId: string | null;
  linkLength: number | null;
  districtCode: string | null;
  districtName: string | null;
  administrativeDongCode: string | null;
  administrativeDongName: string | null;
}

export interface SeoulPedestrianNetworkRow extends SeoulPedestrianBaseRow {
  expandedCarRoad: string | null;
  subwayNetwork: string | null;
  bridge: string | null;
  tunnel: string | null;
  overpass: string | null;
  crosswalk: string | null;
  park: string | null;
  building: string | null;
  workDateTime: string | null;
}

export type SeoulCrosswalkRow = SeoulPedestrianBaseRow;

export interface SeoulPedestrianSpatialPage<Row> {
  service: string;
  startIndex: number;
  endIndex: number;
  totalCount: number | null;
  rows: Row[];
  source: typeof SEOUL_PEDESTRIAN_SPATIAL_SOURCE.source;
  sourceBasis: typeof SEOUL_PEDESTRIAN_SPATIAL_SOURCE.sourceBasis;
  fetchedAt: string;
}

function optionalText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBaseRow(row: SeoulOpenDataRow): SeoulPedestrianBaseRow {
  return {
    nodeType: optionalText(row.NODE_TYPE),
    nodeWkt: optionalText(row.NODE_WKT),
    nodeId: optionalText(row.NODE_ID),
    nodeTypeCode: optionalText(row.NODE_TYPE_CD),
    linkWkt: optionalText(row.LNKG_WKT),
    linkId: optionalText(row.LNKG_ID),
    linkTypeCode: optionalText(row.LNKG_TYPE_CD),
    beginningLinkId: optionalText(row.BGNG_LNKG_ID),
    endLinkId: optionalText(row.END_LNKG_ID),
    linkLength: optionalNumber(row.LNKG_LEN),
    districtCode: optionalText(row.SGG_CD),
    districtName: optionalText(row.SGG_NM),
    administrativeDongCode: optionalText(row.EMD_CD),
    administrativeDongName: optionalText(row.EMD_NM),
  };
}

export function parseSeoulPedestrianNetworkRow(
  row: SeoulOpenDataRow,
): SeoulPedestrianNetworkRow {
  return {
    ...parseBaseRow(row),
    expandedCarRoad: optionalText(row.EXPN_CAR_RD),
    subwayNetwork: optionalText(row.SBWY_NTW),
    bridge: optionalText(row.BRG),
    tunnel: optionalText(row.TNL),
    overpass: optionalText(row.OVRP),
    crosswalk: optionalText(row.CRSWK),
    park: optionalText(row.PARK),
    building: optionalText(row.BLDG),
    workDateTime: optionalText(row.WORK_DTTM),
  };
}

export function parseSeoulCrosswalkRow(
  row: SeoulOpenDataRow,
): SeoulCrosswalkRow {
  return parseBaseRow(row);
}

function toSpatialPage<Row>(
  page: SeoulOpenDataPage,
  rows: Row[],
): SeoulPedestrianSpatialPage<Row> {
  return {
    service: page.service,
    startIndex: page.start,
    endIndex: page.end,
    totalCount: page.totalCount,
    rows,
    ...SEOUL_PEDESTRIAN_SPATIAL_SOURCE,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchSeoulPedestrianNetworkPage({
  startIndex,
  endIndex,
  signal,
}: SeoulPedestrianSpatialRequest): Promise<
  SeoulPedestrianSpatialPage<SeoulPedestrianNetworkRow>
> {
  const page = await requestSeoulOpenDataPage({
    service: SEOUL_PEDESTRIAN_NETWORK_SERVICE,
    start: startIndex,
    end: endIndex,
    signal,
  });

  return toSpatialPage(page, page.rows.map(parseSeoulPedestrianNetworkRow));
}

export async function fetchSeoulCrosswalkPage({
  startIndex,
  endIndex,
  signal,
}: SeoulPedestrianSpatialRequest): Promise<
  SeoulPedestrianSpatialPage<SeoulCrosswalkRow>
> {
  const page = await requestSeoulOpenDataPage({
    service: SEOUL_CROSSWALK_SERVICE,
    start: startIndex,
    end: endIndex,
    signal,
  });

  return toSpatialPage(page, page.rows.map(parseSeoulCrosswalkRow));
}
