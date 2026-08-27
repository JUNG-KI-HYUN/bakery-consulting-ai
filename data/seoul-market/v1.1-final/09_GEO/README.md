# 09_GEO

기준일: 2026-08-27

| 파일 | 상태 | 원천 CRS → 출력 CRS | 비고 |
|---|---|---|---|
| OFFICIAL_SEOUL_MARKETS.geojson | validated | EPSG:5181 → EPSG:4326 | 공식 SHP 2023-10, 1,650개 |
| ADMIN_DONG.geojson | validated | EPSG:5181 → EPSG:4326 | 상권분석서비스 행정동 SHP 2023-10 |
| LIVING_GRID_250M.geojson | validated | EPSG:5179 → EPSG:4326 | 생활인구 격자 SHP 2025-05 |
| FRAMEONE_MARKETS.geojson | text_only | - | Polygon 미확정, geometry=null |
| FRAMEONE_SUBMARKETS.geojson | text_only | - | Polygon 미확정, geometry=null |
| NODES.geojson | text_only | - | 주소·좌표 미확인, geometry=null |

2024년 이후 상권분석 지표는 표준단위구역 체계를 사용하지만 포털의 다운로드 SHP는 2023-10판이다. 따라서 2024+ 지표코드와 geometry 동일성을 확정하지 않으며 Crosswalk는 이름 후보 `manual_review`로만 제공한다.
