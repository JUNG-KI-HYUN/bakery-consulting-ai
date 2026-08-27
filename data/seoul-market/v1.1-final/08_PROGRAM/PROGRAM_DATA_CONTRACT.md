# PROGRAM DATA CONTRACT

스키마 버전 `1.1.0`. 프로그램 내부 JSON, TypeScript 인터페이스와 API Response는 `camelCase`를 사용한다. 미수집은 `null`, 실제 0만 `0`이다. 모든 metric은 `sourceId`·기준시점·공간단위가 필수다.

```ts
type DataStatus =
  | 'official_confirmed'
  | 'frameone_analysis'
  | 'field_check_required'
  | 'stale'
  | 'not_collected';

type GeometryStatus = 'text_only' | 'draft' | 'validated';
type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

interface MarketHierarchy {
  schemaVersion: string;
  checkedAt: string;
  city: string;
  districts: District[];
}

interface District {
  districtId: string;
  name: string;
  markets: Market[];
}

interface Market {
  marketId: string;
  name: string;
  gu: string;
  bakeryMarketImportance: Grade;
  researchPriority: Grade;
  geometryStatus: GeometryStatus;
  submarkets: Submarket[];
}

interface Submarket {
  parentMarketId: string;
  submarketId: string;
  name: string;
  administrativeDong: string[] | null;
  nodes: Node[];
  status: GeometryStatus;
}

interface Node {
  nodeId: string;
  parentSubmarketId: string;
  type: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceId: string | null;
}

interface Source {
  sourceId: string;
  title: string;
  url: string;
  baseDate: string | null;
  retrievedAt: string;
  license: string | null;
}

interface MarketMetric {
  entityId: string;
  metricCode: string;
  value: number | null;
  unit: string;
  baseDate: string | null;
  baseQuarter: string | null;
  retrievedAt: string;
  spatialUnit: string;
  sourceId: string;
  confidence: string;
  status: DataStatus;
}

interface FieldSurvey {
  surveyId: string;
  entityId: string;
  surveyDate: string;
  surveyor: string;
  weekdayType: string;
  timeBand: string;
  observations: Record<string, unknown>;
}

interface OfficialMarketCrosswalk {
  marketId: string;
  officialAreaCode: string;
  relationType: 'contained' | 'contains' | 'partial_overlap' | 'adjacent' | 'manual_review';
  overlapAreaM2: number | null;
  marketOverlapRatio: number | null;
  officialOverlapRatio: number | null;
  geometryVersion: string;
  confidence: string;
}
```

프론트엔드는 `MARKET_HIERARCHY.json`을 Tree 원천으로 바로 읽고, geometry는 ID로 별도 GeoJSON과 결합한다. `manual_review` Crosswalk를 확정 매핑처럼 사용하지 않는다. 외부 원본과 CSV의 `snake_case` 필드는 프로그램 진입 시 Adapter/Normalizer에서 `camelCase`로 변환한다.
