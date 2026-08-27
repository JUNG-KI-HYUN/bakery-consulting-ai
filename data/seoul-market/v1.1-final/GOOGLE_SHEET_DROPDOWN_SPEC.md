# GOOGLE SHEET DROPDOWN SPEC

## Sheets

- `01_MARKET_MASTER`: market_id, gu, market_name, importance, research_priority
- `02_SUBMARKET`: parent_market_id, submarket_id, submarket_name, status
- `03_NODE`: parent_submarket_id, node_id, node_type, name, address, latitude, longitude
- `04_DATA`: entity_id, metric_code, value, unit, base_date, source_id, status
- `05_FIELD_SURVEY`: survey_id, entity_id, date, surveyor, weekday_type, time, weather, observations
- `06_SOURCE`: source_id, title, url, base_date, retrieved_at, license
- `99_LISTS`: 종속 드롭다운용 고유 목록

## Dependency

1. 자치구 선택 → `FILTER(01_MARKET_MASTER!market_name, gu=선택값)`
2. 주요상권 선택 → `FILTER(02_SUBMARKET!submarket_name, parent_market_id=선택 Market ID)`
3. 세부상권 선택 → `FILTER(03_NODE!name, parent_submarket_id=선택 Submarket ID)`

표시값은 한글명, 숨김 보조열은 ID를 사용한다. 이름 중복을 방지하려면 화면에는 `상권명 (자치구)`를 표시한다. CSV Import 원천은 `08_PROGRAM/MARKET_HIERARCHY.csv`, `SUBMARKET_INDEX.csv`, `NODE_INDEX.csv`다.
