# MARKET ANALYSIS SCHEMA

**스키마 제안 버전:** `2.0.0-draft`
**기준일:** 2026-08-27

## 1. 상태체계 결정

단일 `verification_status` 대신 아래 3축을 사용한다.

```ts
type GeometryAvailability = 'none' | 'point' | 'polygon' | 'multipolygon';
type VerificationStage = 'text_only' | 'candidate' | 'verified_point' | 'verified_geometry';
type ReviewStatus = 'not_reviewed' | 'in_review' | 'approved' | 'rejected' | 'stale';
type Confidence = 'A' | 'B' | 'C' | 'D' | 'E';
```

이유: `verified_reference`는 공식 참조 geometry가 검증된 것과 FRAMEONE 경계가 검증된 것을 혼동시킨다. 공식 참조는 `SpatialReference`와 Crosswalk에서 별도로 표현한다.

## 2. 핵심 엔터티

```ts
interface SpatialEntity {
  entity_id: string;
  entity_type: 'market' | 'submarket' | 'node';
  name: string;
  district_code: string;
  geometry_type: 'Point' | 'Polygon' | 'MultiPolygon' | null;
  geometry: GeoJSON.Geometry | null;
  representative_point: GeoJSON.Point | null;
  coordinate_system: 'EPSG:4326' | null;
  geometry_availability: GeometryAvailability;
  verification_stage: VerificationStage;
  review_status: ReviewStatus;
  confidence: Confidence;
  source_ids: string[];
  source_version: string | null;
  source_date: string | null;
  verified_date: string | null;
  verified_by: string | null;
  boundary_method: string | null;
  note: string | null;
}

interface NodeV2 {
  node_id: string;
  node_name: string;
  parent_submarket_id: string;
  node_role: 'store' | 'anchor' | 'station_exit' | 'street_point' | 'pedestrian_gate' | 'barrier' | 'unknown';
  verified_address: string | null;
  road_address: string | null;
  jibun_address: string | null;
  latitude: number | null;
  longitude: number | null;
  geocode_provider: string | null;
  geocode_precision: 'building' | 'parcel' | 'road' | 'place' | 'unknown' | null;
  source_ids: string[];
  verified_date: string | null;
  confidence: Confidence;
  review_status: ReviewStatus;
}

interface SpatialCrosswalk {
  crosswalk_id: string;
  frameone_entity_id: string;
  reference_layer: 'admin_dong' | 'official_market' | 'living_grid';
  reference_id: string;
  relation_type: 'contained' | 'contains' | 'partial_overlap' | 'adjacent' | 'manual_review';
  overlap_area_m2: number | null;
  frameone_overlap_ratio: number | null;
  reference_overlap_ratio: number | null;
  geometry_version_left: string;
  geometry_version_right: string;
  computed_at: string | null;
  review_status: ReviewStatus;
  confidence: Confidence;
  source_ids: string[];
}
```

## 3. Submarket 공간화 필드

| 필드 | 설명 |
|---|---|
| parent_market_id | 확정 Market ID |
| anchor_ids | 역·학교·공원·시장·업무시설 등 검증 앵커 |
| station_exit_ids | 출구 단위 접근점 |
| street_ids | 주요 도로/골목 참조 |
| block_ids | 도로로 둘러싸인 검토 블록 |
| official_area_codes | 공식상권 후보 코드, 확정치 아님 |
| admin_dong_codes | 행정동 후보/중첩 결과 |
| boundary_basis | 경계 설정 근거 |
| exclusion_basis | 제외 블록·장벽 근거 |
| field_check_items | 현장 확인 목록 |

## 4. 지표 스키마

```ts
interface MetricObservation {
  observation_id: string;
  entity_id: string;
  metric_code: string;
  value: number | null;
  lower_bound: number | null;
  upper_bound: number | null;
  unit: string;
  base_date: string | null;
  base_quarter: string | null;
  retrieved_at: string;
  spatial_unit: string;
  source_id: string;
  source_version: string;
  aggregation_method: 'direct' | 'pip_count' | 'area_weighted' | 'population_weighted' | 'estimated' | 'manual';
  confidence: Confidence;
  fact_status: 'official_confirmed' | 'frameone_analysis' | 'field_check_required' | 'stale' | 'not_collected';
}
```

## 5. 주소 자동매칭 결과

```ts
interface StoreSpatialMatch {
  store_id: string;
  normalized_address: string;
  point: GeoJSON.Point;
  geocode_precision: string;
  admin_dong_id: string | null;
  official_market_ids: string[];
  living_grid_ids: string[];
  node_candidates: MatchCandidate[];
  submarket_candidates: MatchCandidate[];
  market_candidates: MatchCandidate[];
  auto_match_status: 'matched' | 'ambiguous' | 'outside' | 'review_required';
  review_reasons: string[];
  matched_at: string;
  geometry_versions: Record<string, string>;
}
```

## 6. 무결성 규칙

- `geometry=null`이면 `geometry_availability='none'`이어야 한다.
- `verified_geometry`는 Polygon/MultiPolygon, source, verified_date, approved reviewer가 모두 있어야 한다.
- EPSG:5181/5179 원천은 변환 로그 없이 EPSG:4326 결과로 배포할 수 없다.
- `manual_review` Crosswalk는 자동 지표집계에서 제외한다.
- 수치 0과 미수집 null을 구분한다.
- 모든 수치는 source_id, source_version, 기준시점, spatial_unit을 필수로 가진다.
- 공식상권 코드 체계/geometry 버전이 다르면 join을 거부한다.
- Market ID는 v1.1 freeze를 유지하며 새 ID를 임의 생성하지 않는다.
