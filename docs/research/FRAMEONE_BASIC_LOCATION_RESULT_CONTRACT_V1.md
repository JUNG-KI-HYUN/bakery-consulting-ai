# FRAMEONE 기초입지분석 Result Contract V1

- 문서 상태: `DESIGN_READY`
- 작성 기준일: `2026-09-14`
- Repository 기준: branch `codex-night-20260901`, HEAD `8c5950c`
- 계약 버전: `FRAMEONE_BASIC_LOCATION_RESULT_V1`
- 범위: 기초입지분석 결과의 공통 의미·상태·표시 계약
- 제외 범위: TypeScript, DB schema, API, UI, 계산식, geometry 구현

## 1. 목적

이 계약은 생활인구, Kakao 장소검색, 서울시 공식상권 통계, FRAMEONE 분류와 향후 Flow Potential·Stay Potential·경쟁구조·후보구간 결과를 같은 화면에서 안전하게 조합하기 위한 공통 표현 규칙이다.

모든 Result는 다음 질문에 답할 수 있어야 한다.

1. 무엇을 분석한 결과인가?
2. 어느 공간단위의 결과인가?
3. 어느 기준일 또는 기간의 결과인가?
4. 어떤 Source와 원자료를 사용했는가?
5. 공식 원자료, 외부 관측, FRAMEONE 계산, 추정, 해석 중 무엇인가?
6. 현재 사용할 수 있는가?
7. 근거의 신뢰 수준은 어느 정도인가?
8. 결측, 충돌 또는 limitation이 있는가?
9. 현장에서 무엇을 다시 확인해야 하는가?
10. 고객에게 어떤 조건으로 보여줄 수 있는가?
11. 다른 Result와 비교 가능한가?
12. 같은 결과를 나중에 재현할 수 있는가?

핵심 원칙은 다음과 같다.

```text
분석 업무영역
≠ 공간단위
≠ Source 유형
≠ 값의 성격
≠ 결과 상태
≠ Confidence
≠ 고객 표시정책
```

예를 들어 서울시 공식상권 추정매출은 `OFFICIAL_COMMERCIAL_AREA` 단위의 공식 Source 제공 추정값이다. 이를 500m 반경 값, 후보점포 예상매출 또는 실제매출로 바꿔 표현하지 않는다.

## 2. Result Contract

### 2.1 개념 구조

아래 구조는 구현 전 의미 계약이다. 실제 TypeScript interface나 저장 schema가 아니다.

```text
Result
├─ identity: resultId, contractVersion, analysisRunId, metricKey, metricLabel
├─ scope: analysisLayer, analysisUnitType, analysisUnitId, analysisUnitLabel
├─ time: referenceDate 또는 referencePeriod, fetchedAt, updatedAt
├─ value: value, valueShape, unit, valueType, calculationType
├─ provenance: primarySource, sourceReferences, methodologyVersion, methodologyNote
├─ quality: status, confidence, confidenceReasons
├─ exceptions: limitations, missingReason
├─ operations: fieldCheck, customerDisplayPolicy, comparability
└─ lineage: relatedResultIds, inputSnapshotRef
```

### 2.2 필드 정의

| 필드 | 필수성 | 역할 | 규칙 |
|---|---|---|---|
| `resultId` | 필수 | 한 분석 실행 안에서 Result를 식별 | 같은 결과를 갱신해 덮어쓰기보다 새 실행·version과 연결 |
| `contractVersion` | 필수 | 적용한 Result Contract 버전 | V1 값은 `FRAMEONE_BASIC_LOCATION_RESULT_V1` |
| `analysisRunId` | 필수 | 동일 입력 snapshot으로 실행된 결과 묶음 | 화면의 다른 시점 결과가 섞이지 않게 함 |
| `metricKey` | 필수 | 기계 판독 가능한 안정적 지표 키 | 표시문구와 분리하며 의미 변경 시 version 검토 |
| `metricLabel` | 필수 | 직원·고객에게 보이는 지표명 | 공간단위나 추정 성격을 숨기는 이름 금지 |
| `analysisLayer` | 필수 | 수요·경쟁 등 분석 업무영역 | 공간단위인 `analysisUnitType`과 분리 |
| `analysisUnitType` | 필수 | 결과가 속한 공간단위 유형 | 3장의 허용값 사용 |
| `analysisUnitId` | 조건부 필수 | 공간단위의 canonical ID | ID가 없는 실행 반경은 `analysisRunId`와 중심점 snapshot으로 식별 |
| `analysisUnitLabel` | 필수 | 화면용 공간단위 명칭 | 예: 공식상권명, 500m 분석반경. 서로 다른 단위를 같은 이름으로 축약 금지 |
| `referenceDate` | 날짜형 결과에 필수 | 단일 기준일 | 기간형과 동시에 강제하지 않음 |
| `referencePeriod` | 기간형 결과에 필수 | 시작·종료 또는 공식 분기 | `2026-Q1`처럼 Source의 실제 기준 표기 사용 |
| `fetchedAt` | 외부 조회 결과에 필수 | Source에서 조회·수집한 시각 | 기준일과 구분 |
| `updatedAt` | 필수 | Result record가 생성 또는 갱신된 시각 | 원자료 기준일을 대신하지 않음 |
| `value` | 상태에 따라 필수 | 실제 Result payload | 결측이면 `null`; 임의 기본값 금지 |
| `valueShape` | 필수 | 값의 구조 | `SCALAR`, `CATEGORY`, `RELATION`, `LIST`, `TEXT` |
| `unit` | 수치에 필수 | 명, 개, 원, %, m 등 | Source 단위를 보존하고 변환 시 계산정보 기록 |
| `valueType` | 필수 | 값이 만들어진 성격 | 4장의 허용값 사용 |
| `calculationType` | 계산·해석 시 필수 | 집계·비율·거리·규칙·AI 요약 등 계산 종류 | 직접값은 `NONE` |
| `primarySource` | Source가 있으면 필수 | 결과의 주 Source ID·이름·유형 | 공식성은 이 필드에서 확인 |
| `sourceReferences` | 필수 | 사용한 모든 원자료 locator와 version | 복수 Source 계산·해석의 lineage 보존 |
| `methodologyVersion` | 계산·지표·해석에 필수 | 적용 규칙 또는 방법 버전 | 가중치·귀속 규칙 변경을 추적 |
| `methodologyNote` | 조건부 필수 | 계산·분류·제한 설명 | 자유로운 결론 대신 재현 가능한 요약 |
| `status` | 필수 | 이 Result의 현재 가용상태 | Source·Boundary review 상태와 분리 |
| `confidence` | 필수 | Result 근거에 대한 신뢰 수준 | 좋고 나쁨 또는 승인 상태가 아님 |
| `confidenceReasons` | 필수 | Confidence 판단 이유 code/message | 빈 배열이면 `confidence=UNKNOWN` |
| `limitations` | 필수 | 적용 제한 code/message 목록 | 제한이 없음을 검토했을 때만 빈 배열 가능 |
| `missingReason` | 조건부 필수 | `value=null`인 이유 | Missing Reason 허용값 사용 |
| `fieldCheck` | 필수 | 현장확인 필요 여부와 항목 | `required=false`여도 명시 |
| `customerDisplayPolicy` | 필수 | 고객 노출 가능 범위 | 7장의 허용값 사용 |
| `comparability` | 필수 | 다른 Result와 비교 가능한 조건 | 단위·기간·Source·방법 version 일치 여부 기록 |
| `relatedResultIds` | 계산·해석에 필수 | 근거 Result 연결 | AI·분석로직이 새로운 숫자를 만들지 않았는지 추적 |
| `inputSnapshotRef` | 실행형 결과에 필수 | 실행 당시 선택 Market/Submarket, 중심점, 반경, 옵션 | 현재 선택 변경 후 과거 결과 오인 방지 |

### 2.3 중첩 필드 최소 구조

```text
primarySource
- sourceId
- sourceName
- sourceType

sourceReference
- sourceId
- locator
- sourceVersion 또는 schemaVersion
- referenceDate 또는 referencePeriod
- fetchedAt

limitation
- code
- message
- severity: INFO | CAUTION | BLOCKING

fieldCheck
- required
- checkKeys[]
- message

comparability
- comparable
- comparisonGroupKey 또는 null
- requirements[]
- reason
```

`sourceReferences`는 최소 1개 이상의 `sourceReference` 배열이다. 여러 원자료를 사용한 계산·해석에서 단일 `sourceId`로 lineage를 축약하지 않는다.

## 3. Analysis Layer와 공간단위

### 3.1 `analysisLayer`

`analysisLayer`는 결과가 답하는 업무 질문이다.

| 값 | 의미 |
|---|---|
| `MARKET_IDENTITY` | FRAMEONE 분류, 상권유형, 권역 설명 |
| `DEMAND` | 생활·주거·직장·교육·교통·목적 수요 |
| `FLOW_POTENTIAL` | 이동 가능성, network, crossing, barrier |
| `STAY_POTENTIAL` | 체류 유발 장소와 체류 가능성 |
| `SURROUNDING_POI` | 범위 안 외부 장소검색 관측 |
| `COMPETITION` | 경쟁점 관측과 경쟁구조 해석 |
| `MARKET_CHANGE` | 비교 가능한 기간의 변화 |
| `BAKERY_FIT` | 베이커리 운영모델과의 정합성 해석 |
| `PROMISING_SEGMENT` | 현장조사 후보구간 |
| `BUILDING_CANDIDATE` | 후보건물·주소 조사 우선순위 |
| `DATA_EVIDENCE` | Source·상태·한계·lineage 표시 |

### 3.2 `analysisUnitType`

| 값 | 의미 | 현재 공간연산 지원 |
|---|---|---|
| `FRAMEONE_MARKET` | FRAMEONE 주요상권 | 분류·계층만 가능. geometry 연산 `BLOCKED` |
| `FRAMEONE_SUBMARKET` | FRAMEONE 하위상권 | 분류·계층만 가능. geometry 연산 `BLOCKED` |
| `FRAMEONE_NODE` | FRAMEONE 미시 거점 | 명칭·유형만 가능. 실제 좌표 `0 / 763` |
| `OFFICIAL_COMMERCIAL_AREA` | 서울시 공식상권 Polygon·통계 단위 | 가능. FRAMEONE 경계와 별개 |
| `ADMIN_DONG` | 행정동 참조 단위 | geometry 참조 가능, 현재 명칭 속성 한계 표시 |
| `LIVING_GRID_250M` | 생활인구 250m Grid | Grid geometry·원천 단위 가능 |
| `RADIUS_300M` | 실행 중심점 기준 300m 원 | Kakao 검색범위 가능; 상권 경계 아님 |
| `RADIUS_500M` | 실행 중심점 기준 500m 원 | Kakao 검색범위 가능; 상권 경계 아님 |
| `POI` | 개별 장소 | Kakao 응답 범위에서 가능; 영업상태 확정 불가 |
| `ROAD_SEGMENT` | 도로 또는 보행망 구간 | 원천 segment 참조 가능; 실제 Flow 확정 불가 |
| `ROUTE_SEGMENT` | 분석로직이 연결한 경로 후보 | 현재 미구현; Pilot 전 내부 전용 |
| `BUILDING` | 건축물 식별 단위 | 현재 Source 미연결 |
| `ADDRESS` | 주소 단위 | Kakao 좌표화는 가능; 표준주소·건물 동일성은 제한 |

### 3.3 공간단위 규칙

- Result 하나는 하나의 `analysisUnitType`만 갖는다.
- 여러 공간단위를 결합한 해석은 대표 단위를 정하고 `relatedResultIds`로 다른 단위 결과를 연결한다.
- `OFFICIAL_COMMERCIAL_AREA`의 값은 `RADIUS_300M`/`RADIUS_500M` 값이 아니다.
- `FRAMEONE_MARKET`/`FRAMEONE_SUBMARKET` geometry 연산은 승인 geometry와 crosswalk가 없으므로 `status=BLOCKED`, `missingReason=BLOCKED_BY_GEOMETRY`다.
- 서울시 공식상권·행정동 Polygon을 FRAMEONE 공간단위의 geometry로 사용하지 않는다.

## 4. Value Type

| 값 | 정의 | 예시 원칙 |
|---|---|---|
| `OFFICIAL_VALUE` | 공식 Source가 직접 제공했고 추정·가공 성격이 아닌 값 | 공식 코드·분류·직접 집계값. Source의 의미를 그대로 유지 |
| `CANONICAL_VALUE` | FRAMEONE canonical 자료에 직접 저장된 분류·식별값 | Market/Submarket/Node ID·명칭·내부 분류. 공공 공식값으로 표현 금지 |
| `OBSERVED_SOURCE_VALUE` | Kakao 등 외부 Source가 조회 시 반환한 관측값 | 검색결과 목록·검색 반환건수. 전수자료로 표현 금지 |
| `CALCULATED_VALUE` | FRAMEONE이 원자료에 명시적 계산을 적용한 값 | 거리, 동일 단위 합계, 변화율. 방법 version 필요 |
| `DERIVED_INDEX` | 여러 Result를 조합한 내부 지표 | Pilot 전 고객 노출 금지, 임의 가중치 금지 |
| `ESTIMATED_VALUE` | Source 또는 FRAMEONE 방법론상 추정값 | 서울시 공식상권 추정매출도 이 값 사용 |
| `INTERPRETATION` | 규칙 또는 AI가 기존 Result를 설명한 해석 | 상권유형·위험신호·다음 확인사항 |
| `UNKNOWN` | 근거 부족 또는 dependency 문제로 값을 생성할 수 없음 | `value=null`과 missingReason 필수 |

`valueType`은 Source의 공신력을 표현하지 않는다. 공식성은 `primarySource.sourceType`, 추정 여부는 `valueType`, 계산 방식은 `calculationType`으로 각각 읽는다.

우선순위 규칙:

1. 공식 Source가 제공했더라도 원래 추정값이면 `ESTIMATED_VALUE`다.
2. FRAMEONE canonical 자료에 직접 저장된 ID·명칭·분류는 `CANONICAL_VALUE`다.
3. 외부 검색 응답은 `OBSERVED_SOURCE_VALUE`다.
4. 원자료를 FRAMEONE이 집계·거리·비율로 바꾸면 `CALCULATED_VALUE`다.
5. 복수 축을 조합한 비교지표는 `DERIVED_INDEX`다.
6. 숫자가 아닌 분석 설명은 `INTERPRETATION`이다.
7. 값을 만들 수 없으면 `UNKNOWN`이며 0이나 빈 문자열을 넣지 않는다.

`sourceType` 권장값은 `PUBLIC_DATA_OFFICIAL`, `EXTERNAL_PLATFORM`, `FRAMEONE_CANONICAL`, `FIELD_EVIDENCE`, `SYSTEM_CALCULATION`, `AI_INTERPRETATION`이다. `AI_INTERPRETATION`은 원 Source가 아니라 해석 수행자를 나타내므로 반드시 근거 `sourceReferences`와 `relatedResultIds`를 함께 둔다.

## 5. Result Status

| 상태 | 의미 | `value` | 대표 상황 |
|---|---|---|---|
| `AVAILABLE` | 계약된 의미와 범위에서 사용할 수 있음 | 존재 | 공식상권 통계가 해당 공식상권·기간으로 정상 조회됨 |
| `PARTIAL` | 일부 값은 있으나 coverage·기간·항목이 불완전함 | 존재 | 일부 카테고리만 검색 성공, 일부 기간 누락 |
| `NEEDS_REVIEW` | 값은 있으나 충돌·분류·선택을 사람이 확인해야 함 | 존재 가능 | 공식상권 수동 참고선택, 불확실한 경쟁점 분류 |
| `NOT_AVAILABLE` | 현재 이 실행에서 사용할 결과가 없음 | `null` | 연결 기능이나 입력이 없어 결과를 제공하지 않음 |
| `BLOCKED` | 알려진 선행 dependency 때문에 계산 또는 확정할 수 없음 | `null` | FRAMEONE geometry 부재로 Market 생활인구 집계 불가 |

Result Status는 Boundary의 `preflightStatus`, `reviewStatus`, `aggregationReadiness`, Source registry의 `connectionStatus`와 별도다.

```text
Source result: AVAILABLE
Market aggregation result: BLOCKED
```

위 조합은 모순이 아니다. Source 원자료는 존재하지만 해당 공간단위 계산의 선행조건이 없다는 뜻이다.

상태 판정 순서:

1. 알려진 blocking dependency가 있으면 `BLOCKED`다.
2. dependency blocker는 없지만 결과 자체가 없으면 `NOT_AVAILABLE`이다.
3. 값이 있고 사람의 판단 전에는 사용할 수 없으면 `NEEDS_REVIEW`다.
4. 값이 일부만 있으면 `PARTIAL`이다.
5. 계약한 범위에서 온전히 사용할 수 있을 때만 `AVAILABLE`이다.

## 6. Confidence

| 값 | 의미 | 판단근거 후보 |
|---|---|---|
| `HIGH` | 단위·기간·Source가 명확하고 핵심 근거가 직접적이며 일치함 | 공식 직접값, 명확한 기준기간, 동일 공간단위, 검증된 계산 |
| `MEDIUM` | 사용할 근거는 있으나 계산·coverage·가정 등 제한이 있음 | 공식/외부 데이터를 명시적 방법으로 계산, 일부 limitation |
| `LOW` | proxy·추정·불완전 관측 의존도가 높음 | Kakao 관측만으로 경쟁구조 해석, 미검증 경로 가설 |
| `UNKNOWN` | 판단 근거가 없거나 Result가 산출되지 않음 | `BLOCKED`, `NOT_AVAILABLE`, provenance 부족 |

`confidenceReasons`는 code와 message로 기록한다. 권장 code는 `DIRECT_OFFICIAL_SOURCE`, `UNIT_MATCHED`, `PERIOD_CLEAR`, `MULTIPLE_SOURCES_AGREE`, `CALCULATION_ASSUMPTION`, `PARTIAL_COVERAGE`, `PROXY_SOURCE`, `STALE_SOURCE`, `SOURCE_CONFLICT`, `INSUFFICIENT_EVIDENCE`다.

Confidence가 높다는 것은 값이 긍정적이거나 좋은 상권이라는 뜻이 아니다. 높은 신뢰도로 낮은 수요나 위험 신호를 확인할 수도 있다. `AVAILABLE`과 `HIGH`도 서로 자동 연동하지 않는다.

## 7. Customer Display Policy

| 값 | 의미 | 표시 조건 |
|---|---|---|
| `INTERNAL_ONLY` | 직원 업무 화면에서만 사용 | 내부 규칙, Pilot 지표, 민감한 방법론 또는 미검증 해석 |
| `CUSTOMER_WITH_NOTE` | 고객에게 limitation을 붙여 표시 가능 | 추정값, Kakao 관측, 공식상권 전체값 등 오인 가능성이 있는 결과 |
| `CUSTOMER_READY` | 고객에게 직접 표시 가능한 검증된 설명·공식 통계 | 단위·기간·Source·의미가 명확하고 필요한 주석이 기본 문구에 포함 |
| `HIDDEN` | 화면·리포트 결과로 노출하지 않음 | 기술 오류 payload, 미완성 중간값, 보안·권한 제한 자료 |

적용 예:

- Kakao 검색 반환건수: `CUSTOMER_WITH_NOTE`
- 서울시 공식상권 추정매출: `CUSTOMER_WITH_NOTE`
- 검증된 공식상권 코드·명칭: `CUSTOMER_READY` 가능
- Pilot 전 Flow/Stay/Competition Index: `INTERNAL_ONLY`
- Source 오류 원문이나 내부 stack 정보: `HIDDEN`

`CUSTOMER_READY`는 값이 실제값이거나 좋은 결과라는 뜻이 아니다. 고객 문구도 `analysisUnitLabel`, `referencePeriod`, valueType의 의미를 숨기면 안 된다.

## 8. Field Check

모든 Result는 `fieldCheck.required`를 명시한다. `true`인 경우 최소 하나의 `checkKey`와 확인 이유를 연결한다.

| Result 상황 | `fieldCheck.required` | checkKey 예시 | 현장 확인 |
|---|---:|---|---|
| Flow Potential 경로 후보 | `true` | `FLOW_DIRECTION_CHECK` | 실제 보행방향·피크·barrier |
| Stay Potential | `true` | `STAY_BEHAVIOR_CHECK` | 실제 체류인원·행태·시간대 |
| Kakao 경쟁점 | `true` | `COMPETITOR_OPEN_CHECK` | 실제 영업·업종·상품·규모 |
| 주소 좌표화 | 조건부 `true` | `ENTRANCE_LOCATION_CHECK` | 실제 점포 출입구와 좌표 일치 |
| 공식상권 분기 통계 | 일반적으로 `false` | 없음 | 후보점포 실제매출은 별도 확인 대상 |
| FRAMEONE 분류 | 조건부 `true` | `MARKET_IDENTITY_CHECK` | 현장 수요·상업 연속성과 설명 정합성 |

현장확인은 원 Result를 덮어쓰지 않는다. 별도 조사 회차 Evidence를 만들고 `relatedResultIds`로 연결한다. 현장 결과와 Source가 충돌하면 둘 다 보존하고 새 Result에 `NEEDS_REVIEW` 또는 limitation을 기록한다.

## 9. Limitation

Limitation은 `code + message + severity` 구조를 사용한다. code는 집계·필터·UI에 쓰고 message는 해당 실행의 구체적인 범위와 영향을 설명한다. 자유문구 하나만 저장하지 않는다.

| code | 사용 상황 |
|---|---|
| `UNIT_SCOPE_MISMATCH_RISK` | 공식상권 전체값이 반경·주소 값으로 오인될 가능성 |
| `SEARCH_NOT_CENSUS` | Kakao 검색이 전수 사업체 자료가 아님 |
| `ESTIMATED_NOT_ACTUAL` | 공식 또는 계산 추정값이며 실제값이 아님 |
| `GEOMETRY_UNCONFIRMED` | FRAMEONE geometry가 승인되지 않음 |
| `GRID_CROSSWALK_MISSING` | Grid-to-Market/Submarket 귀속이 없음 |
| `REFERENCE_DATE_GAP` | Source 사이 기준일·기간 차이 |
| `PARTIAL_COVERAGE` | 지역·기간·카테고리 coverage 일부 누락 |
| `TIME_BREAKDOWN_UNAVAILABLE` | 시간대 자료 없음 |
| `WEEKDAY_WEEKEND_UNAVAILABLE` | 평일/주말 분리 불가 |
| `DWELL_TIME_UNAVAILABLE` | 실제 체류시간 Source 없음 |
| `FOOTFALL_NOT_MEASURED` | 실제 유동량을 측정하지 않음 |
| `OPERATING_STATUS_UNVERIFIED` | 장소의 실제 영업상태 미확인 |
| `SOURCE_STALE` | 원천 기준시점이 현재 판단에 오래됨 |
| `METHOD_PILOT_ONLY` | 방법론이 Pilot 검증 전임 |

`severity=BLOCKING`은 해당 Result의 사용을 막는 경우이며 `status=BLOCKED`와 정합해야 한다. `CAUTION`은 값은 사용할 수 있지만 주석이 필요한 경우다. `INFO`는 방법·단위 안내다.

대표 문구:

- “서울시 공식상권 전체 추정값이며 선택한 500m 분석지점의 값이 아닙니다.”
- “Kakao 검색 응답을 중복 제거한 관측값이며 전체 영업점 수나 인허가 상태가 아닙니다.”
- “FRAMEONE Market geometry와 Grid crosswalk가 없어 Market 단위 생활인구를 계산하지 않았습니다.”
- “현재 Source는 실제 체류시간을 제공하지 않으므로 Stay Potential만 해석할 수 있습니다.”

## 10. Missing Policy

`value=null`인 Result는 `missingReason`을 반드시 갖는다.

| 값 | 의미 | 대표 상태 |
|---|---|---|
| `NO_DATA` | Source의 계약된 범위에 해당 observation이 없음 | `NOT_AVAILABLE` 또는 `PARTIAL` |
| `NOT_APPLICABLE` | 해당 공간단위·지표에 개념적으로 적용되지 않음 | `NOT_AVAILABLE` |
| `NOT_CONNECTED` | 필요한 Source adapter/capability가 아직 연결되지 않음 | `NOT_AVAILABLE` |
| `NOT_CALCULATED` | 입력은 있을 수 있으나 계산을 실행하지 않았거나 방법이 미확정 | `NOT_AVAILABLE` |
| `BLOCKED_BY_GEOMETRY` | 승인 geometry 또는 공간 귀속이 없어 계산 불가 | `BLOCKED` |
| `SOURCE_ERROR` | 조회·수집·파싱 오류로 결과를 얻지 못함 | `NOT_AVAILABLE` 또는 `PARTIAL` |
| `UNKNOWN` | 위 사유를 구분할 근거도 부족함 | `NOT_AVAILABLE` |

규칙:

- 생활인구 observation 없음은 0명이 아니다.
- Kakao 검색이 정상 완료되어 반환 목록이 비었다면 “이번 검색 조건의 반환건수 0”은 `OBSERVED_SOURCE_VALUE`로 기록할 수 있다. 이것을 “실제 경쟁점 0개”로 해석할 수 없으며 `SEARCH_NOT_CENSUS`와 현장확인을 붙인다.
- Kakao 호출 실패는 0건이 아니라 `value=null`, `missingReason=SOURCE_ERROR`다.
- 계산 미실행과 계산 불가능을 구분한다. 전자는 `NOT_CALCULATED`, 후자는 알려진 dependency에 따라 `BLOCKED_BY_GEOMETRY`다.
- 빈 문자열, 빈 배열, 0을 결측 대체값으로 사용하지 않는다. 빈 배열이 정상 결과라면 성공한 조회 범위와 의미를 별도 필드로 증명한다.

## 11. 현재 Source Mapping

아래 표는 실제 값을 만들지 않는 계약 적용 예시다. 상태와 Confidence는 요청 성공·coverage·기준시점에 따라 실행별로 달라질 수 있다.

| Source/결과 | 분석단위 | valueType | status 후보 | confidence 후보 | 고객 표시 | 핵심 limitation | 현장확인 |
|---|---|---|---|---|---|---|---|
| Kakao 장소검색 결과·반환건수 | `POI`, `RADIUS_300M` 또는 `RADIUS_500M` | `OBSERVED_SOURCE_VALUE` | 성공 시 `AVAILABLE`, 일부 카테고리 실패 시 `PARTIAL`, 호출 실패 시 `NOT_AVAILABLE` | `MEDIUM` 또는 `LOW` | `CUSTOMER_WITH_NOTE` | `SEARCH_NOT_CENSUS`, `OPERATING_STATUS_UNVERIFIED` | 실제 영업·업종 확인 필요 |
| 서울시 공식상권 Polygon과 지점 관계 | `OFFICIAL_COMMERCIAL_AREA` | 관계 자체는 `CALCULATED_VALUE`, 경계 속성은 `OFFICIAL_VALUE` | 계산 성공 시 `AVAILABLE` | `HIGH` 또는 기준시점 차이 시 `MEDIUM` | `CUSTOMER_READY` 가능 | 공식상권은 FRAMEONE 경계가 아님 | 일반적으로 불필요 |
| 서울시 공식상권 SALES | `OFFICIAL_COMMERCIAL_AREA` | `ESTIMATED_VALUE` | 정상 조회 시 `AVAILABLE` | `HIGH` 또는 기간·coverage 한계 시 `MEDIUM` | `CUSTOMER_WITH_NOTE` | `ESTIMATED_NOT_ACTUAL`, `UNIT_SCOPE_MISMATCH_RISK` | 후보점포 실제매출은 별도 확인 |
| 서울시 공식상권 STORES | `OFFICIAL_COMMERCIAL_AREA` | 공식 제공 통계는 `OFFICIAL_VALUE` | 정상 조회 시 `AVAILABLE` | `HIGH` 또는 기준 한계 시 `MEDIUM` | `CUSTOMER_WITH_NOTE` | 반경 전수 점포수가 아님, 개별 영업 미확인 | 개별 경쟁점 확인 필요 |
| 250m 생활인구 observation | `LIVING_GRID_250M` | 공식 원천 성격에 따라 `OFFICIAL_VALUE` | current observation 존재 시 `AVAILABLE`, 일부 coverage면 `PARTIAL` | `HIGH` 또는 coverage 한계 시 `MEDIUM` | `CUSTOMER_WITH_NOTE` | 기준일, suppression/coverage, Grid 단위 | 체감 수요는 현장확인 |
| FRAMEONE Market 생활인구 집계 | `FRAMEONE_MARKET` | 산출 전이므로 `UNKNOWN` | `BLOCKED` | `UNKNOWN` | `HIDDEN` 또는 blocker 안내만 내부 표시 | `GEOMETRY_UNCONFIRMED`, `GRID_CROSSWALK_MISSING` | geometry로 대체 불가 |
| FRAMEONE Market/Submarket/Node 분류 | 각 `FRAMEONE_*` | `CANONICAL_VALUE` | 계층 조회 성공 시 `AVAILABLE` | 분류는 `HIGH`, 공간 의미는 `UNKNOWN` | `CUSTOMER_READY` 가능하나 내부 분류임을 표시 | geometry 없음, Node 좌표 없음 | 현장 정합성 조건부 확인 |

FRAMEONE canonical 분류는 공공 공식값이 아니다. `sourceType=FRAMEONE_CANONICAL`, `valueType=CANONICAL_VALUE`로 표현하며 서울시 공식 분류처럼 표시하지 않는다.

## 12. P0 Result Set

P0 목표는 현재 데이터만으로 “이 상권을 어떤 근거로 설명할 수 있고 무엇은 아직 모르는가”를 보여주는 것이다.

### 12.1 바로 제공 가능한 Result

| P0 결과 | analysisLayer | analysisUnitType | 표시 내용 |
|---|---|---|---|
| FRAMEONE 권역 기본정보 | `MARKET_IDENTITY` | `FRAMEONE_MARKET` | 자치구, Market명, 하위상권 수, Node 수, 내부 중요도·조사우선순위의 의미 |
| FRAMEONE 하위상권·Node 목록 | `MARKET_IDENTITY` | `FRAMEONE_SUBMARKET`/`FRAMEONE_NODE` | 계층, 명칭, Node 유형, geometry/좌표 부재 |
| 분석 실행조건 | `DATA_EVIDENCE` | `RADIUS_300M`/`RADIUS_500M` | 실행 중심점·확인 주소·반경·실행시각 |
| 공식상권 공간관계 | `DATA_EVIDENCE` | `OFFICIAL_COMMERCIAL_AREA` | 지점 포함, 반경 교차, 수동 참고선택을 분리 |
| 공식상권 SALES | `DEMAND`/`MARKET_CHANGE` | `OFFICIAL_COMMERCIAL_AREA` | 공식상권·분기 단위 추정매출과 Trend |
| 공식상권 STORES | `COMPETITION`/`MARKET_CHANGE` | `OFFICIAL_COMMERCIAL_AREA` | 공식상권·분기 단위 점포·개폐업·프랜차이즈 통계 |
| Kakao 주변 업종 | `SURROUNDING_POI` | `POI` 및 실행 반경 | 검색 관측 목록, 카테고리별 반환건수, 거리, 검색 한계 |
| Source·상태·한계 | `DATA_EVIDENCE` | 각 Result와 동일 | Source, 기간, status, confidence, limitation, field check |
| 미연결·BLOCKED 분석 | `DATA_EVIDENCE` | 대상 단위 | 값 대신 missingReason과 다음 dependency |

### 12.2 P0 설명 규칙

- P0 상권유형은 현재 Result만으로 근거가 충분할 때만 `INTERPRETATION`으로 제시한다. 부족하면 `UNKNOWN`과 필요한 추가 확인을 표시한다.
- `bakeryMarketImportance`와 `researchPriority`는 기존 FRAMEONE 내부 분류값이며 수요·매출·성공가능성으로 번역하지 않는다.
- 공식상권 수치는 공식상권 카드 안에서만 표시하고 300m/500m 카드와 시각적으로 분리한다.
- 현재 가능한 Result와 미연결 Result를 함께 보여주되, 미연결 항목에 placeholder 숫자를 만들지 않는다.
- P0 해석은 사용한 `relatedResultIds`를 열어볼 수 있어야 한다.

### 12.3 아직 사용할 수 없는 Result

- FRAMEONE Market/Submarket 생활인구 집계
- 검증된 Market/Submarket 공간 비교
- 실제 유동량 또는 Flow Index
- 실제 체류시간 또는 Stay Index
- 검증된 Competition Index
- 확정 유망구간
- 후보건물/주소 우선순위
- 건축물·필지 기본정보 기반 판단
- 후보점포 실제·예상매출

이 항목은 `UNKNOWN`, `NOT_AVAILABLE` 또는 알려진 dependency가 있으면 `BLOCKED`로 표현한다.

## 13. Interpretation Contract

숫자·목록 Result와 종합 해석을 분리한다.

### 13.1 최소 구조

```text
Interpretation
- interpretationId
- contractVersion
- analysisRunId
- analysisLayer
- analysisUnitType / analysisUnitId / analysisUnitLabel
- summary
- positiveSignals[]
- riskSignals[]
- unknowns[]
- nextChecks[]
- interpretationBasis[]
- methodologyVersion
- status
- confidence
- limitations[]
- customerDisplayPolicy
- generatedBy
- generatedAt
```

각 `positiveSignal`, `riskSignal`, `unknown`, `nextCheck`는 최소한 `message`, `relatedResultIds`, `reasonCode`를 갖는다. `interpretationBasis`에는 사용한 Result ID와 그 결과에서 사용한 사실을 연결한다.

### 13.2 생성 규칙

- 해석문은 `status`가 허용하는 Result만 근거로 사용한다.
- `BLOCKED`/`NOT_AVAILABLE` Result는 긍정·부정 근거가 아니라 `unknowns`와 `nextChecks`로 보낸다.
- `PARTIAL`/`NEEDS_REVIEW` Result를 쓰면 그 limitation을 해석문에도 전달한다.
- AI는 근거 Result에 없는 숫자를 생성하지 않는다.
- 서로 다른 공간단위 값을 직접 비교하려면 두 Result의 `comparability.comparable=true`가 확인되어야 한다.
- 긍정 신호가 risk 또는 CRITICAL 현장확인 사항을 상쇄하지 않는다.
- 해석문은 성공 가능성, 계약 가능 여부, 실제매출을 확정하지 않는다.

## 14. Field Handoff Contract

기초분석에서 기본분석 현장조사로 넘길 단위는 `FieldCheckItem`이다. 이 구조도 구현 전 의미 계약이다.

```text
FieldCheckItem
- checkId
- checkKey
- title
- reason
- relatedResultIds[]
- priority: REQUIRED | HIGH | NORMAL | LOW
- location
  - analysisUnitType
  - analysisUnitId 또는 null
  - label
  - coordinateRef 또는 null
- fieldMethod[]
- requiredEvidence[]
- expectedOutcome
- status: OPEN | COMPLETED | NOT_VERIFIABLE | CANCELLED
- assignedTo 또는 null
- createdAt
```

### 14.1 표준 checkKey 후보

| checkKey | 제목 템플릿 | fieldMethod | requiredEvidence 후보 |
|---|---|---|---|
| `FLOW_DIRECTION_CHECK` | “선택 구간의 실제 보행방향 확인” | 시간대별 방향·통과량 관찰 | 조사일시, 조사자, 위치, 관찰기록, 사진 |
| `STAY_BEHAVIOR_CHECK` | “체류 후보 장소 주변의 실제 체류행태 확인” | 대기·좌석·정차·체류행태 관찰 | 시간대, 관찰기록, 사진 |
| `COMPETITOR_OPEN_CHECK` | “검색된 경쟁점의 실제 영업 여부 확인” | 현장 방문·간판·영업상태 확인 | 상호, 주소, 사진, 확인상태 |
| `ENTRANCE_LOCATION_CHECK` | “주소 좌표와 실제 점포 출입구 확인” | 출입구·보행접근 확인 | 좌표, 사진, 접근 메모 |
| `MARKET_IDENTITY_CHECK` | “프로그램 상권설명과 현장 수요구조 정합성 확인” | 수요원·시간대·업종연속성 관찰 | 관찰기록, 반대근거, 사진 |

위 문구는 TEMPLATE이며 실제 장소·좌표·영업상태를 생성하지 않는다. `requiredEvidence`는 Evidence 유형 요구사항이며 가짜 Evidence가 아니다.

### 14.2 인계 규칙

- 하나의 FieldCheckItem은 최소 하나의 Result에 연결한다.
- `reason`에는 Result의 limitation 또는 불확실성이 현장에서 어떻게 해소되는지 적는다.
- 위치를 확인할 수 없으면 좌표를 만들지 않고 `coordinateRef=null`과 위치 확인 check를 둔다.
- 완료된 현장조사는 원 Result를 수정하지 않고 새 survey round와 Evidence로 보존한다.
- 현장 결과가 프로그램 해석과 다르면 둘 중 하나를 삭제하지 않고 충돌 상태로 후속 검토한다.

## 15. 화면 표현원칙

모든 숫자 옆에 긴 Source 설명을 반복하지 않고 단계적으로 근거를 공개한다.

### 15.1 기본 카드

- 제목: `metricLabel`
- 값과 단위
- 공간단위 badge: 예 `서울시 공식상권`, `500m 반경`
- 값 성격 badge: 예 `공식 추정값`, `Kakao 검색 관측`, `FRAMEONE 해석`
- Result Status와 Confidence의 작은 badge
- 기준일 또는 기간
- limitation이 있으면 주의 아이콘과 첫 문장

### 15.2 상세 확인

- 정보 tooltip: 값 성격과 짧은 limitation
- 근거 보기 drawer: Source, 원자료 locator, 계산방법, confidenceReasons, limitations, relatedResultIds
- 데이터 근거 탭: 실행의 모든 Result와 Source 상태, BLOCKED/미연결 항목
- 현장확인 패널: `fieldCheck.required=true` Result에서 생성된 check 목록

### 15.3 오인 방지

- 공식상권 카드와 300m/500m 반경 카드는 제목·색·단위 badge를 분리한다.
- `status`와 `confidence`를 하나의 색으로 합치지 않는다.
- `UNKNOWN`은 `-`, 0, 회색 정상값으로 표시하지 않고 “자료 없음/연결 전/geometry로 차단” 등 이유를 보여준다.
- 추정값은 `valueType=ESTIMATED_VALUE` label을 값 가까이에 둔다.
- 내부 Pilot 지표는 고객 모드에서 숨긴다.
- 고객 화면은 쉬운 문구를 쓰되 Source·단위·추정 성격을 제거하지 않는다.

## 16. 구현 시 주의사항

1. 이 문서를 그대로 DB schema나 TypeScript enum으로 복사하기 전에 기존 Context·API 응답과의 adapter 경계를 설계한다.
2. `analysisRunId`와 `inputSnapshotRef`로 실행 당시 Market/Submarket·중심점·반경을 보존한다.
3. 외부 Source 원문과 정규화 Result, 계산 Result, Interpretation을 분리한다.
4. 공식 추정매출은 `ESTIMATED_VALUE`이며 실제매출이나 후보점포 예상매출로 승격하지 않는다.
5. Kakao 반환건수는 검색 관측값이며 전수 점포수나 영업 확인값이 아니다.
6. 결측, 조회 실패, 정상적인 0 관측을 서로 구분한다.
7. FRAMEONE geometry가 없는 동안 Market/Submarket 공간연산은 `BLOCKED`다.
8. 공식상권·행정동 경계를 FRAMEONE geometry나 확정 crosswalk로 사용하지 않는다.
9. Flow는 `Flow Potential`, Stay는 `Stay Potential`로 표시하고 실측값을 생성하지 않는다.
10. 계산·해석은 `methodologyVersion`, `relatedResultIds`, `sourceReferences`가 없으면 고객 결과로 사용하지 않는다.
11. Customer Display Policy는 서버·리포트·UI에서 동일하게 적용하고 내부 필드를 단순히 CSS로만 감추지 않는다.
12. Source 오류 원문, API key, 개인정보, 내부 민감정보를 Result에 포함하지 않는다.
13. 과거 Result를 최신 Source로 조용히 덮어쓰지 않고 새 analysis run 또는 result version을 만든다.
14. Source별 기준기간이 다르면 자동 비교하지 않고 `REFERENCE_DATE_GAP`을 표시한다.
15. Index의 임의 가중치와 후보구간·후보건물의 가짜 우선순위를 만들지 않는다.

## 17. P0 구현 완료조건

P0 Result Contract 적용은 다음을 모두 만족할 때 완료다.

- 현재 `/markets`의 FRAMEONE 계층, Kakao 장소검색, 공식상권 관계, SALES/STORES가 공통 Result로 변환된다.
- 모든 Result에 `analysisRunId`, 분석 업무영역, 공간단위, Source, 기준기간, valueType, status, confidence, limitation, 고객 표시정책이 있다.
- 공식상권 전체값과 300m/500m 반경 결과가 같은 공간단위처럼 보이지 않는다.
- 공식 추정매출이 실제매출 또는 후보점포 예상매출로 표시되지 않는다.
- Kakao 검색 반환건수가 전체 점포수로 표시되지 않는다.
- `AVAILABLE`, `PARTIAL`, `NEEDS_REVIEW`, `NOT_AVAILABLE`, `BLOCKED`가 Boundary 상태와 분리된다.
- 결측과 정상 0이 구분되고 모든 `null` 결과에 missingReason이 있다.
- Market/Submarket 생활인구는 계속 `BLOCKED_BY_GEOMETRY`로 표시된다.
- P0에서 Flow Index, Stay Index, 후보구간, 후보건물 값을 생성하지 않는다.
- Interpretation의 모든 문장과 신호가 `relatedResultIds`로 추적된다.
- 현장확인이 필요한 Result는 최소 하나의 표준 checkKey로 FieldCheckItem에 인계된다.
- 고객 모드와 직원 모드가 Customer Display Policy를 동일하게 준수한다.
- 기존 분석 Context가 바뀌어도 실행 snapshot 결과가 새 Context로 오인되지 않는다.
- 계약 적용 테스트에는 공식상권/반경 단위 혼동, Source 오류, 빈 검색결과, geometry blocker, 기간 불일치 사례가 포함된다.

## 18. 현재 P0 Blocker와 비차단 항목

### P0 구현을 막지 않는 항목

- FRAMEONE Market/Submarket geometry 부재: 공간집계는 막지만 계층 설명과 blocker 표시는 가능
- Flow/Stay Index 미구현: P0 범위가 아니므로 값 없이 상태만 표시
- 후보구간·후보건물 미구현: P2/P3 범위

### P0 구현 전에 결정해야 할 항목

- 기존 `/markets` 응답을 Result로 변환하는 adapter 위치와 책임
- `analysisRunId` 생성·수명과 input snapshot 보존 위치
- Result 및 Interpretation의 runtime validation 경계
- Customer Display Policy를 서버 응답, 화면, 리포트 중 어디에서 강제할지

이 항목은 기술 설계 결정이며 geometry blocker를 해제하거나 실제 데이터를 변경하지 않는다.

## 19. 다음 단일 개발 작업

다음 작업은 **P0 Result Adapter & View Model Technical Spec V1**을 권장한다. 현재 `MarketAnalysisContext`, Kakao nearby 응답, 공식상권 공간관계, SALES/STORES presentation을 이 계약의 Result로 변환하는 adapter 경계와 오류·결측 처리만 문서로 설계한다. 구현 전에 기존 화면과 API contract에 미치는 영향을 고정해 P0 코드 변경 범위를 최소화한다.
