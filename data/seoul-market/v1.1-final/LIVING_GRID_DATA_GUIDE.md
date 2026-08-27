# LIVING GRID 250M DATA GUIDE

**확인 기준일:** 2026-08-27

## 확인된 사실

- 공식 데이터셋: `[내국인] 서울 생활인구(250m)` OA-22784, 장기·단기외국인 별도 데이터셋.
- 공간단위: 국가표준 250m 격자, 서울 약 8,500여 개 생활인구 셀 안내. 경계 SHP에는 서울 경계 주변 포함 10,125개 레코드.
- Grid 식별자: `CELL_ID`; 보조키 `GID`; 중심좌표 `CELL_X`, `CELL_Y`.
- 공간원천: `서울 격자 파일(250m, 5179, SHP)`, EPSG:5179, 파일 내부 기준 2025-05-12.
- 생활인구 갱신: 일·시간 단위 생산, 4일 전 자료를 매일 제공. Sheet/OpenAPI는 기준일 4일 전 자료.
- 제공방식: Sheet, OpenAPI, 일별·월별 ZIP 다운로드.
- 내국인 주요 필드: 기준일자, 시간대, CELL_ID, 총생활인구, 성별·연령대별 생활인구. 3명 이하 속성은 `*` 비식별.

## 전환 주의

- 기존 행정동·집계구 생활인구 생산은 2026-07-31 이후 종료됐다.
- 과거 행정동 값을 현재 250m 값처럼 사용하지 않는다.
- `LIVING_GRID_250M.geojson`은 EPSG:5179 원본을 EPSG:4326으로 변환한 공간파일이다.
- Market 집계는 프레임원 Polygon 확정 후 교차면적 가중 또는 중심점 포함 방식을 선택해야 한다.

## Source

- https://data.seoul.go.kr/dataList/OA-22784/S/1/datasetView.do
- https://data.seoul.go.kr/dataVisual/seoul/seoulLivingPopulation.do
