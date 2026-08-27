# PROGRAM DATA MODEL · 현재 프로그램 연결 설계

**버전:** v1  
**기준일:** 2026-08-26  
**범위:** 스키마·조인·변환규칙만 정의하며 `full-source-dump` 코드는 수정하지 않음

## 목표 흐름

1. 후보점포 주소 입력
2. 주소 정규화·좌표화·행정/법정구역 확인
3. geometry와 교차표로 Market ID 후보 산출
4. 경계부는 복수 후보·수동선택·선택근거 저장
5. 상권·인구·교통·앵커·경쟁·부동산 스냅샷 호출
6. 베이커리 모델·메뉴 가설과 현장조사 필요항목 제시
7. 현재 `ConsultationInput`, `CandidateStoreInput`, `FacilityCheckInput`, `BreakEvenInput`과 연결
8. 상권성과 점포·시설·임대차·손익 결과를 분리한 뒤 `추천/조건부 추천/보류/위험` 판단

## 핵심 엔티티

| 엔티티 | PK | 주요 관계 | 역할 |
|---|---|---|---|
| districts | gu_code | markets 1:N | 25개 자치구 기준 |
| markets | market_id | districts N:1 | Level 3 프레임원 권역 |
| submarkets | submarket_id | markets N:1 | Level 4, 경계 확정 후 ID 발급 |
| market_nodes | node_id | markets N:1 | 역 출구·Street·앵커·교차점 |
| official_areas | official_area_code+geometry_version | map N:M | 서울시 공식 상권 |
| market_official_area_map | market_id+official_area_code+geometry_version | N:M | 공식/프레임원 권역 교차표 |
| market_snapshots | market_id+data_period+snapshot_version | sources N:M | 기준시점별 수치·분석 |
| source_registry | source_id | snapshots N:M | 출처·URL·조회일·신뢰도 |
| stores | store_id | markets N:1 | 경쟁점·후보점포와 영업상태 이력 |
| field_surveys | survey_id | market/store N:1 | 온라인과 분리된 현장원천 |
| bakery_models | bakery_model_id | markets N:M | 모델 적합성 가설 |
| menus | menu_id | equipment N:M | 메뉴 표준분류 |
| equipment | equipment_id | menus N:M | 설비·공간·인프라 요구 |
| candidate_cases | case_id | store+market | 상담→최종판단 사례 |

## Market ID 매칭

- 확정 경계 내부면 해당 `market_id`를 자동 선택한다.
- 경계 confidence가 D/E이거나 경계부면 복수 후보를 보이고 수동 확정한다.
- 자동은 `match_method=point_in_polygon`, 수동은 `manual_override`와 사유를 저장한다.
- v1 권역은 확정 geometry 전이므로 이름·좌표 근접 탐색 뒤 수동검토를 기본으로 한다.

## 현재 프로그램 필드 연결

| 현재 구조 | 서울 DB 입력 | 연결 용도 | 판단 주의 |
|---|---|---|---|
| ConsultationInput | market_id, 핵심 소비층, bakery_priority | 상담 사전정보 | 중요도는 성공확률이 아님 |
| CandidateStoreInput | geometry, 경쟁, 교통, 앵커, 호가표본 | 후보점포 비교 | 층·전면·출구로 결과가 달라짐 |
| FacilityCheckInput | equipment_requirements | 전기·급배수·배기·반입 | 상권 DB가 시설 가능을 보증하지 않음 |
| BreakEvenInput | rent_asking, maintenance_fee, model/menu | 손익분기점 입력 보조 | 호가·계약가·VAT 구분 |
| BrandMarketingInput | consumers, dayparts, purpose | 오픈 초기 마케팅 실행계획 | 90일 운영대행으로 표현 금지 |
| InteriorSketchInput | node, access, equipment | 기초 동선·배치 조건 | 설계도서·인허가 대체 아님 |

## 판단 원칙

상권 점수를 현재 프로그램 위험점수에 임의 합산하지 않는다. 상권은 수요 배경이고 계약 전 최종판단은 해당 점포의 시설·임대차·투자·손익·운영조건을 함께 검증한다.
