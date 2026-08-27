# FRAMEONE 서울 상권 DB v1.1 최종 데이터 준비도 보고서

**검증일:** 2026-08-27  
**대상:** `frameone-seoul-market-data-v1.1-final-2026-08-27.zip`

## 1. 최종 수정 결과

- 신규 Market ID `SEOCHON`, `SAGAJEONG` 상세문서 2개를 정상 전체 문서로 복원했다.
- 구 Market ID `SEOCHEON`, `SAGAJUNG` 문서는 `status: retired`와 `replaced_by`를 가진 호환 안내문으로 유지했다.
- `MARKET_HIERARCHY.json`의 25개 구, 156개 Market, 382개 Submarket, 763개 Node를 `PROGRAM_DATA_CONTRACT.md`와 일치시켰다.
- 프로그램 내부 JSON, TypeScript와 API Response의 필드명은 `camelCase`로 확정했다.
- 외부 원본과 CSV의 `snake_case`는 허용하되 프로그램 진입 시 Adapter/Normalizer에서 `camelCase`로 변환하도록 문서화했다.

## 2. 자동검증 결과

| 번호 | 검증 항목 | 결과 | 확인값 |
|---:|---|---|---|
| 1 | District | PASS | 25 |
| 2 | active Market | PASS | 156 |
| 3 | Submarket | PASS | 382 |
| 4 | Node | PASS | 763 |
| 5 | 모든 ID unique | PASS | District·Market·Submarket·Node 중복 0 |
| 6 | 신규 Market ID 2개 정상 상세문서 | PASS | 전체 본문 18개 섹션·면책 포함, DEPRECATED 표기 없음 |
| 7 | 구 Market ID 2개 deprecated | PASS | `status: retired`, `replaced_by` 확인 |
| 8 | Hierarchy와 Data Contract 일치 | PASS | 누락 필드·부모 ID 오류·타입 오류 0 |
| 9 | camelCase Naming Rule | PASS | 프로그램 Hierarchy의 비규격 키 0 |
| 10 | Secret 없음 | PASS | 잠재 Secret 탐지 0 |
| 11 | 가짜 좌표 없음 | PASS | Node 좌표 비어 있음 763, 임의 좌표 0 |
| 12 | 가짜 geometry 없음 | PASS | Frameone Market·Submarket·Node 비어 있음, 임의 geometry 0 |

## 3. 프로그램 착수 범위

`MARKET_HIERARCHY.json`은 Tree UI의 원천 데이터로 바로 사용할 수 있으며 TypeScript 계약과 필드명이 일치한다. 신규 ID 오류와 naming 충돌도 해소됐다.

자동 공간매칭, Frameone Polygon, 생활인구 Grid 집계와 실제 인구·매출 수치는 이번 최종 수정 범위에서 제외했으며 Tree UI 프로그램 착수를 막는 사유로 판단하지 않는다. 프로그램에서는 해당 상태를 미수집 또는 수동검토 필요로 표시해야 한다.

PROGRAM DEVELOPMENT: READY
