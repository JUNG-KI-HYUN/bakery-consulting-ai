# FRAMEONE Market/Submarket Boundary Evidence Approval V1

검토일: 2026-09-11

기준 branch: `codex-night-20260901`

기준 Repository HEAD: `d861c6b docs: define living population aggregation readiness`

## 1. 목적과 판정

이 문서는 FRAMEONE Market 156개와 Submarket 382개에 Candidate Boundary를 만들고 Verified Boundary로 승인하기 위한 서울 전역 공통 Evidence Gate를 정의한다.

**설계 판정: `READY`**

기존 E0~E4, `GeometryStatus`, `verificationStatus`, 일반 Evidence 상태를 변경하지 않고 승인 절차에 연결할 수 있다. 다만 이 판정은 승인 기준 문서가 준비됐다는 뜻이다. 실제 FRAMEONE boundary와 생활인구 집계는 계속 `BLOCKED`다.

현재 Repository 근거:

- District 25 / Market 156 / Submarket 382 / Node 763
- Market 156개 전부 `text_only`, geometry 0
- Submarket 382개 전부 `text_only`, geometry 0
- Node 763개 전부 geometry·주소·좌표 없음, coordinate confidence `UNKNOWN`
- 공식상권 후보 관계 863건: 156 Market 전체, 전부 `manual_review`, confidence C/D
- 행정동 후보 관계 458건: 156 Market 전체, 전부 `manual_review`, confidence C/D
- 서울 공식상권 Polygon 1,650개와 행정동 Polygon 425개는 validated reference geometry
- 보행 E1: POINT 212,066 / LINESTRING 279,016, source basis `2020 기준`
- 횡단보도 E1: POINT 19,518 / LINESTRING 11,562, source basis `2020 기준`
- 생활인구 Source/Grid는 READY지만 Market/Submarket aggregation은 BLOCKED

이번 작업은 Polygon, 좌표, E2 relationship, JSON schema, Grid Crosswalk 또는 집계 결과를 생성하지 않는다.

## 2. 기존 상태 축을 분리해서 사용

Boundary approval에서는 다음 세 축을 합치지 않는다.

### 2.1 Geometry 상태

기존 `GeometryStatus`를 유지한다.

| 상태 | 기존 의미 | Boundary 적용 |
|---|---|---|
| `text_only` | geometry 미확정 | 공간값 없음 |
| `draft` | 초안 geometry | E3 Candidate Boundary에만 사용 |
| `validated` | 검증된 geometry | E4 승인 뒤 Verified Boundary에 사용 |

### 2.2 공간 검증 표현

기존 Pilot convention을 유지한다.

| 상태 | 의미 |
|---|---|
| `text_only` | 공간값 없이 텍스트 hierarchy와 앵커만 존재 |
| `candidate` | 후보 관계 또는 초안; 수동 검토 전 확정 사용 금지 |
| `verified_reference` | 참조 레이어의 geometry 자체만 검증됨; FRAMEONE 경계가 아님 |
| `verified_point` | 출처와 CRS가 확인된 FRAMEONE 대표점 |
| `verified_geometry` | 출처와 CRS가 확인되고 E4 승인된 FRAMEONE Polygon/MultiPolygon |

### 2.3 일반 Evidence 검증상태

기존 `VerificationStatus = VERIFIED | ESTIMATED | UNKNOWN | CONFLICTED | STALE`을 evidence item에만 사용한다. 공식 출처라는 이유만으로 `VERIFIED`를 자동 부여하지 않으며, `CONFLICTED`를 geometry 상태나 review decision과 혼용하지 않는다.

## 3. 기존 Evidence Level

E-level의 기존 의미를 그대로 유지한다.

### E0 — Raw Official Source

- 공식 원문, provider, URL, checksum, CRS, source basis, license가 연결된 단계
- 원문 자체를 FRAMEONE geometry로 사용하지 않는다.

### E1 — Parsed Official Primitive

- 공식 POINT/LINESTRING의 문법·좌표순서·ID·provenance가 구조적으로 검증된 단계
- 현재 보행·횡단보도 primitive가 해당한다.
- E1 primitive의 좌표는 FRAMEONE Node 좌표가 아니다.

### E2 — Spatial Relationship Evidence

- 보행 연결, 횡단 연결, 단절 후보, 연결축 후보 등 rule/version과 limitation이 있는 관계 evidence
- 경계 판단을 보조하지만 자동 경계선은 아니다.

### E3 — FRAMEONE Candidate Boundary Evidence

- 텍스트 정의, E1/E2, 물리적 barrier, reference boundary, FRAMEONE Node, 현장지식 등을 함께 검토한 Candidate Boundary evidence
- geometry는 `draft`, 검증 표현은 `candidate`를 유지한다.
- 자동 승격할 수 없다.

### E4 — Human-reviewed Evidence

- 현장 또는 책임자 검토 결과가 연결된 evidence
- reviewer, reviewedAt, 승인 근거, source snapshot, limitation을 보존한다.
- E4 evidence에 명시적 승인이 있고 모든 hard gate를 통과한 특정 boundary version만 `validated + verified_geometry`로 승격할 수 있다.

```text
Official source (E0)
→ Parsed primitive (E1)
→ Spatial relationship evidence (E2)
→ Candidate boundary evidence (E3)
→ Human-reviewed evidence (E4)
→ Verified FRAMEONE geometry
```

E1/E2는 E3를 자동 생성하지 않고, E4 검토 기록만 존재하는 것도 승인 결정을 뜻하지 않는다.

## 4. Boundary Evidence 역할

Repository에 아래 역할명의 구현 convention은 없다. 따라서 이 문서에서는 **검토용 역할 분류**로만 사용하며 enum이나 schema를 추가하지 않는다.

| 역할 | 의미 | FRAMEONE Boundary 대체 가능 여부 |
|---|---|---|
| `AUTHORITATIVE_BOUNDARY` | E4 승인된 FRAMEONE boundary 결과 | 가능. 외부 Source에는 부여하지 않음 |
| `REFERENCE_BOUNDARY` | 공식상권·행정동 등 다른 목적의 검증된 경계 | 금지 |
| `SPATIAL_EVIDENCE` | Node, 역·출입구, 정류장, 도로·보행·횡단 연결 등 위치·동선 근거 | 단독 대체 금지 |
| `DEMAND_EVIDENCE` | 생활인구, 점포·베이커리, 주거·업무·상업시설 분포 | 경계 대체 금지 |
| `BARRIER_EVIDENCE` | 하천·철도·대형도로·대형시설 등 이동 단절·경계 후보 | 단독 대체 금지 |
| `HUMAN_REVIEW_EVIDENCE` | 현장확인, 책임자 판단, 승인·보류·반려 사유 | 자동 대체 불가; 최종 승인에 필수 |

## 5. Evidence 유형별 사용 기준

| Evidence | 역할 | Boundary 결정 근거 | 보조 근거 | Boundary 대체 금지 | 자동화 가능 수준 |
|---|---|---|---|---|---|
| FRAMEONE Market/Submarket text definition | FRAMEONE 의미 기준 | **필수**. 무엇을 포함하려는지 정의 | 이름·역·거리·앵커 설명 | 텍스트만으로 geometry 생성 금지 | 구조화·비교만 자동화 |
| FRAMEONE Node | `SPATIAL_EVIDENCE` | verified point일 때 핵심축·앵커 판단에 사용 | Candidate 범위 탐색 | Node 몇 개로 Polygon/Voronoi 생성 금지 | 좌표 QA·근접 후보는 자동; 관련성은 사람 검토 |
| 서울 공식상권 Polygon | `REFERENCE_BOUNDARY` | 경계 비교·차이 설명에 사용 | 상업활동 reference | FRAMEONE Market/Submarket으로 복사 금지 | overlay·교차·차이 탐지는 자동 |
| 행정동 Polygon | `REFERENCE_BOUNDARY` | 행정적 위치·분할 참고 | 통계 연결·주소 설명 | FRAMEONE Market으로 복사 금지 | overlay 가능; 동일성 판단 금지 |
| 도로/보행 Link | `SPATIAL_EVIDENCE` 또는 `BARRIER_EVIDENCE` | 연결축·접근축·단절 후보 판단 | 후보 경계 설명 | Link buffer/union을 경계로 자동 채택 금지 | E1 parse·E2 후보 탐지는 자동 |
| 횡단보도 | `SPATIAL_EVIDENCE` | 대형도로 횡단 가능성 검토 | barrier 강도 보정 | 횡단보도 유무만으로 포함 결정 금지 | 연결 후보 탐지는 자동 |
| 지하철역/출입구 | `SPATIAL_EVIDENCE` | 실제 접근방향·역세권 중심 검토 | Node 보강 | 고정 radius를 Market 경계로 사용 금지 | 위치 QA·근접 후보는 자동 |
| 버스정류장 | `SPATIAL_EVIDENCE` | 접근축 보조 | 이동 evidence | 정류장 buffer를 경계로 사용 금지 | 향후 연결 후 위치·밀도 분석 가능 |
| 생활인구 250m Grid | `DEMAND_EVIDENCE` | Candidate 내부·외부 수요 차이의 후행 검토만 가능 | coverage·수요 profile | 수요가 높은 셀 외곽선으로 경계 생성 금지 | 통계·overlay 진단은 자동 |
| 상가업소/베이커리 분포 | `DEMAND_EVIDENCE` | 상업 연속성 검토 | 업종·집적 보조 | 점포 convex hull 등 자동 경계 금지 | 향후 Source 연결 후 밀도 후보 산출 가능 |
| 주요 아파트/주거 배후 | `DEMAND_EVIDENCE` | 주거형 상권의 배후 설명 | 소비층·접근성 보조 | 단지 경계를 Market 경계로 대체 금지 | 향후 Source 연결 후 후보 비교 가능 |
| 대형 상업/업무시설 | `DEMAND_EVIDENCE`·`SPATIAL_EVIDENCE` | 앵커와 유입 동선 검토 | 시간대 수요 설명 | 시설 부지 또는 radius를 경계로 대체 금지 | 위치·교차 QA 가능 |
| 하천/철도/대형도로 등 | `BARRIER_EVIDENCE` | 실제 이동 단절이면 주요 경계 근거 | 경계 segment 설명 | 지도 객체 하나를 무조건 경계로 간주 금지 | 교차·근접 탐지는 자동; 단절 강도는 사람 검토 |
| 현장 확인 | `HUMAN_REVIEW_EVIDENCE` | 현재 동선·횡단·상업 연속성·barrier 확인 | 오래된 Source 보완 | 한 번의 관찰만으로 전체 경계 확정 금지 | 기록 정리·비교만 AI 보조 |
| 사람의 최종 승인 | `HUMAN_REVIEW_EVIDENCE` | Verified 승격의 필수 결정 | 예외·limitation 확정 | 자동화 금지 | 사람만 승인 가능 |

현재 연결되지 않은 버스정류장, 상가업소, 아파트 Source는 향후 evidence 후보일 뿐 현재 확보됐다고 간주하지 않는다.

## 6. Boundary 상태 흐름

아래 대문자 이름은 workflow 설명이며 새로운 저장 enum을 구현하는 것이 아니다.

| 단계 | 기존 상태 매핑 | 최소 Evidence | 자동화 | Human Review | 진입 조건 | 보류/실패 조건 |
|---|---|---|---|---|---|---|
| `TEXT_ONLY` | `geometryStatus=text_only`, `verificationStatus=text_only` | hierarchy와 text definition | 무결성·ID 확인 | 불필요 | canonical entity 존재 | text 정의 충돌 또는 parent 오류 |
| `EVIDENCE_COLLECTED` | geometry는 계속 `text_only`; 후보 관계가 있으면 `verificationStatus=candidate` | E0/E1/E2 또는 verified reference와 provenance | 수집·정규화·overlay·QA | evidence 관련성 검토 | entity에 추적 가능한 evidence bundle 연결 | 출처·버전 불명, stale/충돌만 존재 |
| `CANDIDATE_BOUNDARY` | `geometryStatus=draft`, `verificationStatus=candidate`, E3 | 아래 Candidate 최소 조건 | geometry QA·충돌 탐지 | 후보 형태와 의미 검토 | 재현 가능한 draft version과 evidence refs 존재 | geometry invalid, 근거 없는 선분, 자동 복사/반경 생성 |
| `REVIEW_REQUIRED` | `draft + candidate` 유지 | E3 artifact와 QA 결과 | 체크리스트·차이·conflict 요약 | **필수** | 후보가 E4 gate 검토에 제출됨 | material conflict 또는 근거 부족이면 승인 보류/반려 |
| `VERIFIED_BOUNDARY` | `geometryStatus=validated`, `verificationStatus=verified_geometry`, 승인된 E4 | E4 승인 기록과 모든 hard gate | 승격 후 무결성 재검사 | **최종 승인 필수** | 명시적 승인, immutable version, unresolved hard conflict 0 | 자동 승격, reviewer 누락, 승인 후 geometry 변경 |

반려된 Candidate를 삭제하거나 기존 verified version에 덮어쓰지 않는다. 새 boundary는 새 version과 review artifact로 남긴다.

## 7. Candidate Boundary 최소 조건

E3 Candidate Boundary는 다음을 모두 갖춰야 한다.

1. canonical `entityId`, `entityType`, Market인 경우 District, Submarket인 경우 `parentMarketId`가 일치한다.
2. `candidateGeometryRef`, `boundaryVersion`, geometry type, source/output CRS가 기록된다.
3. geometry는 Polygon/MultiPolygon으로 구조적으로 valid하고 empty가 아니다.
4. FRAMEONE text definition과 Candidate가 표현하려는 역·거리·앵커·소비동선 설명이 연결된다.
5. 공간 anchor/동선 evidence와 barrier 또는 경계 전환 근거가 연결된다. barrier가 없으면 없다는 판단 근거를 남긴다.
6. 공식상권과 행정동 reference를 비교하고, 일치 여부가 아니라 차이와 limitation을 기록한다.
7. 사용한 E0/E1/E2, reference layer, 현장자료의 source/snapshot/version/freshness를 추적할 수 있다.
8. 동일 계층 overlap, parent-child relation, 서울·District 범위 이탈, self-intersection 등 QA 결과가 있다.
9. unresolved conflict와 확인 필요사항을 숨기지 않는다.
10. 어떤 external Polygon, Node hull, Voronoi, 고정 radius도 FRAMEONE 경계로 자동 복사·생성하지 않았음을 확인한다.

Candidate 단계에서는 현장 확인이 항상 필수는 아니다. 다만 오래된 Source, 실제 횡단 가능성, 상업 연속성 또는 barrier가 desk evidence만으로 해소되지 않으면 E4 승인 전에 현장 확인이 필수다.

## 8. E3 → E4 승인 기준

### 8.1 Hard gate

다음 항목은 모두 통과해야 한다.

| Gate | 승인 조건 | 실패 시 처리 |
|---|---|---|
| Identity/Hierarchy | canonical ID와 parent 관계가 정확함 | Candidate 유지, 수정 후 재검토 |
| Provenance/Version | geometry와 핵심 evidence의 source, snapshot/version, CRS, 생성·검토 이력이 추적됨 | 승인 금지 |
| Geometry validity | Polygon/MultiPolygon valid, non-empty, 좌표·ring 구조 정상 | 승인 금지 |
| Scope sanity | 설명되지 않은 서울 범위 이탈이 없고 District 경계 차이는 검토됨 | `REVIEW_REQUIRED` |
| Definition fit | FRAMEONE text definition, 주요 anchor와 소비동선에 대한 사람의 설명이 있음 | 승인 금지 |
| Barrier/Connectivity | 주요 연결축과 물리적 barrier를 검토했고 오래된 2020 Source의 한계를 반영함 | 미확인 시 현장/최신 근거 요구 |
| Reference comparison | 공식상권·행정동과의 차이를 검토함. 동일할 필요는 없음 | 비교 누락 시 승인 금지 |
| Same-layer conflict | overlap/touch/sliver를 분류하고 exclusive aggregation conflict가 해결됨 | material conflict면 승인 금지 |
| Parent-child review | Submarket과 parent Market 관계를 검토하고 예외를 설명함 | 미검토 예외는 승인 금지 |
| Human decision | 책임자 reviewer, reviewedAt, reviewNote, 명시적 approval 존재 | 자동 승격 금지 |
| Immutable output | 승인 대상 boundaryVersion이 검토 후 변경되지 않음 | 변경 시 새 version으로 재검토 |

### 8.2 Confidence와 limitation

- `confidence`는 기존 허용 convention을 따르고 이 문서에서 새 scale을 만들지 않는다.
- confidence가 높다는 이유로 hard gate를 생략하지 않는다.
- 제한사항은 승인 후에도 보존한다.
- `STALE` 또는 `CONFLICTED` evidence가 있으면 최신 evidence가 이를 자동으로 삭제하거나 supersede하지 않는다.
- 검토자가 conflict가 boundary에 영향을 주지 않는다고 판단한 경우 그 이유를 review note에 남겨야 한다.

## 9. 동일 계층 Boundary 충돌 규칙

Market↔Market과 Submarket↔Submarket에 같은 규칙을 적용한다. FRAMEONE의 실무적 상권 개념은 일부 겹칠 수 있으므로 geometry overlap 자체를 무조건 오류로 보지 않는다.

| 판정 | 의미 | Boundary 처리 | Exclusive aggregation 처리 |
|---|---|---|---|
| `VALID` | disjoint, boundary touch, 또는 의도적 overlap이 검토·설명됨 | 승인 가능 | CELL_ID별 단일 귀속 규칙이 별도로 확정돼야 함 |
| `REVIEW_REQUIRED` | 의도 불명 overlap, sliver, near-duplicate, 경계선 불명확 | Candidate 유지 | 관련 셀 배정 보류 |
| `CONFLICTED` | 두 entity가 같은 공간을 서로 배타적으로 주장하거나 중복집계를 피할 규칙이 없음 | Verified 승격 금지 | 관련 셀은 양쪽 모두에서 제외하고 해결 필요 |

규칙:

- topology 계산은 overlap 면적과 관련 entity를 알려줄 뿐 정상/오류를 자동 판정하지 않는다.
- 의미상 overlap을 허용해도 생활인구 같은 additive metric에는 same-layer exclusive assignment가 필요하다.
- 겹친 영역을 양쪽에 전액 합산하지 않는다.
- 면적이 작은 sliver도 임의 삭제·snap하지 않는다.
- 충돌 해결은 boundary 수정, 의도적 overlap 승인, 또는 별도 Grid 귀속 규칙 중 하나로 versioned 기록한다.

## 10. Market ↔ Submarket 관계 규칙

FRAMEONE Submarket은 부모 Market의 세부 분석 단위이므로 **부모와 설명 가능한 공간관계**가 필수지만, 행정구역처럼 완전 분할할 필요는 없다.

- 완전 포함: 기본적으로 선호한다. 자동 hard requirement로 고정하지는 않는다.
- 일부 경계 공유: 허용한다.
- Submarket 간 gap: 허용한다. Submarket이 Market 전체를 빠짐없이 덮는다고 가정하지 않는다.
- `union(Submarkets) = Market`: 요구하지 않는다.
- Submarket 간 overlap: 실무 정의상 가능하지만 의도·이유를 검토하고 additive metric의 exclusive assignment를 별도로 해결한다.
- Submarket 일부가 부모 Market 밖에 있음: 자동 clip하거나 삭제하지 않는다. `REVIEW_REQUIRED`로 두고 business definition과 parent boundary 중 어느 쪽을 수정할지 사람이 결정한다.
- 승인 예외: 부모 밖 영역을 유지하려면 책임자의 명시적 사유와 해당 boundary version의 limitation이 필요하다.

Market과 Submarket의 결과를 합산하거나 서로 대체하지 않는다. 각 계층의 Grid 귀속과 지표는 독립적으로 생성한다.

## 11. 최소 Human Review Artifact

실제 schema 구현 전의 최소 필드 제안이다. 기존 camelCase convention을 따른다.

| 필드 | 필수 | 목적 |
|---|---|---|
| `artifactVersion` | 예 | review artifact 구조 버전 |
| `entityType`, `entityId`, `parentEntityId` | 예 | canonical hierarchy 연결. Market의 parent는 District, Submarket의 parent는 Market |
| `boundaryVersion`, `candidateGeometryRef` | 예 | 검토한 immutable geometry 식별 |
| `geometryStatus`, `verificationStatus`, `evidenceLevel` | 예 | `draft/candidate/E3`와 승인 후 상태 구분 |
| `evidenceRefs` | 예 | 역할과 source/snapshot/version을 가진 근거 참조 목록 |
| `qaSummary` | 예 | geometry validity, scope, same-layer, parent-child 결과 |
| `conflicts` | 예 | 없으면 빈 배열; 상태·관련 entity·처리결과 포함 |
| `limitations` | 예 | freshness, coverage, 미확인 사항 |
| `reviewStatus` | 예 | `REVIEW_REQUIRED`, `APPROVED`, `REJECTED` 중 review 결정. 구현 전 naming 검토 필요 |
| `reviewer`, `reviewedAt`, `reviewNote` | 승인 시 예 | 사람의 책임 있는 결정 근거 |
| `confidence` | 승인 시 예 | 기존 confidence convention 사용 |

`sourceSummary`를 별도 중복 필드로 복제하기보다 `evidenceRefs`와 `limitations`에서 재현 가능하게 한다. geometry 본문을 review artifact에 중복 저장하지 않고 versioned ref를 사용한다.

## 12. 자동화 가능 영역과 사람 확인 영역

### 자동화 가능

- E0 provenance/checksum/source metadata 연결
- E1 POINT/LINESTRING fail-closed parsing과 quality flag
- geometry structure·self-intersection·empty·CRS·서울 범위 QA
- 공식상권·행정동·보행·횡단보도·Grid와 overlay 진단
- 동일 계층 overlap/touch/sliver 후보와 parent-child 이탈 탐지
- evidence 목록, source version, freshness warning, conflict 초안 정리
- Candidate geometry 제안 보조와 버전 비교

자동 결과는 `SYSTEM_CALCULATION` 또는 candidate evidence이며 approval이 아니다.

### 사람 확인 필수

- FRAMEONE text definition과 실제 상권 의미의 해석
- 어떤 Node·동선·시설이 경계에 중요한지 판단
- 대형도로·철도·하천이 실제 barrier인지 판단
- 공식상권/행정동과 다른 경계를 유지할 이유 판단
- overlap과 parent-child 예외의 실무적 타당성 판단
- 현장 확인 필요 여부와 현장 evidence 채택
- E3 boundary version의 최종 승인·반려
- confidence와 limitation 확정

AI는 evidence 요약, 후보 보조, 충돌 탐지와 QA까지만 수행한다.

## 13. 서울 전체 적용 방식

- District 25, Market 156, Submarket 382에 동일한 Gate와 artifact topology를 사용한다.
- District별 이름·반경·Source 예외를 코드에 하드코딩하지 않는다.
- entity별 boundaryVersion과 approval을 독립 관리한다. 한 Pilot의 승인이 다른 entity를 승격하지 않는다.
- Market과 Submarket은 같은 hard gate를 사용하되, Submarket에는 parent-child review를 필수 적용한다.
- Source snapshot, rule version, geometry version을 고정해 과거 승인을 재현한다.
- 재검토는 기존 verified boundary를 덮어쓰지 않고 새 Candidate와 review version을 만든다.
- 오래된 보행/횡단보도 Source의 `2020 기준`을 fetchedAt으로 최신화하지 않는다.

## 14. Pilot 검증 원칙

실제 Polygon은 이번 단계에서 만들지 않는다. 다음 단계의 Pilot은 **가장 적은 entity로 서로 다른 난점을 모두 포함**하도록 선정한다. 한 지역이 여러 특성을 함께 가지면 별도 Pilot 수를 늘리지 않는다.

최소 검증 특성:

- 밀집 상업·역세권: Node, 출입구, 보행축과 공식상권 reference가 복잡한 사례
- 주거·대로변: 배후수요와 대형도로 barrier 판단이 중요한 사례
- 복합 경계: 철도·하천·District 경계, 같은 계층 overlap 또는 parent-child 예외가 있는 사례

성수는 밀집 상업·역세권·복합 동선 Gate를 검증하는 후보일 뿐 성수 전용 규칙을 만들지 않는다. Pilot은 Candidate 작성, 자동 QA, 사람 review artifact의 사용성만 검증하고 생활인구를 집계하지 않는다.

## 15. 생활인구 집계 Unlock 조건

Verified Boundary는 생활인구 집계의 **필요조건이지 충분조건은 아니다**. Entity별로 다음을 모두 충족해야 집계 단계로 넘어갈 수 있다.

1. 승인된 E4 artifact가 특정 `boundaryVersion`을 가리킨다.
2. geometry가 `validated + verified_geometry`다.
3. 같은 계층의 material conflict가 해결됐다.
4. Submarket은 parent-child relation 검토를 통과했다.
5. 250m Grid assignment rule과 동일 계층 exclusive assignment가 versioned됐다.
6. 재현 가능한 Market/Grid 또는 Submarket/Grid Crosswalk가 생성·검증됐다.
7. Living Source Current, Grid geometry, CELL_ID reconciliation이 READY다.
8. BOTH/METRIC_ONLY/GEOMETRY_ONLY와 suppression/null 정책을 유지한다.
9. 결과에 source snapshot, reference YMD, boundary/grid/rule version, coverage와 limitation을 보존한다.

하나라도 충족하지 않으면 Market/Submarket aggregation은 계속 `BLOCKED`다.

## 16. 금지사항

- Market/Submarket Polygon 또는 Node 좌표 임의 생성
- 공식상권·행정동 Polygon 복사
- Voronoi, convex hull, buffer, 300m/500m radius의 자동 경계 승격
- E1/E2 또는 높은 confidence만으로 E3/E4 자동 승격
- review 전 `draft`를 `validated`로 변경
- review artifact와 과거 boundary version 덮어쓰기
- 생활인구·점포밀도 등 수요값으로 경계 자체 생성
- unresolved conflict를 정상 overlap으로 자동 처리
- 생활인구 집계, 상권 점수, UI·DB·Scheduler 구현

## 17. 다음 한 단계

**이 기준을 사용해 실제 Polygon 없이 E3/E4 review artifact의 빈 템플릿과 체크리스트만 정의한다.**

템플릿 단계에서도 geometry, E2 relationship 또는 생활인구 집계는 생성하지 않는다.
