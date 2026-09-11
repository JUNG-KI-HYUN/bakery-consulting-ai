# FRAMEONE DATA SOURCE REGISTRY V1 DESIGN

**설계 기준일:** 2026-09-11
**범위:** 서울 25개 구 전체의 공공·무료 API 및 공간/상권 원천 관리 설계
**이번 작업:** 설계만 수행한다. Scheduler, 신규 API 연결, 데이터 다운로드, DB/UI 변경은 포함하지 않는다.

## 1. 목적

FRAMEONE Data Source Registry V1은 서울 전역 점포개발 업무에서 사용하는 데이터 원천을 하나의 운영 목록으로 관리한다. Registry는 다음 질문에 답해야 한다.

- 어떤 원천을 왜 사용하는가.
- 어떤 인증과 이용조건이 필요한가.
- 원천이 언제 갱신되고 FRAMEONE은 언제 확인하는가.
- 정기수집, 변경감시, 요청시 조회 중 어떤 방식인가.
- 어떤 READY snapshot이 현재 사용 가능한가.
- 마지막 확인·수집·게시·오류 시점은 언제인가.
- 자동 처리를 계속할 수 있는가, 사람 검수가 필요한가.

정기 수동 CSV/Excel 다운로드는 원칙적으로 0을 목표로 한다. 다만 공식 API 부재·폐지, 파일 전용 배포, 이용조건 또는 schema 변경처럼 자동 처리가 위험한 예외는 `MANUAL_EXCEPTION`으로 남긴다.

Registry는 데이터 정의나 숫자를 새로 만드는 계층이 아니다. 서로 정의가 다른 생활인구, 거주인구, POI, 상가업소, 인허가를 평균하거나 하나의 사실로 자동 병합하지 않는다.

## 2. 현재 Repository 데이터 Source 현황

### 2.1 실제 코드·파일 기준 현황

| Source | 현재 연결 | Key 환경변수 | 현재 데이터/기능 | 현재 판단 |
|---|---|---|---|---|
| `SRC-SEOUL-SALES` | 연결됨 | `SEOUL_OPEN_DATA_API_KEY` | 서울 공식상권·업종·분기별 추정매출 API client/adapter, 2024·2025 raw manifest | API runtime 상태는 이번 작업에서 미호출. Contract `NEEDS_REVIEW` |
| `SRC-SEOUL-STORES` | 연결됨 | `SEOUL_OPEN_DATA_API_KEY` | 서울 공식상권·업종·분기별 점포수 API client/adapter, 개·폐업 필드 contract, 2024·2025 raw manifest | API runtime 상태는 이번 작업에서 미호출. Contract `NEEDS_REVIEW` |
| 서울 공식상권 Trend | 연결됨(파생) | 부모 Source와 동일 | SALES/STORES의 최근 공통분기를 요청 시 조회하여 증감 계산 | 독립 외부 Source가 아니며 별도 원천 ID를 만들지 않음 |
| `SRC-SEOUL-AREA` | 부분 보유 | `SEOUL_OPEN_DATA_API_KEY` 또는 공식 파일 | `OFFICIAL_SEOUL_MARKETS.geojson` 1,650건, 원천 속성에는 `SRC-SEOUL-OA-15560` alias 사용 | 2023-10 geometry와 2024+ 지표 호환성 `BLOCKED`; Contract `SOURCE_MISSING` 유지 |
| `SRC-SEOUL-LIVING` | 미연결/수집 준비 | `SEOUL_OPEN_DATA_API_KEY` 후보 | 250m adapter·contract·geometry 10,125건, 2026-08-23 raw 253,686행/8,564 key manifest | normalized/current 없음, coverage·억제값 검수 전 Join 금지; `REVIEW_REQUIRED` |
| `SRC-SEOUL-PEDESTRIAN-NETWORK` | Full ingest 완료 | `SEOUL_OPEN_DATA_API_KEY` | current READY snapshot `20260910T100447965Z-f5bfef05`, 491,082행 | `source_basis=2020 기준`; 수집시각을 최신 기준으로 오해 금지 |
| `SRC-SEOUL-CROSSWALK` | Full ingest 완료 | `SEOUL_OPEN_DATA_API_KEY` | current READY snapshot `20260910T100404709Z-a7d15edd`, 31,080행 | `source_basis=2020 기준`; 수집시각을 최신 기준으로 오해 금지 |
| Kakao 주소검색 | 연결됨 | `KAKAO_REST_API_KEY` | 후보점포 주소 → 좌표 server-side 조회 | 요청 시 조회. 첫 결과 사용이라는 V1 한계 유지 |
| Kakao 장소검색 | 연결됨 | `KAKAO_REST_API_KEY` | 반경 주변 POI·경쟁점 참고 검색 | 공식 경쟁점 DB가 아니며 검색 결과끼리 중복 가능 |
| Kakao Map SDK | 연결됨 | `NEXT_PUBLIC_KAKAO_MAP_KEY` | 지도 표시 및 분석 위치 선택 | client 공개용 앱 키 이름만 Registry에 기록 |
| `SRC-SGIS` | 미연결 | `SGIS_CONSUMER_KEY`, `SGIS_CONSUMER_SECRET` 후보 | contract만 존재, 실제 토큰·데이터 호출 없음 | Contract `SOURCE_MISSING`; `NOT_CONNECTED` |
| LOCALDATA·소진공·대중교통·공동주택·주차장·JUSO·건축HUB·VWorld | 미연결 | Source별 후보는 10절 참조 | Registry 후보만 존재 | `NOT_CONNECTED` |

이번 작업에서는 실제 환경변수 값과 API secret을 읽거나 출력하지 않았다. 위 표의 Key 상태는 코드 참조와 사용자 제공 후보명만을 기준으로 한다.

### 2.2 기존 구조 중 보존할 것

- `source-contracts/SOURCE_CONTRACTS.json`: source key, column, format, spatial unit, coordinate system, compatibility gate, license 조건을 보유한다.
- `manifests/MANIFEST_SCHEMA.json`: file manifest와 API snapshot manifest를 하위호환 방식으로 검증한다.
- `raw/`, `normalized/`, `quarantine/`: source ID와 immutable snapshot ID로 구분한다.
- `manifests/<source-id>/current.json`: READY snapshot만 가리키는 작은 pointer다.
- `.staging/<snapshot-id>`: 검증 전 산출물이며 current consumer가 읽지 않는다.
- 실패한 새 수집은 기존 READY snapshot과 current pointer를 변경하지 않는다.
- raw/normalized snapshot은 Git 추적 대상이 아니며 contract·schema·script·설계만 추적한다.

### 2.3 Source ID 정리 원칙

Canonical ID는 기존 contract의 ID를 우선한다. 이미 파일 속성이나 옛 문서에서 다른 ID가 사용된 경우 삭제·일괄변환하지 않고 `aliases`로 보존한다.

- 공식상권 canonical: `SRC-SEOUL-AREA`
- 공식상권 기존 alias: `SRC-SEOUL-OA-15560`
- 250m 생활인구 canonical: `SRC-SEOUL-LIVING`
- 기존 문서 alias: `SRC-SEOUL-LIVINGPOP`, `SRC-SEOUL-OA-22784`
- 신규 ID는 `^SRC-[A-Z0-9-]+$` 규칙을 따른다.
- Trend처럼 부모 snapshot에서 계산되는 값은 외부 Source ID를 새로 만들지 않고 `derived_outputs`에 기록한다.

## 3. Source 분류

### 3.1 `SCHEDULED`

공식 데이터가 정기적으로 생성되고 누락 기간을 따라잡아야 하는 원천이다.

- 250m 생활인구
- LOCALDATA 인허가
- 소진공 상가(상권)정보
- 서울 상권 추정매출·점포수
- 지하철·버스 승하차

정기 실행은 곧 매번 전체 다운로드를 뜻하지 않는다. 날짜·분기 partition 또는 변경된 배포분만 수집하고, 일정 간격으로 전체 key reconciliation을 수행한다.

### 3.2 `CHANGE_WATCH`

자료가 비정기적으로 바뀌며 전체 snapshot 비용이 큰 원천이다. metadata, 공식 수정일, count, 제공되는 checksum/ETag 또는 저비용 fingerprint를 먼저 비교한다.

- pedestrian network
- crosswalk
- 서울 공식상권 Polygon
- 버스정류장 기준정보
- 서울 공동주택 기준정보
- 서울 공영주차장 기준정보

변경감지를 위해 전체 데이터를 매번 내려받아 hash를 계산하지 않는다. 제공처에 저비용 metadata가 없으면 `확인 불가`를 변경 없음으로 간주하지 않고 `REVIEW_REQUIRED` 또는 `MANUAL_EXCEPTION`으로 보낸다.

### 3.3 `ON_DEMAND`

후보점포 또는 상권 분석 요청 때 조회하고, 이용조건과 TTL 범위에서 cache하는 원천이다.

- Kakao 주소검색·장소검색·지도 SDK
- JUSO 주소 표준화
- 건축HUB 건축물대장
- VWorld 필지·건물·용도지역/지구
- SGIS의 선택 통계 조회
- 서울 실시간 도시데이터의 선택 장소 조회

On-demand cache는 원천의 영구 canonical snapshot과 동일하지 않다. 요청 파라미터, 조회시각, 응답 기준시점, source locator, TTL, 이용조건을 함께 보존한다.

## 4. Source Contract / Registry / Runtime State 역할

V1은 기존 `SOURCE_CONTRACTS.json`을 Registry로 확장하지 않는다. 기존 validator와 spatial ingest 회귀를 피하면서 정적 정의와 운영상태를 분리한다.

| 계층 | 역할 | Source of truth | 변경 특성 |
|---|---|---|---|
| Source Contract | 실제 파일/API schema, key, unique key, column map, code system, spatial unit, CRS, compatibility gate, dataset별 license | 기존 `SOURCE_CONTRACTS.json` | 원천 schema·계약 변경 때만 검토 후 변경 |
| Source Registry | FRAMEONE 전체 Source 목록, 업무 목적, 연결 단계, access/auth, 수집모드, 공식 갱신주기, FRAMEONE 확인주기, contract/state 참조 | 신규 `DATA_SOURCE_REGISTRY.json` | 운영정책 변경 시 versioned review |
| Runtime State | 마지막 확인·성공·실패, observed metadata, update availability, 현재 READY snapshot, source health | 신규 source별 state + 기존 immutable manifest/current pointer | 실행마다 갱신되는 파생 상태 |

기존 contract의 `source_date`, `retrieved_at`, `status`는 현재 validator 호환을 위해 그대로 둔다. 신규 Registry가 이를 중복 작성하지 않으며, 후속 구현에서도 즉시 migration/deprecation하지 않는다.

중요한 `status` 의미는 이름으로 분리한다.

- `contract.status`: `READY | NEEDS_REVIEW | SOURCE_MISSING`
- `manifest.status`: `READY | FAILED`
- `source_state.source_health`: 12절의 health enum

## 5. V1 Registry Schema

### 5.1 저장 형태

아래는 설계용 예시다. 이번 작업에서는 JSON/schema 파일을 만들지 않는다.

```json
{
  "schema_version": "1.0.0",
  "registry_checked_at": "ISO-8601",
  "sources": [
    {
      "source_id": "SRC-...",
      "aliases": [],
      "source_name": "공식 자료명",
      "provider": "제공기관",
      "category": "POPULATION | PERMIT | STORE | SALES | TRANSPORT | HOUSING | PARKING | ADDRESS | BUILDING | SPATIAL | POI | STATISTICS",
      "lifecycle": "CURRENT | PLANNED | OPTIONAL",
      "access_type": "OPEN_API | FILE_API | DOWNLOAD_FILE | SDK | DERIVED",
      "api_service": null,
      "official_url": "https://...",
      "auth_env": [],
      "source_refresh_frequency": "DAILY | WEEKLY | MONTHLY | QUARTERLY_CHECK | CHANGE_ONLY | ON_DEMAND | MANUAL_EXCEPTION_ONLY | null",
      "source_refresh_note": "공식 주기·시차 또는 확인 필요 사유",
      "frameone_check_frequency": "DAILY | WEEKLY | MONTHLY | QUARTERLY_CHECK | CHANGE_ONLY | ON_DEMAND | MANUAL_EXCEPTION_ONLY",
      "ingestion_mode": "SCHEDULED | CHANGE_WATCH | ON_DEMAND",
      "automation_policy": "AUTO | AUTO_WITH_REVIEW | MANUAL_EXCEPTION",
      "source_contract_ref": null,
      "state_ref": "source-state/SRC-.../current.json",
      "derived_outputs": [],
      "compatibility": "기존 gate 참조 또는 연결 전 확인사항",
      "governance_ref": "source contract 또는 별도 이용조건 검토기록",
      "notes": "정의·한계"
    }
  ]
}
```

`source_refresh_frequency=null`은 공식 주기를 확인하지 못한 경우에만 허용하고 `source_refresh_note`와 `REVIEW_REQUIRED`를 강제한다. FRAMEONE의 확인주기는 모든 Source에 반드시 enum 값 하나를 지정한다.

### 5.2 Runtime State 최소 형태

```json
{
  "schema_version": "1.0.0",
  "source_id": "SRC-...",
  "source_health": "HEALTHY | STALE | UPDATE_AVAILABLE | REVIEW_REQUIRED | ERROR | NOT_CONNECTED",
  "catalog_updated_at": null,
  "last_checked_at": null,
  "last_successful_check_at": null,
  "latest_observed_source_basis": null,
  "latest_observed_source_period": null,
  "current_snapshot": null,
  "fetched_at": null,
  "published_at": null,
  "change_fingerprint": null,
  "last_error": null,
  "review_reasons": []
}
```

Snapshot 기반 Source에서 `source_basis`, `source_period`, `fetched_at`, `published_at`, `current_snapshot`의 최종 source of truth는 READY manifest다. On-demand Source에서는 query cache record가 기준이다. Runtime State는 화면·scheduler용 resolved cache이며 해당 기준 record와 불일치하면 `REVIEW_REQUIRED`다.

### 5.3 License/Attribution 중복 방지

기존 contract가 있는 Source는 contract의 `license_status`, `license_name`, `attribution_required`, `commercial_use_allowed`, `modification_allowed`, `third_party_copyright`, `usage_note`를 재사용한다. Registry에는 `governance_ref`만 저장한다.

아직 contract가 없는 Source는 연결 전에 같은 governance record를 먼저 작성한다. 논리적으로 조회되는 Registry view는 `license`, `attribution_required`를 포함할 수 있지만, 값을 Registry와 Contract 양쪽에 중복 저장하지 않는다.

## 6. 자동 업데이트 흐름

```text
Scheduler 또는 request
  -> Source Registry 조회
  -> due 여부와 ingestion_mode 판단
  -> metadata/change check 또는 on-demand cache check
      -> 변경 없음 / cache 유효: check 기록 후 종료
      -> 변경 있음 / cache miss: staging 생성
          -> ingest
          -> contract/schema/count/hash/quality validation
              -> 정상: READY manifest
                  -> immutable snapshot publish
                  -> current pointer를 마지막에 교체
                  -> Runtime State = HEALTHY
              -> 비정상: 실패·검수기록 보존
                  -> 기존 current READY snapshot 유지
                  -> Runtime State = REVIEW_REQUIRED 또는 ERROR
```

동일 snapshot resume은 기존 spatial ingest처럼 checkpoint와 page checksum이 일치하는 완료 page만 건너뛴다. source service, page size, total count, source basis가 달라지면 같은 run에 이어 쓰지 않는다.

## 7. 실패·검수 흐름

정상적인 신규 period와 사전에 허용된 count 범위 내 변화는 자동 게시할 수 있다. 아래는 자동 게시를 중단하고 `REVIEW_REQUIRED`로 보낸다.

- API response schema, 필수 field 또는 type 변경
- Source URL, service name, 인증방식 변경
- 좌표계, 공간단위, geometry type 변경
- 이용조건, 라이선스, attribution 조건 변경 또는 확인 불가
- 전체 건수·구별 건수·key coverage의 임계치 초과 급변
- source basis 또는 기준연도의 예상 밖 변경
- parser failure, null key, duplicate composite key 급증
- 예상하지 않은 geometry type 또는 좌표 범위 이탈
- API 폐지·장기 미응답·공식 종료 공지
- 억제값·비공개값 표기의 변경
- 현재 READY manifest와 Runtime State 불일치

HTTP/API 장애나 일시 rate limit은 재시도 정책을 적용하되 새 snapshot을 게시하지 않는다. 기존 current snapshot은 유지하며, 장애 자체와 데이터가 오래된 상태를 구분한다.

- 요청 실패 + 기존 snapshot이 freshness 안: `ERROR`
- 요청 실패 + 기존 snapshot도 freshness 초과: 운영상 `ERROR`, stale 사유를 함께 기록
- 원천 변경은 확인했으나 아직 수집 전: `UPDATE_AVAILABLE`
- schema/quality/terms 이상: `REVIEW_REQUIRED`

## 8. Freshness 정책

| 필드 | 의미 | 원칙 |
|---|---|---|
| `source_basis` | 자료의 기준연도·버전·공간기준(예: `2020 기준`) | 수집시각으로 대체 금지 |
| `source_period` | 관측값이 대표하는 일·월·분기·연도 | 데이터셋에 있을 때만 저장 |
| `catalog_updated_at` | 제공처 catalog/metadata가 표시한 수정시각 | 제공되지 않으면 null |
| `last_checked_at` | FRAMEONE이 변경 여부 또는 API health를 마지막으로 확인한 시각 | 실패한 확인도 기록 |
| `fetched_at` | snapshot/cache 응답을 실제 취득한 시각 | 최신 자료라는 뜻이 아님 |
| `published_at` | validation을 통과한 snapshot을 current로 게시한 시각 | staging 생성시각과 분리 |

모든 Source에 모든 날짜를 강제하지 않는다. 존재하지 않거나 확인하지 못한 값은 null이며 0, 현재시각, `문제없음`으로 보정하지 않는다.

Freshness는 최소 두 축으로 판정한다.

1. **Check freshness:** `last_checked_at`이 `frameone_check_frequency`의 허용 window 안인가.
2. **Data freshness:** 최신 `source_period/source_basis`가 제공처의 공표 시차와 기대 period 안인가.

`fetched_at`이 최신이어도 `source_basis=2020 기준`인 pedestrian/crosswalk를 최신 보행현황으로 표시하지 않는다.

## 9. Source별 권장 업데이트 주기

`원천 주기`는 확인된 공식 공표주기 또는 보수적 분류다. 공식 주기가 확정되지 않은 항목은 연결 전 contract 검수에서 재확인한다. `FRAMEONE 주기`는 운영 권장값이며 Scheduler 구현 시점에 quota·비용·업무 사용량을 다시 확인한다.

### 9.1 공식 Reference URL

Registry 구현 시 아래 공식 페이지를 시작점으로 사용하되, 실제 service name, schema, 인증, 이용조건은 Source Contract 작성일에 다시 확인한다. 버스정류장처럼 정확한 dataset을 아직 선택하지 않은 항목은 portal 검색 결과를 임의 endpoint로 확정하지 않는다.

| Source 범위 | 공식 Reference |
|---|---|
| 서울 250m 생활인구 | [OA-22784](https://data.seoul.go.kr/dataList/OA-22784/S/1/datasetView.do) |
| 서울 공식상권 Polygon | [OA-15560](https://data.seoul.go.kr/dataList/OA-15560/S/1/datasetView.do) |
| 서울 상권 추정매출 | [OA-15572](https://data.seoul.go.kr/dataList/OA-15572/S/1/datasetView.do) |
| 서울 상권 점포수 | [OA-15577](https://data.seoul.go.kr/dataList/OA-15577/S/1/datasetView.do) |
| LOCALDATA 인허가 | [지방행정인허가데이터개방](https://www.localdata.go.kr/) |
| 소진공 상가업소 | [공공데이터포털 15012005](https://www.data.go.kr/data/15012005/openapi.do) |
| 지하철 승하차 | [OA-12914](https://data.seoul.go.kr/dataList/OA-12914/S/1/datasetView.do) |
| 버스 승하차·정류장 | [서울 교통카드 이용정보](https://data.seoul.go.kr/dataList/7/literacyView.do) 및 서울 열린데이터광장 내 선택 dataset |
| 서울 공동주택 | [OA-15818](https://data.seoul.go.kr/dataList/OA-15818/A/1/datasetView.do) |
| 서울 공영주차장 | [OA-13122](https://data.seoul.go.kr/dataList/OA-13122/A/1/datasetView.do) |
| SGIS | [SGIS 개발지원센터](https://sgis.kostat.go.kr/developer/html/openApi/api/intro.html) |
| Kakao | [Local REST API](https://developers.kakao.com/docs/ko/local/dev-guide), [Kakao Map API](https://developers.kakao.com/docs/ko/kakaomap/common) |
| JUSO | [도로명주소 개발자센터](https://business.juso.go.kr/addrlink/openApi/apiReqst.do) |
| 건축HUB | [건축데이터 Open API](https://www.hub.go.kr/portal/psg/idx-intro-openApi.do) |
| VWorld | [VWorld 개발자센터](https://www.vworld.kr/dev/) |
| KOSIS(선택) | [KOSIS 공유서비스](https://kosis.kr/openapi/introduce/introduce_01List.do) |
| 서울 실시간 도시데이터(선택) | [서울 실시간 도시데이터](https://data.seoul.go.kr/SeoulRtd/) |

### 9.2 권장 주기표

| 원천 | 용도 | 수집방식 | 원천 주기 | FRAMEONE 권장주기 | 전체수집 | On-demand | 수동/자동 정책 |
|---|---|---|---|---|---|---|---|
| `SRC-SEOUL-LIVING` 250m 생활인구 | 시간대·성별·연령별 생활수요 | `SCHEDULED`, 날짜 partition | `DAILY`(D-4 제공) | `DAILY`, 공식 적재 완료 이후 | 해당 날짜 서울 전체; 과거 전체 재수집 금지 | 아니오 | `AUTO_WITH_REVIEW`; 최초 grid coverage·억제값 검수 |
| `SRC-LOCALDATA` 인허가 | 제과점·휴게음식점 등의 최신/이력 인허가, 신규·폐업·상태변경 | `SCHEDULED`, 증분 + 정기 reconciliation | `DAILY` 후보, 공식 명세 재확인 | `DAILY` | 최초·분기 reconciliation만 | 아니오 | `AUTO_WITH_REVIEW` |
| `SRC-SDSC-SHOPS` 소진공 상가업소 | 공공 업종 DB snapshot | `SCHEDULED`, release 감시 | `QUARTERLY_CHECK` 후보, 배포주기 재확인 | `WEEKLY` metadata check | 새 release 때만 서울 전체 | 아니오 | `AUTO_WITH_REVIEW`; 업종체계·상가업소번호 변경 gate |
| `SRC-SEOUL-SALES` 상권 추정매출 | 공식상권·업종별 추정매출 | `SCHEDULED`, 신규 분기 | `QUARTERLY_CHECK` | `MONTHLY` | 신규 분기 서울 전체 snapshot | 현재는 요청 시 API 조회도 있음 | `AUTO_WITH_REVIEW`; 추정값 표기 유지 |
| `SRC-SEOUL-STORES` 점포수 | 점포·개업·폐업·프랜차이즈 | `SCHEDULED`, 신규 분기/배포분 | `QUARTERLY_CHECK`, 제공기준 변경 감시 | `MONTHLY` | 신규 배포분만 | 현재는 요청 시 API 조회도 있음 | `AUTO_WITH_REVIEW` |
| 서울 Trend(파생) | SALES/STORES 분기 추이 | 부모 snapshot 게시 후 파생 또는 현재 on-demand 계산 | 부모와 동일 | `MONTHLY` 또는 부모 게시 직후 | 독립 전체수집 없음 | 예 | `AUTO`; 부모 provenance 필수 |
| `SRC-SEOUL-SUBWAY-BOARDING` 지하철 승하차 | 역세권 규모·시간대 보조 | `SCHEDULED`, 일자 partition | `DAILY` | `WEEKLY` | 누락 일자만, 정기 월 집계 | 아니오 | `AUTO_WITH_REVIEW` |
| `SRC-SEOUL-BUS-BOARDING` 버스 승하차 | 정류장·노선별 배후 이동 보조 | `SCHEDULED`, 일자 partition | `DAILY` | `WEEKLY` | 누락 일자만, 정기 월 집계 | 아니오 | `AUTO_WITH_REVIEW` |
| `SRC-SEOUL-BUS-STOPS` 버스정류장 | 정류장 위치·식별자 기준정보 | `CHANGE_WATCH` | `CHANGE_ONLY` | `MONTHLY` | 변경 감지 때 서울 전체 | 아니오 | `AUTO_WITH_REVIEW` |
| `SRC-SEOUL-APARTMENTS` 공동주택 | 세대·준공·주거배후 참고 | `CHANGE_WATCH` | `CHANGE_ONLY`, catalog 주기 재확인 | `MONTHLY` | 변경 감지 때 서울 전체 | 아니오 | `AUTO_WITH_REVIEW` |
| `SRC-SEOUL-PUBLIC-PARKING` 공영주차장 기준정보 | 위치·규모·요금·운영정보 | `CHANGE_WATCH` | `CHANGE_ONLY` | `WEEKLY` | 변경 감지 때 서울 전체 | 아니오 | `AUTO_WITH_REVIEW` |
| 서울 공영주차장 실시간 상태 | 분석 시 참고 가능한 현재 가용정보 | `ON_DEMAND`, 짧은 TTL | `ON_DEMAND` | `ON_DEMAND` | 아니오 | 예 | `AUTO`; 장기 입지 사실로 저장 금지 |
| `SRC-SGIS` | 인구·가구·주택·사업체·종사자 보조 | catalog `CHANGE_WATCH` + 데이터 `ON_DEMAND` | `CHANGE_ONLY`, dataset별 기준연도 | `QUARTERLY_CHECK` | 선택한 통계·경계 version만 | 예 | `AUTO_WITH_REVIEW`; 소수값·기준연도 보존 |
| Kakao 주소·POI·Map SDK | 주소좌표, 현재 장소검색, 지도표시 | `ON_DEMAND`, API별 cache 정책 | `ON_DEMAND` | `ON_DEMAND` | 금지 | 예 | `AUTO`; contract/쿼터/저장조건 변경은 review |
| `SRC-JUSO-ADDRESS` | 도로명주소 표준화 | `ON_DEMAND`, 정규화 주소 cache | `ON_DEMAND` | `ON_DEMAND` | 금지 | 예 | `AUTO_WITH_REVIEW`; 승인키 유형 확인 |
| `SRC-BUILDING-HUB` | 표제부·층·용도·면적 등 근거 | `ON_DEMAND`, 주소/필지 기반 cache | `ON_DEMAND` | `ON_DEMAND` | 금지 | 예 | `AUTO_WITH_REVIEW`; 인허가 가능 최종판정 금지 |
| `SRC-VWORLD-SPATIAL` | 필지·건물·용도지역/지구 공간 참고 | `ON_DEMAND`, dataset/version별 cache | `ON_DEMAND` | `ON_DEMAND` | 금지 | 예 | `AUTO_WITH_REVIEW`; 현재 `NOT_CONNECTED` |
| `SRC-SEOUL-PEDESTRIAN-NETWORK` | E1 도보 network primitive 원천 | `CHANGE_WATCH` | `CHANGE_ONLY` | `QUARTERLY_CHECK` | 변경 확인 때만 | 아니오 | `AUTO_WITH_REVIEW` |
| `SRC-SEOUL-CROSSWALK` | E1 crosswalk primitive 원천 | `CHANGE_WATCH` | `CHANGE_ONLY` | `QUARTERLY_CHECK` | 변경 확인 때만 | 아니오 | `AUTO_WITH_REVIEW` |
| `SRC-SEOUL-AREA` 공식상권 Polygon | 서울 공식상권 참조 geometry | `CHANGE_WATCH` | `CHANGE_ONLY` | `QUARTERLY_CHECK` | 변경 확인 때만 | 아니오 | `AUTO_WITH_REVIEW`; 2024+ 지표 compatibility 재검수 |
| `SRC-KOSIS`(선택) | 서울/전국 보조 국가통계 | catalog 감시 + 선택통계 `ON_DEMAND` | `CHANGE_ONLY`, 통계표별 주기 | `QUARTERLY_CHECK` | 금지, 선택 통계표만 | 예 | `AUTO_WITH_REVIEW` |
| `SRC-SEOUL-REALTIME`(선택) | 지정 장소 실시간 혼잡·교통 등 보조 | `ON_DEMAND`, 짧은 TTL | `ON_DEMAND` | `ON_DEMAND` | 금지 | 예 | `AUTO`; 장기 상권지표와 분리 |

대중교통의 원천은 매일 갱신되더라도 FRAMEONE 점포판단용 장기 패턴을 매일 전체 재계산할 필요는 없다. 일자별 증분은 보존하고 업무용 월/요일/시간대 집계는 versioned 파생 산출물로 만든다.

## 10. API Key Registry

Registry는 환경변수 이름만 저장한다. 값, 일부 마스킹 값, 인증 URL 전체를 manifest·log·문서에 남기지 않는다.

### 10.1 현재 코드에서 사용 중

| 환경변수 | 용도 | 노출 범위 |
|---|---|---|
| `SEOUL_OPEN_DATA_API_KEY` | 서울 Open Data server-side API | server only |
| `KAKAO_REST_API_KEY` | Kakao 주소·장소 REST | server only |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | Kakao Map JavaScript SDK | client 공개용 앱 키; secret로 오인하지 않되 허용 도메인 관리 |

### 10.2 연결 전 확인할 기존 후보

| 환경변수 | 후보 Source | 판단 |
|---|---|---|
| `PUBLIC_DATA_API_KEY` | LOCALDATA/소진공/건축HUB 등 공공데이터포털 서비스 | 서비스별 활용신청·인코딩·endpoint 확인 후 재사용 |
| `SGIS_CONSUMER_KEY` | SGIS token 발급 | server only |
| `SGIS_CONSUMER_SECRET` | SGIS token 발급 | server only |
| `JUSO_ADDRESS_API_KEY` | JUSO 주소검색 | 개발/운영 승인키 유형 확인 |

### 10.3 추가 후보

- 필수: `VWORLD_API_KEY` — VWorld P2 연결 전에 발급·도메인·이용조건 확인.
- 선택: `KOSIS_API_KEY` — KOSIS Source를 실제 선택할 때만 추가.
- 불필요: 서울 대중교통·공동주택·공영주차장은 해당 dataset이 동일 서울 OpenAPI 인증을 사용하면 별도 키를 만들지 않는다. 정확한 service별 인증방식은 연결 시 공식 명세로 재확인한다.

## 11. 수동 다운로드 정책

| 정책 | 의미 | 적용 |
|---|---|---|
| `AUTO` | 정상 요청·cache·파생 계산을 사람 승인 없이 수행 | Kakao/JUSO 등 안정된 on-demand 경로, 검증된 파생 Trend |
| `AUTO_WITH_REVIEW` | 정상 범위는 자동, schema/count/basis/terms 이상만 검수 | 정기 snapshot과 change-watch의 기본값 |
| `MANUAL_EXCEPTION` | API가 없거나 폐지됐고 파일만 갱신되거나 자동처리 위험이 큰 경우 | 정상 운영 Source에는 기본 지정하지 않음 |

`MANUAL_EXCEPTION` 발생 시 수동 파일도 raw intake, checksum, source date, source version, license 확인, contract validation을 거쳐야 한다. 사람이 다운로드했다는 이유로 READY가 되지 않는다.

## 12. Source Health 상태

| 상태 | 의미 | current snapshot 처리 |
|---|---|---|
| `HEALTHY` | check가 기한 내 성공했고 update/review/error가 없음 | current READY 사용 |
| `STALE` | check 기한 또는 기대 source period를 초과했지만 사용할 기존 snapshot이 있음 | 기존 snapshot 사용 가능하되 stale 고지 |
| `UPDATE_AVAILABLE` | 원천 변경을 감지했으나 새 snapshot 미게시 | 기존 snapshot 유지 |
| `REVIEW_REQUIRED` | schema·basis·count·geometry·license·compatibility 이상 | 기존 snapshot 유지, 자동 게시 중단 |
| `ERROR` | 최근 check/ingest가 실패함 | 기존 READY가 있으면 유지, 없으면 미사용 |
| `NOT_CONNECTED` | adapter/contract/auth/config가 연결되지 않음 | current 없음 |

Health 우선순위는 단순 점수합산으로 결정하지 않는다. 예를 들어 license 변경이나 좌표계 변경은 최근 check 성공 여부와 무관하게 `REVIEW_REQUIRED` hard gate다.

## 13. 라이선스 / Attribution 관리

- 이용조건은 제공기관 단위가 아니라 dataset/service 단위로 관리한다.
- `official_terms_url`, `terms_checked_at`, `license_status`, `license_name`, `commercial_use_allowed`, `modification_allowed`, `attribution_required`, `attribution_text`, `third_party_copyright`를 contract/governance record에 보존한다.
- 확인하지 못한 값은 null/`UNKNOWN`이며 허용으로 간주하지 않는다.
- 라이선스 또는 attribution 변경 감지는 `REVIEW_REQUIRED` hard gate다.
- 내부 분석 가능 여부와 고객 리포트 재배포 가능 여부를 분리한다.
- Kakao, VWorld 등 민간/지도 API는 cache·저장·재배포·지도 표시 조건과 quota를 연결 전에 공식 약관으로 재확인한다.

## 14. Snapshot 정책

1. raw는 원본 bytes를 변경하지 않고 source/snapshot별로 보존한다.
2. normalized와 quarantine은 동일 snapshot ID를 사용한다.
3. READY 이전에는 `.staging`에만 쓴다.
4. contract, manifest, count, checksum, key uniqueness, compatibility gate를 통과한 snapshot만 게시한다.
5. snapshot directory는 immutable하며 과거 snapshot을 덮어쓰지 않는다.
6. `current.json`은 READY manifest만 가리키며 마지막 단계에서 교체한다.
7. 새 수집 실패 시 기존 current와 READY snapshot을 유지한다.
8. limited/sample run은 current publish 대상이 아니다.
9. source basis, source period, fetched_at, published_at을 manifest에 구분한다.
10. on-demand cache는 full snapshot과 분리하고 query key, TTL, fetched_at, source period를 저장한다.
11. metadata-only check도 check ID와 fingerprint를 기록해 변경감지 이력을 남긴다.

Pedestrian/crosswalk/공식상권 Polygon은 매일 또는 매주 full download하지 않는다. 공식 수정일·catalog metadata·건수·제공 checksum/ETag를 우선 확인하고, 변경이 확인된 경우에만 새 full snapshot을 staging한다.

## 15. LOCALDATA / 소진공 / Kakao 역할 분리

### 15.1 LOCALDATA

- 최신 인허가 record와 변경 event를 분리한다.
- `신규`, `폐업`, `상태변경`, `정정`을 append-only history로 보존한다.
- 식별은 상호명 또는 주소 문자열만 사용하지 않는다.
- 공식 원천의 관리번호·인허가 종류·관할 자치단체 코드 등 source composite key 원문을 보존하고, 실제 필드명은 API contract 확인 뒤 확정한다.
- 이전·상호변경·중복 가능성은 자동 동일업소 확정이 아니라 candidate/manual review로 처리한다.

### 15.2 소진공 상가업소

- 영업 중 상가업소와 공공 업종체계의 period snapshot이다.
- 업종분류와 상가업소번호 개편 시 과거 ID를 자동 연결하지 않는다.
- 폐업이력 또는 인허가 상태의 단독 원천으로 사용하지 않는다.

### 15.3 Kakao

- 현재 장소검색과 지도 확인용이다.
- 검색 결과 수를 공식 점포수로 표현하지 않는다.
- LOCALDATA·소진공 record와 자동 강제 병합하지 않는다.

후속 canonical competitor store는 세 원천의 source record를 각각 유지하고, 명시적 match evidence와 review status로 관계만 연결한다.

## 16. 250m 생활인구 전환 정책

Repository 조사 결과 현재 contract·adapter·raw manifest의 target은 이미 250m `SRC-SEOUL-LIVING`이다. 과거 행정동·집계구 생산 종료와 혼용 금지 문서는 존재하지만, 이번 범위에서 별도 legacy 수집 구현은 확인되지 않았다.

- `current_target`: OA-22784 내국인 250m를 우선하며 장기·단기외국인은 별도 dataset/source contract로 추가한다.
- `legacy`: 과거 행정동·집계구 생활인구가 향후 발견되면 삭제·변환하지 않고 별도 source ID, spatial unit, period, 종료일로 보존한다.
- 2026-08-23 raw snapshot의 8,564 key와 grid geometry 10,125건 차이는 0으로 채우지 않는다.
- `*` 등 비식별 억제값을 0으로 변환하지 않는다.
- FRAMEONE Market/Submarket Polygon이 승인되기 전 Market 집계와 자동 spatial join을 하지 않는다.
- 생활인구 250m와 SGIS 거주인구는 정의·기간·공간단위가 달라 별도 observation으로 유지한다.

## 17. 서울 전체 적용 원칙과 E2 경계

- 모든 Source adapter와 정책은 서울 25개 구 전체를 대상으로 하며 특정 구·성수·연무장길을 하드코딩하지 않는다.
- FRAMEONE Market/Submarket/Node와 서울 공식상권은 서로 다른 체계다.
- candidate/manual-review 관계를 confirmed로 자동 변경하지 않는다.
- Registry는 다음 흐름의 원천 관리 계층까지만 담당한다.

```text
Data Source Registry
  -> Current Valid Snapshot
  -> E1 Primitive
  -> E2 Evidence
  -> Submarket QA
  -> Candidate Geometry
```

이번 설계는 E2 Evidence, geometry 생성, Submarket Polygon 생성, candidate geometry를 구현하거나 승인하지 않는다.

## 18. 앞으로 연결할 Source 우선순위

현재 roadmap의 canonical competitor/permit 우선순위와 250m spatial join의 미완료 gate를 반영해 같은 P0 안의 순서를 조정한다.

### P0

1. LOCALDATA 인허가 — 제과점 최신·이력·폐업·상태변경의 공식 근거.
2. 소진공 상가업소 — canonical competitor 후보와 공공 업종 snapshot.
3. 250m 생활인구 — 기존 raw/adapter/geometry를 재사용하되 coverage·억제값·집계 gate 선행.

### P1

1. 지하철·버스 승하차와 정류장 기준정보.
2. 서울 공동주택.
3. 서울 공영주차장 기준정보. 실시간 가용정보는 별도 on-demand 보조 Source.

### P2

1. 건축HUB.
2. VWorld 필지·건물·용도지역/지구.
3. SGIS 인구·가구·주택·사업체 고도화.

### 선택

- KOSIS: SGIS/서울 자료가 충족하지 못하는 확정 통계표가 있을 때만 추가.
- 서울 실시간 도시데이터: 지정 장소의 단기 상황을 보조할 때만 사용하고 장기 상권지표와 분리.

기존 Kakao, SALES/STORES/Trend, pedestrian/crosswalk는 신규 연결 우선순위가 아니라 Registry 편입·health 관측·snapshot 안정화 대상이다.

## 19. 구현 시 예상 파일

실제 V1 구현은 별도 작업으로 다음 최소 파일을 예상한다. 경로와 수는 구현 전 기존 validator 재검토 후 확정한다.

- `13_SOURCE_INGEST/registry/DATA_SOURCE_REGISTRY_SCHEMA.json`
- `13_SOURCE_INGEST/registry/DATA_SOURCE_REGISTRY.json`
- `13_SOURCE_INGEST/source-state/<source-id>/current.json` — runtime 생성물, Git 제외 검토
- `13_SOURCE_INGEST/source-checks/<source-id>/<check-id>.json` — immutable change-check 기록, 보존정책 검토
- `lib/market-data/registry/...` — loader/type/health 판정; 구현 시 필요한 최소 범위만
- `tests/market-data/data-source-registry.test.*` — schema, duplicate ID/alias, due/health, READY pointer 보존 검증

기존 `SOURCE_CONTRACTS.json`, `MANIFEST_SCHEMA.json`, ingest script와 current pointer 구조는 교체하지 않고 참조한다. Scheduler, DB, UI는 V1 Registry 구현 작업에도 별도 승인 없이는 포함하지 않는다.

## 20. 완료 기준

Data Source Registry V1 구현이 READY가 되려면 다음을 모두 만족해야 한다.

- 모든 source ID와 alias가 중복 없이 검증된다.
- Registry의 모든 Source에 `ingestion_mode`, `frameone_check_frequency`, `automation_policy`가 있다.
- 공식 주기 미확인은 null + note + review gate로 남는다.
- Contract/Registry/Runtime State의 source of truth가 겹치지 않는다.
- 기존 source contract validator와 spatial ingest 테스트가 회귀하지 않는다.
- READY snapshot만 current로 게시되고 실패 시 기존 current가 유지된다.
- source basis/period와 fetched/published 시각이 분리된다.
- license/attribution UNKNOWN을 허용으로 처리하지 않는다.
- LOCALDATA composite key와 상태변경 history를 보존할 수 있다.
- 250m 생활인구가 legacy 공간단위와 분리되고 미확인/억제값을 0으로 만들지 않는다.
- pedestrian/crosswalk/공식상권 Polygon은 change-watch 후에만 full snapshot한다.
- API key 값과 전체 인증 URL이 파일·log·manifest에 남지 않는다.
- 서울 25개 구 공통 구조이며 특정 구 하드코딩이 없다.
- E2, geometry 생성, DB/UI/Scheduler 변경이 범위에 포함되지 않는다.

## 21. 최종 설계 판정

**Data Source Registry V1 구현 가능 여부: `READY`**

조건은 Registry를 기존 Source Contract와 분리하고, Runtime State가 기존 READY manifest/current pointer를 source of truth로 참조하는 것이다. 개별 미연결 Source는 Registry 구현을 막지 않으며 `NOT_CONNECTED`와 확인 필요 metadata로 명시한다.

다음 한 단계는 **FRAMEONE Data Source Registry V1 구현**이다.
