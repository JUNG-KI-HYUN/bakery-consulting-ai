# FRAMEONE Boundary Review Policy Clarification V1

검토일: 2026-09-14

기준 branch: `codex-night-20260901`

기준 Repository HEAD: `4843ce6 docs: record boundary dry-run status`

정책 판정: **`NEEDS_POLICY_REVIEW`**

## 1. 목적과 범위

이 문서는 E3/E4 Boundary Review Artifact Non-Spatial Dry-run에서 확인된 상태, Gate, Evidence, Confidence 해석의 모호성을 공통 정책으로 정리한다.

이번 문서는 정책 정의만 수행한다. 실제 Polygon, Node 좌표, E3 Candidate, Review Artifact, E4 승인, active pointer, Grid Crosswalk 또는 생활인구 집계 결과를 생성하지 않는다. Schema, 코드, DB, UI, API와 TypeScript type도 변경하지 않는다.

정책 판정이 `NEEDS_POLICY_REVIEW`인 이유는 8개 정책 결정이 미완료여서가 아니다. 아래 결정과 기존 Review Artifact Template의 Gate 평가 상태 표현 사이에 후속 문서 정합성 수정이 필요하기 때문이다. 이 정합성 수정 전에는 Pilot에 진입하지 않는다.

## 2. 현재 전제

현재 Repository의 공간 상태는 다음과 같다.

- FRAMEONE Market geometry: `0 / 156`
- FRAMEONE Submarket geometry: `0 / 382`
- FRAMEONE Node geometry: `0 / 763`
- Grid-to-Market/Submarket crosswalk rows: `0`
- Market/Submarket Living Population Aggregation: `BLOCKED`

완료된 것은 Boundary Evidence Approval V1, E3/E4 Boundary Review Artifact Template V1과 Non-Spatial Dry-run이다. Non-Spatial Dry-run은 직원 절차를 문서 수준에서 검토한 것이며 actual geometry, formal E3/E4 artifact 또는 approval을 만들지 않았다.

이 문서의 정책 준비상태는 실제 geometry 준비상태, E3/E4 승인상태, aggregation readiness 또는 고객 의사결정 준비상태를 변경하지 않는다.

## 3. Status Scope Matrix

상태는 반드시 소유 scope와 함께 기록하고 해석한다.

| Scope | 필드명 | 의미 | 대표 값 | 자동 승격 금지 대상 |
|---|---|---|---|---|
| 설계 문서 | `designStatus` | 정책·설계 문서가 검토 가능한 수준인지 표시 | `DRAFT`, `READY` | Source, Candidate, geometry, aggregation |
| Source 또는 Source artifact | `sourceStatus` | 해당 Source/snapshot/manifest의 자체 품질·게시 준비상태 | 각 Source 계약의 기존 값 | Boundary, aggregation, customer decision |
| E3 접수 전 | `preflightStatus` | 제출물이 formal E3 review에 들어갈 최소 요건을 갖췄는지 표시 | `ELIGIBLE`, `BLOCKED`, `REJECTED` | reviewStatus, geometry status |
| Formal Candidate review | `reviewStatus` | 유효하게 접수된 Candidate version에 대한 사람의 결정 | `APPROVED`, `REVIEW_REQUIRED`, `REJECTED` | geometry 승격, active pointer |
| 공간집계 준비도 | `aggregationReadiness` | entity가 승인된 경계와 재현 가능한 귀속 규칙으로 집계 가능한지 표시 | `READY`, `CONDITIONAL`, `BLOCKED` | customer decision readiness |

공통 원칙:

```text
sourceStatus=READY
≠ designStatus=READY
≠ preflightStatus=ELIGIBLE
≠ reviewStatus=APPROVED
≠ aggregationReadiness=READY
≠ customer decision ready
```

한 scope의 상태는 다른 scope를 자동 변경하지 않는다. 상태를 단독 문자열로 보여줄 때도 화면·문서·로그에서 scope label을 함께 표시해야 한다.

## 4. `NEEDS_REVIEW`와 `REVIEW_REQUIRED` 구분

### `NEEDS_REVIEW`

- Source, metadata 또는 개별 Evidence 자체의 추가 확인 필요를 뜻한다.
- Candidate가 없어도 사용할 수 있다.
- 원천의 연도, license, field 의미, provenance 일부 또는 evidence freshness가 미확인일 때 사용한다.
- Formal review decision이 아니며 `reviewStatus`에 저장하지 않는다.

### `REVIEW_REQUIRED`

- `preflightStatus=ELIGIBLE`로 접수된 유효한 Candidate의 formal review 결과다.
- 사람이 추가 Evidence, 현장 확인, 충돌 해소 또는 Candidate 수정을 요구했음을 뜻한다.
- Candidate는 `draft + candidate` 상태로 남고 자동 승인·승격되지 않는다.
- Source 또는 metadata 상태를 대신하지 않는다.

따라서 Candidate가 없거나 preflight가 끝나지 않은 요청에 `REVIEW_REQUIRED`를 부여하지 않는다. 이 경우는 `preflightStatus=BLOCKED`와 구체적인 `stopReason`으로 표현한다.

## 5. E3 Preflight 규칙

Preflight는 formal Review Artifact를 만들기 전에 실행한다. Preflight 결과는 reviewStatus가 아니다.

### `ELIGIBLE`

다음을 모두 만족할 때만 사용한다.

1. canonical entity identity와 parent identity가 확인된다.
2. Candidate geometry가 실제로 존재하고 immutable reference로 다시 열 수 있다.
3. `boundaryVersion`, geometry checksum, geometry type, CRS와 생성 provenance가 존재한다.
4. 최소 Evidence bundle과 각 reference를 다시 찾을 수 있다.
5. 금지된 자동 복사·고정 반경·근거 없는 생성물임을 나타내는 정보가 없다.

`ELIGIBLE`은 접수 가능 상태일 뿐 geometry validity, E4 review 또는 approval을 뜻하지 않는다.

### `BLOCKED`

요청이 보완되면 같은 업무 목적을 이어갈 수 있지만 formal E3 접수 요건이 현재 부족할 때 사용한다.

대표 조건:

- geometry가 아예 없음
- geometry reference, checksum, CRS 또는 source locator가 누락됐으나 보완 가능
- 필수 Evidence reference가 누락됐으나 확보 가능
- identity 또는 parent를 확인할 자료가 부족함

`BLOCKED`에는 최소한 `stopReason`, 누락 항목, `nextAction`과 책임 주체가 필요하다. 이 문서에서는 필드 정책만 정의하며 schema를 구현하지 않는다.

### `REJECTED`

제출물 자체를 같은 Candidate version으로 formal review에 사용할 수 없을 때 사용한다.

대표 조건:

- 제출 geometry가 다른 entity에 속한 것으로 확인됨
- provenance가 본질적으로 허위이거나 검증 불가능함
- 공식상권·행정동 Polygon을 FRAMEONE geometry로 그대로 복사함
- 금지된 자동 생성 방식으로 만들었고 원래 Candidate를 신뢰할 수 없음
- identity와 Candidate version의 결합이 본질적으로 잘못됨

단순 추가자료 누락은 `REJECTED`가 아니라 `BLOCKED`다. `REJECTED`된 제출물을 수정할 때는 새 Candidate version으로 다시 preflight한다.

## 6. Gate Evaluation State

9개 Hard Gate의 평가 상태는 다음 세 값으로 통일한다.

| 상태 | 의미 | Decision에 미치는 영향 |
|---|---|---|
| `PASS` | Gate를 실제로 평가했고 승인 조건을 충족함 | 다른 모든 Gate와 사람 결정이 충족될 때 승인 가능 |
| `FAIL` | Gate를 실제로 평가했고 승인 조건을 충족하지 못함 | 실패 유형에 따라 `REVIEW_REQUIRED` 또는 `REJECTED` |
| `NOT_EVALUATED` | 선행 Gate 중단 또는 평가 입력 부재로 해당 Gate를 평가하지 못함 | `PASS`로 간주 금지, `APPROVED` 금지 |

규칙:

- `NOT_EVALUATED`는 `FAIL`이 아니다.
- 선행 Gate가 중단되면 후속 Gate는 임의로 `FAIL`이나 `PASS`로 채우지 않는다.
- `NOT_EVALUATED`에는 `stopReason`과 원인이 된 선행 Gate ID를 기록한다.
- 모든 9개 Hard Gate는 approval에 필수이므로 `NOT_APPLICABLE`로 생략하지 않는다.
- Gate 결과에 `REVIEW_REQUIRED`를 사용하지 않는다. 이는 `reviewStatus` 값이다.
- 기존 Template의 Gate 상태 `REVIEW_REQUIRED | NOT_APPLICABLE` 표현은 이 정책과 정합성 수정이 필요하다.

## 7. Gate-to-Decision Matrix

Preflight를 통과한 Candidate에만 아래 formal review 결정을 적용한다.

| 상황 | Gate 결과 | 보완 가능성 | `reviewStatus` | 처리 |
|---|---|---|---|---|
| 모든 필수 Gate 충족, blocking conflict 0, 사람 명시 승인 | 전부 `PASS` | 해당 없음 | `APPROVED` | 별도 승격 단계의 자격만 획득 |
| identity/parent 자료가 단순 누락됨 | Preflight에서 중단 | 보완 가능 | 부여하지 않음 | `preflightStatus=BLOCKED` |
| 제출 Candidate가 잘못된 entity/parent에 본질적으로 연결됨 | `IDENTITY_HIERARCHY=FAIL` | 해당 version 폐기 필요 | `REJECTED` | 새 Candidate version 필요 |
| version locator/checksum/CRS가 누락됨 | Preflight에서 중단 | 보완 가능 | 부여하지 않음 | `preflightStatus=BLOCKED` |
| 검토 중 version/checksum 변조 또는 불일치 확인 | `CANDIDATE_VERSION_INTEGRITY=FAIL` | 해당 version 폐기 필요 | `REJECTED` | 새 version으로 재제출 |
| Polygon empty, self-intersection 등 invalid geometry | `GEOMETRY_VALIDITY=FAIL` | 해당 version 수정 필요 | `REJECTED` | 기존 version 보존, 새 version 필요 |
| FRAMEONE 정의와 본질적으로 불일치 | `FRAMEONE_DEFINITION_FIT=FAIL` | 해당 version 폐기 필요 | `REJECTED` | `DEFINITION_CONFLICT` 보존 |
| 필수 Evidence가 부족하지만 확보 가능 | 관련 Gate `FAIL` | 보완 가능 | `REVIEW_REQUIRED` | `draft + candidate` 유지 |
| 핵심 Evidence가 stale이며 최신성 확인 필요 | 관련 Gate `FAIL` | 보완 가능 | `REVIEW_REQUIRED` | 현장 또는 최신 근거 요구 |
| same-layer/parent-child/barrier conflict가 미해결 | `RELATION_CONFLICT_REVIEW` 또는 `SPATIAL_MEANING_REVIEW=FAIL` | 해결 가능 | `REVIEW_REQUIRED` | conflict를 `OPEN`으로 보존 |
| 관계 충돌이 Candidate 의미를 본질적으로 부정함 | 관련 Gate `FAIL` | 해당 version 폐기 필요 | `REJECTED` | 근거와 반려 사유 보존 |
| limitation 누락 | `LIMITATIONS_COMPLETE=FAIL` | 보완 가능 | `REVIEW_REQUIRED` | 누락을 보완하고 재검토 |
| 아직 사람이 검토하지 않음 | `HUMAN_APPROVAL=NOT_EVALUATED` | 사람 검토 필요 | `REVIEW_REQUIRED` | 자동 승인 금지 |
| 사람이 수정 후 재검토를 요청함 | `HUMAN_APPROVAL=FAIL` | 보완 가능 | `REVIEW_REQUIRED` | reviewNote에 요구사항 기록 |
| 사람이 해당 version 사용을 명시적으로 반려함 | `HUMAN_APPROVAL=FAIL` | 해당 version 폐기 필요 | `REJECTED` | 기존 record 보존 |

Gate `FAIL`만으로 결정을 자동 계산하지 않는다. 실패 원인이 보완 가능한지, 해당 Candidate version을 폐기해야 하는지 사람이 기록해야 한다. 다만 Hard Gate가 하나라도 `FAIL` 또는 `NOT_EVALUATED`이면 `APPROVED`는 불가능하다.

## 8. Approval V1 ↔ Template Hard Gate 대응표

새 Gate를 추가하지 않고 Approval V1의 기준을 Template의 9개 Hard Gate에 포함한다.

| Approval V1 기준 | Template Hard Gate | 대응 설명 |
|---|---|---|
| Identity/Hierarchy | `IDENTITY_HIERARCHY` | entity ID, type, District/parent Market 관계 |
| Provenance/Version | `CANDIDATE_VERSION_INTEGRITY` | geometry와 핵심 evidence의 source, version, CRS, 이력 |
| Immutable output | `CANDIDATE_VERSION_INTEGRITY` | 검토 version과 checksum 불변성 |
| Geometry validity | `GEOMETRY_VALIDITY` | Polygon/MultiPolygon 구조, empty, ring, self-intersection |
| Scope sanity | `GEOMETRY_VALIDITY` | 서울/District 범위 이상 탐지와 설명 여부 |
| Definition fit | `FRAMEONE_DEFINITION_FIT` | text definition, 핵심 거리, anchor와 소비동선 적합성 |
| Barrier/Connectivity | `SPATIAL_MEANING_REVIEW` | 연결축, 물리적 barrier, Source freshness와 현장 의미 |
| Reference comparison | `REFERENCE_COMPARISON` | 공식상권·행정동과 차이 및 limitation |
| Same-layer conflict | `RELATION_CONFLICT_REVIEW` | overlap, touch, sliver와 exclusive aggregation conflict |
| Parent-child review | `RELATION_CONFLICT_REVIEW` | Submarket-parent Market 관계와 승인 예외 |
| Confidence와 limitation 보존 | `LIMITATIONS_COMPLETE` | stale, coverage, conflict, 미확인, 재검토 조건 |
| Human decision | `HUMAN_APPROVAL` | reviewer, reviewedAt, reviewNote, 명시적 결정 |

9개 Gate로 기존 승인 기준을 표현할 수 있다. 현재는 새 Gate가 필요하지 않다.

## 9. E4 의미

정책상 `E4`는 **사람의 review가 완료되어 그 판단과 근거가 보존된 Evidence level**을 뜻한다. `E4`만으로 승인 여부를 뜻하지 않는다.

승인 여부는 반드시 다음 조합으로 읽는다.

| 표현 | 의미 |
|---|---|
| `evidenceLevel=E4`, `reviewStatus=APPROVED` | 사람이 검토했고 해당 Candidate version을 승인함 |
| `evidenceLevel=E4`, `reviewStatus=REVIEW_REQUIRED` | 사람이 검토했고 보완·재검토를 요구함 |
| `evidenceLevel=E4`, `reviewStatus=REJECTED` | 사람이 검토했고 해당 Candidate version 사용을 반려함 |

문서와 직원 화면에서는 설명용 문구로 `E4 reviewed`와 `E4 approved`를 구분할 수 있다. 이를 새로운 저장 enum으로 추가하지 않는다.

`E4다 = 승인됐다`는 해석을 금지한다. 실제 geometry 승격은 `E4 + APPROVED`를 포함한 모든 hard gate와 별도 승격 검증을 통과한 뒤에만 가능하다.

## 10. Evidence Cardinality Matrix

아래 분류는 role별 최소 정책이며 실제 Evidence record를 만들지 않는다.

| Evidence role | Market | Submarket | 분류 | 적용 조건 |
|---|---|---|---|---|
| `SOURCE_PROVENANCE` | 필요 | 필요 | `REQUIRED` | geometry와 핵심 evidence의 source/version/CRS/checksum 추적 |
| `FRAMEONE_DEFINITION` | 필요 | 필요 | `REQUIRED` | canonical text definition과 entity 의미 연결 |
| `CANDIDATE_GEOMETRY` | 필요 | 필요 | `REQUIRED` | immutable geometry ref, boundaryVersion, checksum, type, CRS |
| `SPATIAL_RELATION` | 필요 | 필요 | `REQUIRED` | 주요 anchor, 이동축, 주변 entity와 공간 의미 설명 |
| `REFERENCE_BOUNDARY` | 필요 | 필요 | `REQUIRED` | 공식상권과 행정동을 비교하되 FRAMEONE boundary로 대체 금지 |
| `BARRIER` | 조건부 | 조건부 | `CONDITIONAL` | 하천·철도·대형도로·시설 또는 단절 가능성이 Candidate에 영향을 줄 때 필요; 해당 없음 판단도 근거 기록 |
| `HUMAN_REVIEW` | 필요 | 필요 | `REQUIRED` | formal review decision 시 reviewer, 시각, note와 정확한 version 연결 |
| `FIELD_CHECK` | 조건부 | 조건부 | `CONDITIONAL` | stale source, 횡단 가능성, 상업 연속성, barrier가 desk evidence로 해소되지 않을 때 E4 결정 전 필요 |

생활인구, 점포·베이커리, 주거·업무시설과 기타 demand evidence는 `OPTIONAL`이다. Candidate 해석과 confidence를 보조할 수 있지만 geometry, provenance, hard gate 또는 사람 승인을 대체하지 않는다.

`REQUIRED` Evidence가 없으면 approval은 불가능하다. Preflight 필수 항목이면 `BLOCKED`, 유효한 Candidate 접수 후 보완 가능한 누락이면 `REVIEW_REQUIRED`, 제출물의 신뢰 기반을 본질적으로 훼손하면 `REJECTED`를 적용한다.

## 11. Confidence `A/B/C/D/E`

Confidence는 Evidence의 전체 일관성과 판단 신뢰 수준을 사람이 요약한 값이며 approval status나 verification status가 아니다.

| 등급 | 공통 의미 |
|---|---|
| `A` | 다수의 강하고 독립적인 근거가 일치하며 필요한 현장·사람 검토까지 일관됨 |
| `B` | 주요 근거가 충분하고 일관되나 범위·시점 등 제한적인 불확실성이 남음 |
| `C` | 실무 검토에는 사용할 수 있으나 중요한 보완사항 또는 limitation이 존재함 |
| `D` | 근거가 약하거나 중요한 충돌·누락이 커서 안정적인 판단에 사용하기 어려움 |
| `E` | provenance 또는 핵심 근거가 부족해 신뢰 가능한 판단에 사용할 수 없음 |
| `null` | 아직 사람이 confidence를 결정하지 않았거나 formal review 전임 |

규칙:

- Confidence는 자동 산식이나 정밀 점수가 아니다.
- `A`라도 Hard Gate가 `FAIL` 또는 `NOT_EVALUATED`이면 `APPROVED`가 될 수 없다.
- 낮은 Confidence를 이유로 원천 Evidence나 conflict를 삭제하지 않는다.
- `D` 또는 `E`와 `APPROVED`가 함께 제안되면 상태 불일치로 보고 결정을 확정하기 전에 사람이 원인과 Gate 결과를 재검토한다.
- Confidence 변경은 과거 review record를 덮어쓰지 않는다.

## 12. 직원 표준 검토 흐름

```text
Request
→ Preflight
→ Candidate Integrity
→ Geometry Validity
→ Definition Fit
→ Spatial / Reference / Relation Review
→ Limitations
→ Human Review
→ Decision
```

1. Request가 실제 건인지 SAMPLE인지 구분하고 entity 목적을 확인한다.
2. Preflight에서 identity, geometry 존재, version, checksum, CRS, provenance와 최소 Evidence를 확인한다.
3. `BLOCKED` 또는 `REJECTED`이면 formal Review Artifact를 만들지 않고 `stopReason`을 남긴 뒤 중단한다.
4. `ELIGIBLE`인 Candidate만 9개 Hard Gate 검토에 진입한다.
5. Candidate integrity 또는 geometry validity에서 해당 version을 사용할 수 없는 실패가 나오면 후속 Gate를 `NOT_EVALUATED`로 남기고 중단한다.
6. Definition, spatial meaning, reference와 relation conflict를 순서대로 검토한다.
7. 보완 가능한 누락이나 conflict는 `REVIEW_REQUIRED`, 본질적 불일치는 `REJECTED`로 구분한다.
8. 모든 limitation, freshness, coverage, field-check 필요사항을 기록한다.
9. 책임자가 정확한 boundaryVersion/checksum과 모든 Gate 결과를 확인한다.
10. 모든 Gate가 `PASS`이고 blocking conflict가 없을 때만 사람이 `APPROVED`를 결정할 수 있다.

중단된 이후의 Gate는 추정해서 채우지 않는다. `NOT_EVALUATED`와 선행 Gate의 `stopReason`을 보존한다.

## 13. 대표적인 실패사례

| 사례 | 올바른 처리 | 금지 처리 |
|---|---|---|
| geometry가 없음 | `preflightStatus=BLOCKED`; formal E3/reviewStatus 없음 | `REVIEW_REQUIRED` Candidate로 가장 |
| geometry ref 또는 checksum이 누락됐지만 보완 가능 | Preflight `BLOCKED`, 누락과 next action 기록 | 빈 값으로 E3 접수 |
| 제출 geometry provenance가 허위·검증 불가 | Preflight `REJECTED` 또는 formal review 중 확인 시 `REJECTED` | limitation으로만 낮춰 승인 |
| invalid geometry | `GEOMETRY_VALIDITY=FAIL`, `reviewStatus=REJECTED`, 새 version 요구 | 자동 수정 후 같은 version 유지 |
| Evidence 부족 또는 stale source | 유효 Candidate이면 관련 Gate `FAIL`, `REVIEW_REQUIRED` | `NEEDS_REVIEW`만 붙이고 승인 |
| FRAMEONE 정의와 본질적 불일치 | `FRAMEONE_DEFINITION_FIT=FAIL`, `REJECTED` | 높은 demand/confidence로 상쇄 |
| overlap 또는 parent-child conflict 미해결 | 관련 Gate `FAIL`, 보완 가능하면 `REVIEW_REQUIRED` | 정상 overlap으로 자동 처리 |
| 선행 Gate에서 검토 중단 | 후속 Gate `NOT_EVALUATED`와 stopReason 기록 | 후속 Gate를 일괄 `FAIL` 또는 `PASS` 처리 |
| 사람이 아직 결정하지 않음 | `HUMAN_APPROVAL=NOT_EVALUATED`, `REVIEW_REQUIRED` | AI/System이 `APPROVED` 부여 |

## 14. Pilot 진입 Gate

`Pilot Boundary Evidence Package V1` 진입 전 다음을 모두 확인한다.

1. status scope 구분이 Approval V1과 Template에 동일하게 반영됨
2. Preflight 결과와 중단 규칙이 문서 간 일치함
3. Gate 상태가 `PASS | FAIL | NOT_EVALUATED`로 일치함
4. Gate-to-decision matrix가 직원 체크리스트와 일치함
5. E4가 human-reviewed level이며 approval은 별도 reviewStatus라는 의미가 일치함
6. Evidence cardinality가 기존 Evidence 역할과 충돌하지 않음
7. Confidence `A/B/C/D/E` 의미가 문서 간 일치함
8. 실제 geometry, E3/E4 approval과 aggregation이 계속 `BLOCKED`로 유지됨

현재는 3번과 관련해 기존 Review Artifact Template이 Gate 상태로 `REVIEW_REQUIRED | NOT_APPLICABLE`을 사용한다. 본 정책은 `REVIEW_REQUIRED`를 reviewStatus로만 사용하고 필수 Hard Gate의 미평가를 `NOT_EVALUATED`로 정의한다. 기존 Template을 수정하지 않은 현재 상태에서는 문서 간 표현이 완전히 일치하지 않는다.

따라서 현재 결론은 **`NEEDS_POLICY_REVIEW`**다. 후속 정합성 수정이 완료되고 위 8개 조건이 모두 확인된 뒤에만 **`POLICY_READY_FOR_PILOT`**로 변경할 수 있다.

```text
POLICY_READY_FOR_PILOT
≠ geometry READY
≠ E3 APPROVED
≠ aggregation READY
```

## 15. 금지사항

- 실제 Market/Submarket Polygon 또는 Node 좌표 생성
- 실제 E3 Candidate 또는 Review Artifact 생성
- 실제 E4 승인 또는 자동 승인
- `draft/candidate`를 `validated/verified_geometry`로 승격
- active boundary pointer 생성·변경
- 공식상권·행정동 Polygon을 FRAMEONE boundary로 복사
- Grid-to-Market/Submarket Crosswalk 생성·게시
- Market/Submarket 생활인구 집계
- geometry 기반 candidate-store decision integration
- UI, API, DB, schema 또는 TypeScript type 구현
- 신규 library 추가
- 기존 Approval V1, Review Artifact Template 또는 `CURRENT_STATUS.md` 수정
- 현재 geometry-dependent `BLOCKED` 상태 해제
