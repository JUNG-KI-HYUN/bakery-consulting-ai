# FRAMEONE Competitor / Micro Market Analysis Implementation

기준일: 2026-09-02  
목표: “주변에 몇 개가 있는가”가 아니라 **이 후보점포의 베이커리 수요와 경쟁압력이 계약 판단에 어떤 영향을 주는가**를 설명한다.

## 1. 구현 판정

| 기능 | 판정 | 데이터 | 신뢰도 | 핵심 한계 |
|---|---:|---|---|---|
| 100/250/300/500m 현재 경쟁점 지도 | A/B | 소진공 상가 + 인허가 + 자체DB | 중~높음 | 업종 분류·갱신·중복 정리 필요 |
| 제과점/카페/디저트 분류 | B/C | 업종코드·업태·상호 + 검수 | 중 | 혼합업태·브랜드명으로 완전 자동화 불가 |
| 프랜차이즈/개인점 | B/C | 브랜드 사전 + 자체DB | 중 | 가맹/직영·로컬 체인 구분 오류 |
| 최근 신규오픈·폐업 | B | 지방행정 인허가 | 중~높음 | 인허가일≠실제 오픈일, 폐업신고 지연 |
| 영업기간 | B/C | 인허가·폐업일 | 중 | 지위승계·상호변경·재신고로 단절 |
| 경쟁밀도 | A/B | canonical store + 면적/수요 | 높음(정의상) | 해석 기준은 FRAMEONE 정책 |
| Bakery Survival Index | B/C | 3년 개폐업·기간·밀도 | 중 | 생존확률이 아닌 관찰지표로만 표시 |
| 실제 경쟁점 매출 | D | 카드/POS 민간자료 | - | 공개 데이터로 불가 |
| 250m 생활·주거·직장 수요 | B/C | SGIS/서울 grid·건물/세대 | 중 | 원형 경계 절단·시점 차이 |
| 집객시설·접근성 | A/B | 공공 POI·교통·현장 | 중~높음 | 시설 존재가 실제 고객유입을 뜻하지 않음 |

## 2. 점포 원천을 결합해야 하는 이유

### 2.1 소진공 상가(상권)정보

강점:

- 전국 현재 점포 후보, 업종코드, 상호·주소·좌표.
- 반경 검색과 업종 분류의 주된 base layer.

한계:

- 폐업일·인허가일의 신뢰 가능한 장기 이력 원천이 아님.
- 2023년 식별자 재부여 이력 때문에 단순 ID 비교로 생존기간을 만들 수 없음.

### 2.2 지방행정 인허가

강점:

- 인허가일 `APVPERMYMD`, 영업상태, 폐업일 `DCBYMD`, 업태, 업소명.
- 신규·폐업과 관찰 영업기간의 핵심 원천.

한계:

- 제과점영업만 보면 혼합형 베이커리를 놓침.
- 신고일과 실제 영업 개시·종료일이 다를 수 있음.
- 주소·좌표 오류, 지위승계·재신고·법인변경으로 동일 점포 이력이 나뉨.

### 2.3 FRAMEONE 자체 DB

역할:

- 현장 확인, 브랜드/개인점, 제조형/판매형, 좌석, 주력 제품, 상태 확인일.
- 자동 매칭의 오분류 교정.
- 향후 베이커리 특화 경쟁강도와 Similar Store의 기반.

## 3. Canonical Store 모델

```text
source_store_record
- source_system
- source_record_id
- source_snapshot_at
- source_name / source_address / source_point
- source_industry_code / source_business_type
- permit_date / closure_date / source_status
- raw_payload

canonical_store
- store_id
- canonical_name
- normalized_address
- point
- store_status
- opened_at_observed
- closed_at_observed
- bakery_class
- franchise_class
- classification_confidence
- last_verified_at

store_source_link
- store_id
- source_system / source_record_id
- match_method
- match_score
- reviewed_by / reviewed_at

store_observation
- store_id
- observed_at
- observation_type
- value
- evidence_id
```

원천 레코드를 물리적으로 합쳐 삭제하지 않는다. 오매칭을 되돌릴 수 있어야 한다.

## 4. Entity Resolution

### 4.1 후보 생성

- 좌표 50m 이내.
- 정규화 도로명/건물번호 일치.
- 상호 token/Jaro-Winkler 유사도.
- 업태 호환.
- 인허가/스냅샷 기간 호환.

### 4.2 결과 상태

| 상태 | 의미 | 집계 사용 |
|---|---|---|
| `AUTO_MATCH_HIGH` | 높은 점수·충돌 없음 | 가능 |
| `REVIEW_MATCH` | 동일 후보 다수/상호 변경 가능 | 검수 후 |
| `NO_MATCH` | 독립 레코드 | 신규 canonical 후보 |
| `CONFLICT` | 상태·주소·기간 충돌 | 확정 집계 제외 또는 표시 |

프랜차이즈는 정규식 한 개가 아니라 `brand_dictionary`로 관리한다. `brand_name`, aliases, operator, valid period, franchise/chain/local_chain/unknown을 둔다.

## 5. 베이커리 분류

```text
BAKERY_CORE_CONFIRMED
BAKERY_CORE_LIKELY
CAFE_WITH_BAKERY
DESSERT_ADJACENT
CAFE_GENERAL
NON_COMPETITOR
REVIEW
```

경쟁점 집계는 최소 두 개를 제공한다.

- **핵심 경쟁점**: confirmed + 현장/공식 업태로 베이커리 핵심 확인.
- **광의 경쟁점**: likely + cafe-with-bakery + dessert-adjacent.

한 숫자로 숨기지 말고 `핵심 8곳 / 광의 17곳 / 검토중 3곳`처럼 표시한다.

## 6. 거리와 도보권

### 6.1 기본 반경

| 반경 | 해석 | 기본 지표 |
|---:|---|---|
| 100m | 바로 앞 경쟁·가시권 | 핵심경쟁, 출입구, 집객시설 |
| 250m | 초근접 도보권 | 경쟁·세대·건물·생활인구 |
| 300m | FRAMEONE 현재 분석 연결 | 기존 300m 지표와 비교 |
| 500m | 주 생활권·상권 맥락 | 공식상권·생활/직장인구·개폐업 |
| 1km | 목적형·대형점 보조 | 대형 베이커리/교통 접근; 기본 화면 접기 |

반경은 경쟁사 화면 복제가 아니라 FRAMEONE 계약판단의 비교 band다.

### 6.2 Euclidean vs Network

- P1 기본: 원형 buffer. 빠르고 설명 가능하며 기존 300/500m와 호환.
- P1.5: 도보 network 5분/10분. 강·철도·대단지 담장·횡단보도 장벽이 큰 곳에 유용.
- 원형과 도보권 결과가 크게 다르면 `보행장벽` risk를 생성.

## 7. Micro Market: Grid와 반경의 결합

결론은 **Grid로 적재하고, 반경/도보권으로 집계**하는 혼합형이다.

| 방식 | 장점 | 단점 | 역할 |
|---|---|---|---|
| Grid | 재사용·타일링·시계열·heatmap에 좋음 | 경계 셀 배분 오차 | 원천/중간 저장 |
| Radius | 고객이 이해하기 쉬움, 후보점포 중심 | 후보마다 재계산, 장벽 무시 | 기본 결과 UI |
| Official area | 추정매출 등 원천 단위 보존 | 후보 중심 미세권과 불일치 | 매출·정책 데이터 |
| Walking catchment | 실제 접근성 반영 | 도로망·출입구·연산 필요 | 고급 검증 |

격자값을 반경에 넣을 때 면적비례 배분은 인구가 셀 안에 균등하다는 가정이다. 건물 footprint·주거/업무 가중을 쓸 수 있지만 모델값임을 표시한다.

### 7.1 Micro Market 출력

```text
250m Micro Market
- 생활인구: 추정 집계, 기준월
- 상주인구/세대: 기준연도
- 직장인구: 기준연도
- 핵심 베이커리: 6 (확인 5, 추정 1)
- 광의 경쟁점: 13
- 최근 12개월 신규: 2
- 최근 12개월 폐업: 1
- 집객시설: 역출입구 1, 학교 2, 병원 3
- 데이터 확인도: 78% (성공확률 아님)
```

## 8. 경쟁밀도

단순 `점포 수/원면적`과 수요보정 지표를 분리한다.

### 8.1 면적밀도

\[
Density_r = \frac{CoreCompetitors_r}{Area_r\ (km^2)}
\]

### 8.2 수요대비 경쟁

\[
CompetitionPressure_r = \frac{w_1 Core + w_2 Adjacent}{DemandIndex_r}
\]

`DemandIndex`는 생활·주거·직장 인구를 FRAMEONE 정책으로 표준화한 내부 지표다. 원시 인구처럼 표시하지 않는다. 가중치는 베이커리 유형별로 분리하고 현업 검증 전 최종판정에 직접 쓰지 않는다.

### 8.3 거리감쇠 경쟁

\[
WeightedCompetition = \sum_i classWeight_i \times e^{-d_i/\tau}
\]

- `classWeight`: 핵심/광의/대형/프랜차이즈.
- `d`: 도보거리 우선, 없으면 직선거리.
- `τ`: 경험적 감쇠거리; 초기에는 전문가 정책값, 추후 실제성과로 보정.

고객 UI에는 공식 숫자가 아닌 `FRAMEONE 경쟁압력(참고)`로 표시하고 계산 근거를 연다.

## 9. 신규·폐업·영업기간

### 9.1 관찰 규칙

```text
observed_open_date = best available of
  field-verified open date
  official permit date
  first source appearance

observed_close_date = best available of
  official closure date
  field-verified closure date
  repeated source disappearance + verification
```

`permit date`를 `open date`로 이름 바꾸지 않는다. UI는 `인허가 기준 신규`라고 표시한다.

### 9.2 기간

\[
ObservedOperatingMonths = months(observed\_open\_date, min(close\_date, as\_of))
\]

지위승계·재신고가 의심되면 `CONTINUITY_UNCERTAIN` flag. 평균보다 중위수와 사분위 범위가 강건하지만, 표본 수를 반드시 표시한다.

## 10. Bakery Survival Index

### 10.1 이름과 의미

권장 고객명: **Bakery Market Stability Index** 또는 **Bakery Survival Environment Index**.  
금지: `3년 생존확률 72%`.

이는 과거 관찰자료를 요약한 상권 안정성 지표이지 개별 점포의 생존확률이 아니다.

### 10.2 구성 후보

| 요소 | 계산 | 방향 | 품질 조건 |
|---|---|---|---|
| 최근 3년 신규점 | 연도별 인허가 신규 수/기존점 | 양면적 | 인허가 커버리지 |
| 최근 3년 폐업점 | 폐업 수/활동점포 수 | 낮을수록 안정 | 폐업신고 지연 |
| 관찰 영업기간 | 중위·IQR | 길수록 안정 | continuity flag 제외 |
| 점포 순증감 | 신규-폐업 | 맥락 필요 | 수요추세와 결합 |
| 베이커리 밀집도 | 거리감쇠 경쟁 | 과밀 경고 | 분류 confidence |
| 음식점 폐업 변화 | 음식업 benchmark | 낮을수록 안정 | 업종 매핑 |
| 추정매출 추세 | TTM YoY | 높을수록 긍정 | 서울 공식상권만 |

### 10.3 산식

초기에는 통계모델이 아니라 투명한 scorecard다.

\[
Index = \sum_j w_j \times PercentileOrBand_j
\]

- 비교 universe: 같은 상권유형·같은 기간의 서울 상권.
- 모든 요소에 `as_of`, 표본 수, quality flag.
- 어떤 하나가 없으면 남은 가중치를 자동 재배분하지 않고 `자료부족` 또는 별도 버전을 반환.
- 지수는 0–100이더라도 `관찰환경 지수`로 표시.

### 10.4 설명 예

> 최근 3년간 베이커리 인허가 신규는 늘었지만 폐업도 함께 늘었고, 관찰 영업기간 중위값은 비교 상권보다 짧습니다. 따라서 이 지수는 ‘경쟁회전이 빠른 상권’으로 분류합니다. 개별 후보점포의 생존확률을 뜻하지 않습니다.

## 11. 공간 API 설계

```text
GET /candidate-stores/{id}/micro-market?bands=100,250,300,500

{
  "asOf": "2026-09-02",
  "bands": [{
    "radiusM": 250,
    "competitors": {
      "coreConfirmed": 5,
      "coreLikely": 1,
      "cafeDessert": 7,
      "review": 3
    },
    "changes": {"new12mPermitBased": 2, "closed12mReported": 1},
    "demand": {"livingPopulationEstimate": 0, "status": "NOT_LOADED"},
    "quality": {"classificationCoveragePct": 86}
  }],
  "limitations": ["PERMIT_DATE_NOT_ACTUAL_OPEN_DATE"]
}
```

점포 list endpoint는 customer view에서 전화번호·원천 필드 등 불필요 정보를 감춘다.

## 12. 파이프라인

```text
INPUT
후보점포 좌표 + 100/250/300/500m + 업종/브랜드 사전
  ↓
DATA SOURCE
소진공 상가 + 지방인허가 + 서울 집계 + SGIS + 자체 현장DB
  ↓
DB
source records → canonical stores → observations/evidence → spatial index
  ↓
CALCULATION
반경/도보권, 분류, 신규·폐업, 영업기간, 밀도, 안정성 scorecard
  ↓
API
/micro-market, /competitors, /market-stability
  ↓
UI
지도 + band 비교 + 확인/추정/검토중 + 시점
  ↓
AI INTERPRETATION
수요·경쟁·변화 fact만 설명, 생존확률 문장 차단
  ↓
REPORT
핵심 경쟁점, 개폐업, 한계, 현장 확인 목록
```

## 13. 현장조사 연결

자동으로 생성할 확인 작업:

- 좌표 30m 이내 같은 상호 2개 → 중복/층 확인.
- 상가정보 영업, 인허가 폐업 → 현장 상태 확인.
- `BAKERY_CORE_LIKELY`이며 300m 내 → 사진/업태 확인.
- 프랜차이즈 사전 미일치 로컬 체인 → 브랜드 분류.
- 폐업일 없음 + 장기 미관찰 → 임의 폐업 처리 금지.

현장 확인 결과는 source row를 수정하지 않고 `store_observation + evidence`로 추가한다.

## 14. 고객용 vs 직원용

| 직원용 | 고객용 |
|---|---|
| 모든 원천 레코드·match score | 핵심/광의 경쟁점 수 |
| 분류 confidence·review queue | 확인/추정/검토중 구분 |
| 인허가 상태·source timestamps | 최근 개폐업과 기준일 |
| 계산식·거리감쇠·분모 | 100/250/300/500m band 비교 |
| 충돌·좌표 오류 | 계약 전 현장확인 항목 |

## 15. 테스트와 완료기준

### 테스트

- 동일 건물 내 같은 상호의 층별 복수점포.
- 상호 변경·대표자 변경·지위승계.
- 인허가 영업/상가정보 미존재, 그 반대.
- 폐업 후 동일 주소 새 업소.
- 좌표계 오류로 수 km 이동한 레코드.
- 원형 경계 위 점포의 포함 규칙 (`ST_Intersects` vs point within).
- 100m와 500m 결과의 단조성.
- 생존확률 금지어 lint.

### P0/P1 완료기준

1. 서울 표본 300개 점포의 자동 분류 precision/recall을 현업 라벨과 대조.
2. 20개 후보지에서 지도 표시와 실제 주소의 수동 표본 검증.
3. 신규/폐업 100건의 인허가일·상태 원문 추적 가능.
4. 숫자마다 `기준일·반경·분류범위·출처`가 표시.
5. 매칭 충돌은 확정 경쟁점 수에 조용히 포함되지 않음.
6. Bakery Survival 기능은 실제 생존확률 표현을 전혀 사용하지 않음.

## 16. 개발 순서

1. **C1** 업종·브랜드 taxonomy와 canonical store schema.
2. **C2** 소진공·인허가 raw 적재 및 좌표 정규화.
3. **C3** entity resolution + review queue.
4. **C4** 100/250/300/500m spatial API와 지도.
5. **C5** 신규·폐업·관찰 영업기간.
6. **C6** SGIS/서울 demand grid 결합.
7. **C7** Bakery Market Stability scorecard.
8. **C8** 도보 network와 현장 evidence feedback.

