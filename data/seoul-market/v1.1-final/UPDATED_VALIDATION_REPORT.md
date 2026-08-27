# UPDATED VALIDATION REPORT

**검수일:** 2026-08-27

| 항목 | 결과 |
|---|---|
| districts_25 | PASS |
| markets_156 | PASS |
| market_id_unique | PASS |
| submarket_id_unique | PASS |
| node_id_unique | PASS |
| no_fake_frameone_geometry | PASS |
| official_geojson_count | PASS |
| admin_geojson_nonempty | PASS |
| grid_geojson_nonempty | PASS |
| secret_scan_passed | PASS |
| required_files | PASS |

## 정량 결과

- 자치구: 25
- Level 3: 156
- Level 4: 382
- Level 5: 763
- ID 수정: 2
- 공식 상권 이름 후보 Crosswalk: 156/156 (100.0%)
- 행정동 이름 후보 Crosswalk: 156/156 (100.0%)
- Grid 공간연산 Crosswalk: 0/156
- 현장조사 S/A: 25/49

## 제한사항

- Crosswalk는 현재 이름 기반 후보이며 relation_type=manual_review다. 면적비는 모두 공란이다.
- 프레임원 Polygon 확정 전 25개 Pilot 수치를 적재하지 않았다.
- 인증형 API 실제 READY는 0개다. 서울 공식 파일 다운로드만 READY다.
- 프로그램 개발은 Tree·지도 레이어·상세 패널 골격 착수 가능하나, 공간자동매칭·수치집계는 보완 필요다.