# Seoul Spatial Data Ingestion V1 Design

## 1. 현재 Repository 데이터 구조

- 확인 기준은 branch `codex-night-20260901`, HEAD `9b6d159 feat: add seoul pedestrian spatial api clients`이다.
- `lib/market-data/clients/seoul-open-data.ts`는 서울 열린데이터 API 공통 요청, `INFO-000` 확인, 최대 1,000건 범위 검증, `list_total_count` 및 `row` 해석을 담당한다.
- `lib/market-data/clients/seoul-pedestrian-spatial.ts`는 `TbTraficWlkNet`과 `tbTraficCrsng`의 page wrapper, normalized row type, row parser를 함께 제공한다. 별도 spatial type/parser 파일은 현재 없다.
- 공통 `lib/market-data/types.ts`는 매출·점포·생활인구 관측값용이며 spatial snapshot type이나 loader는 없다. 이번 데이터를 기존 metric observation으로 변환하지 않는다.
- `data/seoul-market/v1.1-final/13_SOURCE_INGEST/`에는 `raw/`, `normalized/`, `quarantine/`, `manifests/`, `source-contracts/`와 표준 Node 기반 검증기가 있다. 이 구조를 그대로 확장하고 별도 최상위 data 체계를 만들지 않는다.
- 기존 원칙은 raw 원본 보존, normalized와 raw 분리, quarantine 격리, source contract 및 manifest 검증이다. 현재 raw 약 398 MB는 `.gitignore`로 제외되어 있고 normalized/quarantine은 placeholder만 있다.
- 기존 manifest는 파일 단위 schema이다. API 다중 page snapshot에 필요한 수집 진행상태·page 수·자치구별 건수는 현재 schema에 없다. 새 중복 metadata 시스템을 만들기보다 기존 manifest schema에 API snapshot 변형을 하위호환 방식으로 추가하는 것이 적합하다.
- 기존 `SRC-SEOUL-FOOT`는 서울시 상권분석서비스의 **길단위인구-상권** source이다. 도보 network인 `TbTraficWlkNet`과 의미가 다르므로 재사용하면 안 된다.
- 현재 tracked 파일은 약 24.4 MB이고 Git loose object는 약 55.7 MiB이다. 대형 공간 snapshot은 기존 raw와 같은 Git 비추적 정책이 맞다.
- 현재 `.gitignore`는 `13_SOURCE_INGEST/raw/*`만 제외한다. 실제 V1 수집 전에 normalized snapshot, quarantine data, staging, checkpoint도 명시적으로 제외해야 한다.

## 2. 권장 Ingestion 구조

V1은 자치구별 API 필터 호출이 아니라 **서비스별 서울 전체 순차 pagination 후 로컬 자치구 분할**을 사용한다.

```text
서울 열린데이터 API
  ├─ TbTraficWlkNet: 1..491082, 최대 1,000건/page, 예상 492 pages
  └─ tbTraficCrsng: 1..31080, 최대 1,000건/page, 예상 32 pages
          ↓
공통 seoul-open-data client의 응답·RESULT.CODE 검증
          ↓
동일 snapshot staging의 raw page 저장 + page checkpoint
          ↓
기존 seoul-pedestrian-spatial row parser로 normalized record 변환
          ↓
SGG_CD 기준 자치구별 NDJSON 분할
  └─ 자치구 코드 누락 row는 UNKNOWN 파일에 보존
          ↓
전체 건수·page·ID·WKT 누락·parser 결과 검증
          ↓
READY manifest 발행 및 current pointer 전환
          ↓
기존 정상 snapshot 유지 + 새 immutable snapshot 사용
```

전체 호출 후 분할을 선택하는 이유는 다음과 같다.

- 한 서비스의 `list_total_count`와 실제 수집 범위를 직접 대조할 수 있다.
- 자치구 필터의 정확한 optional parameter 계약을 새로 가정할 필요가 없다.
- 잘못된 자치구 코드, 누락 코드, 경계부 record를 필터 단계에서 잃지 않는다.
- 자치구별 재호출에 따른 중복·누락·호출 수 증가를 피한다.
- 동일 raw snapshot에서 자치구 분할 규칙을 다시 검증하거나 재생성할 수 있다.

V1은 재현성과 API 부하 제어를 위해 page를 순차 수집한다. 제한적 병렬 수집은 실제 rate limit과 순서 안정성이 확인된 후 별도 검토한다.

이 snapshot은 FRAMEONE geometry가 아니라 향후 사람 검수용 공식 spatial evidence이다. 도보망이나 횡단보도만으로 Market/Submarket Polygon을 자동 생성하지 않는다.

## 3. 저장방식 비교

| 방식 | 장점 | 단점 | V1 적합성 |
|---|---|---|---|
| 하나의 대형 JSON | 파일 하나로 단순함 | 전체 메모리 사용, 부분 재개 어려움, 작은 변경도 전체 재작성, 손상 영향이 큼 | 낮음 |
| 자치구별 JSON | 조회 범위가 작고 사람이 열기 쉬움 | 배열 종료 전 불완전 파일, district별 전체 배열 메모리 또는 복잡한 streaming writer 필요 | 보통 |
| 자치구별 NDJSON | 한 줄씩 streaming 가능, 중단 지점과 오류 행 식별이 쉬움, Node 기본 fs로 작성 가능 | 일반 JSON처럼 파일 전체를 한 번에 parse할 수 없음 | **높음** |
| API page raw snapshot | 원본 추적, page retry·resume·감사에 유리함 | 분석용 조회에 부적합하고 page 경계가 업무 공간단위가 아님 | raw 보존 계층으로 필수, normalized 최종 형식은 아님 |
| DB/PostGIS | 공간 질의·index·동시 접근에 유리함 | V1 범위를 넘어서는 schema·migration·운영 부담, 현재 즉시 필요하지 않음 | 현재 낮음 |

**V1 최종 선택은 자치구별 NDJSON을 normalized canonical snapshot으로 사용하는 것이다.** API page JSON은 선택 경쟁 대상인 최종 조회 형식이 아니라 원본 증빙과 resume를 위한 raw 계층으로 함께 보존한다. DB/PostGIS 도입은 실제 공간 질의량과 운영 요구가 확인된 뒤 판단한다.

## 4. 권장 파일/디렉터리 구조

기존 `13_SOURCE_INGEST` 구조 안에서만 확장한다. 아래 source ID는 다음 구현에서 contract로 확정할 제안명이다.

```text
data/seoul-market/v1.1-final/13_SOURCE_INGEST/
  raw/
    SRC-SEOUL-PEDESTRIAN-NETWORK/
      .staging/<snapshot-id>/
        pages/000001-001000.json
        checkpoint.json
      <snapshot-id>/pages/*.json
    SRC-SEOUL-CROSSWALK/
      .staging/<snapshot-id>/...
      <snapshot-id>/pages/*.json
  normalized/
    SRC-SEOUL-PEDESTRIAN-NETWORK/
      .staging/<snapshot-id>/districts/<SGG_CD>.ndjson
      <snapshot-id>/districts/<SGG_CD>.ndjson
      <snapshot-id>/districts/UNKNOWN.ndjson
    SRC-SEOUL-CROSSWALK/
      .staging/<snapshot-id>/...
      <snapshot-id>/districts/*.ndjson
  quarantine/
    <source-id>/<snapshot-id>/parse-failures.ndjson
  manifests/
    <source-id>/<snapshot-id>.manifest.json
    <source-id>/current.json
  source-contracts/
    SOURCE_CONTRACTS.json
    SOURCE_CONTRACT_SCHEMA.json
```

- `<snapshot-id>`는 충돌 없는 UTC 호출 시작시각 기반 값으로 하고 source별로 독립 관리한다.
- raw page에는 API가 반환한 JSON bytes를 재포맷하지 않고 저장한다. API key가 포함된 요청 URL, header, log는 저장하지 않는다.
- normalized row는 기존 `parseSeoulPedestrianNetworkRow` 또는 `parseSeoulCrosswalkRow` 결과를 그대로 한 줄에 하나씩 기록한다. WKT는 문자열/null로 보존하며 이 단계에서 해석하지 않는다.
- current loader는 `current.json`이 가리키는 READY snapshot만 읽는다. staging이나 FAILED snapshot은 읽지 않는다.
- raw 원문 보존을 위해 현재 공통 client가 버리는 원 응답 text를 다음 구현에서 최소 범위로 전달할 수 있어야 한다. 별도 API client나 중복 row parser를 만들지는 않는다.

## 5. Manifest 설계

기존 file manifest와 충돌하지 않도록 `MANIFEST_SCHEMA.json`에 API snapshot용 하위호환 변형을 추가하고 공통 필드 이름을 재사용한다. source별 snapshot manifest 하나가 전체 page를 대표한다.

| 필드 | 의미 |
|---|---|
| `schema_version` | API snapshot manifest schema 버전 |
| `snapshot_id` | 이번 수집을 식별하는 불변 ID |
| `dataset` | `seoul_pedestrian_network` 또는 `seoul_crosswalk` |
| `service_name` | 실제 API 서비스명 `TbTraficWlkNet` 또는 `tbTraficCrsng` |
| `source_id` | source contract ID. 기존 `SRC-SEOUL-FOOT`와 분리 |
| `source` | `Seoul Open Data Plaza` |
| `source_basis` | `2020 기준` |
| `fetched_at` | 전체 snapshot 수집 완료 시각 ISO 8601. 자료 기준일과 구분 |
| `page_size` | V1 고정 최대 1,000 |
| `total_count` | API `list_total_count` |
| `expected_page_count` | `ceil(total_count / page_size)` |
| `fetched_page_count` | 검증된 raw page 수 |
| `fetched_row_count` | 모든 page의 raw row 합계 |
| `stored_count` | normalized로 완전히 기록된 row 합계. WKT 누락 row 포함 |
| `quarantined_count` | parser 실패로 normalized되지 못하고 raw 위치가 quarantine에 기록된 row 수 |
| `district_counts` | `SGG_CD`, `SGG_NM`, normalized row count의 목록과 `UNKNOWN` count |
| `validation` | RESULT, count, duplicate, WKT 누락, parsing failure 집계 |
| `status` | `COLLECTING`, `VALIDATING`, `READY`, `FAILED` 중 하나 |
| `failure` | 없으면 `null`; 있으면 page 범위, attempt, 오류 kind, 안전한 message, 발생시각. key와 전체 URL 제외 |

`source_basis = "2020 기준"`은 자료의 기준이고 `fetched_at`은 호출시각이다. 2026년에 내려받아도 2026 최신 또는 실시간 데이터로 표기하지 않는다.

Checkpoint는 최종 manifest가 아니다. 동일 snapshot의 staging에만 두며 다음을 최소 보관한다.

- `snapshot_id`, `service_name`, `page_size`, 처음 확인한 `total_count`
- 마지막으로 완전 저장·검증된 page 범위와 다음 `startIndex`
- 완료 page 파일의 상대경로와 SHA-256
- 마지막 성공시각, 현재 attempt, 마지막 실패 정보

## 6. 수집·검증·교체 흐름

1. source contract, API key 존재 여부, staging/final 경로가 `13_SOURCE_INGEST` 내부인지 확인한다.
2. 기존 `current.json`과 그 READY snapshot을 읽기 전용으로 유지한다.
3. source별 새 `.staging/<snapshot-id>`를 만들고 첫 page에서 `INFO-000`과 `list_total_count`를 확정한다.
4. `start=1`, `end=min(start+999,totalCount)`로 순차 요청한다. 예상치는 보행 network 492 pages, 횡단보도 32 pages이다.
5. 각 성공 응답의 원문 page를 임시 파일에 완전히 쓴 뒤 close하고, 같은 directory에서 `fs.rename`으로 확정 page 이름에 승격한다. 그 뒤에만 checkpoint를 갱신한다.
6. raw row를 기존 spatial parser로 변환하여 `SGG_CD`별 NDJSON staging에 append한다. district code가 없거나 알려지지 않아도 `UNKNOWN.ndjson`에 보존한다.
7. 다음을 모두 검증한다.
   - 모든 page의 `RESULT.CODE === "INFO-000"`
   - page마다 `list_total_count`가 첫 page 값과 동일
   - fetched page 수가 `ceil(totalCount / 1000)`과 동일
   - page 범위가 1부터 total까지 겹침·공백 없이 이어짐
   - fetched row 합계가 `totalCount`와 동일
   - READY 후보는 `stored_count === fetched_row_count`; WKT 누락 row도 normalized에 보존하고 parser 실패 row는 raw 위치를 quarantine에 남김
   - `nodeId`, `linkId`, exact normalized record의 중복 수를 각각 집계
   - node ID 단독 반복은 link 구조상 정상일 수 있으므로 자동 삭제하지 않음. source contract에서 자연키가 확정되기 전에는 exact page overlap만 hard failure로 처리하고 나머지는 `NEEDS_REVIEW` evidence로 남김
   - district별 count와 UNKNOWN count 합계가 `stored_count`와 동일
   - `NODE_WKT` empty/null, `LNKG_WKT` empty/null, parsing failure 수를 각각 집계
8. parsing failure는 raw 위치·page·row index·안전한 오류만 quarantine에 기록한다. 원 row를 폐기하거나 geometry로 보정하지 않는다. V1 READY 조건은 parsing failure 0이다.
9. 검증 성공 후 raw와 normalized staging directory를 동일 volume의 불변 `<snapshot-id>` directory로 각각 rename한다.
10. `READY` manifest를 임시 파일에 쓰고 close한 후 고유 final manifest 이름으로 rename한다.
11. 마지막으로 `current.next.json`을 쓰고 close한 뒤 `fs.rename`으로 `current.json` pointer를 교체한다. 소비자는 pointer가 바뀐 뒤에만 새 snapshot을 본다.
12. 실패 시 status와 failure를 남기고 기존 current pointer 및 기존 READY snapshot은 그대로 유지한다.

Node 기본 `fs`만으로 같은 volume 내 **새 이름으로의 rename**은 안전하게 사용할 수 있다. 반면 기존 비어 있지 않은 directory 자체를 직접 덮어쓰는 rename은 Windows를 포함해 이식성 있는 atomic 교체로 의존하면 안 된다. 따라서 snapshot directory는 immutable하게 두고 작은 pointer 파일만 마지막에 교체한다. pointer overwrite 동작은 구현 테스트로 확인하고, 실패 시 이전 pointer 복원 절차를 둔다. 이 방식은 raw와 normalized 두 directory의 물리적 동시 교체가 아니라 READY manifest와 pointer를 기준으로 한 논리적 atomic publish이다.

## 7. 실패 및 재시도 정책

- page timeout 기본값은 30초로 두고 `AbortSignal.timeout`을 사용한다. 환경별 조정은 가능하되 manifest에는 비밀값 없이 실행 설정만 기록한다.
- 한 page는 최초 요청을 포함해 최대 3회 시도한다.
- network 실패, timeout, HTTP 429, HTTP 5xx만 재시도 대상으로 한다. configuration/validation 오류, 응답 schema 오류, 명백한 비재시도 API 오류는 즉시 중단한다.
- 재시도 간격은 1초, 2초의 exponential backoff와 작은 jitter를 사용한다. retry 중 page 범위를 바꾸지 않는다.
- page 파일과 checkpoint는 page 원문 저장 및 기본 검증이 끝난 뒤에만 확정한다. 실패한 부분 파일은 완료 page로 계산하지 않는다.
- 재실행은 같은 snapshot staging의 checkpoint를 읽고 SHA-256이 일치하는 완료 page를 건너뛴다. 마지막 미완료 page부터 다시 요청한다.
- resume 시 `service_name`, `page_size`, `total_count`, `source_basis`가 checkpoint와 다르면 기존 run에 이어 쓰지 않고 FAILED로 닫은 뒤 새 snapshot을 시작한다.
- 전체 검증 실패, parser failure, totalCount 변동, page overlap/gap이 발생하면 current pointer를 갱신하지 않는다.
- FAILED staging은 자동으로 정상 snapshot에 합치지 않는다. 원인 확인과 보존기간 정책 후 별도 정리한다.

## 8. Git / snapshot 관리정책

- raw API pages, normalized NDJSON, quarantine rows, staging, checkpoint, `current.json`은 자동생성 runtime data이므로 Git에 넣지 않는다.
- 현재 `.gitignore`의 raw 제외 규칙을 본떠 다음 구현 전에 normalized snapshot, quarantine data, staging, checkpoint, current pointer를 제외한다. 각 directory의 `.gitkeep`은 계속 추적한다.
- 수집 script, test, source contract/schema, 설계문서는 추적한다.
- compact final manifest는 API key·전체 요청 URL·개인정보가 없음을 검토한 경우에만 기존 관례대로 선택적으로 추적한다. 자동수집 직후 자동 stage/commit하지 않는다.
- snapshot 재현은 Git blob이 아니라 source contract, manifest, raw checksum, 수집 script version으로 관리한다.
- 기존 repo tracked data가 약 24.4 MB인 반면 raw intake는 이미 약 398 MB이며 Git에서 제외되어 있다. 약 52만 spatial rows의 반복 snapshot을 Git에 넣으면 clone과 diff 비용이 계속 증가하므로 V1에서 직접 tracking하지 않는다.
- 보존은 최소한 current READY와 직전 READY를 유지한다. 자동 삭제는 V1 구현과 분리하고, 삭제 전 manifest/current 참조 여부를 검증한다.

향후 사용 경로는 다음으로 제한한다.

```text
서울 Spatial Snapshot
→ 자치구/행정동 필터
→ FRAMEONE Market/Submarket 검증 evidence
→ 도보 Link/Node 및 횡단보도·물리적 단절 검토
→ candidate_geometry 근거
→ 사람 검수
→ verified_geometry
```

Ingestion 결과만으로 서울 공식 공간단위와 FRAMEONE Market/Submarket을 동일시하거나 geometry status를 승격하지 않는다.

## 9. 다음 구현에서 수정할 예상 파일

아래는 예상 범위이며 이번 설계 작업에서는 수정하지 않는다.

- `.gitignore`: generated raw/normalized/quarantine/staging/checkpoint/current pointer 제외
- `lib/market-data/clients/seoul-open-data.ts`: 검증된 raw 응답 bytes를 ingestion에 전달하는 최소 기능
- `lib/market-data/clients/seoul-pedestrian-spatial.ts`: 기존 parser/type을 유지하며 ingestion이 재사용할 안정적 export 확인
- `data/seoul-market/v1.1-final/13_SOURCE_INGEST/source-contracts/SOURCE_CONTRACTS.json`: 두 API source contract 추가. `SRC-SEOUL-FOOT` 재사용 금지
- `data/seoul-market/v1.1-final/13_SOURCE_INGEST/manifests/MANIFEST_SCHEMA.json`: 기존 file manifest를 깨지 않는 API snapshot manifest 변형
- `data/seoul-market/v1.1-final/13_SOURCE_INGEST/ingest-seoul-pedestrian-spatial.mjs`: collect/checkpoint/normalize/validate/publish orchestration
- `data/seoul-market/v1.1-final/13_SOURCE_INGEST/validate-source-ingest.mjs`: 새 contract/manifest 검증 연결
- `tests/market-data/seoul-spatial-ingestion.test.cjs`: 소형 fixture로 pagination, resume, count mismatch, retry, publish failure, 기존 snapshot 보존 검증

실제 파일 구성은 구현 시작 전 다시 `git status`, 현재 script convention, source contract schema를 확인해 최소 범위로 확정한다. WKT parser, GeoJSON writer, UI loader, DB migration은 예상 범위에 포함하지 않는다.

## 10. 완료 기준

- 두 service를 최대 1,000건 page로 서울 전체 수집할 수 있고, 자치구별 API filter에 의존하지 않는다.
- 소형 fixture 기준 page 실패 후 resume가 가능하며 완료 page를 다시 쓰지 않는다.
- raw API response와 normalized district NDJSON이 분리되고 기존 parser/type만 사용한다.
- WKT empty/null row, district 미상 row, ID 미상 row를 자동 폐기하지 않는다.
- `RESULT.CODE`, total/page/fetched/stored count, district count, ID 중복, WKT 누락, parsing failure 검증이 manifest에 남는다.
- 검증이 하나라도 hard failure이면 기존 current READY snapshot이 계속 사용된다.
- 성공 snapshot만 READY manifest와 current pointer로 publish된다.
- sourceBasis와 fetchedAt이 분리되어 2020 기준 자료를 최신·실시간으로 오표현하지 않는다.
- raw/normalized snapshot과 checkpoint가 Git status에 나타나지 않으며 key와 전체 인증 URL이 파일·로그·manifest에 남지 않는다.
- 전체 데이터 다운로드 없이 fixture test로 갱신·rollback 경로를 검증한 뒤에만 실제 전체 ingest를 별도 승인해 실행한다.
- FRAMEONE Market/Submarket/Node geometry, candidate geometry, Polygon, GeoJSON, 지도 UI, DB는 변경되지 않는다.

## 11. 다음 한 단계

Seoul Spatial Data Ingestion V1 구현
