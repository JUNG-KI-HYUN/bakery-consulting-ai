# FRAMEONE Sales Analysis Implementation

기준일: 2026-09-02  
핵심 원칙: **실제매출과 추정매출을 혼용하지 않는다.**

## 1. 대표 판단

| 기능 | 판정 | 이유 |
|---|---:|---|
| 서울 공식상권·행정동 분기 추정매출 추이 | **B** | 서울 API/파일 적재 후 독자 계산 가능 |
| 전년동기·전분기·최근 4분기 추세 | **B** | 분기 패널 정규화와 상권코드 버전 관리 필요 |
| 3년 업종·상권·베이커리 성장률 | **B/C** | 2021+ 가능하나 2024 공간단위 변경과 코로나 기저효과 주의 |
| 후보점포 300m 실제 매출 | **D** | 공공자료의 공식상권 값을 원형 반경 매출로 재라벨링할 수 없음 |
| 개별점포 평균·중위·상위20%·하위20% | **D** | 개별점포 분포가 필요; 공공 집계자료만으로 산출 불가 |
| 공공 추정매출 기반 상권 Heatmap | **B/C** | 영역 choropleth는 가능; 미세격자 추정은 모델오차 큼 |
| 카드/통신 결합 미세격자 Heatmap | **D** | 민간 데이터 계약 필요 |
| BEP와 상권 추정매출의 맥락 비교 | **B/C** | 분모·점포분포 부재 때문에 “평균점포 매출”은 제한적으로만 가능 |
| 데이터 기반 AI 해설 | **A/B** | 계산 결과 JSON만 입력하고 금지어·근거 검증을 두면 가능 |

## 2. 서울시 자료로 답할 수 있는 질문

공식 소스: [서울시 상권분석서비스 추정매출-상권](https://data.seoul.go.kr/dataList/OA-15572/S/1/datasetView.do), [행정동](https://data.seoul.go.kr/dataList/OA-22175/S/1/datasetView.do).

답할 수 있음:

- 이 공식상권의 베이커리 관련 업종 **분기 추정매출 총액**은 최근 상승/하락했는가?
- 전분기·전년동기 대비 변화율은 얼마인가?
- 업종 추정매출 변화가 상권 전체 음식 관련 업종 변화보다 빠른가?
- 매출액 변화와 점포 수 변화가 함께 일어났는가?
- 평일/주말, 요일, 시간대, 성·연령별 추정 소비 구성이 어떻게 다른가?

답할 수 없음:

- 특정 후보점포가 월 3,800만 원을 매출할 것인가?
- 반경 300m의 실제 카드·현금 매출은 얼마인가?
- 상권 내 베이커리 개별점포의 중위 매출은 얼마인가?
- 특정 경쟁점의 매출은 얼마인가?
- 공개 집계값만으로 이 점포의 생존확률은 얼마인가?

## 3. 표준 데이터 모델

### 3.1 원천 보존

```text
seoul_sales_raw
- source_dataset_id
- source_row_hash
- fetched_at
- source_period_code
- source_trade_area_code
- source_industry_code
- raw_payload_json
```

### 3.2 정규화 fact

```text
market_sales_quarterly
- geography_type       TRADE_AREA | ADMIN_DONG
- geography_version
- geography_id
- year_quarter         2026Q2
- industry_taxonomy_version
- canonical_industry_id
- source_industry_code
- estimated_sales_amount
- estimated_sales_count
- store_count
- weekday/weekend_amount
- day_of_week_json
- time_band_json
- gender_json
- age_band_json
- source_id
- data_as_of
- quality_flags[]
```

### 3.3 상권 코드 버전

```text
market_geography_version
- geography_id
- valid_from / valid_to
- source_geometry_id
- geometry
- crs_original
- source_release

market_geography_crosswalk
- from_geography_id
- to_geography_id
- overlap_area_ratio
- population_weight_optional
- method
```

2024년 전후 영역이 달라진 레코드를 동일한 `TRDAR_CD` 문자열만으로 연결하지 않는다. 가장 안전한 기본 UI는 “공식 원천이 제공하는 동질 구간”을 보여주고, crosswalk 보정 추세는 직원용 고급 옵션으로 둔다.

## 4. 업종 매핑

서울 업종코드를 FRAMEONE 베이커리 관점으로 다음처럼 버전 관리한다.

| 그룹 | 포함 후보 | 사용 |
|---|---|---|
| Bakery Core | 제과점·베이커리 해당 공식 코드 | 대표 추정매출 추세 |
| Bakery Adjacent | 카페, 디저트, 떡·간식 등 | 대체·보완 수요 맥락 |
| Food Service Benchmark | 음식업 전체 또는 선택 바스켓 | 상권 전체 성장 비교 |
| Excluded | 식료품 소매 등 목적이 다른 업종 | 기본 추세에서 제외 |

코드명 텍스트에 의존하지 않고 `industry_mapping_version`과 적용일을 저장한다. 업종 분류가 바뀌면 과거 리포트 재현이 가능해야 한다.

## 5. 계산식

모든 계산은 분모 0·누락·억제값을 별도 상태로 처리한다.

### 5.1 전분기 대비(QoQ)

\[
QoQ_t = \left(\frac{S_t}{S_{t-1}}-1\right)\times100
\]

### 5.2 전년동기 대비(YoY)

\[
YoY_t = \left(\frac{S_t}{S_{t-4}}-1\right)\times100
\]

### 5.3 최근 4분기 합계 변화

사용자 예시의 “최근 4분기 +8.4%”는 모호하므로 라벨을 명확히 한다.

\[
TTM\ YoY_t = \left(\frac{\sum_{i=0}^{3}S_{t-i}}{\sum_{i=4}^{7}S_{t-i}}-1\right)\times100
\]

UI: `최근 4개 분기 합계 / 직전 4개 분기 합계 +8.4%`.

### 5.4 최근 4분기 방향

- 각 분기 QoQ 화살표를 표시.
- 단순히 첫 분기와 마지막 분기만 비교한 값은 `4분기 사이 변화`로 라벨.
- 변동성이 큰 경우 “상승” 한 단어보다 4개 값과 범위를 보여준다.

### 5.5 로그 선형 추세(직원용)

\[
\log(S_t)=\alpha+\beta t+\epsilon_t
\]

`β`의 부호·적합도·관측 수를 함께 저장한다. 4개 분기만으로 통계적 유의성을 과장하지 않는다. 고객 화면은 `상승 경향 / 보합 / 하락 경향 / 판단자료 부족`의 규칙형 라벨이 적절하다.

### 5.6 점포 수와 함께 보는 매출

\[
SalesPerListedStore_t = \frac{EstimatedSales_t}{StoreCount_t}
\]

이는 **개별점포 평균 실제매출이 아니다.** 원천 추정매출의 커버리지와 점포 수 집계 기준이 다를 수 있으므로 내부 진단 보조치로만 사용하고, 고객용이라면 `점포 수로 단순 나눈 참고값`이라고 표기한다. 데이터 품질 검증 전 기본 화면에서는 숨긴다.

### 5.7 상대 성장

\[
RelativeGrowth = BakeryGrowth - BenchmarkGrowth
\]

예: 같은 상권의 Bakery Core TTM YoY와 음식업 바스켓 TTM YoY 차이. 이것은 시장점유율 변화가 아니라 “성장률 차이”다.

## 6. 화면 설계

### 6.1 고객용 카드

```text
베이커리 분기 추정매출 추세
공간: 서울시 공식상권 ○○ / 데이터 기준: 2026 Q2

2025 Q3  ↓  12.1억
2025 Q4  ↑  12.8억
2026 Q1  ↑  13.0억
2026 Q2  ↑  13.4억

최근 4개 분기 합계 vs 직전 4개 분기: +8.4%
전년동기: +6.2% | 전분기: +3.1%

주의: 카드·현금 등을 통계적으로 추정한 상권 집계값이며
후보점포의 예상매출이나 실제매출이 아닙니다.
```

### 6.2 오류를 막는 UX

- 제목과 축에 `추정매출` 고정 배지.
- 공간단위를 `300m`가 아니라 `서울시 공식상권`으로 표시.
- 2024 영역 변화가 포함되면 데이터 구조 변경 경고.
- 금액·건수·점포 수의 기준시점을 tooltip에 표시.
- 데이터가 없는 값을 0으로 그리지 않는다.
- 성·연령 분해 합계가 총 추정매출과 다를 수 있다는 안내를 둔다.

### 6.3 직원용

- 원천 dataset ID, source URL, 적재시각.
- 업종 매핑 버전.
- 영역 버전과 crosswalk 사용 여부.
- 누락/급변/outlier flag.
- 계산식과 분모.

## 7. BEP와 시장 수준 비교

### 7.1 지금 가능한 안전한 비교

```text
후보점포 월 BEP: 3,800만원
공식상권 Bakery Core 분기 추정매출: 13.4억원
공식 점포 수: 12개
```

이 세 값을 나란히 보여주는 것은 가능하다. 그러나 `13.4억원 ÷ 3 ÷ 12`를 “상권 평균 매출”이라고 단정하면 안 된다.

허용되는 해설:

> 후보점포는 월 3,800만원 이상이 손익분기 기준입니다. 현재 공공자료는 상권 총 추정매출과 점포 수를 제공하지만 개별점포 매출분포를 제공하지 않아, 이 BEP가 상권 중위 매장보다 높은지는 판정할 수 없습니다. 점포 수로 단순 나눈 참고값과의 비교가 필요하다면 내부 검토용으로만 표시합니다.

### 7.2 상위 20%·중위 분석

요구 데이터:

- 동일 업종 개별점포 월별 매출 또는 privacy-safe 분포 quantile.
- 현금·카드 업스케일 방식과 점포 universe.
- 점포 상태·면적·형태·영업일수.
- 최소표본·소수점포 비공개 규칙.

따라서 판정은 **D**다. NICE비즈맵과 유사한 평균·중위·상위20% 기능은 UI가 아니라 데이터 계약 문제다. 민간 계약이 없으면 억지 분포를 만들지 않는다.

민간 데이터 확보 후에도 다음만 표시한다.

- `데이터 제공사 표본 내 추정 분포`.
- 표본 수·기준월·커버리지.
- 후보점포 BEP의 percentile band.
- 점추정이 아니라 범위.

## 8. 매출 Heatmap

### 8.1 기술과 데이터 분리

| 층 | 구현 | 판정 |
|---|---|---:|
| 지도 색상/범례/클러스터/타일 | 기존 지도 Viewer 위에 구현 | A |
| 서울 공식상권 추정매출 choropleth | 폴리곤 + 분기 추정매출 | B |
| 행정동 choropleth | 행정동 매출 | B |
| 상권값을 100m 격자에 동일 분배 | 기술상 가능, 분석적으로 부적절 | E |
| 공개 변수로 소지역 매출을 모델링 | 가능하나 검증 전 C | C |
| 카드사 미세격자 매출 Heatmap | 계약 후 | D |

### 8.2 권장 1단계

- Heatmap이라는 명칭 대신 `상권별 추정매출 분포`.
- 공식상권 polygon choropleth.
- 절대금액과 점포 수를 함께 필터.
- 업종·분기·금액/증감률 toggle.
- quantile 색상은 기준 분포와 절단점을 명시.

### 8.3 금지

- 폴리곤 총액을 kernel density로 부드럽게 뿌려 “거리 단위 실제매출”처럼 표현.
- 데이터가 없는 구역을 낮은 매출로 표시.
- 총액만으로 큰 상권을 우수하게 평가.
- 민간 경쟁사의 heatmap 값을 수집해 FRAMEONE DB에 적재.

## 9. AI Narrative

### 9.1 숫자 생성 방지 구조

```json
{
  "metric_id": "bakery_sales_ttm_yoy",
  "value": 8.4,
  "unit": "%",
  "period": "2025Q3-2026Q2 vs prior four quarters",
  "geography": {"type":"TRADE_AREA","name":"○○상권"},
  "source_label": "서울시 추정매출",
  "quality_flags": [],
  "evidence_ids": ["metric_run_123"]
}
```

LLM에는 원천 테이블 전체가 아니라 계산이 완료된 `metric facts`와 허용된 문장 템플릿을 전달한다. 출력 후 숫자·단위·기간이 fact set에 존재하는지 validator가 검사한다.

### 9.2 해설 규칙 예

```text
IF ttm_yoy > +5 AND store_count_yoy > +5
THEN "추정매출과 점포 수가 함께 증가"

IF ttm_yoy > +5 AND store_count_yoy <= 0
THEN "추정매출은 증가했지만 점포 수는 늘지 않음"

IF bep_market_distribution is unavailable
THEN 중위/상위 수준 비교 문장 금지
```

### 9.3 허용 예시

> 이 공식상권의 베이커리 분기 추정매출은 최근 4개 분기 합계 기준 직전 4개 분기보다 8.4% 높습니다. 같은 기간 경쟁점 수가 6.1% 늘어 수요 증가와 경쟁 심화가 함께 관찰됩니다. 이는 후보점포의 예상매출이 아닙니다.

## 10. 데이터 파이프라인

```text
INPUT
후보점포 좌표·Market/Submarket/Node, 업종 매핑
  ↓
DATA SOURCE
서울 추정매출 + 점포 집계 + 상권 폴리곤
  ↓
DB
raw immutable → normalized quarterly fact → geography crosswalk
  ↓
CALCULATION
QoQ / YoY / TTM YoY / trend / relative growth / quality flags
  ↓
API
/markets/{id}/sales-trend?industry=bakery&period=12q
  ↓
UI
추정매출 라벨, line/bar, 방향, 기준시점, 한계
  ↓
AI INTERPRETATION
fact-only narrative + rule gate + numeric validator
  ↓
REPORT
차트 snapshot + 원천 링크 + 공간/기간/추정 주의문
```

## 11. API 응답 계약 제안

```json
{
  "metricType": "ESTIMATED_SALES",
  "geography": {"type": "SEOUL_TRADE_AREA", "id": "...", "version": "2026Q2"},
  "industry": {"id": "BAKERY_CORE", "mappingVersion": "v1"},
  "series": [
    {"quarter": "2026Q1", "amount": 1300000000, "quality": "OK"},
    {"quarter": "2026Q2", "amount": 1340000000, "quality": "OK"}
  ],
  "comparisons": {"qoqPct": 3.08, "yoyPct": 6.2, "ttmYoyPct": 8.4},
  "source": {"name": "서울시 상권분석서비스", "isEstimate": true, "asOf": "2026Q2"},
  "limitations": ["NOT_STORE_FORECAST", "GEOGRAPHY_AGGREGATE"]
}
```

## 12. 테스트

| 테스트 | 기대 결과 |
|---|---|
| 전분기 0/누락 | 변화율 `null`, 사유 코드 반환 |
| 상권코드 변경 | crosswalk 없으면 연속추세 차단 |
| 분기 중복 | source release/row hash로 1건 선택, 이력 보존 |
| 성·연령 합계 불일치 | 오류로 합계 보정하지 않고 공식 한계 flag |
| 업종 매핑 변경 | 과거 리포트는 당시 mapping version 재현 |
| AI가 없는 숫자 출력 | validator 실패, 템플릿 fallback |
| 실제매출 문구 | 금지어 lint 실패 |

## 13. 개발 순서와 완료기준

1. **S1 원천 적재(B)**: 2021+ 추정매출·점포·폴리곤 백필, row count/합계 대조.
2. **S2 정규화**: 분기·업종·공간 버전 모델, 중복·누락 quality report.
3. **S3 계산 API**: QoQ/YoY/TTM와 테스트 fixture.
4. **S4 고객/직원 UI**: 추정 라벨·출처·한계가 항상 보임.
5. **S5 BEP 문맥 연결**: 분포 부재를 숨기지 않는 비교 카드.
6. **S6 AI 해설**: metric fact whitelist와 numeric validator.
7. **S7 Heatmap**: 공식상권 choropleth부터 시작.

완료기준:

- 서울 원천 샘플과 10개 상권·12개 분기의 값이 일치.
- 2024 공간변경 경고가 자동 노출.
- 고객 화면 어느 곳에서도 `실제매출` 또는 `후보점포 예상매출`로 오인될 문구가 없음.
- 모든 AI 숫자가 metric run ID로 역추적됨.
- 민간 분포가 없을 때 중위·상위20% 화면이 생성되지 않음.

