# FRAMEONE 베이커리 기초입지분석 V2 — 후보건물 선정형 Master Architecture

- 문서 상태: `DESIGN_DRAFT`
- 작성 기준일: `2026-09-14`
- Repository 기준: branch `codex-night-20260901`, HEAD `7613bb4`
- 범위: FRAMEONE 창업컨설팅 1단계인 비현장 기초분석
- 최종 질문: **어디를 현장조사하러 갈 것인가?**

## 0. 설계 원칙과 현재 전제

이 문서는 현재 `/markets`의 개별 조회 기능을 후보구간과 후보건물/주소 선정까지 이어지는 하나의 업무 흐름으로 재구성한다. 기초분석의 결론은 상권의 좋고 나쁨이나 계약 권고가 아니다. 직원이 제한된 현장조사 시간을 어디에 먼저 쓸지 설명 가능한 근거로 압축하는 것이다.

현재 Repository에서 확인한 기반은 다음과 같다.

- FRAMEONE 계층: District `25`, Market `156`, Submarket `382`, Node `763`
- FRAMEONE geometry: Market `0 / 156`, Submarket `0 / 382`, Node `0 / 763`
- 서울시 공식 참조상권 Polygon: `1,650`, 서울시 행정동 Polygon: `425`
- 생활인구 250m Grid geometry: `10,125`
- Grid-to-Market/Submarket crosswalk rows: `0`
- Market/Submarket 생활인구 공간집계: `BLOCKED`
- 보행 네트워크와 횡단보도 current snapshot은 존재하지만 2020년 기준의 E1 공간 원천이다. 실제 이동량이나 이동방향을 뜻하지 않는다.
- Kakao 지도, 주소 좌표화, 300m/500m 주변 장소 검색이 구현되어 있다.
- 서울시 공식상권과 분석지점의 `INSIDE`/`RADIUS_OVERLAP` 관계, 서울시 공식상권 SALES/STORES와 Trend가 구현되어 있다.
- 공식상권·행정동 crosswalk는 `manual_review` 후보이며 FRAMEONE 경계나 확정 관계가 아니다.

모든 분석 출력은 최소한 `공간단위`, `Source`, `asOf/referencePeriod`, `actual/estimated/inferred`, `verificationStatus`, `confidence`, `limitation`을 분리한다. `UNKNOWN`은 0이나 양호로 바꾸지 않는다. 공식상권을 FRAMEONE 경계로 대체하지 않으며, 반경 값과 공식상권 값을 서로의 값처럼 사용하지 않는다.

## 1. 서비스 4단계 구조

| 단계 | 업무 범위 | 핵심 질문 | 종료 산출물 |
|---|---|---|---|
| 1. 기초분석 | 현장 방문 전, 확보 가능한 프로그램·공공·지도 데이터를 이용한 지역 압축 | 어디를 보러 갈 것인가? | 우선 현장조사 후보구간과 후보건물/주소 목록, 현장 체크리스트 |
| 2. 기본분석 | 실제 보행·동선·체류·가시성·진입성·경쟁점 영업·공실·전면 확인 | 프로그램 분석과 현장이 일치하는가? | 현장 Evidence와 후보 재정렬 |
| 3. 심화분석 | 특정 후보점포의 임대차·권리금·시설·전기·급배수·배기·도면·장비·BEP·계약조건 검토 | 이 점포를 계약해도 되는가? | 계약 전 Hard Risk와 조건부 판단 |
| 4. 추가분석 | 세무·노무·지원사업·오픈 마케팅·전문가 연계 | 추가 전문 지원이 무엇인가? | 분야별 실행안 또는 전문가 인계 |

V2 `/markets`는 1단계만 담당한다. 후보주소의 우선순위는 2단계 진입 순서이며 계약 적합 판정이 아니다.

## 2. 기초분석 목적과 최종 산출물

기초분석은 다음 질문을 순서대로 좁힌다.

```text
권역
→ 하위상권
→ 미시상권
→ 수요
→ 이동·보행 가능성
→ 체류가능성
→ 경쟁구조
→ 상권변화
→ 베이커리 운영모델 적합성
→ 유망구간
→ 후보건물/주소
→ 현장확인 체크리스트
```

최종 산출물은 다음 네 묶음이다.

1. **분석 설명서**: 선택한 지역의 정체성, 수요·Flow·Stay·경쟁·변화 근거와 한계
2. **유망구간 목록**: 핵심 소비축, 보조 소비축, 통과 가능축, 체류 가능축, 연결 약한 구간, 현장확인 우선구간
3. **후보건물/주소 목록**: `우선 현장조사`, `검토`, `후순위`, `제외 검토`와 그 근거
4. **현장조사 인계서**: 확인된 사실, 추정·해석, 현장 필수 확인사항

`제외 검토`도 자동 배제는 아니다. 자료상 우선순위가 낮거나 blocking 확인사항이 있어 현장에서 제외 여부를 검토한다는 뜻이다.

## 3. 분석단위와 역할

| 공간단위 | 역할 | 현재 상태 | 사용 규칙 |
|---|---|---|---|
| FRAMEONE District | 서울 25개 자치구별 탐색·업무 분류 | 사용 가능 | 행정통계 자체와 동일 개념으로 간주하지 않음 |
| FRAMEONE Market | 1차 후보 권역과 내부 주요상권 분류 | text hierarchy 사용 가능, geometry 없음 | 권역 설명과 탐색 Context로 사용. Polygon 집계 금지 |
| FRAMEONE Submarket | Market 안의 하위상권 비교 단위 | text hierarchy 사용 가능, geometry 없음 | 하위상권 선택과 Node 묶음에 사용. 공간면적·포함집계 금지 |
| FRAMEONE Node | 미시상권·현장 확인 거점 후보 | 명칭·유형 중심, 실제 좌표 `0 / 763` | 좌표 없는 Node를 지도 POI나 실제 동선점으로 표현 금지 |
| 서울시 공식상권 | 공식 경계 및 SALES/STORES 통계 단위 | Polygon `1,650`, 지점 공간관계·통계 사용 가능 | FRAMEONE Market/Submarket의 대체 경계가 아님 |
| 행정동 | 행정통계·참조경계 단위 | Polygon `425`; 현재 속성 한계 있음 | FRAMEONE 경계로 복사 금지. 동명·구명 속성 공백 한계 표시 |
| 생활인구 250m Grid | 시간대 생활인구의 원천 단위 | geometry `10,125`; current source 존재 | Grid 자체 조회·지점/반경 귀속 설계 가능. FRAMEONE 집계는 BLOCKED |
| 사용자 선택 300m/500m | 주소 또는 지도점 중심의 미시 분석창 | 구현됨 | 원형 검색/비교 범위일 뿐 상권 경계가 아님 |
| 주소/건물 | 현장조사 대상과 기초 건축정보의 최종 연결키 | Kakao 주소 좌표화만 구현 | 표준주소·건물 식별·대장정보는 추가 Source 필요 |

V2는 공간단위마다 값을 따로 보존하고, 화면에서 단위 이름을 수치 바로 옆에 표시한다. 여러 단위의 값을 하나의 총합으로 합치려면 명시적인 귀속 규칙과 검증된 geometry가 있어야 한다.

## 4. 상권유형 모델

상권유형은 `주 유형 1개 + 보조 유형 0~2개` 구조를 권장한다. 혼합형은 근거가 서로 다른 두 유형을 단순히 모은 라벨이 아니라, 둘 이상의 수요가 시간대나 장소에서 실질적으로 함께 작동한다는 Evidence가 있을 때 사용한다.

| 유형 | 판단 근거 후보 | 베이커리 해석 예시 |
|---|---|---|
| 주거형 | 생활인구의 주거 시간대 패턴, 공동주택, 생활편의 POI | 반복 구매, 생활형 제품, 주말·저녁 수요 가능성 |
| 직장형 | 오피스·사업체, 평일 주간 수요, 업무시설 POI | 출근, 점심, 간식, 단체 주문 가능성 |
| 역세권형 | 역·출입구·환승·정류장과 연결축 | 테이크아웃과 시간대 편중 가능성 |
| 목적방문형 | 특정 집객시설, 전문 상업·문화 목적지 | 차별화 상품과 목적 구매 가능성 |
| 관광/여가형 | 관광·문화·공원·여가시설과 주말 수요 | 포장, 선물, 카페 결합 가능성 |
| 교육형 | 학교·대학·학원, 등하교·수업 시간대 | 가격대와 간편식, 특정 시간대 수요 가능성 |
| 혼합형 | 서로 다른 수요원이 함께 작동한다는 복수 근거 | 시간대·상품 구성을 나눈 복합 운영 가능성 |

각 유형은 `type`, `role=PRIMARY|SECONDARY`, `evidenceRefs`, `confidence`, `limitation`으로 설명한다. 현재 근거가 없거나 상충하면 `UNKNOWN`으로 남기고 `fieldCheckRequired` 또는 추가 Source 필요를 표시한다. bakery importance/research priority 같은 기존 내부 등급을 상권유형 Evidence로 대체하지 않는다.

## 5. 수요모델

수요는 사람 수 하나가 아니라 **수요원 × 시간 × 방문목적 × 공간단위**로 본다.

| 수요축 | 현재 연결 가능성 | 필요한 해석 |
|---|---|---|
| 생활인구 | 250m current 원천과 grid geometry 존재. FRAMEONE 집계는 BLOCKED | 시간대·평일/주말 패턴, 기준일과 결측을 보존 |
| 주거수요 | 생활인구 일부와 향후 공동주택/인구통계 | 반복 구매 가능 배후. 실제 구매력으로 단정 금지 |
| 직장수요 | 현재 전용 Source 미연결 | 평일 주간과 점심·간식 수요 후보 |
| 교육수요 | Kakao POI 보조 가능, 공식·정형 Source 필요 | 학생·교직원 수요 후보. 재학생 수 추정 금지 |
| 교통수요 | 지도 POI 보조 가능, 승하차·정류장 Source 계획 | 통과·환승 수요 후보. 실제 상권 소비와 분리 |
| 여가/문화 | Kakao POI 보조 가능, 시설별 정형 Source 필요 | 주말·목적방문·체류 가능 수요 |
| 목적방문 | 공식상권·POI·시설 근거의 조합 필요 | 앵커 목적과 주변 소비 전환 가능성 |
| 집객시설 | Kakao 검색 가능, 시설별 규모·이용량 부족 | 장소 존재와 집객 규모를 분리 |
| 배달 가능 수요 | 현재 미구현 | 배달 플랫폼 범위·주문 자료 없이는 가능성만 검토 |

현재 상태에서 250m Grid를 분석지점 300m/500m에 연결하는 기능을 만들 경우에도 교차면적, centroid 또는 포함 규칙을 명시하고 경계 셀의 부분 포함 한계를 표시해야 한다. Market/Submarket 결과로 승격하려면 승인 geometry와 crosswalk가 먼저 필요하다.

## 6. Flow Potential 모델

Flow는 **실측 유동인구**가 아니라 사람이 이동할 가능성이 있는 연결구조를 설명하는 `Flow Potential`로 정의한다.

### 6.1 구성요소

- Origin/Destination 후보: 지하철역·출입구, 버스정류장, 주거단지, 오피스, 학교, 공원, 시장, 병원, 쇼핑·문화시설
- Network: 보행 네트워크의 연결성, 교차로, 횡단보도, 주요 연결도로
- Friction/Barrier: 대형도로, 철도, 하천, 고저차, 단절 구간, 횡단 수단 부족
- Direction hypothesis: Origin에서 Destination으로 이어질 가능성이 있는 경로
- Time context: 출근, 점심, 하교, 퇴근, 저녁, 주말 등 근거가 있는 시간창

### 6.2 출력

각 Flow 후보는 `from`, `to`, `route/segmentRef`, `supportingEvidence`, `contradictingEvidence`, `timeContext`, `confidence`, `fieldCheckRequired`, `limitation`을 갖는다. 실제 보행량·방향·속도·혼잡은 현장 또는 별도 측정 Source가 없으면 생성하지 않는다.

보행 네트워크와 횡단보도 데이터는 연결 가능성의 구조적 근거다. 2020 기준이라는 freshness 한계를 항상 함께 표시하고, 횡단보도 존재만으로 실제 횡단량이나 소비 전환을 추정하지 않는다.

## 7. Stay Potential 모델

Stay는 실제 체류시간이 아니라 **사람이 머물 이유와 장소가 존재할 가능성**인 `Stay Potential`로 정의한다.

대상 POI는 공원, 쇼핑·복합시설, 카페·식음 집적, 병원, 대형 오피스, 학교·학원, 문화·관광시설, 시장, 광장, 대기시설, 주요 교통 결절점이다.

각 장소는 다음 필드를 표시할 수 있어야 한다.

- 장소명, 표준주소 또는 제공 주소, 유형
- 분석지점/후보주소와의 직선거리 및 거리 산정 방식
- 예상 수요 성격과 시간 Context
- 체류가능성 판단근거와 반대근거
- Source, 수집시점, verificationStatus, confidence
- 현장확인 필요 여부와 limitation

POI 존재는 체류 발생을 보장하지 않는다. 좌석, 대기행태, 실제 이용량, 체류시간은 확인 자료가 없으면 `UNKNOWN` 또는 현장확인 항목으로 남긴다.

## 8. 경쟁분석

경쟁분석은 `점포 관측`과 `경쟁도 해석`을 분리한다.

### 8.1 Source 역할

| Source | 사용할 수 있는 의미 | 사용할 수 없는 의미 |
|---|---|---|
| Kakao Local | 실행 시점·반경·검색 카테고리에 노출된 POI, 거리와 위치 | 전체 영업점 수, 인허가 상태, 완전한 개·폐업 이력 |
| 서울시 STORES | 공식상권·업종·분기 기준 점포·개업·폐업·프랜차이즈 통계 | 분석지점 300m/500m 점포 수, 개별 점포 영업 확인 |
| 서울시 SALES | 공식상권·업종·분기 기준 추정매출 | 후보점포 실제·예상매출, 300m/500m 반경 매출 |
| LOCALDATA(계획) | 제과점·휴게음식점 등 인허가 최신상태와 변경이력 | 현장 영업 여부를 단독 확정 |
| 소상공인 상가업소(계획) | 영업 중 상가업소와 공공 업종분류 snapshot | 폐업이력의 단독 원천 |
| 현장 Evidence | 실제 영업, 메뉴·가격·고객·가시성·체류 관찰 | 조사일 이후 상태의 자동 보장 |

### 8.2 분류와 결과

관측 점포는 직접경쟁 베이커리, 카페형 베이커리, 제과점, 프랜차이즈, 개인점, 카페, 디저트로 분류하되 Source가 제공하지 않는 구분은 사람이 검토한다. 신규 개업, 폐업, 장기영업은 시계열 Source가 있을 때만 부여한다.

`Count`는 Source와 범위별 관측 수다. `Competition Intensity`는 수요, 거리, 집적, 업종 유사성, 영업상태, 규모의 근거를 함께 검토한 별도 해석이다. Kakao 중복 제거 수를 경쟁강도로 직접 변환하지 않는다.

## 9. 상권 변화 분석

변화는 같은 Source, 같은 공간단위, 같은 업종 정의, 비교 가능한 기간이 확보된 항목만 계산한다.

- 현재 가능: 서울시 공식상권 SALES/STORES의 분기 Trend
- 조건부 가능: 생활인구 snapshot 이력이 누적되고 동일 schema·grid 기준이 확인된 경우의 Grid 변화
- 추가 Source 필요: 개별 점포의 인허가 개·폐업 이력, 업종 구성 변화, 주거·직장 배후 변화
- 현재 불가: FRAMEONE Market/Submarket 점포·생활인구 변화 집계

변화 출력은 시작·종료기간, 단위, 절대 변화, 변화율, 결측, 기준 변경, Source limitation을 포함한다. 관측기간이 짧거나 Source 정의가 바뀌면 추세라고 단정하지 않는다.

## 10. 베이커리 적합성 모델

베이커리 적합성은 상권 특성을 운영모델의 요구조건으로 번역하는 설명이다. 성공확률이나 계약 권고 점수가 아니다.

| 운영모델 | 필요한 상권 신호 후보 | 주요 현장 검증 |
|---|---|---|
| 생활형 동네빵집 | 반복 주거수요, 생활동선, 일상 편의업종 | 재방문 흐름, 가족·연령대, 접근·주차 |
| 출근/테이크아웃형 | 역·정류장·오피스 연결, 오전 Flow Potential | 실제 출근방향, 정차 가능성, 빠른 진입 |
| 오피스 점심·간식형 | 평일 주간 직장수요, 오피스·식음 집적 | 점심 피크, 단체수요, 주말 공동화 |
| 목적방문형 | 목적시설·상업축, 차별화 수요, 광역 접근 | 실제 목적방문 동선, 대기·회전, 브랜딩 가시성 |
| 프리미엄 베이커리 | 목적소비·소득 관련 근거, 체류·선물 수요 | 가격 수용성, 경쟁제품, 공간 품질 |
| 카페 결합형 | Stay Potential, 여가·미팅 수요 | 좌석·면적·화장실·체류행태·시설 가능성 |
| 선물/포장형 | 관광·업무·방문 수요와 이동 편의 | 포장 구매행태, 차량·대중교통 접근 |
| 배달 병행형 | 배후수요와 주문권역 가능성 | 플랫폼 수요·수수료·조리동선·픽업 접근 |

각 모델은 `supportingSignals`, `riskSignals`, `missingEvidence`, `fieldChecks`, `confidence`를 제시한다. 높은 적합성도 임대료, 시설, 전면, 실제 유동, 경쟁점 품질 같은 심화·현장 위험을 상쇄하지 않는다.

## 11. 유망구간 도출

유망구간은 지도 선을 자동 확정하는 기능보다 **근거가 겹치는 조사 구간 후보**로 시작한다.

1. 수요 발생지와 주요 목적지를 배치한다.
2. 보행 network와 횡단보도로 연결 가능성을 확인한다.
3. 대형도로·철도·하천 등 barrier와 우회 가능성을 표시한다.
4. Stay POI와 경쟁점 집적을 겹쳐 본다.
5. 베이커리 운영모델별로 유리·불리 신호를 연결한다.
6. 각 구간에 근거, 반대근거, 결측, 현장 질문을 붙인다.

출력 유형은 다음과 같다.

- `핵심 소비축 후보`: 수요원·목적지·상업집적의 근거가 함께 있는 구간
- `보조 소비축 후보`: 일부 시간대나 보조 수요로 연결될 가능성이 있는 구간
- `통과축 후보`: 이동 가능성 근거는 있으나 정차·소비 근거가 부족한 구간
- `체류축 후보`: Stay POI와 식음·여가 집적 근거가 있는 구간
- `연결 약한 구간`: barrier, 우회, 낮은 연결성 근거가 있는 구간
- `현장확인 우선구간`: 가능성과 불확실성이 모두 커서 실제 확인 가치가 높은 구간

실제 동선, 유동방향, 소비축이라는 확정 표현은 현장검증 전 사용하지 않는다. FRAMEONE Node 좌표가 없으므로 현재 Node 간 경로를 자동 생성할 수 없다.

## 12. 후보건물/주소 선정

후보건물 평가는 유망구간 위 또는 주변의 주소를 현장조사 순서로 정렬하는 단계다.

### 12.1 평가 근거 후보

- 수요 발생지, Flow Potential, Stay Potential과의 접근성
- 역·출입구·정류장 등 대중교통 접근
- 배후 주거·직장·교육·목적시설 근거
- 직접경쟁점 거리, 관측 경쟁 밀집, 주변 업종 구성
- 집객시설과의 연결 가능성
- 도로·보행 network 접근, 횡단보도, barrier
- 표준주소, 건물 식별자, 건축물대장의 용도·층·면적 등 확보 가능한 공식 기본정보
- Source freshness, confidence, 결측과 충돌

### 12.2 현장 또는 심화분석으로 남길 항목

실제 전면·간판 노출·내부 구조·배기·전기·급배수·실측 면적·체감 유동·공실·임대료·권리금·시설상태는 기초분석에서 확인된 값으로 사용하지 않는다.

### 12.3 우선순위 판정

| 결과 | 의미 | 최소 출력 |
|---|---|---|
| 우선 현장조사 | 근거가 여러 축에서 일치하며 현장 확인 가치가 높음 | 지지 근거, 핵심 결측, 현장 질문 |
| 검토 | 가능성은 있으나 충돌 또는 중요 결측이 있음 | 충돌 근거와 해소 조건 |
| 후순위 | 현재 근거상 다른 후보보다 조사 효율이 낮음 | 비교 열위 근거와 재검토 조건 |
| 제외 검토 | hard concern 또는 핵심 접근성 문제를 먼저 확인해야 함 | 제외 후보 사유와 사람 확인 요구 |

판정에는 이유 코드를 여러 개 연결한다. A/B/C/D 같은 내부 등급은 표시 편의를 위해 사용할 수 있으나, 설명 가능한 근거 없이 합산한 단일 점수로 판정을 만들지 않는다. CRITICAL 현장·시설 위험은 긍정 신호로 상쇄하지 않는다.

## 13. 현장조사 인계

각 후보주소의 인계서는 세 부분을 분리한다.

| 구분 | 예시 | 표시 규칙 |
|---|---|---|
| 프로그램에서 확인된 것 | 좌표화된 주소, 역 직선거리, 공식 POI, Kakao 관측, 공식상권 통계 | Source·기준시점·공간단위와 함께 표시 |
| 추정·해석한 것 | 주동선 가능성, Stay Potential, 베이커리 운영모델 적합성 | `INFERRED`와 confidence, 판단근거 표시 |
| 현장에서 확인할 것 | 실제 보행량·방향, 가시성, 전면, 진입성, 실제 영업, 고객 대기·체류, 공실, 임대료, 시설상태 | 체크 결과·사진·조사자·조사일·조사회차를 별도 Evidence로 저장 |

인계서에는 후보주소, 분석 실행 Context, 적용 반경, 유망구간 참조, 우선순위와 이유, 미확인 항목, 충돌, 다음 행동, 담당자를 포함한다. 재조사 결과는 기존 분석을 덮어쓰지 않고 새 조사 회차로 연결한다.

## 14. 화면 IA V2

권장 화면 흐름은 다음 15단계다.

| 순서 | 화면/섹션 | 핵심 기능 |
|---|---|---|
| 1 | 분석 조건 | District/Market/Submarket, 운영모델, 기준일, 지점/주소, 300m/500m 설정 |
| 2 | 권역 개요 | FRAMEONE 계층·Node·내부 설명과 geometry 상태 |
| 3 | 상권 유형 | 주 유형·보조 유형, Evidence, UNKNOWN/확인 필요 |
| 4 | 수요 분석 | 수요원별 현재 근거와 결측 |
| 5 | 생활인구/시간대 | Grid·반경 또는 승인된 단위별 시간 패턴과 한계 |
| 6 | Flow 분석 | 이동 가능축, network·횡단보도·barrier와 현장 질문 |
| 7 | Stay Potential | 체류 유발 POI, 거리, 수요 성격, confidence |
| 8 | 주변 업종 | Source·반경별 관측 목록과 중복 제거 정보 |
| 9 | 경쟁구조 | 직접/간접 경쟁, Count와 Intensity 분리 |
| 10 | 상권 변화 | 비교 가능한 공식 시계열과 Source 한계 |
| 11 | 베이커리 적합성 | 운영모델별 지지·위험·미확인 신호 |
| 12 | 유망구간 | 구간 후보, 근거·반대근거·현장확인 필요 |
| 13 | 후보건물/주소 | 조사 우선순위, 이유, 결측·blocker |
| 14 | 현장조사 인계 | 확인/추정/현장필수 분리 체크리스트 |
| 15 | 데이터 근거 | Source, asOf, 단위, 상태, limitation, lineage |

현재 `종합 진단`은 상권 기초분석 결과와 특정 점포의 종합 계약진단을 혼동시킬 수 있다. V2에서는 1단계 결과를 `기초입지 분석결과` 또는 `현장조사 후보 요약`으로 재정의하고, 점포 계약 관련 종합진단은 3단계 심화분석에 둔다.

## 15. 기존 기능 유지·이동·통합·축소·제거 후보·신규 표

| 현재 기능 | 판단 | V2 위치와 처리 |
|---|---|---|
| FRAMEONE 권역 선택 | 유지 | 1. 분석 조건의 최상위 Context |
| 하위상권 선택 | 유지 | 1~2. 분석 조건/권역 개요; geometry 없음 표시 |
| Node 목록 | 이동 | 2. 권역 개요와 12. 유망구간의 탐색 후보. 좌표 없는 Node는 텍스트 거점 |
| Kakao 지도 | 유지·통합 | 전 단계 공통 지도. 분석 결과 레이어와 Evidence 선택을 연결 |
| 주소로 위치 찾기 | 유지 | 1. 분석 조건과 13. 후보주소 입력. Kakao 해석 주소임을 표시 |
| 300m/500m 실행 반경 | 유지 | 미시 분석창. 상권 경계와 분리하고 실행 snapshot 보존 |
| Kakao 경쟁점/주변검색 | 이동·축소 | 8. 주변 업종의 관측 Source로 이동. 경쟁 결론 역할은 축소 |
| 서울시 공식상권 Polygon | 유지 | 참조 레이어와 지점 `INSIDE`/반경 `OVERLAP` 근거 |
| 서울시 공식상권 SALES | 유지·이동 | 4·10 및 15. 공식상권 단위 추정매출로만 표시 |
| 서울시 공식상권 STORES | 유지·통합 | 8~10. 공식상권 단위 점포·개폐업·프랜차이즈 통계 |
| 공식상권 Trend | 유지 | 10. 비교 가능한 분기 변화 |
| 공식상권/행정동 crosswalk 후보 | 축소 | 15. 데이터 근거의 manual review 후보. 확정 관계처럼 노출 금지 |
| 생활인구 Grid 표시 | 유지·이동 | 5·15. geometry와 metric 연결상태/결측을 함께 표시 |
| 현재 `종합 진단` | 이동·이름 변경 후보 | `기초입지 분석결과`로 역할 재정의. 계약 종합진단과 분리 |
| 현재 `경쟁 환경` | 통합 | 8. 주변 업종과 9. 경쟁구조로 분리 |
| 현재 `데이터 근거` | 유지·강화 | 15. 모든 결론의 lineage·상태·한계 확인 |
| 상권유형·수요·Flow·Stay 모델 | 신규 필요 | 3~7. 근거형 설명 모델 |
| 유망구간 | 신규 필요 | 12. 구간 후보와 현장 질문 |
| 후보건물/주소 우선순위 | 신규 필요 | 13. 주소 식별·근거·우선순위 |
| 현장조사 인계 | 신규 필요 | 14. 확인/추정/현장필수 분리 |
| 단일 근거 없는 종합점수 | 제거 후보 | 이유 코드와 축별 결과로 대체 |

## 16. 데이터 요구사항 Matrix

| 분석항목 | 사용목적 | 현재 Source | 현재 구현 여부 | 신뢰도 | 현재 가능 | 추가 Source 필요 | 현장확인 필요 | 최종 출력 |
|---|---|---|---|---|---|---|---|---|
| FRAMEONE 계층 | 권역→하위상권→Node 탐색 | `MARKET_HIERARCHY.json` | 구현 | 높음(분류), 공간은 없음 | 예 | geometry 승인 Evidence | Node 실제 위치·의미 | 권역 Context·계층 설명 |
| FRAMEONE 경계 | 권역 공간집계 | Boundary 정책/후보 자료 | 미구현, BLOCKED | 미평가 | 아니오 | 실제 Candidate geometry와 E3/E4 review | 필요 가능 | 승인 경계와 version |
| 분석지점/반경 | 미시 분석창 고정 | Kakao Map/Local | 구현 | Source 의존 | 예 | 표준주소 Source 보강 | 실제 출입 위치 | 실행 Context snapshot |
| 공식상권 공간관계 | 지점과 공식통계 단위 연결 | `SRC-SEOUL-AREA` | 구현 | 검증 geometry, 시점 한계 | 예 | geometry compatibility 지속 검토 | 아니오 | INSIDE/RADIUS_OVERLAP |
| 공식 추정매출 | 공식상권 소비 참고 | `SRC-SEOUL-SALES` | 구현 | 공식 추정값 | 예 | 필요 시 업종 범위 보강 | 실제 점포매출 | 공식상권 추정매출·Trend |
| 공식 점포통계 | 경쟁·변화 참고 | `SRC-SEOUL-STORES` | 구현 | 공식상권 통계 | 예 | 갱신기준 확인 | 개별점 영업 | 점포·개폐업·프랜차이즈 Trend |
| 생활인구 Grid | 시간대 수요 | `SRC-SEOUL-LIVING`, 250m Grid | foundation/current 존재, 화면 분석 미연결 | 공식 원천, coverage 한계 | Grid 수준 조건부 | 지점/반경 귀속 규칙 | 체감 수요 | 시간대·요일 수요 패턴 |
| Market/Submarket 생활인구 | 권역 수요 비교 | 위 Source + 승인 geometry | BLOCKED | 산출 불가 | 아니오 | 승인 geometry와 grid crosswalk | 아니오 | 권역별 집계·coverage |
| 주변 POI | 수요원·경쟁 후보 탐색 | `SRC-KAKAO-LOCAL-MAP` | 구현 | on-demand 관측 | 예 | 시설별 공식 Source | 존재·영업·규모 | 범위별 관측 목록 |
| 인허가/개폐업 | 경쟁점 상태·변화 | `SRC-LOCALDATA` | 미구현/Source 필요 | 미평가 | 아니오 | 공식 contract·ingest | 실제 영업 | 업소 상태·변경이력 |
| 상가업소 | 업종 구성·영업 snapshot | `SRC-SDSC-SHOPS` | 미구현/Source 필요 | 미평가 | 아니오 | 공식 contract·ingest | 실제 영업 | 업종 집적·점포 관측 |
| 보행 network | 연결 가능성 | `SRC-SEOUL-PEDESTRIAN-NETWORK` | current spatial foundation | E1, 2020 basis | 구조적 분석 가능 | 최신성 metadata, routing 규칙 | 실제 보행량·방향 | Flow Potential network |
| 횡단보도 | barrier 통과 가능성 | `SRC-SEOUL-CROSSWALK` | current spatial foundation | E1, 2020 basis | 구조적 분석 가능 | 최신성 metadata | 실제 이용·신호환경 | crossing evidence |
| 지하철 수요 | 역 규모·시간 이동 | `SRC-SEOUL-SUBWAY-BOARDING` | 미구현/Source 필요 | 미평가 | POI 위치만 보조 | 승하차 contract·ingest, 출입구 | 실제 출근 동선 | 교통수요·시간 패턴 |
| 버스 수요 | 정류장 이동수요 | `SRC-SEOUL-BUS-BOARDING`, `SRC-SEOUL-BUS-STOPS` | 미구현/Source 필요 | 미평가 | POI 위치만 보조 | 정류장·승하차 contract | 실제 정차 후 동선 | 교통수요·Flow 근거 |
| 주거 배후 | 반복 생활수요 | 생활인구, 계획 `SRC-SEOUL-APARTMENTS`, `SRC-SGIS` | 일부 foundation/나머지 미구현 | Source별 상이 | 제한적 | 세대·인구 통계 연결 | 실제 생활동선 | 주거수요 근거 |
| 직장 배후 | 평일 주간 수요 | Kakao 오피스 POI 보조 | 미구현/Source 필요 | 낮음 | 장소 후보만 | 사업체·종사자 통계 | 실제 근무·점심 흐름 | 직장수요 근거 |
| 교육수요 | 등하교·학원 수요 | Kakao 학교/학원 POI 보조 | 부분 구현 | 낮음~중간 | 장소 후보만 | 학교·학생·학원 정형 Source | 실제 시간대 | 교육수요 근거 |
| Stay Potential | 체류 유발지 탐색 | Kakao POI, 공식 공간원천 후보 | 미구현 | 추론 | 제한적 설계 가능 | 시설 규모·이용량 Source | 실제 체류·좌석·대기 | 장소별 Stay 근거 |
| 경쟁강도 | 수요 대비 경쟁 해석 | Kakao + SALES/STORES | 미구현 | 혼합/추론 | 제한적 | LOCALDATA·상가업소 | 영업·규모·제품 | Count와 Intensity 분리 |
| 상권유형 | 수요구조 설명 | 계층·POI·공식통계 | 미구현 | 추론 | P0 설명형 가능 | 수요 Source 확장 | 현장 정합성 | 주 유형+보조 유형 |
| 유망구간 | 조사할 거리 압축 | 보행·횡단·POI·수요 | 미구현 | 추론 | 제한적, 좌표 있는 근거만 | 출입구·교통·시설 Source | 실제 동선·barrier | 구간 후보와 confidence |
| 표준주소 | 후보 단위 정규화 | Kakao geocode | 부분 구현 | 제공 결과 의존 | 예 | `SRC-JUSO-ADDRESS` | 출입구·호수 | 후보주소와 좌표 |
| 건축물 기본정보 | 후보건물 desk 검토 | 계획 `SRC-BUILDING-HUB` | 미구현/Source 필요 | 미평가 | 아니오 | 건축물대장 contract | 실제 점포·시설 | 용도·층·면적 등 기본정보 |
| 필지·건물 공간 | 후보건물 위치·규제 보조 | 계획 `SRC-VWORLD-SPATIAL` | 미구현/Source 필요 | 미평가 | 아니오 | dataset/schema/저장조건 확인 | 현황 일치 | 필지·건물 참조 |
| 임대·공실·전면·시설 | 계약 전 실무 검토 | 없음 | 미구현 | UNKNOWN | 아니오 | 적법한 매물/현장 Source | 필수 | 현장·심화분석 Evidence |

## 17. Index 설계원칙

Index는 비교와 정렬을 돕는 내부 보조수단이다. 근거를 숨긴 종합점수, 성공확률 또는 계약 결론으로 사용하지 않는다.

| Index | 구성요소 후보 | normalization 후보 | 결측치 정책 | Pilot 검증 |
|---|---|---|---|---|
| Demand Index | 생활인구 시간패턴, 주거·직장·교육·교통·목적 수요 | 동일 Source·동일 단위 내 percentile, robust z-score, 구간화 | UNKNOWN 유지; 가능한 요소만 재가중 금지 | 알려진 서로 다른 수요형 지역의 설명력 비교 |
| Flow Index | Origin/Destination, network 연결성, 횡단, barrier, 시간 Context | 거리감쇠, network 접근성, 범주형 evidence level | 실측 유동 없음 표시; route 불가 시 미산출 | 현장 보행방향·피크와 후보축 적중 비교 |
| Stay Index | 체류 유발 POI 유형·거리·집적·이용근거 | 유형별 구간화, 거리감쇠, Source confidence 층화 | 체류시간 생성 금지; 규모 미상 별도 표시 | 현장 좌석·대기·체류 관찰과 비교 |
| Competition Index | 직접/간접 경쟁, 거리, 집적, 공식 점포변화, 상태 | Source별 count 정규화 후 별도 축 유지 | Kakao 누락을 0으로 처리 금지 | 현장 영업점·제품·규모 조사와 비교 |
| Bakery Fit Index | 운영모델별 demand/flow/stay/competition 신호와 risk | 모델별 rule band 또는 다축 profile | 핵심 근거 누락 시 등급 보류 | 실제 운영모델 적합성에 대한 직원 평가와 비교 |
| Building Priority | 구간, 접근성, 경쟁거리, 건물기본정보, 결측·hard concern | 순위구간 또는 rule-based category | 현장필수 결측은 점수 0이 아니라 flag | 현장조사 후 유지/하향/제외 비율 검토 |

공통 설계 규칙은 다음과 같다.

1. Index마다 구성요소, Source, 기준시점, 공간단위, 계산 version을 보존한다.
2. `actual`, `estimated`, `inferred`, `UNKNOWN`을 섞지 않는다.
3. 결측을 0으로 채우거나 남은 요소의 비중을 자동 확대하지 않는다.
4. confidence는 데이터 coverage·freshness·독립 근거 일치·현장검증 수준을 별도로 표현한다.
5. 결과에는 기여 근거와 제한사항을 함께 노출한다.
6. 임의 가중치는 확정하지 않는다. Pilot 전에 가설, 기대 방향, 실패 조건을 먼저 기록한다.
7. Pilot은 다양한 상권유형과 실패사례를 포함하고, 직원의 현장 결과와 비교한다.
8. 가중치와 기준 변경은 version으로 남기고 과거 결과를 조용히 재계산하지 않는다.

## 18. 현재 가능한 기능

추가 Source나 FRAMEONE geometry 없이도 다음을 순차 구현할 수 있다.

- District/Market/Submarket/Node 계층을 이용한 분석 Context 선택과 기본 설명
- Market/Submarket의 `text_only`, Node 좌표 없음, 공간집계 BLOCKED 상태를 명시한 권역 개요
- 주소 또는 지도점과 300m/500m 실행 snapshot
- Kakao 주변 장소의 Source·반경·조회상태·중복 제거 한계를 포함한 관측 목록
- 분석지점의 서울시 공식상권 `INSIDE`/`RADIUS_OVERLAP` 관계
- 사람이 선택한 공식상권의 SALES/STORES와 분기 Trend
- 공식상권 수치가 분석 반경이나 후보점포 수치가 아니라는 설명
- 현재 Source Registry와 데이터별 freshness·limitation 표시
- 좌표가 있는 POI, 보행 network, 횡단보도를 이용한 제한적 Flow/Stay Evidence 조회 설계
- 확인된 사실·추정·현장확인 항목으로 나눈 기초분석 결과 틀

현재 가능한 결과는 설명형 Evidence 묶음이다. Market/Submarket 면적 집계, 확정 유망축, 자동 후보건물 순위는 아직 가능하다고 표시하지 않는다.

## 19. 추가 데이터 필요사항

| 우선도 | 데이터/준비사항 | 필요한 이유 | 선행 검증 |
|---|---|---|---|
| 최우선 blocker | 승인된 FRAMEONE Market/Submarket geometry와 version | 권역 집계·구간 귀속·비교의 기준 | E3 preflight, E4 human review, 별도 승격 검증 |
| 최우선 blocker | Grid-to-Market/Submarket crosswalk | 생활인구 권역 집계 | 승인 geometry, 귀속 규칙, coverage/결측 검증 |
| P1 | 생활인구 지점/반경 조회 규칙 | geometry 승인 전에도 미시 수요를 설명 | grid ID/metric 대응, 부분 교차, privacy/suppression 정책 |
| P1 | 지하철 출입구·승하차, 버스정류장·승하차 | Flow와 시간대 교통수요 강화 | 공식 dataset·키·기간·갱신 contract |
| P1 | LOCALDATA 인허가와 소상공인 상가업소 | 경쟁점 상태·업종·변화 보강 | entity matching을 candidate/manual review로 분리 |
| P1 | 공동주택·인구·사업체 | 주거·직장 배후수요 | 기준연도·공간단위·억제값 보존 |
| P1 | 목적·체류시설의 정형 정보 | Stay Potential의 규모와 성격 보강 | 시설 식별·운영·이용량 의미 확인 |
| P2 | 최신 보행·횡단 metadata와 routing 기준 | Flow Potential freshness·재현성 | 2020 basis 한계, 연결·barrier rule 검증 |
| P3 | 표준주소·건축물대장·필지/건물 공간정보 | 후보주소를 실제 건물 기본정보에 연결 | API contract, 식별키, 이용·저장조건 |
| 현장 | 보행량·방향·체류·가시성·전면·진입·공실·임대·시설 | desk inference 검증과 심화분석 진입 | 조사자·일시·회차·Evidence history |

## 20. 개발 우선순위

### P0 — 현재 데이터로 상권을 설명

목표는 직원이 선택 Context, 현재 가능한 근거, 불가능한 집계를 혼동하지 않고 읽는 것이다.

- IA 1~3, 8~10, 15를 현재 Context와 Source로 재배치
- 주 유형+보조 유형의 설명형 초안과 `UNKNOWN` 처리
- 공식상권·반경·FRAMEONE 단위를 분리한 근거 카드
- 확인/추정/현장필수 3분법을 모든 결과에 적용
- 기존 `종합 진단`을 기초입지 결과로 재정의

독립 검증: 같은 분석 실행 snapshot에서 공간단위·Source·수치 의미·결측이 정확히 표시되고, geometry 없는 권역에 공간값이 생성되지 않는지 확인한다.

### P1 — 수요·Flow·Stay·경쟁구조 강화

- 생활인구의 안전한 지점/반경 연결과 시간대 설명
- 기존 보행 network·횡단보도 기반 Flow Potential
- POI 기반 Stay Potential과 Source confidence
- Kakao Count와 공식 통계, 향후 인허가/상가업소의 역할 분리
- 비교 가능한 기간만 사용하는 변화 분석

독립 검증: 각 축이 자체 근거와 limitation을 제공하고, 실측 유동·체류시간·전체 점포수로 잘못 표현되지 않는지 확인한다.

### P2 — 유망구간 추천

- 수요원, 목적지, network, crossing, barrier, Stay, 경쟁 Evidence를 구간 후보로 연결
- 핵심/보조/통과/체류/연결약함/현장우선 분류
- 반대근거, 결측, 현장질문과 confidence 표시
- Pilot에서 현장 관찰과 비교하고 규칙 조정

독립 검증: 모든 구간이 좌표가 있는 근거와 재현 가능한 rule version을 가지며, 미확인 동선을 확정하지 않는지 확인한다.

### P3 — 후보건물/주소 우선순위

- 표준주소와 건물 식별, 건축물·필지 기본자료 연결
- 유망구간과 후보주소의 접근성·경쟁·배후 근거 연결
- `우선 현장조사/검토/후순위/제외 검토` 판정과 이유 코드
- 현장조사 인계서 및 재조사 history 연결
- Pilot 결과로 Index/판정 기준 검증

독립 검증: 후보별 Source와 이유가 재현되고, 현장필수 항목을 desk 확인값으로 표시하지 않으며, 자동 계약판정을 만들지 않는지 확인한다.

P0~P3는 각각 별도의 기능 단위로 완료·검증한다. 뒤 단계의 화면을 먼저 만들기 위해 blocker를 임의 데이터나 가짜 geometry로 우회하지 않는다.

## 21. 완료 기준

### 21.1 V2 기초분석 제품 완료 기준

- 권역에서 후보주소까지 15단계 흐름이 끊김 없이 이어진다.
- 모든 결과가 어느 공간단위의 값인지 명확하다.
- Source, 기준시점, 값 의미, verificationStatus, confidence, limitation을 확인할 수 있다.
- 상권유형은 주 유형+보조 유형과 근거로 설명되며 자료 부족은 `UNKNOWN`이다.
- Demand, Flow Potential, Stay Potential, Competition, Change, Bakery Fit이 서로 다른 축으로 설명된다.
- Kakao 관측 수, 공식상권 통계, 반경 분석값을 서로 대체하지 않는다.
- 실측하지 않은 유동·체류·매출·영업상태·시설을 생성하거나 확정하지 않는다.
- 유망구간마다 지지·반대근거, confidence, 현장 질문이 있다.
- 후보건물/주소마다 조사 우선순위와 이유, 결측, hard concern이 있다.
- 현장조사 인계에서 확인된 사실·추정·현장필수 항목이 분리된다.
- Index는 version·근거·결측 정책을 갖고 Pilot 전 임의 가중치를 확정하지 않는다.
- 과거 분석과 현장조사 이력은 snapshot/version/round로 재현 가능하다.

### 21.2 현재 blocker 해제 조건

다음은 이 설계문서 완료로 해제되지 않는다.

- 실제 Market/Submarket Polygon 생성과 승인
- 실제 E3 Candidate 접수와 E4 승인
- `validated`/`verified_geometry` 승격과 active boundary pointer
- Grid-to-Market/Submarket crosswalk 게시
- Market/Submarket 생활인구 공간집계
- geometry 기반 candidate-store decision integration

이 항목은 실제 Candidate geometry, provenance, E3 preflight, E4 human review, 승격 검증과 각 집계의 별도 완료기준을 충족해야 한다.

## 부록 A. 현재 구현 근거

이 설계는 다음 Repository 자료를 선택적으로 확인해 작성했다.

- `app/markets/MarketsExplorer.tsx`: 현재 분석 모드, 계층 선택, 업무 탭, 실행 Context
- `app/markets/KakaoBaseMap.tsx`: Kakao 지도, 주소 찾기, 300m/500m, 주변검색
- `app/markets/MarketAnalysisSummary.tsx`: 지점 분석 결과와 Source 구분
- `app/markets/MarketSpatialViewer.tsx`: 공식 경계·Grid·crosswalk 후보와 공간관계
- `app/markets/OfficialMarketTrend.tsx`: 공식상권 SALES/STORES Trend와 제한 문구
- `app/markets/spatial-layer-registry.ts`: geometry 상태와 feature count
- `app/api/markets/geocode/route.ts`, `nearby-places/route.ts`, `bakery-data/route.ts`, `crosswalk/route.ts`: 현재 API 의미와 검증 조건
- `lib/market-data/*`: 분석 Context, presentation, official data와 Source registry
- `data/seoul-market/v1.1-final/MARKET_HIERARCHY.json`: FRAMEONE 계층과 현재 `text_only` 상태
- `data/seoul-market/v1.1-final/13_SOURCE_INGEST/DATA_SOURCE_REGISTRY.json`: 현재·계획 Source와 사용 제한
- `data/seoul-market/v1.1-final/13_SOURCE_INGEST/MARKET_SUBMARKET_LIVING_POPULATION_AGGREGATION_READINESS_V1.md`: 생활인구 집계 blocker
- `data/seoul-market/v1.1-final/13_SOURCE_INGEST/FRAMEONE_BOUNDARY_REVIEW_POLICY_CLARIFICATION_V1.md`: geometry 승인·상태 scope 정책
- `CURRENT_STATUS.md`: 현재 구현·검증·BLOCKED 상태

## 부록 B. 다음 단일 개발 작업

다음 작업은 **P0 기초입지분석 Result Contract V1**을 권장한다. 코드를 작성하기 전에 한 분석 실행의 입력 snapshot과 15개 화면이 공유할 출력 구조를 문서로 고정한다. 최소 대상은 공간단위, Source/asOf, `actual|estimated|inferred|UNKNOWN`, verificationStatus, confidence, limitation, 확인/추정/현장필수 구분이다. 이 계약이 먼저 있어야 현재 데이터를 재배치해도 공식상권·반경·FRAMEONE 값의 의미가 섞이지 않는다.
