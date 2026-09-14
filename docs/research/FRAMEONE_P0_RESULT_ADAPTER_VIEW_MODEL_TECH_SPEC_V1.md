# FRAMEONE P0 Result Adapter & View Model Technical Spec V1

- 문서 상태: `IMPLEMENTATION_READY`
- 작성 기준일: `2026-09-14`
- Repository 기준: branch `codex-night-20260901`, HEAD `eaa0c16`
- 상위 설계: `FRAMEONE_BASIC_LOCATION_ANALYSIS_V2_MASTER_SPEC.md`
- Result 계약: `FRAMEONE_BASIC_LOCATION_RESULT_CONTRACT_V1.md`
- 범위: `/markets` P0 구현을 위한 최소 기술구조
- 제외 범위: 코드·UI·API·DB·schema·library·geometry 구현

## 1. 목적

이 문서는 현재 `/markets`에서 생성되는 분석 데이터를 P0 공통 Result와 화면 전용 View Model로 안전하게 변환할 위치와 책임을 확정한다.

P0가 답할 질문은 다음과 같다.

- 현재 선택한 지역과 분석지점은 어디인가?
- FRAMEONE 내부 분류상 어떤 권역·하위상권인가?
- Kakao와 서울시 공식상권에서 어떤 근거를 확인했는가?
- 각 근거의 공간단위·기준기간·값 성격은 무엇인가?
- 무엇이 조회 실패·미연결·geometry dependency로 확인 불가한가?
- 현장에서 무엇을 다시 확인해야 하는가?

P0는 실제 Flow Index, Stay Index, Market/Submarket 생활인구 집계, 유망구간, 후보건물을 만들지 않는다.

## 2. 현재 Repository 구조

### 2.1 현재 실행 흐름

```text
MARKET_HIERARCHY.json
  → app/markets/page.tsx
  → MarketsExplorer hierarchy prop

지도 선택 또는 주소 좌표화
  → KakaoBaseMap draft point/radius
  → “이 위치 상세분석” 실행
  → ExecutedMarketAnalysis
  → MarketSpatialViewer executedSpatialAnalysis + executedFrameoneContext

Kakao nearby API
  → KakaoBaseMap fetch
  → KakaoNearbySearchState
  → MarketSpatialViewer

서울 공식상권 GeoJSON
  → spatial-layers API
  → MarketSpatialViewer client parse/load
  → findRelatedOfficialMarkets

공식상권 수동 참고선택
  → bakery-data API
  → SALES/STORES + Trend
  → MarketSpatialViewer client parse

위 상태 결합
  → buildMarketAnalysisContext
  → MarketAnalysisContext
  → MarketsExplorer
  → buildMarketSummaryPresentation
  → MarketAnalysisSummary UI
```

### 2.2 현재 파일별 책임

| 파일 | 현재 책임 | P0 판단 |
|---|---|---|
| `app/markets/page.tsx` | hierarchy JSON을 읽어 Client Component에 전달 | 유지. P0 도메인 해석을 추가하지 않음 |
| `app/markets/MarketsExplorer.tsx` | Market/Submarket 선택, 탭·분석모드, 최상위 Context 상태, 화면 조합 | P0 View Model 조립의 호출 지점으로 사용 |
| `app/markets/KakaoBaseMap.tsx` | draft 위치·반경, 실행 이벤트, geocode, nearby fetch와 지도 표시 | Source 획득 UI로 유지. Result 의미 판정 금지 |
| `app/markets/MarketSpatialViewer.tsx` | 공간 layer fetch, 공식상권 관계 계산, crosswalk·공식통계 fetch, Context 조립 | 현재 orchestration을 유지하되 Result/표시 로직은 추가하지 않음 |
| `lib/market-data/market-analysis-context.ts` | 실행·Source 상태를 불변 snapshot으로 정규화 | P0 Adapter 입력 경계로 재사용하고 run identity 추가 |
| `lib/market-data/market-analysis-presentation.ts` | deterministic 해석, 상태문구, 값 formatting, customer/staff 세부정보 조립 | 전환 기간 재사용. 최종적으로 Interpretation과 View Model로 책임 분리 |
| `app/markets/MarketAnalysisSummary.tsx` | presentation 결과 렌더링과 staff/customer toggle | P0 View Model만 렌더링하도록 점진 전환 |
| `app/api/markets/nearby-places/route.ts` | Kakao 요청, 응답 정규화, 중복 제거 결과 반환 | Source adapter로 유지; provider 응답 runtime validation 강화 지점 |
| `app/api/markets/bakery-data/route.ts` | 공식상권 코드 검증, SALES/STORES service 호출, Trend 반환 | 유지. 공통 Result 변환은 하지 않음 |
| `app/api/markets/spatial-layers/[layerId]/route.ts` | 허용된 공간 layer 전달 | 유지. P0 Result 의미 판정 금지 |
| `app/api/markets/crosswalk/route.ts` | manual-review 후보만 반환 | 데이터 근거용 유지. 확정 관계 Result로 변환 금지 |
| `lib/market-data/services/bakery-official-market.ts` | 공식 Source observation과 Trend 생성 | Source normalization/service로 재사용 |
| `lib/market-data/data-source-registry.ts` | Registry runtime validation과 Source 조회 | Source 메타데이터·validation 패턴 재사용 |

### 2.3 현재 구조의 핵심 간극

- `analysisRunId`가 없어 하나의 실행에 속한 결과 묶음을 명시적으로 식별할 수 없다.
- `MarketAnalysisContext`는 좋은 불변 입력 snapshot이지만 Result Contract의 상태·Confidence·limitation·display policy를 제공하지 않는다.
- `market-analysis-presentation.ts`가 해석과 표시 formatting을 함께 담당한다.
- `MarketAnalysisSummary.tsx`가 Context 기반 결과를 렌더링하며 공통 Customer Display Policy 경계가 없다.
- hierarchy JSON은 현재 `unknown as MarketHierarchy`로 전달된다.
- bakery/crosswalk client parser는 일부 최상위 필드만 확인하고 observation 내부 finite 값·enum·기간 정합성을 완전히 검증하지 않는다.
- Kakao client fetch는 응답을 타입 단언한 뒤 사용하므로 API payload 경계 검증이 약하다.
- 새 분석 실행 시 늦게 도착한 이전 요청 응답과 기존 공식상권 참고선택을 run 단위로 차단하는 명시적 token이 없다.

## 3. P0 Data Flow

### 3.1 확정 흐름

```text
Raw Provider / Repository Data
  ↓
기존 Source Normalization
  - API route validation/normalization
  - Seoul client + adapter + service
  - hierarchy validation boundary
  ↓
MarketAnalysisContext V2
  - analysisRunId
  - executed target snapshot
  - executed FRAMEONE context
  - run-scoped Source request states
  ↓
Source-specific Result Adapters
  ↓
BasicLocationResult[]
  ↓
Deterministic Interpretation Builder
  ↓
Customer Display Policy Filter
  ↓
P0 View Model Builder
  ↓
MarketAnalysisSummary UI
```

### 3.2 단계별 책임

| 단계 | 책임 | 금지 책임 |
|---|---|---|
| Raw Source | 공급자가 제공한 원문·파일 | FRAMEONE 의미·상태 판정 |
| Source Normalization | 필드 파싱, 기본 식별자·숫자·enum 검증, Source 단위 보존 | 고객 문구, 상권판정 |
| MarketAnalysisContext | 실행 snapshot과 각 Source 요청상태를 결합·freeze | Confidence·limitation·표시정책 결정 |
| Result Adapter | Source/Context를 Result Contract로 변환 | I/O, AI 해석, UI 스타일, 최종 상권판정 |
| Interpretation Builder | Result만 사용한 deterministic 설명 | Source 직접 접근, 새 숫자 생성 |
| Display Policy Filter | audience별 Result·Interpretation 노출 제한 | 도메인 계산, UI 임의 예외 |
| View Model Builder | 렌더링 순서, label, badge, note, empty/error section 조립 | Raw Source 의미 재판정 |
| UI | View Model을 접근성 있게 렌더링하고 사용자 이벤트 전달 | Source status·Confidence·limitation 계산 |

### 3.3 기존 Context의 위치

`MarketAnalysisContext`는 Raw Source가 아니며 최종 Result도 아니다. 현재 여러 비동기 Source 상태와 실행 기준을 안전하게 묶는 **run input snapshot**으로 유지한다. P0 Adapter는 이 Context와 실행 당시 FRAMEONE hierarchy snapshot만 입력으로 받는다.

새 Result pipeline은 기존 API 응답을 즉시 전면 교체하지 않는다. 현재 Context 생성까지의 흐름을 유지하고 그 뒤에 순수 변환계층을 추가한다.

## 4. Result Adapter 책임

### 4.1 담당 범위

각 Adapter는 다음을 수행한다.

- 안정적인 `resultId`, `metricKey`, `metricLabel` 생성
- `analysisRunId`와 input snapshot 연결
- `analysisLayer` 지정
- `analysisUnitType`, ID, label 지정
- Source ID·이름·유형과 sourceReferences 연결
- referenceDate/referencePeriod/fetchedAt 연결
- `value`, `valueShape`, `unit`, `valueType`, `calculationType` 지정
- Result `status`, `confidence`, `confidenceReasons` 지정
- limitation code/message/severity 생성
- `value=null`일 때 missingReason 지정
- 현장확인 required/checkKey/message 연결
- customerDisplayPolicy 지정
- comparability와 methodologyVersion 지정
- 계산·해석 입력 Result의 lineage 연결

### 4.2 하지 않는 일

- 외부 Source 또는 API 조회
- geometry 계산
- AI 호출
- 임의 숫자·매출·Flow·Stay·점포수 생성
- UI 색상·layout·반응형 결정
- 최종 상권 좋음/나쁨 판정
- 후보구간·후보건물 추천
- Boundary 또는 crosswalk 승인
- Source 원문 수정

### 4.3 공통 helper 원칙

공통 helper는 다음처럼 구조적 불변조건만 보장한다.

- Result ID 생성 규칙
- `value=null`과 missingReason 정합성
- `BLOCKED`와 blocking limitation 정합성
- Source reference 기본 조립
- Result deep-freeze
- exhaustive enum 처리
- finite number·날짜/분기·좌표 guard 재사용

공통 helper가 Source별 Confidence나 limitation을 알아서 추론하지 않는다. 그 정책은 Source Adapter 안의 명시적 mapping table로 둔다.

## 5. Source Adapter 구성

### 5.1 선택한 방식

**Source별 독립 Adapter + 공통 Result helper + 별도 Interpretation/View Model builder**를 채택한다.

현재 Source의 단위와 실패 의미가 서로 다르기 때문이다.

- Kakao는 실행 반경의 on-demand 검색 관측이다.
- 공식상권 공간관계는 검증된 서울시 Polygon과 실행 원의 계산 결과다.
- SALES는 공식 Source가 제공한 추정값이다.
- STORES는 공식상권·분기 통계다.
- FRAMEONE hierarchy는 내부 canonical 분류이고 geometry가 없다.
- blocked analysis는 Source 실패가 아니라 알려진 dependency 결과다.

Analysis Layer별 Adapter는 하나의 Source 응답을 여러 번 해석하거나 서로 다른 Source 의미를 한 함수에 결합할 위험이 있다. 하나의 거대한 Adapter도 Source 추가·부분 실패·단독 테스트를 어렵게 하므로 사용하지 않는다.

### 5.2 Adapter 목록과 입출력

| Adapter | 입력 | 출력 | 핵심 정책 |
|---|---|---|---|
| `adaptAnalysisTargetResults` | run target snapshot | 분석지점·반경 Result | 좌표·반경은 실행값만 사용, draft state 금지 |
| `adaptFrameoneHierarchyResults` | executed FRAMEONE context와 선택 hierarchy record | Market/Submarket/Node canonical Result | `CANONICAL_VALUE`; geometry/좌표를 만들지 않음 |
| `adaptKakaoNearbyResults` | `context.kakaoNearby` | 카테고리 상태, 반환건수, POI Result | `OBSERVED_SOURCE_VALUE`; 전수 점포수 금지; 오류 count null |
| `adaptOfficialMarketRelationResults` | `context.officialMarkets` | INSIDE/RADIUS_OVERLAP/UNKNOWN 및 수동 참고선택 Result | 계산 관계와 수동선택을 별도 Result로 분리 |
| `adaptOfficialSalesResults` | `context.publicData.selectedOfficialMarketData.sales` | 공식상권 SALES Result | 추정매출은 `ESTIMATED_VALUE`; 반경·점포 값 아님 |
| `adaptOfficialStoresResults` | `context.publicData.selectedOfficialMarketData.stores` | 공식상권 STORES Result | 지표별 Result; 유사업종·전체·프랜차이즈를 합산하지 않음 |
| `adaptOfficialTrendResults` | `officialTrend` | 기간별 값·QoQ/delta Result | 연속 분기와 null 계산 정책 보존 |
| `buildP0UnavailableResults` | run snapshot과 known capability state | 미연결·BLOCKED Result | 생활인구 집계·Flow·Stay·구간·건물에 숫자 생성 금지 |

### 5.3 조립 함수

상위 pure orchestrator `buildP0BasicLocationResults`는 I/O 없이 각 Adapter를 호출하고 Result 배열을 반환한다.

```text
buildP0BasicLocationResults(input)
  = target results
  + FRAMEONE canonical results
  + Kakao results
  + official relation results
  + SALES results
  + STORES/Trend results
  + unavailable/blocked results
```

부분 실패는 전체 throw로 바꾸지 않는다. Adapter 입력 자체가 계약을 위반한 경우에만 개발 오류로 fail fast한다. 정상적인 Source 오류·미응답·missing은 Result Status와 missingReason으로 변환한다.

### 5.4 Source metadata

Adapter는 `getDataSourceById`로 Registry의 정적 메타데이터를 조회할 수 있다. Registry의 `connectionStatus`를 실행 Result의 `status`로 복사하지 않는다. 예를 들어 Source가 `CONNECTED`여도 이번 요청이 실패하면 Result는 `NOT_AVAILABLE/SOURCE_ERROR`다.

## 6. analysisRunId 정책

### 6.1 생성 시점과 위치

- 사용자가 **“이 위치 상세분석”을 실행하는 순간** 새 `analysisRunId`를 생성한다.
- 현재 이벤트 소유권에 맞춰 `MarketSpatialViewer.handleAnalysisExecuted`에서 생성하고 `ExecutedMarketAnalysis`/`MarketAnalysisContext`에 넣는다.
- 구현은 브라우저 기본 `crypto.randomUUID()`를 우선하며 새 library를 추가하지 않는다.
- `buildMarketAnalysisContext`는 clock이나 UUID를 생성하지 않고 전달받은 ID를 검증·freeze만 한다.

### 6.2 새 Run 판정

| 사용자 행동 | Run 처리 | 이유 |
|---|---|---|
| 지도 draft 이동·새 점 선택, 아직 실행 전 | 기존 Run 유지 | 실행 snapshot은 바뀌지 않음 |
| 같은 조건으로 분석 버튼 재실행 | 새 Run | 새로운 Source 요청과 시점을 가진 별도 실행 |
| 좌표 변경 후 재실행 | 새 Run | 분석대상 변경 |
| 300m→500m 또는 500m→300m 후 재실행 | 새 Run | 분석단위 변경 |
| FRAMEONE Market/Submarket 변경만 하고 미실행 | 기존 Run 유지, stale 표시 | 현재 코드의 실행 Context 보존 원칙 유지 |
| Market/Submarket 변경 후 분석 재실행 | 새 Run | 실행 FRAMEONE Context 변경 |
| 공식상권 참고선택만 변경 | 같은 Run의 새 `resultSetRevision` | 분석지점·반경은 같고 참고 통계 Source 선택만 변경 |
| 페이지 새로고침 | Run 종료 | P0는 영구저장하지 않음 |

### 6.3 공식상권 선택과 Result revision

공식상권 수동 참고선택은 target Run을 바꾸지 않는다. 대신 in-memory `resultSetRevision`을 증가시키고 이전 공식통계 Result를 현재 View Model에서 대체한다. 요청한 공식상권 코드, 요청 시작 revision, 응답 완료 revision을 비교해 늦게 도착한 과거 응답을 폐기한다.

`resultSetRevision`은 DB version이 아니다. P0의 비동기 결과 정합성을 위한 메모리 값이다. 이후 영구 snapshot을 도입할 때는 선택 변경마다 immutable result-set version을 저장한다.

### 6.4 Source request 귀속

- 모든 비동기 요청은 시작 당시 `analysisRunId` 또는 `resultSetRevision`을 캡처한다.
- 응답 시 현재 token과 일치할 때만 Context에 반영한다.
- 새 Run 시작 시 Kakao, 공식 공간관계, 공식통계의 이전 loading/error/data state를 새 Run에 상속하지 않는다.
- 기존 `AbortController`는 유지하되 abort만으로 정합성을 가정하지 않는다.

### 6.5 P0 저장과 향후 연결

- P0에서는 React memory에만 보관하며 localStorage·DB·상담 JSON에 저장하지 않는다.
- 새로고침과 페이지 이탈 시 Run은 사라진다.
- 향후 상담/현장조사 연결 시 `analysisRunId`, input snapshot, result contractVersion, methodologyVersion과 Result Set을 immutable snapshot으로 저장할 수 있다.
- 영구저장 전에는 `analysisRunId`만 상담 이력이나 현장 Evidence에 연결한 것으로 간주하지 않는다.

## 7. Runtime Validation

### 7.1 원칙

외부·파일·API 경계에서는 `unknown`을 받아 검증한 뒤 내부 타입으로 변환한다. P0 때문에 새 validation library를 추가하지 않는다. 현재 `data-source-registry.ts`, `parseMarketCrosswalk`, `parseBakeryDataResponse`의 수동 guard 패턴을 작은 공통 primitive로 정리한다.

### 7.2 경계별 책임

| 경계 | 검증 위치 | 최소 검증 |
|---|---|---|
| Kakao provider 응답 | `nearby-places` server route의 provider parser | documents 배열, place ID/명칭, x/y finite·서울 범위 후보, distance finite/non-negative, 예상 필드형 |
| nearby API client 응답 | `KakaoBaseMap`의 전용 response parser | categories enum, 배열, totalCount finite/non-negative, POI 필수필드, 응답 중심·반경 일치 |
| geocode API | server provider parser + client response parser | 좌표 finite, EPSG:4326 범위, resolvedAddress string/null |
| 공식상권 GeoJSON | spatial API allowlist + client `parseFeatureCollection` | FeatureCollection, geometry type, feature count, 공식상권 ID |
| 공식상권 공간관계 | pure relation 함수 입출력 | marketCode/name, relation enum, 실행 좌표·반경 일치 |
| SALES/STORES provider | 기존 Seoul client/adapter | 공식상권 코드, 분기, metric enum, unit, finite/null, dataStatus |
| bakery-data client 응답 | `parseBakeryDataResponse` 강화 | observation 내부 ID·metric·unit·status·finite, 공식상권·분기 일치, Trend 값 finite/null |
| hierarchy JSON | server import 직후 전용 parser | schemaVersion, District/Market/Submarket/Node 배열, ID·parent 정합, 허용 status, nullable 좌표 finite |
| Result Adapter 출력 | 공통 invariant assertion | contractVersion, runId, unit/value/status/missing 정합, Source lineage, display policy |
| View Model 출력 | 개발 invariant | section ID 중복, display policy 위반, hidden Result 포함 여부 |

### 7.3 오류 처리

- Provider payload 위반은 해당 Source Result를 `NOT_AVAILABLE/SOURCE_ERROR`로 만든다.
- 배열 일부만 안전하게 분리할 수 있고 Source 계약이 이를 허용하면 정상 항목은 보존하고 `PARTIAL/PARTIAL_COVERAGE`로 표시한다.
- 잘못된 숫자는 0으로 바꾸지 않는다.
- 예상하지 못한 enum은 기본 `AVAILABLE`로 매핑하지 않는다.
- 개발자가 만든 Result Contract invariant 위반은 조용히 숨기지 않고 개발 환경에서 fail fast한다.
- 사용자 화면에는 내부 stack·provider 원문·secret을 전달하지 않는다.

## 8. Customer Display Policy

### 8.1 강제 위치

Customer Display Policy는 **공통 View Model Builder 진입점**에서 강제한다.

```text
BasicLocationResult[] + Interpretation[] + audience
  → applyResultDisplayPolicy
  → buildP0ViewModel
  → UI
```

UI component는 `customerDisplayPolicy`를 재판정하거나 숨김 예외를 만들지 않는다.

### 8.2 audience별 규칙

| Policy | STAFF View Model | CUSTOMER View Model |
|---|---|---|
| `INTERNAL_ONLY` | 표시 가능, 내부 badge 필수 | 제외 |
| `CUSTOMER_WITH_NOTE` | 표시 | limitation note와 함께 표시 |
| `CUSTOMER_READY` | 표시 | 표시 |
| `HIDDEN` | 일반 화면에서 제외; 진단 log에도 원문 비노출 | 제외 |

현재 `/markets`는 직원 업무 화면이므로 기본 `audience=STAFF`다. 기존 “상담용 보기” toggle은 표현 모드일 뿐 권한 경계가 아니다. 향후 고객 리포트는 서버에서 `audience=CUSTOMER` View Model을 생성한 뒤 직렬화해야 하며, 전체 직원 Result를 브라우저에 보내 CSS로 숨기지 않는다.

표시정책 filter가 Result를 제외하면 그 Result를 근거로 한 고객 Interpretation도 함께 제외하거나 허용된 근거만으로 다시 생성한다. 근거가 사라진 문장은 남기지 않는다.

## 9. Interpretation Builder

### 9.1 구조

P0 Interpretation Builder는 I/O와 AI가 없는 pure deterministic function이다.

```text
buildP0Interpretation(results, runSnapshot)
  → summary
  → positiveSignals[]
  → riskSignals[]
  → unknowns[]
  → nextChecks[]
  → interpretationBasis[]
```

각 항목은 `reasonCode`, `messageKey`, 렌더링에 필요한 안전한 params, `basisResultIds`를 갖는다. 긴 자유문구를 조건문마다 직접 만들기보다 제한된 message catalog를 사용한다.

### 9.2 P0 deterministic rule

| 조건 | 출력 그룹 | 허용 해석 |
|---|---|---|
| 공식상권 `INSIDE` Result AVAILABLE | 확인된 내용 | 분석지점이 해당 공식상권 경계 내부 |
| 복수 `RADIUS_OVERLAP` AVAILABLE | 참고할 내용 | 분석반경이 여러 공식통계 단위와 교차하므로 단일 통계 해석 주의 |
| 공식 SALES/STORES AVAILABLE/PARTIAL | 확인된 내용/참고 | 해당 공식상권·분기 통계가 전부/일부 존재 |
| Kakao 카테고리 AVAILABLE | 참고할 내용 | 해당 반경·검색조건에서 장소 결과가 반환됨 |
| Kakao NOT_AVAILABLE | unknowns/nextChecks | 주변검색을 확인할 수 없어 재조회 필요 |
| 공식상권 관계 결과 없음 | 참고할 내용 | 계산한 공식상권 중 직접 포함·교차가 확인되지 않음 |
| 공식상권 관계 UNKNOWN | unknowns | 계산 불가를 OUTSIDE로 처리하지 않음 |
| FRAMEONE geometry BLOCKED | unknowns | Market/Submarket 공간집계 불가 |
| Flow/Stay/구간/건물 NOT_AVAILABLE | unknowns | 현재 P0 범위에서 판단하지 않음 |
| Kakao 경쟁 POI 존재 | nextChecks | 실제 영업·업종·상품 확인 필요 |

P0의 `positiveSignals`는 데이터가 긍정적이라는 의미로 사용하지 않는다. 명확한 공간관계나 Source 가용성처럼 **확인된 분석 기반**만 담는다. 수요가 좋다, 경쟁이 약하다, 매출이 높다, 유망하다는 결론은 만들지 않는다.

### 9.3 기존 presentation 전환

현재 `buildMarketSummaryPresentation`의 다음 로직은 초기 rule catalog의 참고 구현으로 재사용한다.

- request status 표현
- Kakao 카테고리별 성공·실패 분리
- INSIDE/RADIUS_OVERLAP/UNKNOWN 구분
- 공식상권 수동선택 warning
- 확인된 내용/참고할 내용/추가 확인 필요 분류
- 공식상권과 반경의 제한 문구

값 formatting, UI label, staff raw detail 조립은 Interpretation Builder에 옮기지 않고 View Model Builder로 분리한다.

## 10. P0 View Model

### 10.1 개념 구조

```text
P0BasicLocationViewModel
- schemaVersion
- analysisRunId
- resultSetRevision
- audience
- pageStatus: EMPTY | LOADING | READY | PARTIAL
- analysisContext
- marketIdentity
- availableEvidence
- currentInterpretation
- missingBlockedAnalysis
- fieldHandoffPreview
- dataEvidence
- navigation
```

### 10.2 Section별 필드

| Section | 최소 필드 | UI 책임 |
|---|---|---|
| `analysisContext` | Market/Submarket label·ID, executed address/point, radius, executedAt, stale 여부 | 실행 기준을 고정 표시 |
| `marketIdentity` | canonical facts, official relations, identity interpretation, limitations | 내부 분류와 공식상권 구분 |
| `availableEvidence` | group ID, title, unit badge, Result cards | Kakao/SALES/STORES/공식경계 그룹 렌더링 |
| `currentInterpretation` | summary, confirmed/positive, reference, risks, unknowns, nextChecks | deterministic 해석 표시 |
| `missingBlockedAnalysis` | title, status, missingReason label, blocking dependencies, next availability condition | 값 없이 미연결·차단 이유 표시 |
| `fieldHandoffPreview` | checkKey, title, reason, priority, related result links | 향후 현장조사 인계 미리보기 |
| `dataEvidence` | Source, unit, date/period, valueType, status, confidence, limitations, sourceReference | drawer/근거 탭 렌더링 |
| `navigation` | section IDs·labels·enabled 상태 | IA 순서 제공 |

### 10.3 Result card

View Model의 Result card는 이미 표시 가능한 값이어야 한다.

```text
ResultCardViewModel
- id
- label
- displayValue
- unitLabel
- analysisUnitBadge
- valueTypeBadge
- statusBadge
- confidenceBadge
- referenceLabel
- primaryNote
- hasMoreEvidence
- evidenceTargetId
- internalOnly
```

UI는 원시 `value`, Source status, missingReason를 다시 해석하지 않는다. `displayValue`의 “자료 없음”, “조회 실패”, “geometry로 차단” 구분은 builder가 만든다. 단, View Model은 원 Result ID를 보존해 근거 drawer로 이동할 수 있어야 한다.

### 10.4 부분 렌더링

`pageStatus`는 개별 Result Status의 단순 복사값이 아니다.

- 실행 전: `EMPTY`
- 실행 직후 필수 Source 대기: `LOADING`, 이미 있는 canonical Context는 표시 가능
- 하나 이상의 핵심 근거가 있고 일부 Source 실패/대기/결측: `PARTIAL`
- P0 섹션을 계약대로 모두 표현 가능: `READY`

`READY`는 모든 데이터가 존재하거나 geometry blocker가 해제됐다는 뜻이 아니다. 차단 항목을 정확히 보여주는 것도 P0 View Model의 정상 완료에 포함된다.

## 11. Missing / Error 처리

### 11.1 독립 Source 실패

| 상황 | Result | 계속 표시할 내용 |
|---|---|---|
| Kakao 전체 실패 | `NOT_AVAILABLE/SOURCE_ERROR` | FRAMEONE canonical, 공식상권 관계·통계, blocked 목록 |
| Kakao 일부 카테고리 실패 | 성공 category `AVAILABLE`, 실패 category `NOT_AVAILABLE`; group `PARTIAL` | 성공 category 관측과 개별 오류 |
| SALES observation 없음 | `value=null`, `NOT_AVAILABLE/NO_DATA` | STORES, 공식관계, Kakao. 0원 표시 금지 |
| STORES 일부 metric 누락 | 지표별 status, section `PARTIAL` | 존재하는 지표. 누락 지표를 0개 처리 금지 |
| 공식상권 layer 실패 | 관계 Result `NOT_AVAILABLE/SOURCE_ERROR` | Kakao와 FRAMEONE canonical |
| 공식상권 포함·교차 없음 | 성공 계산의 빈 relation Result | Kakao 유지. 계산 실패와 구분 |
| 공식상권 미선택 | 통계 Result `NOT_AVAILABLE/NOT_CALCULATED` | 공간관계와 선택 안내 |
| hierarchy invalid | P0 실행 차단 개발/데이터 오류 | 임의 Market/Submarket 표시 금지 |
| FRAMEONE geometry 없음 | 집계 Result `BLOCKED/BLOCKED_BY_GEOMETRY` | canonical hierarchy는 `AVAILABLE` |

### 11.2 전체 실패 기준

분석 실행 target 또는 canonical Market ID처럼 Result 귀속의 핵심 식별자가 유효하지 않을 때만 해당 Run 전체를 사용할 수 없게 한다. 보조 Source 하나의 실패는 전체 화면 오류로 승격하지 않는다.

### 11.3 stale Context

Market/Submarket UI 선택이 실행 snapshot과 달라지면 현재처럼 stale banner를 유지한다. 새 선택값으로 기존 Result label을 다시 만들지 않는다. 사용자가 다시 실행하기 전까지 모든 Result와 View Model은 기존 run snapshot을 기준으로 렌더링한다.

## 12. 기존 화면 매핑

| 현재 화면/요소 | 판단 | P0 처리 |
|---|---|---|
| `분석 설정` 탭 | 유지·재사용 | Market/Submarket, 권역/지점 모드, 지도 위치·반경 실행 유지 |
| FRAMEONE 기본 브리핑 | 이동·재사용 | P0 `Analysis Context`와 `Market Identity`로 이동 |
| 3단계 사용순서 | 이름변경 | 마지막 단계를 `기초입지 분석결과 확인`으로 변경 |
| `종합 진단` 탭 | 이름변경·구조변경 | `기초입지 분석결과`; P0 View Model의 A~G section 렌더링 |
| `MarketAnalysisSummary` | 재사용·입력변경 | Context 대신 P0 View Model을 입력받는 dumb renderer로 전환 |
| 상담용/직원용 toggle | P0 직원화면에서 제한적 유지 | audience policy와 혼동 금지. 보안 경계가 아님 |
| `경쟁 환경` 탭 | 이동·통합 | Kakao 관측은 Available Evidence의 주변업종/경쟁근거 section으로 통합; 지도 상세는 유지 가능 |
| `데이터 근거` 탭 | 유지·강화 | Result별 Source·기간·단위·status·confidence·limitation·lineage |
| 직원용 raw 검증정보 | 이동 | Data Evidence drawer/detail로 이동. 고객 View Model에서 제외 |
| 공식상권 지도·선택 | 유지 | 공식관계와 통계 Source 선택 도구. FRAMEONE 경계처럼 표현 금지 |
| crosswalk manual-review 후보 | P0에서 축소 | 직원 Data Evidence에서만 표시, 상권 identity 확정근거 금지 |
| 생활인구 Grid layer | 유지 | 지도 참조 가능. Market 집계값은 BLOCKED 표시 |
| Flow/Stay/유망구간/후보건물 | P0에서 숨김 또는 unavailable section | 숫자·등급·추천 생성 금지, P1/P2/P3로 이동 |

기존 `market-analysis-presentation.ts`는 한 번에 삭제하지 않는다. P0 View Model이 같은 현재 사실을 표현하는지 비교한 뒤 호출부를 전환하고, 더 이상 사용되지 않을 때 별도 정리한다.

## 13. File Architecture

현재 `lib/market-data` 구조를 유지하며 새 최상위 `lib/markets` 영역을 만들지 않는다.

### 13.1 신규 파일 제안

```text
lib/market-data/basic-location/
  result-contract.ts
  result-helpers.ts
  result-adapters.ts
  adapters/
    analysis-target.ts
    frameone-hierarchy.ts
    kakao-nearby.ts
    official-market-relation.ts
    official-market-statistics.ts
    unavailable-analysis.ts
  interpretation.ts
  display-policy.ts
  view-model.ts
```

초기 Slice에서는 파일 수를 줄이기 위해 `result-adapters.ts`가 각 Adapter를 export하는 barrel 역할만 하며, Source별 파일을 유지한다. Source가 작은데도 더 세분화된 directory를 만들지 않는다.

### 13.2 수정 파일 제안

| 파일 | 최소 변경 |
|---|---|
| `lib/market-data/market-analysis-context.ts` | `analysisRunId`, `executedAt`, 선택적으로 `resultSetRevision`을 input/snapshot에 추가 |
| `app/markets/MarketSpatialViewer.tsx` | 실행 시 run ID 생성, 비동기 응답 token 귀속, Context에 전달 |
| `app/markets/MarketsExplorer.tsx` | Result→Interpretation→View Model pure pipeline 호출과 View Model 상태 전달 |
| `app/markets/MarketAnalysisSummary.tsx` | P0 View Model renderer로 점진 전환, 명칭 변경 |
| `lib/market-data/market-analysis-presentation.ts` | 전환 중 호환 또는 thin wrapper; 즉시 전면 재작성 금지 |
| `app/markets/KakaoBaseMap.tsx` | Slice 필요 시 nearby response parser 강화; 지도 책임 유지 |

### 13.3 재사용 대상

- `MarketAnalysisContext`와 `buildMarketAnalysisContext`
- `ExecutedMarketAnalysis`의 draft/executed 분리
- `findRelatedOfficialMarkets`
- `BakeryOfficialMarketData`, `MarketDataObservation`, Trend builder
- Data Source Registry 조회·수동 runtime guard 패턴
- AbortController와 현재 Source별 부분 실패 상태
- 기존 presentation의 안전한 문구와 직원 상세정보
- `MarketAnalysisSummary`의 section·근거 상세 UI 구조

## 14. P0 Implementation Slice

### Slice 1 — Result Core + Run Identity + FRAMEONE/Target Adapter

- `result-contract.ts`, `result-helpers.ts`
- 실행 순간 `analysisRunId`와 `executedAt` 생성·snapshot 보존
- analysis target, FRAMEONE hierarchy Adapter
- geometry-dependent unavailable/blocked Result
- pure invariant tests/fixture 검증

독립 완료: 실행 snapshot과 canonical 결과, blocker가 공통 Result로 생성되며 기존 화면 출력은 유지된다.

### Slice 2 — Kakao + Official Relation Adapter

- Kakao response runtime validation 강화
- Kakao category/POI Result Adapter
- 공식상권 INSIDE/RADIUS_OVERLAP/UNKNOWN, 수동 참고선택 Adapter
- Source별 부분 실패와 stale response token 처리

독립 완료: 반경 검색과 공식 공간관계가 서로 다른 단위 Result로 조회되고 Source 하나 실패해도 다른 결과가 유지된다.

### Slice 3 — SALES/STORES/Trend Adapter

- bakery response 내부 observation validation 강화
- SALES 추정값, STORES 직접 통계, Trend 계산값 Adapter
- NO_DATA·suppressed·invalid·partial mapping
- 공식상권 단위/반경 오인 방지 limitation

독립 완료: 공식통계 Result가 지표별로 재현되고 0·null·suppressed·오류가 구분된다.

### Slice 4 — Deterministic Interpretation + Display Policy

- rule catalog와 Interpretation Builder
- STAFF/CUSTOMER policy filter
- 근거 없는 문장과 사라진 basis 차단
- 현재 presentation과 golden fixture 비교

독립 완료: 모든 해석문이 Result ID로 추적되고 customer View Model에 INTERNAL_ONLY/HIDDEN 근거가 남지 않는다.

### Slice 5 — P0 View Model + 기초입지 분석결과 화면

- P0 View Model Builder
- `종합 진단`을 `기초입지 분석결과`로 변경
- Analysis Context, Market Identity, Evidence, Interpretation, Missing/Blocked, Field Preview, Data Evidence section
- `MarketAnalysisSummary`를 View Model renderer로 전환

독립 완료: 현재 Source만으로 P0 화면이 완성되고 기존 지도·검색·통계 선택은 유지된다.

### Slice 6 — Evidence Detail + Partial Rendering 회귀검증

- Result evidence drawer/detail
- field handoff preview 연결
- Source별 실패·빈 결과·기간 차이·stale Context 표시
- 기존 presentation 호환 코드 정리 여부 판단

독립 완료: 실패 matrix와 display policy를 화면 수준에서 검증하고 사용하지 않는 호환 코드는 별도 최소 변경으로 정리한다.

## 15. 테스트 전략

현재 `package.json`에는 별도 test script나 test framework가 없고 관련 디렉터리에서 기존 unit test를 확인하지 못했다. P0 구현 때문에 새 library를 추가하지 않는다.

### 15.1 Pure function 검증 사례

각 Adapter/Builder는 I/O·clock·React와 분리해 동일 입력에 동일 출력을 내도록 한다.

- Kakao 전체 성공, 일부 category 실패, 전체 실패, 정상 빈 결과
- 공식상권 INSIDE 1개, 교차 복수, 관계 없음, UNKNOWN
- SALES available/partial/missing/suppressed/invalid와 값 0
- STORES 일부 지표 누락과 정상 0
- 기준분기 일치/불일치, 비연속 Trend
- geometry blocker와 hierarchy canonical availability 동시 존재
- Market/Submarket 선택 후 미실행 stale Context
- 이전 Run 응답이 새 Run 뒤에 도착하는 race
- STAFF/CUSTOMER/HIDDEN policy matrix
- Interpretation basis Result가 filter된 경우 문장 제거
- null과 missingReason, BLOCKED와 blocking limitation invariant

테스트 runner가 없는 상태에서는 첫 Slice에서 새 framework를 설치하지 않는다. 순수 fixture assertion을 현재 Node 실행환경으로 검증할 수 있는 최소 방식이 실제 TypeScript 구성과 맞는지 먼저 확인하고, 실행할 수 없다면 typecheck·lint·build와 수동 deterministic fixture 결과를 구분해 보고한다.

### 15.2 Slice별 필수 검증

- `npx tsc --noEmit` 또는 Repository의 실제 TypeScript 검증 명령
- 변경 파일 대상 ESLint 또는 `npm run lint`
- 관련 pure fixture 검증이 실행 가능한 경우 해당 명령
- UI Slice에서 production build
- `git diff --check`
- 보호파일과 staged 파일 확인

실행하지 않은 테스트는 PASS로 기록하지 않는다. Source 실패는 기존 실패와 이번 변경 회귀를 분리한다.

## 16. 완료조건

이 Technical Spec은 다음을 확정한다.

- 기존 `MarketAnalysisContext` 뒤에 Source별 Result Adapter를 배치한다.
- Result Adapter는 I/O·AI·UI 판단을 하지 않는다.
- Source별 Adapter와 공통 structural helper를 사용한다.
- 분석 버튼 실행 시 client에서 새 run ID와 실행시각을 만들고 Context에 주입한다.
- 좌표·반경·FRAMEONE Context 재실행은 새 Run이며 공식상권 참고선택은 같은 Run의 result-set revision이다.
- P0는 memory-only이며 새로고침 후 유지하거나 DB에 저장하지 않는다.
- 외부/파일/API 경계에서 수동 runtime guard를 사용하고 새 validation library를 도입하지 않는다.
- Display Policy는 audience-aware View Model Builder에서 강제하며 UI가 우회하지 않는다.
- P0 해석은 deterministic rule과 Result ID lineage만 사용한다.
- UI는 Raw Source가 아니라 P0 View Model을 렌더링한다.
- Source 하나의 실패가 전체 P0 화면 실패가 되지 않는다.
- 기존 `/markets` 구조를 전면 재작성하지 않고 여섯 Slice로 전환한다.
- geometry-dependent Result는 계속 `BLOCKED`이며 Flow/Stay/유망구간/후보건물 값을 생성하지 않는다.

이 문서 이후 같은 범위의 추가 아키텍처 문서를 만들지 않고 Slice 1 구현으로 진행한다.

## 17. LM Studio 적용 후속시점

P0 Result Adapter, Interpretation Builder, Display Policy, View Model에는 LM Studio를 사용하지 않는다. 이 계층은 재현 가능한 deterministic processing이어야 한다.

Local AI는 P0 전체와 기본 현장 Evidence 구조가 안정된 뒤 다음 보조작업에서 검토한다.

- POI 명칭·카테고리의 세부분류 후보 생성
- 경쟁점 설명 텍스트의 분류 후보 생성
- 직원 field note 구조화
- 복수 Evidence 요약 초안
- deterministic Interpretation을 바탕으로 한 자연어 문장 초안

적용 조건:

- 입력 Result와 Evidence ID가 모두 추적 가능할 것
- 생성 결과를 `INTERPRETATION`으로 명시할 것
- 새로운 숫자·실제매출·유동량·체류시간·승인상태를 생성하지 않을 것
- 직원 검토 전에는 `INTERNAL_ONLY`일 것
- model/version/prompt version과 생성시각을 보존할 것
- Local AI 장애가 Source Result와 P0 deterministic 화면을 막지 않을 것

현재는 설치·연결 시점이 아니다.

## 부록 A. 첫 번째 실제 구현 작업

첫 구현은 **Slice 1 — Result Core + Run Identity + FRAMEONE/Target Adapter**로 제한한다.

변경 범위:

- 공통 Result type과 structural helper
- `MarketAnalysisContext`에 전달받은 `analysisRunId`/`executedAt` 보존
- 분석 실행 이벤트에서 run identity 생성
- 실행 target과 FRAMEONE canonical 결과 Adapter
- Market/Submarket 생활인구, Flow, Stay, 유망구간, 후보건물의 명시적 unavailable/blocked Result
- pure invariant 검증

이 Slice에서는 Kakao·SALES/STORES 변환, Interpretation, View Model, UI 이름변경을 함께 구현하지 않는다.
