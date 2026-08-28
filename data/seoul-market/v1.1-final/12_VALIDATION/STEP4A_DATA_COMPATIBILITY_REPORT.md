# STEP 4A DATA COMPATIBILITY REPORT

기준일: 2026-08-28

## 1. 판정

- STEP 4A 로컬 호환성 점검과 재현 가능한 검증 산출물 작성은 완료했다.
- 공식상권 2024+ 지표 원본과 OA-22784 생활인구 수치 원본은 저장소에서 찾지 못했다. 두 호환성 검사는 `SOURCE_MISSING`이며 `PASS`가 아니다.
- 행정동 레이어의 명칭·자치구 속성이 모두 비어 있어 `NEEDS_REVIEW`다.
- 기존 데이터, geometry, Crosswalk, 프로그램 코드에는 손대지 않았다.

## 2. 공식상권 geometry와 2024+ 지표

- geometry: 1650개, 공식상권코드 고유 1650개, 누락 0, 중복 0
- geometry 유형: Polygon 1561, MultiPolygon 89
- 원천/출력 CRS: `EPSG:5181` → `EPSG:4326`
- local geometry version: `SEOUL_MARKET_SHP_2023-10-20`
- 현재 서울시 상권분석서비스 설명은 2022 표준단위구역을 상권 구성 기반으로 명시한다.
- 2024+ 지표 후보 파일: 0개
- 지표 원본이 없으므로 geometry 코드 수 외 metric 코드 수, 교집합, 차집합, 명칭/유형 일치는 모두 `null`이다.
- 결론: 코드가 같다고 가정하는 직접 조인은 금지하고, 지표 파일 확보 뒤 기준년·분기·상권구분코드·상권코드·명칭·유형을 비교해야 한다.

## 3. 생활인구 Grid key coverage

- geometry: 10125개, grid_id 고유 10125개, 누락 0, 중복 0
- 보조 GID: 고유 10125개, 누락 0, 중복 0
- 원천/출력 CRS: `EPSG:5179` → `EPSG:4326`
- local geometry version: `SEOUL_250M_GRID_SHP_2025-05-12`
- OA-22784 수치 후보 파일: 0개
- 수치 원본이 없으므로 metric row/key, matched/unmatched key, coverage ratio는 모두 `null`이다. 미확인을 0으로 기록하지 않았다.
- OA-22784 수치 원본을 확보한 뒤 `CELL_ID`를 문자열로 보존하여 `grid_id`와 비교해야 한다.

## 4. 행정동 attribute audit

- geometry: 425개, adm_cd 고유 425개, 누락 0, 중복 0
- adm_nm: 값 있음 0, 누락 425
- gu_code: 값 있음 0, 누락 425
- gu: 값 있음 0, 누락 425
- 공식상권 레이어의 adm_cd/adm_nm 후보로 399/425개 코드를 참조할 수 있다. 미참조 26개, 명칭 충돌 0개다.
- 공식상권의 area-level 자치구가 행정동 코드와 어긋나는 후보 2개가 있어 이를 행정동 자치구로 복사하지 않는다.
- 보완 후보는 서울시 자치구-행정동 코드 PDF, SGIS 기준연도 경계 API, 행정안전부 행정표준코드관리시스템이다.

## 5. 기존 데이터 불변 검증

- hierarchy: 25 / 156 / 382 / 763
- FRAMEONE non-null geometry: Market 0, Submarket 0, Node 0
- Crosswalk: 공식상권 863개 모두 manual_review, 행정동 458개 모두 manual_review, Grid 0개
- Crosswalk 상태 승격: 0
- 신규 geometry/좌표 생성: 0
- 생활인구 수치 집계·상권 점수 계산: 0
- 보호 상담 데이터 SHA-256: 작업 시작 기준과 동일

## 6. 다음 단계 조건

STEP 4B에서 가능한 범위는 원천 스냅샷 수집 어댑터의 입력 계약·스키마 검증까지다. 공식 데이터 파일/API 응답, 기준시점, 서비스 코드, 필드가 확보되기 전에는 실제 적재 성공이나 공간 조인을 선언할 수 없다.

STEP 4C 전에 반드시 필요한 데이터:

- 동일 기준분기의 2024+ 공식상권 지표 원본과 상권코드·명칭·구분코드
- OA-22784 생활인구 수치 원본과 원문 `CELL_ID`
- 425개 행정동 전체의 기준연도 코드·명칭·자치구 코드·자치구명 공식 매핑
- geometry와 지표의 버전 호환성 검토 결과 및 불일치 코드 처리 규칙
- FRAMEONE Polygon 확정 전에는 Market↔Grid 집계 및 overlap 계산 금지

## 7. 공식 출처

- 공식상권 geometry: https://data.seoul.go.kr/dataList/OA-15560/S/1/datasetView.do
- 서울시 상권분석서비스 구성 기준: https://golmok.seoul.go.kr/introduce.do
- 생활인구 250m: https://data.seoul.go.kr/dataList/OA-22784/S/1/datasetView.do
- 생활인구 전환 공지: https://data.seoul.go.kr/together/notice/boardView.do?seq=721010a1522630fbf7a78d381a8326ee
- 행정동 geometry: https://data.seoul.go.kr/dataList/OA-22160/S/1/datasetView.do
- SGIS 행정경계 API: https://sgis.mods.go.kr/developer/html/newOpenApi/api/dataApi/addressBoundary.html
- 행정표준코드관리시스템: https://www.code.go.kr/indexFrame.do
