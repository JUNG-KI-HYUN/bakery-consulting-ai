# STEP 4B-1 RAW INTAKE REPORT

기준일: 2026-08-28

## 1. 판정

- 실제 Raw ZIP 5개와 내부 CSV 5개를 식별하고 원본 SHA-256, CP949 인코딩, 실제 Header, 행·key 구조를 검증했다.
- Raw는 수정하지 않았고 저장소 내부에 압축해제본을 남기지 않았다. Manifest와 검증 결과만 생성했다.
- 생활인구 합산, 매출 분석, 경쟁점 분석, Polygon intersection, FRAMEONE 자동매칭, Crosswalk 승격은 모두 수행하지 않았다.
- 코드 일치는 geometry 동등성의 증거가 아니므로 모든 공간 Join은 계속 금지한다.

## 2. Raw 파일

| Source | 파일 | SHA-256 | 인코딩 | 행수 | Key 수 |
|---|---|---|---:|---:|---:|
| SRC-SEOUL-LIVING | 250_LOCAL_RESD_20260823.zip | `f8040e04b1da4bcf68eaac6171cd8ab242e88ca8a579370ff0a5e962ace8f362` | CP949 | 253,686 | 8,564 |
| SRC-SEOUL-SALES | 서울시 상권분석서비스(추정매출-상권)_2024년.zip | `97e7cde3a3291a8fd623f7b5268ea4b01a666027ae20da2ddf804ddae22288c5` | CP949 | 87,179 | 1,581 |
| SRC-SEOUL-SALES | 서울시 상권분석서비스(추정매출-상권)_2025년.zip | `c907f3d386d62b89f45781e6e6172328ee91b1b8dd2c621e4171e437bee1c6b2` | CP949 | 85,732 | 1,577 |
| SRC-SEOUL-STORES | 서울시 상권분석서비스(점포-상권)_2024년.zip | `969b7c38e5f3cc8630970e4ca8b85ef1c20d485982f64a90de990b13b38ca5ff` | CP949 | 306,889 | 1,650 |
| SRC-SEOUL-STORES | 서울시 상권분석서비스(점포-상권)_2025년.zip | `133bfc6ce79e13ee5b289490e4667dfba46a0af5d0d71df360a0d324e030a4e6` | CP949 | 304,775 | 1,650 |

## 3. 실제 Header와 Contract 차이

- 생활인구 Grid key 실제 Header는 `CELL_ID`가 아니라 `250M격자`다. 실제 행 grain은 `일자 + 시간 + 행정동코드 + 250M격자`다.
- Sales는 `기준_년분기_코드` 한 필드로 연도·분기를 표현하며 2024/2025 모두 한국어 Header다.
- Stores는 2024 한국어 Header와 2025 영문 Header가 서로 달라 version별 매핑이 필요하다.

## 4. 생활인구 Grid Coverage

- metric rows: 253,686
- metric unique grid: 8,564
- geometry grid: 10,125
- matched / geometry-only / metric-only: 8,563 / 1,562 / 1
- geometry coverage ratio: 84.572840%
- metric coverage ratio: 99.988323%
- `생활인구합계`의 `*` 억제값: 14,257행. 0으로 치환하지 않았다.
- 기존 3필드 후보 key에는 48,809개 중복 초과행이 있으나 행정동코드를 포함한 실제 4필드 row key 중복은 0개다.

## 5. 2024/2025 코드 비교

- Sales: 1581 / 1577, 교집합 1575, 2024 only 6, 2025 only 2, 명칭 충돌 1
- Stores: 1650 / 1650, 교집합 1650, 2024 only 0, 2025 only 0, 명칭 충돌 1
- Sales↔Stores 2024: 교집합 1581, Sales only 0, Stores only 69
- Sales↔Stores 2025: 교집합 1577, Sales only 0, Stores only 73

## 6. 2023 geometry 코드 비교

- Sales 2024: geometry 1,650 / metric 1,581 / 교집합 1,581 / 상태 `PARTIAL_CODE_MATCH`
- Stores 2024: geometry 1,650 / metric 1,650 / 교집합 1,650 / 상태 `CODE_LEVEL_MATCH`
- Sales 2025: geometry 1,650 / metric 1,577 / 교집합 1,577 / 상태 `PARTIAL_CODE_MATCH`
- Stores 2025: geometry 1,650 / metric 1,650 / 교집합 1,650 / 상태 `CODE_LEVEL_MATCH`
- `CODE_LEVEL_MATCH`도 geometry version 호환 확정이 아니다. 공식 근거 확인 전 `geometry_compatibility_status=NEEDS_REVIEW`, `join_allowed=false`를 유지한다.

## 7. 후속 확인

- Raw의 공식 다운로드 시각과 배포 라이선스/제공 버전을 확인해야 한다. 확인 전 `retrieved_at=null`을 유지한다.
- 생활인구 metric-only Grid 1개와 geometry-only Grid 1,562개의 시점·경계 범위를 확인해야 한다.
- 코드 3110024 명칭의 2024 `혜회동주민센터`와 2025 `혜화동주민센터` 차이를 공식 원천에서 확인해야 한다.
- STEP 4B-2 API 검증 전에는 API key·adapter를 추가하지 않는다.
