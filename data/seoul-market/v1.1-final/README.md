# FRAMEONE 서울 상권 마스터 데이터베이스 v1.1

**기준일:** 2026-08-27

서울 25개 자치구 → 156개 프레임원 주요상권 → 382개 세부상권 → 763개 Node를 직원용 Tree·지도·상세 패널에서 읽을 수 있게 연결한 개발 전 데이터 패키지다.

## 시작 파일

- `MARKET_HIERARCHY.json`: 직원용 Tree 기본 원천
- `00_MASTER/MARKET_ID_FREEZE_v1_1.md`: ID 동결·변경 Crosswalk
- `09_GEO/`: 공식 상권·행정동·250m 격자와 프레임원 text-only 레이어
- `10_UI/`: 직원 UI·지도·Google Sheet 명세
- `11_PILOT/`: 자치구별 25개 파일럿과 적재 판정
- `08_PROGRAM/PROGRAM_DATA_CONTRACT.md`: Cursor 개발 데이터 계약
- `00_MASTER/UPDATED_VALIDATION_REPORT.md`: 최종 검수

## 핵심 제한

공식 상권·행정동 SHP는 포털에서 실제 내려받아 EPSG:4326으로 변환했지만 원천 파일은 2023-10판이다. 2024년 이후 표준단위구역 지표와 동일 geometry인지 추가 검증이 필요하다. 프레임원 권역 Polygon은 만들지 않았고 geometry는 null이다. Crosswalk는 이름 후보 100%이며 공간 중첩비 검증은 0%다. 파일럿 실제 수치는 이 때문에 의도적으로 적재하지 않았다.
