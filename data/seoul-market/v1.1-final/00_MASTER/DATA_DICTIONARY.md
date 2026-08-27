# DATA DICTIONARY · 표준 데이터 사전

**버전:** v1  
**기준일:** 2026-08-26

| No. | 도메인 | 필드명 | 형식 | 필수 | 정의 | 1차 원천 | 규칙/주의 |
|---:|---|---|---|:---:|---|---|---|
| 1 | identity | market_id | string | Y | 프레임원 영속 Market ID | 프레임원 | 예: SEOUL-SEONGDONG-SEONGSU |
| 2 | identity | market_name_ko | string | Y | 표시용 주요 상권명 | 프레임원 | 이름 변경과 ID를 분리 |
| 3 | identity | market_grade | enum | Y | 대표/주요/지역 | 프레임원 | 인지도 순위가 아닌 구내 역할 |
| 4 | identity | city | string | Y | 서울특별시 | 행정 | 고정값 |
| 5 | identity | gu_code | string | Y | 프레임원 자치구 영문코드 | 프레임원 | ID 구성요소 |
| 6 | identity | gu_name | string | Y | 자치구명 | 행정 | 25개 중 하나 |
| 7 | location | administrative_dong_codes | array | N | 관련 행정동 코드 목록 | 서울/행안부 | 상권과 N:M |
| 8 | location | legal_dong_codes | array | N | 관련 법정동 코드 목록 | 국토/행정 | 실거래 연결 |
| 9 | location | official_area_codes | array | N | 서울시 공식 상권코드 목록 | 서울 상권영역 | 기준연도 필수 |
| 10 | location | official_area_types | array | N | 골목/발달/시장/관광특구 등 | 서울 상권영역 | 공식 명칭 보존 |
| 11 | location | geometry_version | string | N | 경계 기준연도·버전 | 공식/프레임원 | 예: seoul-standard-unit-2024 |
| 12 | location | boundary_type | enum | Y | 공식/프레임원 분석권역 | 프레임원 | 현재는 분석권역 |
| 13 | location | boundary_basis | text | Y | 경계 설정 근거 | 프레임원 | 역·거리·앵커·단절요소 |
| 14 | location | boundary_includes | array | Y | 포함 세부상권·Node | 프레임원 | 동일 형식 |
| 15 | location | boundary_excludes | array | N | 인접하지만 제외한 영역 | 프레임원 | 현장 보정 |
| 16 | location | centroid | point | N | 대표 중심좌표 WGS84 | 지리 API | 숫자 검증 후 |
| 17 | location | main_stations | array | N | 중심역 | 교통 | 역코드 별도 |
| 18 | location | main_exits | array | N | 핵심 출구 | 현장/지도 | 출구별 동선 확인 |
| 19 | location | main_streets | array | Y | 핵심거리 | 프레임원/공식 | 도로명 표준화 |
| 20 | location | adjacent_market_ids | array | N | 인접 Market ID | 프레임원 | 표시명이 아닌 ID 권장 |
| 21 | population | resident_population | integer | N | 주민등록/등록인구 | 서울시 | 기준월·공간단위 필수 |
| 22 | population | households | integer | N | 세대수 | 서울시 | 주민등록 기준 |
| 23 | population | age_distribution | object | N | 연령구간별 인구 | 서울시/KOSIS | 구간 정의 저장 |
| 24 | population | sex_distribution | object | N | 성별 인구 | 서울시/KOSIS | 기준월 저장 |
| 25 | population | one_person_households | integer | N | 1인가구 | KOSIS/SGIS | 조사연도 저장 |
| 26 | population | housing_types | object | N | 아파트·단독·다세대 등 | KOSIS/SGIS | 공간불일치 주의 |
| 27 | population | apartment_households | integer | N | 배후 아파트 세대 | 서울 상권/현장 | 반경·배후지 정의 |
| 28 | living_population | weekday_by_hour | object | N | 평일 시간대 생활/길단위인구 | 서울시 | 지표명·공간단위 보존 |
| 29 | living_population | weekend_by_hour | object | N | 주말 시간대 생활/길단위인구 | 서울시 | 동일 기준 비교 |
| 30 | living_population | age_by_hour | object | N | 시간대·연령 인구 | 서울시 | 원천 제공범위 확인 |
| 31 | living_population | sex_by_hour | object | N | 시간대·성별 인구 | 서울시 | 원천 제공범위 확인 |
| 32 | living_population | long_term_foreigners | object | N | 장기체류 외국인 | 서울시 | 격자 전환 확인 |
| 33 | living_population | short_term_foreigners | object | N | 단기체류 외국인 | 서울시 | 관광수요 보조 |
| 34 | work | business_count | integer | N | 사업체수 | KOSIS/SGIS/상권서비스 | 기준연도 |
| 35 | work | worker_population | integer | N | 직장인구/종사자 | 서울 상권서비스 | 업데이트 특성 기록 |
| 36 | work | office_density | enum | N | 낮음/중간/높음 | 프레임원 의견 | 근거 source_id 필수 |
| 37 | work | major_employers | array | N | 주요 기업·기관 | 공식 기업/기관 | 최신성 확인 |
| 38 | traffic | subway_lines | array | N | 노선 | 교통기관 | 관할구간 주의 |
| 39 | traffic | subway_daily_boarding | integer | N | 일 승하차 | 서울시 | 역명·노선·일자 |
| 40 | traffic | subway_hourly_boarding | object | N | 시간대별 승하차 | 서울교통공사 | 1~8호선 범위 주의 |
| 41 | traffic | bus_routes | array | N | 주요 버스노선 | 서울시 | 정류장 ID 저장 |
| 42 | traffic | transfer_role | enum | N | 없음/지역/광역 | 프레임원 의견 | 교통 근거 필요 |
| 43 | traffic | vehicle_access | enum | N | 낮음/중간/높음 | 현장/도로 | 진입·회차 분리 |
| 44 | traffic | parking_supply | object | N | 공영/민영/점포주차 | 서울시/현장 | 실시간 가능 범위 분리 |
| 45 | anchors | schools | array | N | 학교 | 공공데이터 | 시설명·좌표 |
| 46 | anchors | universities | array | N | 대학 | 공공데이터 | 캠퍼스 경계 |
| 47 | anchors | hospitals | array | N | 병원 | 공공데이터 | 병상·방문객은 별도 |
| 48 | anchors | parks | array | N | 공원·산책로 | 서울시 | 출입구·동선 |
| 49 | anchors | tourism | array | N | 관광시설 | 관광데이터랩/서울 | 행사와 평시 구분 |
| 50 | anchors | retail_malls | array | N | 몰·백화점·시장 | 공식 시설 | 영업시간·출입구 |
| 51 | anchors | hotels | array | N | 호텔 | 관광/공공 | 외국인 수요 보조 |
| 52 | anchors | culture_venues | array | N | 공연·전시시설 | 공식 시설 | 행사일자 분리 |
| 53 | commerce | market_types | array | Y | 다중 상권유형 코드 | 프레임원 | 표시라벨과 정규화 코드 동시 보존 |
| 54 | commerce | core_consumers | array | Y | 핵심 소비층 1차 가설 | 프레임원 의견 | 현장·수치 검증 |
| 55 | commerce | weekday_pattern | text | N | 평일 패턴 | 분석 의견 | 근거 필수 |
| 56 | commerce | weekend_pattern | text | N | 주말 패턴 | 분석 의견 | 근거 필수 |
| 57 | commerce | dayparts | object | N | 출근~야간 패턴 | 분석/현장 | 시간구간 표준 사용 |
| 58 | commerce | store_counts_by_industry | object | N | 업종별 점포수 | 서울 상권/소진공 | 분류코드 저장 |
| 59 | commerce | openings | object | N | 개업점포 | 서울 상권 | 기준분기·업종 |
| 60 | commerce | closures | object | N | 폐업점포 | 서울 상권 | 기준분기·업종 |
| 61 | commerce | sales_estimated | object | N | 추정매출 | 서울 상권 | 실매출 아님 |
| 62 | commerce | consumer_estimates | object | N | 추정소비 | 서울 상권 | 매출 원천과 차이 기록 |
| 63 | bakery | bakery_store_counts | object | N | 제과점·베이커리 관련 점포 | 공식 분류/관찰 | 카페와 분리 |
| 64 | bakery | competitor_observations | array | N | 경쟁점 관찰 | 온라인/현장 | 관찰일·출처 |
| 65 | bakery | bakery_models_fit | object | N | 모델별 적합/조건부/보류/부적합 | 프레임원 의견 | 근거와 확인사항 |
| 66 | bakery | customer_menu_matrix | array | N | 소비자×시간×목적×메뉴 | 프레임원 의견 | 실제 데이터 여부 |
| 67 | bakery | menu_price_observations | array | N | 온라인 메뉴가격 관찰값 | 공식 메뉴/온라인 | 객단가로 오인 금지 |
| 68 | bakery | average_ticket_official | number | N | 공식 객단가 | 공식/카드사 | 없으면 null |
| 69 | bakery | repeat_purchase_hypothesis | enum | N | 낮음/중간/높음 | 프레임원 의견 | 현장 검증 |
| 70 | real_estate | deposit_asking | array | N | 보증금 호가 표본 | 민간 매물 | 호가 라벨 필수 |
| 71 | real_estate | rent_asking | array | N | 월세 호가 표본 | 민간 매물 | 전용면적·층·전면 포함 |
| 72 | real_estate | maintenance_fee_asking | array | N | 관리비 호가 표본 | 민간 매물 | 포함항목 확인 |
| 73 | real_estate | premium_asking | array | N | 권리금 호가 표본 | 중개/양도정보 | 시설·영업권 분리 |
| 74 | real_estate | first_floor_rent_per_sqm | number | N | 1층 전용㎡당 월세 관찰값 | 호가/현장 | 표본수 저장 |
| 75 | real_estate | vacancy_observations | array | N | 공실 관찰 | 현장/민간 | 공식 공실률과 분리 |
| 76 | real_estate | commercial_sale_transactions | array | N | 상업업무용 매매 실거래 | 국토교통부 | 임대차 자료 아님 |
| 77 | real_estate | building_ledger | object | N | 건축물대장 요약 | 건축HUB | 용도·면적·승인일 |
| 78 | field | field_survey_ids | array | N | 현장조사 레코드 | 프레임원 | 수정 이력 보존 |
| 79 | field | pedestrian_counts | array | N | 시간구간별 보행 표본 | 현장 | 관측점·분·방향 |
| 80 | field | competitor_visit_observations | array | N | 경쟁점 방문상황 | 현장 | 정확한 관찰시간 |
| 81 | field | broker_interviews | array | N | 중개업소 인터뷰 | 현장 | 의견·사실 분리 |
| 82 | meta | source_ids | array | Y | 출처 레지스트리 키 | 프레임원 | 모든 숫자 필수 |
| 83 | meta | data_period | string | N | 데이터 기준시점 | 원천 | 조회일과 분리 |
| 84 | meta | checked_at | date | Y | 조회/검증일 | 프레임원 | YYYY-MM-DD |
| 85 | meta | confidence_grade | enum | Y | A/B/C/D/E | 프레임원 | 항목 단위 권장 |
| 86 | meta | fact_status | enum | Y | 확인된 사실/분석 의견/확인 필요 | 프레임원 | 혼합 금지 |
| 87 | meta | notes | text | N | 한계·예외·변경이력 | 프레임원 | 원문 보존 |

## 공통 결측값 규칙

- **null**: 원천에 값이 없음 또는 아직 수집하지 않음
- **확인 필요**: 점포·현장·관할기관·전문가 확인이 필요
- **현재 확인 가능한 신뢰도 높은 자료 없음**: 공공·신뢰 자료를 찾지 못함
- 0은 실제로 0인 경우에만 사용하고 미수집을 0으로 저장하지 않음

## 금액 규칙

- 원 단위 정수 저장, 표시 시 원/만원을 명시
- VAT 포함 여부, 관리비 포함항목, 전용/계약면적을 별도 저장
- 실거래·호가·중개현장·온라인 메뉴가격 관찰값을 서로 다른 필드와 source_type으로 구분

## 시간대 표준

| 코드 | 시간 | 용도 |
|---|---|---|
| COMMUTE_AM | 06:00~09:59 | 출근·등교 |
| MORNING | 10:00~11:59 | 오전 생활수요 |
| LUNCH | 12:00~13:59 | 점심 |
| AFTERNOON | 14:00~16:59 | 카페·간식·체류 |
| COMMUTE_PM | 17:00~19:59 | 퇴근·귀가 |
| EVENING | 20:00~22:59 | 저녁·데이트·회식 |
| NIGHT | 23:00~05:59 | 야간 |

## 사실 상태

- 확인된 사실: source_id와 원문이 있는 내용
- 프레임원 분석 의견: 데이터·현장 관찰을 해석한 내용
- 확인 필요: 아직 근거가 부족하거나 점포별 판단이 필요한 내용
