# CODEX Future Implementation Plan

기준일: 2026-09-02  
목적: 향후 Codex가 **한 번에 한 기능만**, 기존 구조를 보존하며 구현할 수 있도록 작업단위를 정의한다. 이번 조사에서는 코드를 수정하지 않았다.

## 1. 확인한 현재 구조

첨부 source dump에서 확인한 핵심 흐름:

```text
ConsultationForm
  ├─ CandidateStoreForm
  ├─ FacilityCheckForm
  ├─ BreakEvenForm
  ├─ BrandMarketingForm
  └─ InteriorSketchForm
        ↓
calculateBreakEven
        ↓
calculateRisk
        ↓
diagnosis-service / reportNarrative
        ↓
DiagnosisResultView / DiagnosisReportDocument / Preview
```

주요 파일:

| 영역 | 현재 파일 | 향후 역할 |
|---|---|---|
| 타입 | `lib/diagnosis/types.ts` | optional/versioned 타입부터 확장 |
| 손익 | `lib/diagnosis/calculateBreakEven.ts` | 기존 산식 보존, Finance V2 순수함수 추가 |
| Risk | `lib/diagnosis/calculateRisk.ts` | V2 유지, V3 별도 구현 후 병행 비교 |
| 서비스 | `lib/diagnosis/diagnosis-service.ts` | 새 계산결과 orchestration |
| Narrative | `lib/diagnosis/reportNarrative.ts` | rule facts 기반 설명으로 점진 전환 |
| 입력 | `components/diagnosis/*Form.tsx` | 기존 form에 작게 확장 |
| 결과 | `components/diagnosis/DiagnosisResultView.tsx` | engine별 섹션 추가 |
| 보고서 | `components/reports/*` | snapshot·근거·비교 appendix |
| route | `app/api/consultations/*` | 현재 API contract를 깨지 않는 optional fields |
| 저장 | `data/consultations.json` | prototype 호환; 실제 배포 DB에 맞춘 migration은 별도 확인 |

주의: source dump에는 이후 개발된 `/markets` 최신 구조가 모두 포함되지 않은 것으로 보인다. Market 기능을 구현할 때는 실제 repository의 현행 `/markets` tree와 `AGENTS.md`를 먼저 다시 조사해야 하며, 이 문서의 파일경로를 무조건 생성하지 않는다.

## 2. 변경 원칙

1. 현재 기능·화면·API를 삭제하거나 전면 재설계하지 않는다.
2. 새 필드는 처음에 optional이고, 기존 JSON sample이 그대로 로드되어야 한다.
3. 기존 계산함수를 고치기보다 새 순수함수를 나란히 추가하고 fixture로 결과를 비교한다.
4. 데이터 migration과 UI를 한 prompt에서 동시에 크게 만들지 않는다.
5. 새 라이브러리는 현재 기술로 불가능한 경우에만 별도 승인·작업으로 추가한다.
6. `actual`, `estimated`, `verified`, `unknown`을 타입·UI에서 분리한다.
7. 모든 decision에는 rule version, input snapshot, generatedAt을 저장한다.
8. 외부 API는 server-side adapter를 통해 호출하고 key를 client bundle에 넣지 않는다.
9. AI는 계산 API 뒤에 두며, 숫자 생성·법률판단·견적 생성을 금지한다.
10. 각 단계 완료 시 `npm run lint`와 `npm run build`를 최소 검증으로 실행한다.

## 3. 최소 공통 primitive

물리적 “Engine 폴더”를 먼저 만들지 않는다. 실제 기능이 필요할 때 아래 primitive를 가장 가까운 기존 모듈에 추가한다.

```text
EvidenceRef
MetricFact
RiskFinding
DecisionSnapshot
ScenarioSnapshot
CalculationAssumption
SourceAttribution
```

예상 타입 방향:

```text
VerificationStatus = VERIFIED | ESTIMATED | UNKNOWN | CONFLICTED | STALE
EvidenceSourceType = DOCUMENT | FIELD_CHECK | PHOTO | OWNER_STATEMENT |
  TENANT_STATEMENT | EXPERT_STATEMENT | PUBLIC_DATA |
  SYSTEM_CALCULATION | CUSTOMER_INPUT
RiskSeverity = CRITICAL | HIGH | MEDIUM | LOW
```

`OWNER_STATEMENT`를 verification status로 두지 않는 것이 중요하다.

## 4. P0 구현 단위

### FEATURE 1 — Evidence Foundation

#### Prompt 1.1: 타입만 추가

- `Evidence`, `VerificationStatus`, `EvidenceSourceType` 정의.
- 기존 record에 optional `evidence?: Evidence[]`, `schemaVersion?`.
- sample/JSON backward compatibility.
- UI 변경 없음.

완료기준: 기존 sample이 타입 오류 없이 build.

#### Prompt 1.2: 저장 API round-trip

- consultation GET/PUT/POST에서 evidence 보존.
- unknown field 손실 여부 확인.
- 생성/수정 timestamp 규칙.

완료기준: 생성→조회→수정 후 evidence 동등.

#### Prompt 1.3: 공통 badge/viewer

- 확인됨/추정/진술/미확인 badge.
- 출처·확인자·시점 drawer.
- 고객/직원 공개 필드 구분은 optional flag.

#### Prompt 1.4: 핵심 field 연결

- 전기, 배기, 급배수, 소방, 장비반입, 건축물/관리규약부터.
- 모든 입력항목을 한 번에 evidence화하지 않음.

### FEATURE 2 — Data Confidence

#### Prompt 2.1: 순수 계산

- `calculateEvidenceCoverage(fields, policyVersion)`.
- total coverage와 critical coverage 분리.
- UNKNOWN/CONFLICTED는 0.
- 성공확률이라는 이름 금지.

#### Prompt 2.2: 결과 UI

- `자료 확인도`, counts, 핵심 미확인.
- 82%여도 critical unknown이면 보류 메시지.

완료기준: critical unknown fixture가 항상 blocker.

### FEATURE 3 — Red Flag Engine V3

#### Prompt 3.1: Rule model

- `RiskFinding {ruleId, severity, status, evidenceIds, messageKey}`.
- CRITICAL/HIGH/MEDIUM rule table.
- 기존 `calculateRisk`는 변경하지 않음.

#### Prompt 3.2: V3 evaluator

- `calculateRiskV3(record, breakEven, evidenceCoverage, investment?)`.
- non-offsetting gates.
- rule trace 반환.

#### Prompt 3.3: V2/V3 shadow compare

- 개발/직원 화면에서 판정차이 표시.
- 과거 fixture 최소 20개.
- authoritative report는 아직 V2 유지.

#### Prompt 3.4: report 전환

- 전문가 승인된 threshold/version 고정.
- report에 V3 verdict·rule version·must resolve.
- rollback flag.

### FEATURE 4 — Investment Engine

#### Prompt 4.1: line-item 모델

- facility cost category와 low/base/high.
- `CONFIRMED/QUOTED/RANGE_ESTIMATE/UNKNOWN`.
- VAT·중복포함·evidence.

#### Prompt 4.2: Hidden Cost catalog

- 기존 시설입력에서 필요한 line-item 후보만 생성.
- AI 없이 deterministic mapping.
- 금액이 없으면 UNKNOWN, 0으로 만들지 않음.

#### Prompt 4.3: 합계 계산

- refundable deposit와 expense 분리.
- low/base/high 및 confirmed/estimated/unknown count.
- 중복 item 제외.

#### Prompt 4.4: Budget Guard UI

- 초기예산 vs 확정 vs 예상추가 vs high.
- 초과가능성·미확인 항목.

#### Prompt 4.5: 시설 cost ranges

- 수동 입력부터.
- 자체 견적 DB/추천범위 자동화는 별도 P1 작업.

### FEATURE 5 — Stress Test + Runway

#### Prompt 5.1: Finance V2 순수함수

- 기존 `calculateBreakEven` 결과를 바꾸지 않음.
- conservative/base/positive.
- 0·100% variable rate·negative profit 처리.

#### Prompt 5.2: Working Capital

- availableCash, initialCashOutflow, remainingCash.
- zero-sales burn와 conservative burn을 둘 다 계산.
- threshold policy는 config/version.

#### Prompt 5.3: UI/report

- 3 scenario table, runway, breach.
- positive가 Critical을 상쇄하지 않음.

### FEATURE 6 — Deal Simulator

#### Prompt 6.1: Scenario snapshot

- base immutable, scenario clone, changedFields, createdBy/At.
- 아직 UI 없음.

#### Prompt 6.2: Recalculation API/function

- 기존 BEP/Investment/Stress 함수 재사용.
- diff 반환.
- 예상매출 source type과 범위 guard.

#### Prompt 6.3: Rent Free calculator

- horizon 12/24/36개월.
- rent/management/VAT waiver를 계약조건별 분리.
- deposit는 cash tie-up.

#### Prompt 6.4: What-if UI

- 월세/권리금/렌트프리 우선.
- 운영변수 고급 섹션은 접기.
- base vs scenario 판정.

#### Prompt 6.5: Negotiation rounds

- INITIAL/ROUND1/.../FINAL version.
- scenario별 BEP/투자/runway/verdict snapshot.

#### Prompt 6.6: 목표조건 역산

- 월세 부담·target profit binding constraints.
- `적정`이라는 문구 금지.
- 권리금은 payback policy와 cashflow definition 표시.

### FEATURE 7 — Candidate Comparison

#### Prompt 7.1: Comparison DTO

- 여러 case를 동일 단위/시점 snapshot으로 변환.
- missing/confidence 필드.

#### Prompt 7.2: 계산/정렬

- CRITICAL→unknown→investment/runway→market 순.
- total score 없음.

#### Prompt 7.3: PC UI

- 기본 3개, 최대 5개.
- sticky row labels, group collapse, delta.

#### Prompt 7.4: 모바일

- pair compare/switch.
- 모든 5개 열 축소 금지.

#### Prompt 7.5: PDF

- 3개 landscape 요약.
- 4~5개 appendix.

### FEATURE 8 — Decision Explanation

P0 선정은 7개지만, 구현 단위상 Candidate Comparison 뒤에 붙는 P0 마감기능이다.

#### Prompt 8.1: Explanation facts

- positive/risk/mustResolve/negotiable/possibleNextVerdict 구조.
- rule trace에서 deterministic 생성.

#### Prompt 8.2: Template narrative

- AI 없이 기본문장 완성.
- 모든 숫자 fact ID.

#### Prompt 8.3: AI polish(optional)

- JSON schema input/output.
- numeric validator와 fallback.
- 직원/고객 tone 분리.

## 5. P1 Market 구현 단위

### FEATURE 9 — Canonical Competitor Store

1. 업종·brand taxonomy만 정의.
2. 소진공 raw adapter/fixture.
3. 지방인허가 raw adapter/fixture.
4. source record schema.
5. entity-resolution candidate generation.
6. review queue.
7. canonical store API.
8. 100/250/300/500m spatial query.
9. 지도 marker와 확인/추정/검토중.
10. 신규·폐업·관찰기간.

각 prompt는 한 번호만 처리한다. 실제 API key 연계와 UI를 같은 작업으로 묶지 않는다.

### FEATURE 10 — Seoul Estimated Sales

1. 공식 ZIP/API schema fixture와 raw loader.
2. quarter/industry/geography normalization.
3. 2024 geography version/crosswalk gate.
4. QoQ/YoY/TTM pure calculations.
5. server API response with source/limitations.
6. 4/12분기 chart.
7. BEP contextual comparison card.
8. fact-only narrative.
9. official-area choropleth.

금지 acceptance test: UI/보고서에 `실제매출`, `후보점포 예상매출`로 노출되면 실패.

### FEATURE 11 — Micro Market

1. grid source contract.
2. 100/250/300/500m cell aggregation.
3. 생활/상주/직장/세대 freshness.
4. competitor+POI join.
5. band comparison UI.
6. 도보장벽/isochrone는 별도 후속.

### FEATURE 12 — Mobile Evidence

1. 현장 task template.
2. photo metadata/upload.
3. candidate short code linking.
4. offline local draft.
5. sync/conflict.
6. missing task generation.
7. optional GPS/voice with consent.

### FEATURE 13 — Drawing/Equipment

1. equipment spec schema.
2. doorway/path measurement schema.
3. simple clearance checker.
4. facility connection requirements.
5. drawing layer IDs.
6. impact proposal→CAPEX.
7. expert confirmation state.

### FEATURE 14 — Contract/Rules Extraction

1. secure document metadata/upload.
2. OCR abstraction and fixture.
3. field extraction schema.
4. page/bbox evidence.
5. deterministic validators.
6. current-input conflict UI.
7. missing-question generator.
8. legal disclaimer/expert review.

## 6. P2 구현 단위

### FEATURE 15 — Government Support

1. K-Startup API contract fixture.
2. 기업마당 API contract fixture.
3. announcement/version/attachment schema.
4. dedupe and correction handling.
5. customer profile minimal fields.
6. PASS/FAIL/UNKNOWN rules.
7. match UI + official link.
8. attachment text extraction.
9. evidence-grounded briefing.
10. Pipeline state-change re-match.

### FEATURE 16 — Startup Navigator

1. operating-model questions.
2. versioned content/task schema.
3. 13-step base template.
4. dependency/blocker evaluator.
5. official URL/effective-date registry.
6. Due Diligence gate.
7. stage/task UI.
8. Opening Readiness completion.

### FEATURE 17 — Actuals Capture

1. prediction snapshot freeze at decision/contract.
2. consent/data-minimization.
3. 1/3/6/12-month minimal form.
4. forecast/actual calculation.
5. missing/dropout reason.
6. cohort dashboard only after minimum sample rule.

Production Capacity, Menu Economics, Similar Store, ML은 별도 프로젝트로 남긴다.

## 7. 외부 API adapter 원칙

권장 위치는 실제 repo 조사 후 결정하되 개념적으로:

```text
lib/data-sources/seoul/*
lib/data-sources/sdsc/*
lib/data-sources/local-permits/*
lib/data-sources/sgis/*
lib/data-sources/kstartup/*
lib/data-sources/bizinfo/*
```

각 adapter는:

- `fetchRaw`, `validateRaw`, `normalize` 분리.
- 공식 source URL, fetchedAt, schemaVersion.
- fixture 기반 offline 개발.
- key/env 누락 시 명시 오류.
- retry/rate limit 최소 구현; 대규모 queue를 먼저 도입하지 않음.
- raw immutable 저장과 normalized upsert 분리.

## 8. DB 진화

현재 JSON prototype을 기준으로 한 안전한 순서:

1. 타입에 optional 필드·`schemaVersion`.
2. read-time default adapter.
3. write 시 새 버전.
4. sample fixture update.
5. 실제 persistent DB가 존재하면 그 schema를 조사한 별도 migration prompt.

금지:

- 모든 기존 record를 한 번에 강제 migration.
- source row와 canonical row를 한 table로 합침.
- calculation result를 원입력에 덮어씀.
- 과거 report를 최신 rules로 조용히 재계산.

## 9. 테스트 전략

현재 `package.json`에는 전용 test runner가 없다. 처음부터 새 test framework를 넣지 않고:

- 순수함수 fixture 파일.
- build-time TypeScript checks.
- `npm run lint`, `npm run build`.
- API route의 작은 deterministic fixture 검증.

테스트 수가 커질 때 test runner 도입은 별도 의사결정으로 한다.

필수 fixture:

- 제조형+배기불가 confirmed.
- 배기 UNKNOWN, 전체 confidence 90%.
- variable rate 100%, sales 0, negative profit.
- rent-free와 월세인하 horizon 교차.
- CAPEX 중복포함·VAT·unknown.
- 후보 3개 중 상권은 최고지만 CRITICAL인 점포.
- 서울 2024 geography change.
- 공고 정정/마감/unknown eligibility.
- AI가 fact에 없는 숫자 생성.

## 10. Codex prompt template

향후 한 작업의 권장 형식:

```text
목표: [한 기능/한 단계]
수정 허용: [구체 파일 또는 영역]
수정 금지: 기존 API/화면/산식, unrelated files
입력/출력 contract: [...]
Backward compatibility: 기존 sample/record가 동작해야 함
Edge cases: [...]
검증: npm run lint, npm run build, 지정 fixture
완료기준: [...]
코드 외 산출물: 변경 이유와 남은 dependency
```

한 prompt에 `Evidence + Risk + CAPEX + Simulator + Compare`를 넣지 않는다.

## 11. Release gates

| Gate | 요구사항 |
|---|---|
| Data | source·asOf·estimate/actual·quality 존재 |
| Calculation | 순수함수·0/누락/경계 fixture |
| Decision | rule version·trace·non-offsetting critical |
| AI | fact whitelist·numeric validator·fallback |
| UI | customer/staff 정보분리·주의문 |
| Report | snapshot·source·generatedAt·limitations |
| Privacy | 최소수집·권한·audit·retention |
| Backward | 기존 consultation/sample/report build |

## 12. 권장 실제 개발 순서

```text
1 Evidence types/storage
2 Data Confidence
3 Risk V3 shadow
4 Investment line items
5 Stress/Runway
6 Deal scenarios/Rent Free
7 Candidate Comparison
8 Decision Explanation
9 Competitor ETL/map
10 Seoul sales trend
11 Micro Market
12 Mobile Evidence/DD
13 Drawing/Equipment
14 Support API
15 Navigator/Pipeline
16 Actuals capture
```

이 순서가 중요한 이유는 상위 기능이 하위 근거를 재사용하기 때문이다. Evidence 없이 AI 문서분석을 먼저 만들거나, CAPEX 없이 Deal Simulator를 먼저 고도화하면 나중에 계산 contract를 다시 바꾸게 된다.

