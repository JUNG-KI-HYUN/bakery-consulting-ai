# CODEX IMPLEMENTATION PLAN · STEP 2~7

**기준 커밋:** `8dde56e`
**범위 제한:** 전체 리팩토링 금지, 요청 기능 외 구현 금지, 수정 파일 최소화, 새 라이브러리 추가 금지, DB 변경은 구조·SQL 제안 후 중단.

## 공통 개발 원칙

- 기존 District 25 / Market 156 / Submarket 382 / Node 763과 ID를 변경하지 않는다.
- Markdown 마스터는 유지하고 JSON/CSV/GeoJSON은 파생물로 취급한다.
- `manual_review` 관계와 `geometry=null`을 확정 매칭에 사용하지 않는다.
- 비밀키는 환경변수만 사용하며 샘플키를 만들지 않는다.
- 각 STEP 완료 후 변경파일·테스트·남은 문제만 보고하고 멈춘다.

## STEP 2 — 공간 검증 상태와 Pilot 작업기반

| 항목 | 명세 |
|---|---|
| 목적 | 단일 geometryStatus를 3축 상태로 확장하고 Pilot 25 검수데이터를 안전하게 표현 |
| 입력값 | v1.1 hierarchy, Pilot 25, FRAMEONE GeoJSON, Crosswalk, Schema V2 |
| 수정 예상 파일 | `lib/markets/types.ts` 또는 동등 타입, `data/markets/*` 파생 JSON, 검증 스크립트, `/markets` 상세패널 최소 수정 |
| 데이터 | geometry_availability, verification_stage, review_status, source/version/date, representative_point |
| 계산 로직 | null/Point/Polygon 일관성 검증; 승인조건 검증; Crosswalk 상태 분리 |
| 위험도 판단 | stale·manual_review·candidate는 자동집계 제외 |
| 완료 기준 | 1,301 객체 보존, ID/계층 개수 동일, 가짜 geometry 0, Pilot 상태표시 가능 |
| 테스트 | 기존 12항목 회귀 + 상태조합 unit test + null geometry 렌더링 |
| 실패 시 중단 | ID/개수 변경, 기존 geometry 덮어쓰기, 근거 없는 좌표 생성 |

## STEP 3 — 지도 Viewer

| 항목 | 명세 |
|---|---|
| 목적 | 6개 레이어와 검증상태를 명확히 분리해 표시 |
| 입력값 | FRAMEONE/공식상권/행정동/Grid GeoJSON, 레이어 레지스트리 |
| 수정 예상 파일 | `/markets` 지도 컴포넌트, 레이어 설정, 범례, 상세패널 |
| 데이터 | layer_id, geometry_version, source, visibility, style, status |
| 계산 로직 | ID join, 상태별 스타일; null geometry는 목록/패널에서 표시 |
| 위험도 판단 | 공식상권과 FRAMEONE 동일색 금지; stale 경고 |
| 완료 기준 | 레이어 6종 독립 토글, 범례, 클릭패널, 검색결과 연동 |
| 테스트 | 각 레이어 on/off, 빈 geometry, 대용량 Grid 성능, 모바일/데스크톱 |
| 실패 시 중단 | CRS 미확인 geometry 렌더링, 공식상권을 FRAMEONE으로 라벨링 |

## STEP 4 — 생활인구·공식상권 적재

| 항목 | 명세 |
|---|---|
| 목적 | 원천 스냅샷·버전·공간집계를 재현 가능하게 구축 |
| 입력값 | 공식 원천 파일/API 샘플, verified Market Polygon |
| 수정 예상 파일 | `scripts/import-*`, source registry, metric schema, validation fixtures |
| 데이터 | raw snapshot, normalized metric, crosswalk, aggregation log |
| 계산 로직 | CRS 변환→validity→intersection→면적가중; 수식과 분모 저장 |
| 위험도 판단 | geometry/code 버전 불일치 시 join 거부 |
| 완료 기준 | Pilot 승인 Polygon에 대해 동일 입력 재실행 시 동일 결과, source_id 누락 0 |
| 테스트 | CRS, 면적합, 경계셀, null/0, 샘플 수기검산 |
| 실패 시 중단 | 2023 SHP와 2024+ 코드를 호환표 없이 결합, Pilot Polygon 미승인 |

## STEP 5 — 경쟁점·창폐업

| 항목 | 명세 |
|---|---|
| 목적 | 제과점 중심 경쟁·창폐업·프랜차이즈 지표 생성 |
| 입력값 | 서울 점포-상권, 소진공 상가업소, 지방행정 인허가 샘플 |
| 수정 예상 파일 | 업종 taxonomy, source adapter, dedupe/match 로직, metric tests |
| 데이터 | establishment snapshot/history, classification, franchise flag, coordinates |
| 계산 로직 | 주소·좌표·상호 정규화, 중복후보, PIP, 분기 집계, 수요대비 밀도 |
| 위험도 판단 | 베이커리카페/대형/개인 자동확정 금지; confidence 표시 |
| 완료 기준 | Pilot 샘플에서 원천별 건수·중복·미분류를 재현 가능 |
| 테스트 | 동명이점, 이전점포, 폐업/영업중 충돌, 좌표없음, 프랜차이즈 오분류 |
| 실패 시 중단 | 화면 크롤링 의존, 약관 미확인 데이터 배포, 폐업 추정 생성 |

## STEP 6 — 후보 점포 자동 상권매칭

| 항목 | 명세 |
|---|---|
| 목적 | 주소를 검증좌표와 공식/FRAMEONE 공간단위 후보에 연결 |
| 입력값 | 주소, geocode 결과, 승인 geometry, Node/앵커, 장벽 규칙 |
| 수정 예상 파일 | geocoding adapter interface, spatial matcher, review queue, 상담 입력 UI |
| 데이터 | normalized address, geocode precision, candidates, reasons, versions |
| 계산 로직 | PIP→boundary distance→복수후보→장벽/출입구 플래그→검수큐 |
| 위험도 판단 | 최단거리 단독확정 금지; 경계·중첩·대로·지하몰은 review_required |
| 완료 기준 | 행정동/공식상권/Grid 결과와 FRAMEONE 후보/확정 상태 분리 |
| 테스트 | 경계선, 복수중첩, 도로 양측, 철도/하천, 주소실패, 좌표정밀도 낮음 |
| 실패 시 중단 | 미승인 Market Polygon으로 자동확정, provider 약관 위반 저장 |

## STEP 7 — Risk V2 결합

| 항목 | 명세 |
|---|---|
| 목적 | 입지·경쟁·점포·시설·임대차·재무를 Hard Risk 게이트와 결합 |
| 입력값 | 기존 배기/전기/월세/제조공간/도면 결과 + STEP 4~6 분석 |
| 수정 예상 파일 | `lib/diagnosis/calculateRisk.ts` 동등 파일, 타입, 결과뷰, 테스트 |
| 데이터 | domain score, coverage, hard risk status, assumptions, conditions |
| 계산 로직 | 입력검증→Hard Risk→영역평가→판정→설명문 생성 |
| 위험도 판단 | confirmed 치명위험=위험, 핵심 미확인=보류, 해결조건=조건부 추천 |
| 완료 기준 | 추천/조건부 추천/보류/위험이 상호배타적이고 근거·확인사항 출력 |
| 테스트 | Risk V2 Spec 6개 이상 시나리오, 기존 리포트 회귀, null 데이터 |
| 실패 시 중단 | 단순 총점으로 Hard Risk 상쇄, 매출·성공가능성 단정 |

## Codex에 붙여넣을 최초 실행 프롬프트

```text
기준 커밋 8dde56e에서 STEP 2만 구현하라.

기존 District 25 / active Market 156 / Submarket 382 / Node 763, 모든 ID와 hierarchy를 변경하지 않는다. 전체 프로젝트 리팩토링, 새 라이브러리, STEP 3 이후 기능 구현은 금지한다. 수정 파일은 최소화한다.

목표:
1) geometry 상태를 geometry_availability / verification_stage / review_status로 분리한다.
2) source_id, source_version, source_date, verified_date, verified_by, representative_point를 표현할 수 있게 한다.
3) 기존 geometry=null은 그대로 유지한다.
4) manual_review Crosswalk를 확정관계처럼 쓰지 못하게 한다.
5) /markets에서 text_only, candidate, verified_point, verified_geometry 및 공간데이터 없음/경계 확인 필요를 표시한다.

DB 변경이 필요하면 구현하지 말고 구조와 SQL만 제안한 뒤 멈춘다. 계산/검증 규칙은 코드 주석으로 설명한다. 완료 후 기존 12개 검증과 추가 상태검증 테스트를 실행한다. 기능이 완료되면 추가 개선하지 말고 변경파일, 테스트 결과, 남은 문제만 짧게 보고하라.
```
