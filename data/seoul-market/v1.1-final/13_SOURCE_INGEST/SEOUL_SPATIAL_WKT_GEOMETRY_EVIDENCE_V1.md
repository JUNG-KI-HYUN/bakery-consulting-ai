# Seoul Spatial WKT Processing & Geometry Evidence V1 Design

## 1. 목적과 범위

이 문서는 READY 상태의 서울 보행 네트워크 및 횡단보도 Full Snapshot을 읽기 전용으로 조사한 결과를 바탕으로 WKT Processing V1과 Geometry Evidence 흐름을 설계한다.

- 기준 branch: `codex-night-20260901`
- 기준 HEAD: `93e36af chore: verify seoul spatial source metadata`
- 조사 방식: current pointer가 가리키는 normalized 자치구별 NDJSON 전체 streaming 집계와 raw page 전체 field 분포 확인
- 구현하지 않은 것: WKT parser, geometry 객체, GeoJSON, Polygon, 공간 Join, DB, UI
- 원천 기준: 두 source 모두 `2020 기준`, CRS metadata `WGS84`

서울 공식 WKT는 FRAMEONE Market/Submarket/Node geometry가 아니라 **공식 spatial evidence source**다.

## 2. Full Snapshot 요약

| dataset | source ID | current snapshot | rows | districts | UNKNOWN | manifest |
|---|---|---:|---:|---:|---:|---|
| pedestrian | `SRC-SEOUL-PEDESTRIAN-NETWORK` | `20260910T100447965Z-f5bfef05` | 491,082 | 25 | 0 | READY |
| crosswalk | `SRC-SEOUL-CROSSWALK` | `20260910T100404709Z-a7d15edd` | 31,080 | 25 | 0 | READY |

두 snapshot 모두 raw/normalized checksum, pagination, total count, stored count, district sum 검증을 통과했고 parsing failure 및 exact record duplicate는 0이다.

## 3. Record Semantics

WKT의 null 여부와 raw `NODE_TYPE`을 전체 row에서 교차 확인했다.

| dataset | total | NODE_ONLY | LINK_ONLY | BOTH | NEITHER |
|---|---:|---:|---:|---:|---:|
| pedestrian | 491,082 | 212,066 | 279,016 | 0 | 0 |
| crosswalk | 31,080 | 19,518 | 11,562 | 0 | 0 |

전체 row에서 다음 관계가 정확히 성립한다.

- raw `NODE_TYPE = NODE` ↔ `NODE_WKT`만 존재 ↔ `POINT`
- raw `NODE_TYPE = LINK` ↔ `LNKG_WKT`만 존재 ↔ `LINESTRING`
- NODE row의 `LNKG_WKT` null과 LINK row의 `NODE_WKT` null은 counterpart field의 구조적 비적용이며 실제 geometry 결측이 아니다.
- BOTH와 NEITHER가 모두 0이므로 현재 Full Snapshot에서 primitive 종류는 row마다 명확히 구분된다.

따라서 기존 `node_wkt_missing_count`와 `link_wkt_missing_count`라는 이름은 데이터 오류처럼 오해될 수 있다. 향후에는 counterpart 비적용과 같은 row에서 기대되는 WKT의 실제 결측을 분리해야 한다.

## 4. ID Semantics와 기존 Duplicate Metric

### 4.1 실제 ID 상태

현재 parser의 `optionalText`는 숫자 `0`을 문자열 `"0"`으로 보존한다. 따라서 반대 primitive의 ID는 null/empty가 아니라 sentinel `"0"`으로 normalized된다.

| dataset/type | rows | valid nodeId | nodeId sentinel 0 | valid linkId | linkId sentinel 0 |
|---|---:|---:|---:|---:|---:|
| pedestrian NODE_ONLY | 212,066 | 212,066 | 0 | 0 | 212,066 |
| pedestrian LINK_ONLY | 279,016 | 0 | 279,016 | 279,016 | 0 |
| crosswalk NODE_ONLY | 19,518 | 19,518 | 0 | 0 | 19,518 |
| crosswalk LINK_ONLY | 11,562 | 0 | 11,562 | 11,562 | 0 |

구문상으로는 모든 row의 `nodeId`와 `linkId`가 non-null이지만, 의미상 `"0"`은 해당 primitive에 ID가 없음을 나타내는 counterpart sentinel이다.

### 4.2 유효 ID 중복

| dataset | valid node ID count | unique valid node ID | valid node duplicate occurrences | valid link ID count | unique valid link ID | valid link duplicate occurrences |
|---|---:|---:|---:|---:|---:|---:|
| pedestrian | 212,066 | 212,066 | 0 | 279,016 | 279,016 | 0 |
| crosswalk | 19,518 | 19,518 | 0 | 11,562 | 11,562 | 0 |

기존 validator는 null을 제외하지만 `"0"`은 유효한 문자열로 Set에 넣는다. 그 결과 다음 값은 실제 유효 ID 중복이 아니라 sentinel `"0"`의 반복 횟수다.

- pedestrian `node_id_duplicate_count = 279,015`: LINK row의 `nodeId="0"` 279,016건 중 첫 건을 제외한 수
- pedestrian `link_id_duplicate_count = 212,065`: NODE row의 `linkId="0"` 212,066건 중 첫 건을 제외한 수
- crosswalk `node_id_duplicate_count = 11,561`: LINK row의 `nodeId="0"` 11,562건 중 첫 건을 제외한 수
- crosswalk `link_id_duplicate_count = 19,517`: NODE row의 `linkId="0"` 19,518건 중 첫 건을 제외한 수

### 4.3 향후 metric 정의

validator 수정은 다음 구현 범위에서 별도 수행한다. metric은 적어도 아래처럼 정의한다.

- `node_id_present_count`: null/blank/`"0"`이 아닌 node ID row 수
- `node_id_missing_count`: null/blank/`"0"`인 node ID row 수. `counterpart_not_applicable_count`와 실제 NODE row 결측을 하위 분류한다.
- `unique_valid_node_id_count`: sentinel을 제외한 고유 node ID 수
- `valid_node_id_duplicate_count`: sentinel을 제외한 유효 ID의 첫 출현 이후 반복 수
- `link_id_present_count`, `link_id_missing_count`, `unique_valid_link_id_count`, `valid_link_id_duplicate_count`: 동일 원칙
- `exact_record_duplicate_count`: canonical normalized row 전체가 동일한 반복 수. ID 반복과 분리한다.

raw source value는 원형 보존하되 canonical primitive의 식별자로 `"0"`을 채택하지 않는다.

## 5. WKT Geometry Type Profile

전체 normalized snapshot을 prefix 및 숫자 pair 구조로 검사했다. 이는 geometry 생성이나 공간연산이 아니라 parser 구현 전 구조 프로필이다.

### 5.1 Pedestrian

| field | type | count | vertices | X range | Y range | decimal precision |
|---|---|---:|---:|---:|---:|---:|
| `NODE_WKT` | POINT | 212,066 | 항상 1 pair | 126.79591065586087–127.18379640834361 | 37.43053046552525–37.69427014918685 | 2–15 |
| `LNKG_WKT` | LINESTRING | 279,016 | 2–92 | 동일 | 동일 | 2–15 |

- 예상 밖 geometry type: 0
- 단순 구조상 malformed: 0

### 5.2 Crosswalk

| field | type | count | vertices | X range | Y range | decimal precision |
|---|---|---:|---:|---:|---:|---:|
| `NODE_WKT` | POINT | 19,518 | 항상 1 pair | 126.79833262648582–127.18166929749658 | 37.434467095096004–37.69235349866938 | 3–15 |
| `LNKG_WKT` | LINESTRING | 11,562 | 2–14 | 동일 | 동일 | 3–15 |

- 예상 밖 geometry type: 0
- 단순 구조상 malformed: 0

### 5.3 자치구 표본

종로구, 성동구, 마포구, 금천구, 강남구에서 각각 NODE와 LINK sample을 확인했다.

| district | pedestrian NODE/LINK | crosswalk NODE/LINK |
|---|---|---|
| 종로구 | `POINT(126.985754... 37.569562...)` / 3-vertex `LINESTRING` | `POINT(127.000335... 37.586592...)` / 2-vertex `LINESTRING` |
| 성동구 | `POINT(127.029314... 37.568804...)` / 2-vertex `LINESTRING` | `POINT(127.037938... 37.561159...)` / 2-vertex `LINESTRING` |
| 마포구 | `POINT(126.933874... 37.553551...)` / 2-vertex `LINESTRING` | `POINT(126.934836... 37.549009...)` / 2-vertex `LINESTRING` |
| 금천구 | `POINT(126.901646... 37.456960...)` / 2-vertex `LINESTRING` | `POINT(126.883373... 37.476692...)` / 2-vertex `LINESTRING` |
| 강남구 | `POINT(127.054867... 37.484444...)` / 2-vertex `LINESTRING` | `POINT(127.055773... 37.489357...)` / 2-vertex `LINESTRING` |

## 6. Coordinate Order

- 판단: WKT는 `X=longitude`, `Y=latitude` 순서로 처리 가능하다.
- 근거: 두 Full Snapshot의 모든 숫자 pair에서 X가 약 126.80–127.18, Y가 약 37.43–37.69 범위이며 5개 자치구 NODE/LINK 표본도 같은 순서를 보였다. 공식 CRS metadata는 WGS84다.
- confidence: **HIGH**. parser 구조 검증에는 충분하다.
- 제한: 이 판단은 개별 도로의 현행 위치 정확성이나 2020 이후 변화를 검증한 것이 아니다.

## 7. Invalid / Missing WKT 정의

다음 구현에서는 row type을 먼저 판별한 후 WKT 상태를 평가한다.

1. `COUNTERPART_NOT_APPLICABLE`
   - NODE row의 `LNKG_WKT` 없음 또는 LINK row의 `NODE_WKT` 없음
   - 정상 구조이며 오류·quarantine 대상이 아니다.
2. `EXPECTED_WKT_MISSING`
   - NODE row에서 `NODE_WKT`가 없거나 LINK row에서 `LNKG_WKT`가 없음
   - 현재 Full Snapshot에서는 0건이다.
3. `UNSUPPORTED_WKT_TYPE`
   - NODE row가 POINT가 아니거나 LINK row가 LINESTRING이 아니거나 지원하지 않는 prefix
4. `MALFORMED_WKT`
   - 괄호, 숫자 pair, delimiter, 최소 vertex 구조가 불완전
5. `COORDINATE_RANGE_SUSPICIOUS`
   - 숫자 parse는 되지만 configured 서울 검토 범위를 벗어남. 자동 보정하지 않는다.
6. `PARSE_FAILURE`
   - 안전한 parser가 primitive로 구조화할 수 없음. raw 위치와 원인을 보존한다.

각 상태는 source fact의 상태이며 FRAMEONE geometry status를 변경하지 않는다.

## 8. Canonical Spatial Primitive V1 제안

### 8.1 공통 provenance

- `sourceId`
- `snapshotId`
- `sourceBasis` (`2020 기준`)
- `districtCode`, `districtName`
- `administrativeDongCode`, `administrativeDongName`
- `sourceRowType` (`NODE` 또는 `LINK`)
- `rawPage`, `rawRowIndex` 또는 동등한 재현 가능한 source locator
- `qualityFlags`

### 8.2 SpatialNode

- `kind: "NODE"`
- `nodeId`: sentinel `"0"`을 제외한 source node ID
- `nodeTypeCode`
- `wkt`: 원본 문자열
- `geometryType: "POINT"`
- `coordinates`: parser 성공 시 `[longitude, latitude]`; 이 값은 FRAMEONE Node 좌표가 아니다.
- counterpart `linkId="0"`은 canonical ID로 승격하지 않고 provenance/quality에서만 추적한다.

### 8.3 SpatialLink

- `kind: "LINK"`
- `linkId`: sentinel `"0"`을 제외한 source link ID
- `linkTypeCode`
- `sourceBeginningLinkageId`: `BGNG_LNKG_ID` 원 의미를 확정하기 전 source 명칭을 유지
- `sourceEndLinkageId`: `END_LNKG_ID` 원 의미를 확정하기 전 source 명칭을 유지
- `linkLength`: source value를 number/null로 보존하되 단위는 공식 근거 확인 전 확정하지 않음
- `wkt`: 원본 문자열
- `geometryType: "LINESTRING"`
- `coordinates`: parser 성공 시 ordered longitude/latitude pairs
- counterpart `nodeId="0"`은 canonical ID로 승격하지 않는다.

### 8.4 Crosswalk primitive

별도 POINT 목록으로 단순화하지 않는다. crosswalk source 안의 `SpatialNode`와 `SpatialLink`를 동일 canonical primitive로 처리하고 `sourceId=SRC-SEOUL-CROSSWALK`로 의미를 구분한다. Crosswalk Node/Link를 실제 횡단 가능 지점·연결선으로 활용하는 것은 E1 구조검증 이후 관계 근거를 추가 확인한 E2 단계에서만 가능하다.

V1 primitive는 WKT의 안전한 구조화 결과이며 GeoJSON이나 FRAMEONE geometry가 아니다.

## 9. Node-Link 관계 해석 가능 범위

raw 전체 분포는 다음과 같다.

- NODE_ONLY row: `NODE_ID`는 모두 비제로 존재하고 `LNKG_ID`, `BGNG_LNKG_ID`, `END_LNKG_ID`는 모두 `0` sentinel이다.
- LINK_ONLY row: `LNKG_ID`, `BGNG_LNKG_ID`, `END_LNKG_ID`가 모두 비제로 존재하고 `NODE_ID`는 `0` sentinel이다.
- 유효 `LNKG_ID`는 source별로 모두 고유하다.

LINK row endpoint-like value의 현재 node ID 집합 포함률:

| dataset | LINK rows | beginning value in node set | end value in node set |
|---|---:|---:|---:|
| pedestrian | 279,016 | 277,223 (99.36%) | 276,854 (99.23%) |
| crosswalk | 11,562 | 11,530 (99.72%) | 11,524 (99.67%) |

높은 포함률은 node 관계 후보임을 강하게 시사하지만 100%가 아니며, field 이름만으로 시작/끝 Node ID라고 확정하지 않는다. 미매칭은 자치구 경계, source subset, 누락 node 또는 다른 의미일 수 있다. 따라서 V1은 raw field를 `sourceBeginningLinkageId`/`sourceEndLinkageId`로 보존하고 관계 의미는 **NEEDS_REVIEW**로 둔다.

## 10. Geometry Evidence Model

기존 FRAMEONE terminology인 `text_only`를 유지하고 Evidence 단계와 geometry status를 분리한다.

### E0 — Raw Official Source

- 서울 열린데이터 원문 page와 checksum
- 공식 source URL, provider, CRS, source basis, license가 연결됨
- geometry로 사용하지 않음

### E1 — Parsed Official Primitive

- POINT/LINESTRING 문법, 숫자, coordinate order, source ID와 provenance가 검증됨
- unsupported/malformed/suspicious 상태가 분리됨
- FRAMEONE geometry 또는 공간관계 확정이 아님

### E2 — Spatial Relationship Evidence

- 검증된 primitive 사이의 보행 연결, 횡단 연결, 단절 후보, 연결축 후보
- relation rule/version과 limitation을 보존
- 자동 경계선이 아니라 경계 판단의 한 근거

### E3 — FRAMEONE Candidate Boundary Evidence

- E1/E2 외에 도로, 철도, 하천, 대형시설, 공식상권 참고자료, FRAMEONE Node, 현장지식을 함께 검토한 candidate
- 자동 승격 금지, 검토자와 근거를 연결

### E4 — Human-reviewed Evidence

- 현장 또는 책임자 검토를 거쳐 승인된 evidence
- 승인일, 검토자, source snapshot, limitation을 보존

흐름은 다음과 같다.

```text
Official source (E0)
→ Parsed primitive (E1)
→ Spatial relationship evidence (E2)
→ Candidate boundary evidence (E3)
→ Human review (E4)
→ Verified FRAMEONE geometry
```

E1/E2 도달은 FRAMEONE Submarket을 자동으로 candidate geometry로 만들지 않는다. 현재 Market/Submarket의 `text_only` 상태는 그대로다. 향후 `candidate_geometry`, `verified_geometry` 같은 상태가 필요하더라도 별도 schema 검토 후 도입해야 하며 이번 문서에서 확정하거나 적용하지 않는다.

## 11. 연무장길 Pilot 절차

대상은 기존 hierarchy의 성수권 Market `SEOUL-SEONGDONG-SEONGSU`, Submarket `SEOUL-SEONGDONG-SEONGSU-YEONMUJANG`(연무장길)이다. 실제 경계는 만들지 않는다.

1. 두 current pointer와 READY manifest를 고정해 사용한 snapshot을 기록한다.
2. 491,082 rows 전체가 아니라 성동구 `1120000000.ndjson`만 district loader로 streaming한다.
3. E1 parser로 성동구 pedestrian POINT/LINESTRING과 crosswalk POINT/LINESTRING을 source별 primitive로 분리한다.
4. 기존 FRAMEONE 연무장길 Node와의 관계는 candidate search 범위로만 조회하고 자동 Join하지 않는다.
5. 연무장길과 관련 있다고 판단할 spatial primitive의 선정 근거와 제외 근거를 남긴다.
6. 도보 Link, Node, crosswalk Link/Node를 통해 연결축·단절·횡단 후보를 E2 evidence로 작성한다.
7. 지하철 출입구, 도로 구조, 공식상권 polygon(참고자료만), 현장조사, 주요 출입동선, 필요 시 건물/필지/POI와 교차검토한다.
8. 근거 충돌과 2020 freshness warning을 보존한 채 E3 candidate boundary evidence를 작성한다.
9. 사람이 지도와 현장을 검토하고 E4 승인하기 전에는 FRAMEONE geometry를 만들거나 status를 변경하지 않는다.

보행망 하나 또는 서울 공식상권 polygon 하나로 연무장길 경계를 만들지 않는다.

## 12. 2020 기준 데이터 한계

- `source_basis`는 계속 `2020 기준`이며 `fetched_at`과 구분한다.
- 2026년 수집 snapshot이라는 사실은 데이터 내용이 2026년 최신 또는 실시간임을 의미하지 않는다.
- 도로, 횡단보도, 건물, 보행 동선이 현재 현장과 달라졌을 수 있다.
- E1 parser 결과가 구조적으로 정확해도 현재 상권 경계의 정확성을 보장하지 않는다.
- candidate boundary 단계에서는 현재 지도, 추가 공식자료, FRAMEONE 현장지식과 현장조사를 함께 사용해야 한다.
- 원천의 연도 한계는 폐기 사유가 아니라 evidence limitation과 freshness warning으로 보존한다.

## 13. 처리 성능 원칙

- 서울 전체 491,082 pedestrian rows를 매 요청마다 메모리에 올리지 않는다.
- current manifest가 가리키는 자치구별 NDJSON을 기본 처리 단위로 사용한다.
- 연무장길 Pilot은 성동구 파일만 streaming parse한다.
- 서울 전체 type/count audit처럼 필요한 배치에서만 25개 파일을 순차 streaming한다.
- DB/PostGIS/spatial index는 Pilot 후 실제 공간 질의 성능 문제가 확인될 때 별도 결정한다.

## 14. 다음 구현의 최소 파일 범위

예상 최소 범위이며 구현 시작 전에 다시 확인한다.

- `lib/market-data/spatial/seoul-spatial-wkt.ts` 신규: POINT/LINESTRING의 fail-closed parser와 canonical primitive 타입
- `tests/market-data/seoul-spatial-wkt.test.cjs` 신규: 실제 형식에서 축약한 명시적 fixture로 type, sentinel, malformed, suspicious range 검증
- `lib/market-data/ingestion/seoul-spatial-ingestion.ts` 최소 수정: 기존 duplicate metric에서 `"0"` sentinel을 제외하고 새 ID metric을 계산할 필요가 있을 때만 변경
- source contract, DB, UI, 지도, FRAMEONE hierarchy는 변경하지 않는다.

실제 Full Snapshot 전체를 test fixture로 복사하지 않고, source row를 식별 불가능한 소형 `fixture`로 명시해 사용한다.

## 15. 구현 금지항목

- Polygon 또는 Submarket boundary 자동 생성
- GeoJSON 자동 출력
- 서울 공식 primitive를 FRAMEONE geometry로 명명 또는 승격
- geometry Join 및 nearest/containment 결과 자동 확정
- `BGNG_LNKG_ID`/`END_LNKG_ID`를 근거 없이 begin/end Node ID로 확정
- sentinel `"0"`을 유효 ID로 사용
- malformed/suspicious 좌표 자동 보정
- 2020 source를 최신·실시간 데이터로 표현
- DB/PostGIS/Supabase spatial, UI, 지도 layer 추가

## 16. 완료 기준과 구현 판정

WKT Processing V1 구현의 완료 기준은 다음과 같다.

- NODE/LINK row type을 raw `NODE_TYPE`과 expected WKT field로 fail-closed 분류한다.
- NODE는 POINT 1 pair, LINK는 LINESTRING 최소 2 vertices로 구조 검증한다.
- coordinate order를 longitude/latitude로 명시하고 비정상 범위를 flag로 남긴다.
- counterpart 비적용과 expected WKT missing을 구분한다.
- null/blank/`"0"` sentinel을 유효 ID에서 제외한다.
- raw WKT, source ID, snapshot ID, source basis, district, source locator를 보존한다.
- Crosswalk를 POINT 목록으로 단순화하지 않고 NODE/LINK primitive를 모두 보존한다.
- relation field 의미가 미확정임을 유지하고 미매칭 endpoint-like ID를 버리지 않는다.
- output은 E1 primitive이며 FRAMEONE geometry status를 변경하지 않는다.
- district 단위 streaming 처리와 deterministic test가 통과한다.

**판정: CONDITIONAL**

POINT/LINESTRING 구조, coordinate order, NODE/LINK row semantics 및 sentinel 문제는 안전한 parser 구현에 충분히 확인됐다. 다만 `BGNG_LNKG_ID`/`END_LNKG_ID`의 공식 관계 의미와 일부 node 집합 미매칭 원인은 미확정이므로 relationship resolution은 parser와 분리해 NEEDS_REVIEW로 유지한다. 이 조건은 WKT parser와 canonical primitive 구현 자체를 차단하지 않는다.
