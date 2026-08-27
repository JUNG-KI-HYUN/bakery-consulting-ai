# API FIELD MAP

**기준일:** 2026-08-26

| 프레임원 도메인 | 표준 필드 | 1차 API/원천 | 조인키 | 공간단위 | 변환·주의 |
|---|---|---|---|---|---|
| 상권경계 | official_area_codes, geometry | API-SEOUL-AREA | 공식 상권코드 | 공식 상권/표준단위 | EPSG:5181→WGS84 변환, geometry_version 보존 |
| Market ID | market_id | 프레임원 | market_id | Level 3/4 | 공식 코드와 N:M crosswalk |
| 행정동 | administrative_dong_codes | API-SGIS/서울 | 행정동코드 | 행정동 | 기준연도 코드 보존 |
| 생활인구 | weekday_by_hour 등 | API-SEOUL-FOOT, API-SEOUL-LIVING-GRID | 공식코드/격자 | 상권/250m | 전환 전후 혼합 금지 |
| 직장인구 | worker_population | API-SEOUL-WORK | 공식 상권코드 | 공식 상권 | 분기 반복 특성 기록 |
| 주민인구 | resident_population 등 | API-SEOUL-REGISTEREDPOP | 행정동코드 | 행정동 | 상권으로 면적가중/격자집계 시 방법 기록 |
| 점포·창폐업 | store_counts_by_industry, openings, closures | API-SEOUL-STORES | 공식코드+업종코드+분기 | 공식 상권 | 업종코드 버전 저장 |
| 경쟁점 POI | competitor_observations | API-SHOP-SDSC | 좌표/업종코드 | 점 | 폐업·중복 현장확인 |
| 추정매출 | sales_estimated | API-SEOUL-SALES | 공식코드+업종코드+분기 | 공식 상권 | 실매출 아님, 2021+ 제공 주의 |
| 추정소비 | consumer_estimates | API-SEOUL-CONSUME | 공식코드+분기 | 공식 상권 | 행정동 소비 원천과 차이 |
| 앵커 | anchors.* | API-SEOUL-ANCHOR | 공식코드/시설코드 | 상권 | 시설 좌표와 거리 재계산 권장 |
| 지하철 | subway_daily_boarding | API-SUBWAY-DAILY | 역명+노선+일자 | 역 | 동명역·환승역 정규화 |
| 시간대 교통 | subway_hourly_boarding | API-SUBWAY-HOURLY | 역명+노선+일자 | 역 | 서울교통공사 관할만 |
| 주소좌표 | centroid/store coordinates | API-NAVER-GEOCODE | 정규화 주소 | 점 | 결과 후보·행정동코드 검증 |
| 인구·사업체 보완 | population/business_count | API-SGIS | 경계코드/격자 | 집계구·격자 | KOSIS와 제외범위 차이 기록 |
| 관광 | tourism.* | API-TOURISM-DATALAB | 시군구/관광지 | 지역/POI | 행사기간·평시 분리 |
| 상가 매매 | commercial_sale_transactions | API-RTMS-COMMERCIAL | 법정동앞5자리+계약월 | 시군구/거래 | 임대차·월세가 아님 |
| 건축물 | building_ledger | API-BUILDING-HUB | 시군구+법정동+지번 | 건물 | 위반건축물·현황과 시차 가능 |
| 현장 | field.* | FIELD SURVEY | survey_id+market_id | 관측점 | 원천 온라인값을 덮어쓰지 않음 |

## crosswalk 기본키

| 테이블 | PK | 주요 FK |
|---|---|---|
| markets | market_id | gu_code |
| market_official_area_map | market_id + official_area_code + geometry_version | market_id |
| market_admin_map | market_id + admin_dong_code + boundary_version | market_id |
| market_grid_map | market_id + grid_id + geometry_version | market_id |
| market_sources | market_id + source_id + data_period | market_id |
| stores | store_id | market_id |
| field_surveys | survey_id | market_id, store_id nullable |
