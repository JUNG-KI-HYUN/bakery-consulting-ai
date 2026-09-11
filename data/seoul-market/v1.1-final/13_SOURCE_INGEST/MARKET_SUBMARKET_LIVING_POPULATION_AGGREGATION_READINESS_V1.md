# Market/Submarket Living Population Aggregation Readiness V1

검토일: 2026-09-11

기준 Repository HEAD: `bc96b63 feat: publish validated living population current snapshot`

대상 Source: `SRC-SEOUL-LIVING` / `Se250MSpopLocalResd`

Reference YMD: `20260906`

## 1. 결론

**최종 판정: `BLOCKED`**

서울 250m 생활인구 Source Current와 공식 Grid geometry의 입력 호환성은 `READY`다. 그러나 FRAMEONE Market 156개와 Submarket 382개에는 검증된 Polygon, 검증된 Point, 완성된 Grid Crosswalk가 하나도 없다. 따라서 현재 Repository 상태로는 생활인구를 FRAMEONE Market/Submarket 수치로 집계하거나 게시할 수 없다.

이 판정은 Source 자체의 실패를 뜻하지 않는다.

- Source Current: 존재, `SOURCE_CURRENT_ONLY`, `spatial_aggregation_ready=false`
- Source snapshot: `READY`, 253,346행, metric CELL_ID 8,559개
- 공식 Grid geometry: `READY`, Polygon 10,125개
- Reconciliation: BOTH 8,558 / METRIC_ONLY 1 / GEOMETRY_ONLY 1,567
- FRAMEONE target geometry: Market 0 / Submarket 0 / Node point 0
- `MARKET_LIVING_GRID_CROSSWALK.csv`: 데이터 행 0

즉, **Grid까지의 준비는 완료됐지만 Grid에서 FRAMEONE 경계로 넘어가는 공간근거가 없다.**

## 2. 범위와 비범위

이번 문서는 다음만 설계·검증한다.

- 현재 FRAMEONE Market/Submarket/Node 공간정보 수준
- 향후 공통 공간집계 방식과 안전 gate
- 250m Grid 경계셀·중복·missing 처리
- 단일 날짜 snapshot에서 표현 가능한 지표 범위
- 서울 전체 공통 구조와 향후 Pilot 검증 방식

이번 작업에서 하지 않은 것:

- 서울 전체 또는 일부 지역 생활인구 집계
- Market/Submarket/Node geometry 생성 또는 승격
- Grid Crosswalk 생성
- 상권 점수 생성
- API 호출, ingestion, dependency 추가, 코드 구현

## 3. 확인 근거

| 근거 | Repository 확인 결과 |
|---|---|
| `MARKET_HIERARCHY.json` | District 25 / Market 156 / Submarket 382 / Node 763 |
| `FRAMEONE_MARKETS.geojson` | 156 features, 전부 `geometry=null`, `status=text_only` |
| `FRAMEONE_SUBMARKETS.geojson` | 382 features, 전부 `geometry=null`, `status=text_only` |
| `NODES.geojson` | 763 features, 전부 `geometry=null`; latitude/longitude 전건 null; `status=text_only` |
| `MARKET_LIVING_GRID_CROSSWALK.csv` | header만 존재, 관계 행 0 |
| `MARKET_OFFICIAL_CROSSWALK.csv` | 863행, Market 156개 포함, 전부 `manual_review`, confidence C/D |
| `MARKET_ADMIN_DONG_CROSSWALK.csv` | 458행, Market 156개 포함, 전부 `manual_review`, confidence C/D |
| `LIVING_GRID_250M.geojson` | Polygon 10,125개, 공식 SHP/viewer와 CELL_ID 및 주요 속성 전건 일치 |
| Source Current pointer | `SOURCE_CURRENT_ONLY`; `spatial_aggregation_ready=false` |
| Publication decision | Source current 게시만 허용; Market/Submarket 집계는 허용하지 않음 |

`CURRENT_STATUS.md`의 HEAD `d595b51`보다 실제 Repository HEAD `bc96b63`이 최신이므로, current publication 및 공식 geometry 검증 결과는 Repository를 우선했다.

## 4. 현재 FRAMEONE 공간정보 상태

### Market

- 보유 수준: **text only + candidate relation**
- Polygon: 0/156
- Point: 확인된 Market 대표점 없음
- 공식상권 후보: 863건, 156 Market 전체, 전부 `manual_review`, confidence C/D
- 행정동 후보: 458건, 156 Market 전체, 전부 `manual_review`, confidence C/D
- 생활인구 Grid 관계: 0건
- 현재 집계 readiness: **BLOCKED 156 / READY 0 / CONDITIONAL 0**

후보 관계는 경계 검토를 시작할 evidence이지, 집계 boundary가 아니다. 이름 후보 또는 참조 geometry가 존재한다는 이유로 Market 생활인구를 계산할 수 없다.

### Submarket

- 보유 수준: **text only + text node evidence**
- Polygon: 0/382
- Point: 확인된 Submarket 대표점 없음
- 공식상권/행정동 관계: Submarket 단위 확정 관계 없음
- 생활인구 Grid 관계: 0건
- 현재 집계 readiness: **BLOCKED 382 / READY 0 / CONDITIONAL 0**

Submarket의 거리·역·앵커 텍스트는 범위 검토에 유용하지만 공간 포함관계를 계산할 수 없다.

### Node

- 보유 수준: **text only**
- 763개 모두 이름과 유형은 있으나 주소·위도·경도·geometry가 미확인
- 좌표 신뢰도: 판정할 좌표 자체가 없으므로 `UNKNOWN`
- 현재 공간집계 입력 readiness: **BLOCKED 763**

Node 텍스트를 지오코딩한 것으로 가정하거나 임의 좌표를 부여하지 않는다.

## 5. Aggregation 방법 후보 비교

| 방식 | 장점 | 주요 위험 | 현재 사용 가능 여부 | FRAMEONE 정의 왜곡 가능성 |
|---|---|---|---|---|
| A. Verified Polygon 기반 | FRAMEONE이 승인한 범위에 직접 Grid를 연결할 수 있고 재현성이 높음 | 경계 버전·중첩·경계셀 정책이 없으면 중복 또는 시점 불일치 발생 | **불가**: verified Market/Submarket Polygon 0 | 낮음. 단, 승인·버전·출처가 모두 보존될 때만 |
| B. Node/Point 기반 radius | 후보점포나 핵심 Node 주변의 국지적 생활인구를 설명하기 쉬움 | 원을 Market/Submarket 전체로 오인; 여러 Node 중복; radius 선택자의 자의성 | **불가**: verified Point 0. 향후에도 `node catchment`로만 조건부 사용 | 높음 |
| C. Official commercial district relation 기반 | 공식 Polygon 1,650개를 참조 evidence로 활용 가능 | 서울 공식상권을 FRAMEONE 경계로 치환; 후보 관계를 확정 관계로 오인 | **집계 불가**: 863건 전부 `manual_review` C/D. 후보 검토 evidence로만 사용 | 매우 높음 |
| D. Administrative area 기반 | 행정구역 통계·설명과 연결이 단순하고 경계가 안정적 | 행정동과 실제 소비동선 기반 Market 정의가 다름; 넓은 면적 과포함 | **집계 불가**: 458건 전부 `manual_review` C/D. 후보 검토 evidence로만 사용 | 매우 높음 |
| E. Evidence 기반 candidate aggregation | 여러 참조 레이어·현장조사·Node를 함께 검토하며 경계 후보를 발전시킬 수 있음 | candidate 값을 확정 수치로 노출하거나 evidence 간 충돌을 숨길 위험 | **설계상 조건부**: 후보 경계 QA에는 사용 가능하나 현재 Market/Submarket 수치 생성 금지 | 중간~높음. 상태·한계를 명시하면 통제 가능 |

기존 `official-market-spatial-relation.ts`의 300m/500m 공식상권 관계 계산은 **후보점포 분석반경과 공식상권의 참고 관계**를 위한 기능이다. FRAMEONE Market/Submarket 생활인구 집계 경계로 재사용하지 않는다.

## 6. 절대 금지할 방식

- 서울 공식상권 Polygon을 FRAMEONE Submarket Polygon으로 자동 대체
- Node 이름 또는 몇 개의 Node로 임의 Polygon 생성
- 300m/500m 원을 Market/Submarket 전체로 간주
- 행정동을 FRAMEONE Market으로 자동 간주
- `manual_review` 또는 candidate 관계를 confirmed/verified로 자동 승격
- Grid intersection만 있다는 이유로 셀 인구를 복수 Market/Submarket에 전액 중복 합산
- 면적비만으로 셀 인구가 균등 분포한다고 확정
- METRIC_ONLY geometry 생성, GEOMETRY_ONLY population 0 입력
- 단일 날짜 snapshot을 장기평균·평일평균·주말평균으로 표현

## 7. Readiness 기준

Readiness는 Source 상태가 아니라 **각 FRAMEONE entity가 생활인구를 안전하게 받을 준비상태**다. Entity별로 판정하고, 낮은 단계의 evidence를 자동 승격하지 않는다.

### READY

다음을 모두 충족해야 한다.

1. Market 또는 Submarket의 Polygon/MultiPolygon이 `verified_geometry` 또는 동등한 승인 상태다.
2. geometry source, CRS, boundary version, verified date, reviewer/evidence가 기록돼 있다.
3. 동일 계층 Polygon의 self-invalidity, gap/overlap, 중복 entity ID가 QA됐다.
4. Grid 연결은 BOTH만 사용하며 METRIC_ONLY/GEOMETRY_ONLY 정책이 적용된다.
5. CELL_ID별 포함관계와 boundary conflict를 재현 가능한 Crosswalk로 저장한다.
6. 같은 계층에서 한 CELL_ID가 복수 entity에 중복 합산되지 않는다.
7. Source reference YMD, snapshot ID, boundary version, aggregation rule version을 결과에 보존한다.
8. suppression·null·부분 coverage를 0이나 완전합계로 바꾸지 않는다.

### CONDITIONAL

검증 Point, E3 candidate boundary, 사람 검토가 연결된 공간 evidence 등은 있으나 verified boundary 또는 exclusive Grid assignment가 완료되지 않은 상태다.

- 허용: 후보 경계 비교, coverage 진단, centroid/intersection 방식 비교, 내부 Pilot QA
- 금지: FRAMEONE Market/Submarket 공식 생활인구 수치 게시, 점수 반영, 고객용 확정 표현
- 출력에는 `candidate`, `not_for_decision`, limitation, missing/conflict count가 필요하다.

현재의 이름 기반 `manual_review` C/D 관계와 좌표 없는 Node만으로는 CONDITIONAL에 승격하지 않는다.

### BLOCKED

다음 중 하나면 수치 집계를 막는다.

- text-only이거나 geometry/point가 null
- 경계 출처·버전·검토상태를 확인할 수 없음
- official/admin geometry를 FRAMEONE geometry처럼 사용해야만 계산 가능
- 동일 계층 중첩을 해소하지 못함
- Grid Crosswalk가 없거나 재현할 수 없음
- suppression/missing을 0으로 바꿔야만 총계를 만들 수 있음

현재 Market 156, Submarket 382, Node 763은 이 상태다.

## 8. 추천 V1 Grid 포함 방식

검증된 FRAMEONE Polygon이 마련된 뒤의 V1 기본은 **centroid-in-polygon + same-layer exclusive assignment**로 제안한다.

| 방식 | 장점 | 단점 | V1 위치 |
|---|---|---|---|
| Centroid-in-polygon | 결정 규칙이 단순·재현 가능; 인구를 면적비로 쪼개지 않음; 중복 통제가 쉬움 | 작은/가느다란 경계와 외곽 셀에서 누락·편향 가능 | **기본 집계 규칙** |
| Polygon intersection | 닿는 모든 경계셀을 찾고 coverage QA에 유용 | 교차한 모든 entity에 전액 합산하면 중복·과대평가 | **진단 플래그 전용** |
| Area-weighted intersection | 경계셀을 연속 비율로 표현해 시각적으로 부드러움 | 셀 내부 인구가 균등하다는 검증되지 않은 가정으로 값을 분배 | **V1 합계에 사용 금지; 후속 shadow 비교 후보** |

Centroid-in-polygon도 실제 개인의 위치를 뜻하지 않는다. 이는 250m 셀 관측치를 한 승인 경계에 귀속하는 **집계 규칙**일 뿐이며, 방법·한계·버전을 결과에 남겨야 한다.

## 9. Boundary/Grid 처리정책

### 9.1 같은 계층의 독점 배정

- Market 계층과 Submarket 계층을 각각 따로 처리한다.
- 같은 계층에서 CELL_ID 하나는 최대 한 entity에만 합산한다.
- centroid가 복수 verified Polygon에 포함되면 `CONFLICTED`로 두고 모든 해당 entity 합계에서 제외한다.
- centroid가 경계선에 정확히 놓이거나 수치오차 범위 내이면 자동 tie-break하지 않고 `REVIEW_REQUIRED`로 제외한다.
- Polygon과 교차하지만 centroid가 밖인 셀은 `BOUNDARY_INTERSECTION_NOT_ASSIGNED`로 기록하고 V1 합계에는 넣지 않는다.
- Market 합계와 그 하위 Submarket 합계는 서로 다른 계층 결과다. 둘을 더하지 않는다.

### 9.2 Crosswalk 최소 필드

향후 Crosswalk에는 최소한 다음을 보존한다.

- `entity_type`, `entity_id`, `cell_id`
- `boundary_version`, `grid_geometry_version`
- `assignment_method`, `assignment_rule_version`
- `centroid_relation`, `intersection_relation`
- `assignment_status`: `ASSIGNED | CONFLICTED | REVIEW_REQUIRED | NOT_ASSIGNED`
- `evidence_refs`, `generated_at`, `reviewed_at`

기존 CSV의 `overlap_area`, `grid_overlap_ratio`, `market_overlap_ratio`, `weight_method`는 향후 진단값으로 사용할 수 있으나, 면적가중 인구를 자동 생성하는 근거로 사용하지 않는다.

### 9.3 Reconciliation 정책 유지

| 구분 | 집계 처리 | 결과 의미 |
|---|---|---|
| BOTH 8,558 | geometry와 metric이 있으므로 공간집계 입력 후보 | boundary readiness를 별도로 통과해야 함 |
| METRIC_ONLY 1 | 공간집계 제외, `REVIEW_REQUIRED`, suppressed 원문 보존 | geometry 임의 생성 금지 |
| GEOMETRY_ONLY 1,567 | `NO_OBSERVATION`, `population=null` | 0이 아니며 Source 오류로 자동 간주하지 않음 |

## 10. 생활인구 지표 후보와 의미

현재 Snapshot은 `20260906` 하루다. 따라서 가능한 것은 **그 날짜의 시간대별 단면과 하루 요약**이며 장기 대표값이 아니다.

| 지표 후보 | 안전한 정의 | 현재 제약 |
|---|---|---|
| 시간대별 생활인구 | YMD·TT별 승인된 CELL_ID 관측치 집계 | verified FRAMEONE boundary 없음; suppression/missing completeness 필요 |
| 일평균 생활인구 | 완전한 24개 시간대 총계의 산술평균 | 하루 snapshot 평균일 뿐 장기 일평균이 아님 |
| 시간대 profile | 각 시간대 값을 동일 날짜 안에서 비교 | 평일/주말 일반화 금지 |
| 남녀 구성 | 성별 세부 필드의 관측 가능한 구성비 | suppressed component가 있으면 완전 구성비로 표시 금지 |
| 연령대 구성 | 연령·성별 필드의 관측 가능한 구성비 | suppressed/missing coverage와 field 정의 보존 필요 |
| weekday/weekend | 여러 날짜 snapshot을 확보한 뒤 요일군별 산출 | 단일 날짜로 비교·평균 계산 불가 |

추가 계산 규칙:

- candidate key는 `YMD + TT + H_DNG_CD + CELL_ID`다. 같은 CELL_ID·시간대의 복수 H_DNG_CD 행을 합치는 의미가 공식 Source 정의상 분할 관측인지 먼저 확인해야 한다.
- 시간대 인구를 하루 동안 더한 값을 `일 생활인구`라고 부르지 않는다. 서로 다른 시간 단면의 합은 person-day 또는 유니크 인구가 아니다.
- suppressed 또는 missing component를 빼고 만든 값은 완전한 총계로 표시하지 않는다. 필요하면 `observed_subtotal`, completeness, suppressed count를 별도로 둔다.
- 장기 평균, 증감률, weekday/weekend 비교는 복수 기준일과 명시적 기간정책이 생긴 뒤에만 계산한다.
- 이번 단계에서 상권 점수나 추천 판정으로 변환하지 않는다.

## 11. 서울 전체 적용 구조

향후 공통 집계엔진은 자치구별 별도 로직 없이 다음 순서로 동작해야 한다.

1. immutable Source snapshot과 Source Current pointer를 분리해 읽는다.
2. 공식 Grid geometry와 reconciliation artifact의 버전을 고정한다.
3. 대상 entity별 readiness를 판정한다.
4. verified boundary만 centroid-in-polygon 대상에 넣는다.
5. same-layer exclusivity와 boundary conflict를 검사한다.
6. BOTH만 metric join 후보로 사용한다.
7. suppression, NO_OBSERVATION, REVIEW_REQUIRED를 보존한다.
8. 결과에 snapshot ID, reference YMD, boundary/grid/rule version, coverage 및 limitation을 기록한다.
9. readiness가 READY가 아니면 공식 Market/Submarket aggregate를 게시하지 않는다.

서울 전체와 Pilot은 같은 schema, rule version, 상태값을 사용해야 한다. 성수/성동 전용 radius, 이름 매칭, 예외 CELL_ID 하드코딩은 금지한다.

## 12. Pilot 검증 방식

성수는 공통 구조를 검증하는 대표 Pilot로만 사용할 수 있다. Pilot 전에 FRAMEONE 경계 또는 공간 evidence가 별도 절차로 만들어지고 검토되어야 하며, 이 문서는 해당 geometry를 생성하지 않는다.

Pilot 검증 항목:

1. 공통 readiness gate를 성수에도 변경 없이 적용한다.
2. verified/candidate/text-only 상태가 UI·artifact에서 혼동되지 않는지 확인한다.
3. centroid-in-polygon 배정과 intersection 진단 목록을 수작업 overlay 표본으로 대조한다.
4. 동일 계층 중첩, 경계선 centroid, hole, MultiPolygon, 미배정 셀을 포함한 edge case를 점검한다.
5. BOTH/METRIC_ONLY/GEOMETRY_ONLY가 서울 공통 정책대로 유지되는지 확인한다.
6. centroid 방식과 area-weighted shadow 결과는 오차 진단으로만 비교하고, area-weighted 값을 운영 수치로 승격하지 않는다.
7. Pilot 통과가 서울 전체 경계 검증 완료를 뜻하지 않도록 entity별 readiness를 유지한다.

## 13. 다음 한 단계

**서울 공통 E3→E4 FRAMEONE Market/Submarket boundary evidence 승인 기준과 최소 검토 artifact를 먼저 확정한다.**

그 단계에서도 생활인구 집계는 실행하지 않고, provenance·CRS·boundary version·reviewer·중첩 QA를 갖춘 geometry만 `verified_geometry`로 승격하도록 한다.
