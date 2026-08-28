# 13_SOURCE_INGEST

STEP 4B-0 공식 데이터 Source Ingest Contract와 검증 gate다. 이 디렉터리는 실제 공식 데이터를 적재하거나 분석하는 구현이 아니다. 실제 원천이 없으면 `SOURCE_MISSING`, 실행하지 않은 검사는 `NOT_RUN`, 호환성 확인 전 Join은 `BLOCKED`로 기록한다.

## 디렉터리 역할

| 경로 | 역할 | 허용 조건 |
|---|---|---|
| `source-contracts/` | Source별 기관·원천·버전·키·컬럼·공간단위·호환조건 계약 | `DATA_SOURCE_CATALOG`의 기존 source_id 사용 |
| `manifests/` | 실제 원천파일 1개당 provenance와 검증 결과 기록 | 실제 원천이 존재할 때만 manifest 생성 |
| `raw/` | 다운로드/API 응답 원본을 바이트 그대로 보존 | 수정·재포맷·수치 보정 금지 |
| `normalized/` | 검증을 통과한 파생 데이터 | validation `PASS`와 compatibility `PASS`가 모두 필요 |
| `quarantine/` | 버전·컬럼·키·숫자·호환성 문제가 있는 데이터 격리 | 분석 및 자동 Join 금지 |

`raw/`, `normalized/`, `quarantine/`의 `.gitkeep`은 빈 구조를 보존하는 placeholder이며 공식 원천이나 manifest가 아니다.

## Source Contract

`source-contracts/SOURCE_CONTRACTS.json`은 다음 7개 기존 ID를 사용한다.

- `SRC-SEOUL-LIVING`
- `SRC-SEOUL-AREA`
- `SRC-SEOUL-STORES`
- `SRC-SEOUL-SALES`
- `SRC-SEOUL-FOOT`
- `SRC-SEOUL-WORK`
- `SRC-SGIS`

계약의 필드명은 canonical `snake_case`다. `source_column_map`은 실제 raw 컬럼명을 연결한다. 실제 헤더가 확인되지 않은 매핑은 `null`이며, 이 상태에서는 검증이 `PASS`가 될 수 없다. `supported_versions`가 비어 있으면 어떤 version도 자동 지원하지 않는다.

## Raw 및 manifest 규칙

향후 실제 원천은 다음 규칙을 사용한다.

```text
raw/<source_id>/<original_filename>
manifests/<source_id>/<original_filename>.manifest.json
```

manifest 최소 필드는 `source_id`, `original_filename`, `sha256`, `retrieved_at`, `source_date`, `source_version`, `row_count`, `key_count`, `validation_status`, `compatibility_status`, `normalized_output`, `notes`다. 실제 파일이 없으면 manifest를 만들지 않는다.

`row_count`, `key_count`, coverage는 원천 부재 또는 검사 불가 시 `null`이다. 실제 관측값이 0일 때만 `0`을 쓴다. 미수집을 0으로 치환하지 않는다.

## Compatibility Gate

- 공식상권: `SEOUL_MARKET_SHP_2023-10-20`과 실제 2024+ metric 코드 호환성 확인 전 Join 금지
- 생활인구: OA-22784 원문 `CELL_ID`와 `LIVING_GRID_250M.geojson`의 `grid_id` 10,125개 coverage 확인 전 Join 금지
- 행정동: 425개 `adm_cd`의 공식 `adm_nm`, `gu_code`, `gu` 전수 검증 전 자동 보강 금지
- `manual_review` Crosswalk는 compatibility 증거가 아니며 상태를 승격하지 않는다.

## 검증 실행

새 라이브러리 없이 Node 표준기능만 사용한다.

```powershell
node --check data/seoul-market/v1.1-final/13_SOURCE_INGEST/validate-source-ingest.mjs
node data/seoul-market/v1.1-final/13_SOURCE_INGEST/validate-source-ingest.mjs
```

현재 계약·원천 상태에서 summary를 재생성할 때만 다음을 사용한다.

```powershell
node data/seoul-market/v1.1-final/13_SOURCE_INGEST/validate-source-ingest.mjs --write-summary
```

향후 실제 manifest 한 건은 다음 방식으로 검증할 수 있다. 검증기는 파일을 이동하거나 수정하지 않는다.

```powershell
node data/seoul-market/v1.1-final/13_SOURCE_INGEST/validate-source-ingest.mjs --validate-manifest <manifest-path>
```

CSV와 JSON 배열/`records`/GeoJSON FeatureCollection은 표준기능으로 검사한다. ZIP/SHP 내부 컬럼 검증과 인코딩 변환은 현재 지원하지 않으며 실제 적재 단계에서 검증된 압축 해제·Shapefile adapter 요구사항으로 남긴다. 새 라이브러리는 STEP 4B-0에서 설치하지 않는다.

## 프로그램 사용 금지 조건

다음 중 하나라도 해당하면 raw를 프로그램 분석에 사용할 수 없다.

- 원천 또는 manifest 없음
- source/version/date/code system/spatial unit 누락
- 실제 geometry를 포함하는데 CRS 누락
- 필수 컬럼 누락, key null/중복, 숫자 parse 오류
- 계약에 지원 version이 등록되지 않았거나 실제 version이 불일치
- compatibility gate가 `PASS`가 아님
- `normalized_output`이 검증 전에 지정됨

이 단계는 raw 수치 적재, 생활인구·매출 계산, Polygon intersection, Crosswalk 승격을 수행하지 않는다.
