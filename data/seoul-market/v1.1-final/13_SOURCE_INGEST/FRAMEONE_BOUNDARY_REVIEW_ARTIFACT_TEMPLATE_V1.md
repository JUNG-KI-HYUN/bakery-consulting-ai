# E3/E4 Boundary Review Artifact Template V1

검토일: 2026-09-11

기준 branch: `codex-night-20260901`

기준 Repository HEAD: `b730808 docs: define frameone boundary evidence approval`

## 1. 목적과 판정

이 문서는 FRAMEONE Market/Submarket E3 Candidate Boundary를 사람이 검토하고 E4 evidence를 남기기 위한 최소 Review Artifact, Hard Gate, 결정 규칙과 version 관리 기준을 정의한다.

**템플릿 설계 판정: `READY`**

문서 템플릿은 서울 전역에 공통 적용할 수 있다. 실제 Market/Submarket geometry 0, Node 좌표 0이며 실제 Boundary 승인과 생활인구 집계는 계속 `BLOCKED`다.

이번 작업에서는 다음을 하지 않는다.

- 실제 Market/Submarket Boundary 또는 Node 좌표 생성
- 실제 entity 검토·승인
- JSON Schema, 코드, DB, UI, API, active pointer 구현
- Grid Crosswalk 또는 생활인구 집계

## 2. 기존 상태와 Review Artifact의 관계

Review Artifact는 상태를 섞지 않고 다음을 따로 기록한다.

| 축 | Candidate 입력 | 사람 검토 | 승인 후 별도 승격 결과 |
|---|---|---|---|
| Geometry | `geometryStatus=draft` | 변경하지 않음 | `validated` |
| 공간 검증 | `verificationStatus=candidate` | 변경하지 않음 | `verified_geometry` |
| Evidence level | Candidate 근거 `E3` | 완료된 Human Review evidence `E4` | 승인 artifact를 provenance로 연결 |
| Review decision | 검토 전 없음 | `APPROVED`, `REVIEW_REQUIRED`, `REJECTED` | `APPROVED`만 승격 후보 |

`APPROVED` Review Artifact가 geometry를 직접 수정하지 않는다. 별도 승격/게시 단계가 승인된 정확한 `boundaryVersion`과 checksum을 확인한 뒤 상태를 변경해야 한다.

## 3. Review Artifact 최소 필드

프로그램 내부 convention에 맞춰 camelCase를 사용한다. 아래는 문서상 계약이며 실제 schema를 구현하지 않는다.

| 필드 | 필수 시점 | 목적 |
|---|---|---|
| `artifactKind` | 항상 | 다른 artifact와 구분하는 고정 의미 |
| `artifactVersion` | 항상 | Review Artifact 구조 버전 |
| `reviewArtifactId` | 항상 | review record의 불변 식별자 |
| `entity.entityType` | 항상 | `MARKET` 또는 `SUBMARKET` |
| `entity.entityId` | 항상 | canonical hierarchy ID |
| `entity.parentEntityId` | 항상 | Market은 District ID, Submarket은 Market ID |
| `candidateBoundary.boundaryVersion` | 항상 | 검토 대상 Boundary 버전 |
| `candidateBoundary.geometryRef` | 항상 | 대용량 geometry를 복사하지 않는 immutable reference |
| `candidateBoundary.geometryChecksum` | 항상 | 같은 ref가 바뀌지 않았음을 확인하는 checksum |
| `candidateBoundary.geometryType` | 항상 | `Polygon` 또는 `MultiPolygon` |
| `candidateBoundary.crs` | 항상 | 검토 대상 geometry CRS |
| `candidateState.geometryStatus` | 항상 | E3 입력은 `draft` |
| `candidateState.verificationStatus` | 항상 | E3 입력은 `candidate` |
| `candidateState.evidenceLevel` | 항상 | E3 입력은 `E3` |
| `evidenceRefs` | 항상 | source/evidence를 복사하지 않고 참조 |
| `gateResults` | 항상 | 각 Hard Gate의 판정과 근거 |
| `conflicts` | 항상 | 없으면 빈 배열; 충돌 유형·상태·처리근거 |
| `limitations` | 항상 | freshness, coverage, 미확인과 사용 제한 |
| `review.reviewStatus` | 검토 완료 시 | 사람의 최종 결정 |
| `review.evidenceLevel` | 검토 완료 시 | 완료된 사람 검토는 `E4` |
| `review.reviewer` | 검토 완료 시 | 책임 있는 사람 식별자 |
| `review.reviewedAt` | 검토 완료 시 | ISO 8601 검토 시각 |
| `review.reviewNote` | 검토 완료 시 | 승인·보류·반려 이유 |
| `review.confidence` | 검토 완료 시 | 기존 `A/B/C/D/E` convention 또는 `null` |

### 3.1 제외하거나 합친 후보 필드

- `sourceSnapshots`: 별도 배열로 두지 않는다. 각 `evidenceRefs`에 `sourceId`, `snapshotId`, `artifactRef`를 저장해 중복을 막는다.
- 최상위 `crs`: `candidateBoundary.crs`로 묶어 어느 geometry의 CRS인지 명확히 한다.
- 별도 `sourceSummary`: evidence 원문을 다시 요약·복사하지 않는다. 사람 판단은 `reviewNote`, Source limitation은 `evidenceRefs` 또는 `limitations`에 둔다.
- geometry 본문: artifact에 넣지 않는다. `geometryRef + geometryChecksum + boundaryVersion`만 보존한다.
- `approvedAt`: `reviewedAt`과 의미가 중복된다. 활성화 시각은 향후 active pointer의 `activatedAt`으로 분리한다.

`reviewArtifactId`와 `geometryChecksum`은 후보 목록에 없었지만, 어떤 review record가 어떤 정확한 geometry를 승인했는지 재현하기 위해 최소 필드에 추가한다.

## 4. reviewStatus

Boundary review 전용 구현 convention은 아직 없으므로 직전 Approval V1에서 제안한 최소 세 상태를 사용한다. Geometry status, 일반 Evidence `VerificationStatus`, Source/runtime health와 혼용하지 않는다.

### `APPROVED`

- 모든 필수 Hard Gate가 `PASS`다.
- 승인 차단 conflict가 없다.
- 사람이 정확한 boundaryVersion/checksum을 명시적으로 승인했다.
- E4 evidence가 완성됐다.
- 별도 승격 단계에서만 `validated + verified_geometry`로 전환할 수 있다.

### `REVIEW_REQUIRED`

- Candidate를 즉시 폐기할 정도는 아니지만 추가 evidence, 수정, 최신 Source 또는 현장 확인이 필요하다.
- geometry는 `draft`, 검증 표현은 `candidate`로 유지한다.
- 미해결 항목과 다음 확인사항을 `gateResults`, `conflicts`, `reviewNote`에 남긴다.

### `REJECTED`

- 제출된 Candidate Boundary를 해당 버전 그대로 사용할 수 없다.
- 예: geometry invalid, 금지된 자동생성 방식, FRAMEONE 정의와 본질적 불일치, provenance 부재.
- record와 candidate version은 삭제하지 않는다. 수정안은 새 boundaryVersion과 새 Review Artifact로 검토한다.

## 5. Hard Gate Checklist

Gate 판정은 문서상 `PASS | FAIL | REVIEW_REQUIRED | NOT_APPLICABLE`을 사용한다. `NOT_APPLICABLE`에는 이유가 필요하며, 필수 Gate를 편의상 생략하는 값으로 사용하지 않는다.

| Gate ID | GIS/Data 확인 | 직원이 확인할 실무 질문 | 승인 조건 |
|---|---|---|---|
| `IDENTITY_HIERARCHY` | entityId/type/parent가 canonical hierarchy와 일치 | 검토 대상 상권과 상위 권역이 맞는가 | `PASS` |
| `CANDIDATE_VERSION_INTEGRITY` | boundaryVersion, geometryRef, checksum, CRS, provenance 존재 | 어느 버전의 지도를 검토했는지 다시 찾을 수 있는가 | `PASS` |
| `GEOMETRY_VALIDITY` | Polygon/MultiPolygon, non-empty, ring/self-intersection 및 좌표 유효 | 지도가 깨지거나 비정상 모양이 아닌가 | `PASS` |
| `FRAMEONE_DEFINITION_FIT` | text definition ref와 candidate 범위 비교 | 상권 이름·핵심 거리·앵커가 실제 범위와 맞는가 | `PASS` |
| `SPATIAL_MEANING_REVIEW` | 주요 anchor, 이동축, barrier evidence와 freshness 검토 | 고객동선과 실제 단절이 경계에 반영됐는가 | `PASS` |
| `REFERENCE_COMPARISON` | 공식상권·행정동 reference와 차이 기록 | 공식 경계와 다르다면 FRAMEONE 정의상 이유를 설명할 수 있는가 | `PASS` |
| `RELATION_CONFLICT_REVIEW` | 같은 계층 overlap과 parent-child 관계 검토 | 인접 상권과 과도하게 겹치거나 부모 범위를 설명 없이 벗어나지 않는가 | `PASS` |
| `LIMITATIONS_COMPLETE` | stale, coverage, 미확인, 현장확인 필요사항 기록 | 아직 모르는 부분과 사용 제한이 빠짐없이 적혔는가 | `PASS` |
| `HUMAN_APPROVAL` | reviewer, reviewedAt, reviewNote와 명시적 결정 존재 | 책임자가 이 정확한 버전을 승인했는가 | `PASS` 및 `reviewStatus=APPROVED` |

### 5.1 항목 통합 이유

- Entity identity와 Parent hierarchy는 하나의 hierarchy integrity Gate로 합쳤다.
- Candidate version, CRS, provenance는 같은 검토대상의 재현성을 증명하므로 하나의 integrity Gate로 합쳤다.
- 주요 anchor, 동선, barrier는 모두 실제 상권 의미를 설명하는 공간 검토이므로 하나로 합쳤다. 개별 evidence는 `evidenceRefs`로 남긴다.
- 공식상권과 행정동은 모두 `REFERENCE_BOUNDARY`이며 둘 다 같은 comparison Gate에서 필수 확인한다.
- 동일 계층 overlap과 parent-child는 entity 간 공간관계 QA이므로 하나의 Gate로 합쳤다.

항목을 합쳤어도 원래 검토내용을 생략한 것은 아니다.

## 6. Soft Evidence

Soft Evidence는 Candidate 해석과 confidence에 도움을 주지만 Hard Gate를 대체하지 않는다.

| Soft Evidence | 사용 목적 | 금지 해석 |
|---|---|---|
| 생활인구 분포 | 시간대 수요 차이·coverage 참고 | 고인구 Grid 외곽선을 Boundary로 자동 채택 |
| 상가업소·베이커리·경쟁점 | 상업 연속성·업종 집적 참고 | 점포 hull 또는 밀도를 경계로 확정 |
| 아파트·주거 배후 | 주거형 수요와 접근축 참고 | 단지 경계를 Market 경계로 대체 |
| 업무·상업시설 | 앵커·시간대 수요 참고 | 시설 부지/radius를 Boundary로 대체 |
| 지하철 이용 | 역세권 규모와 시간대 이동 참고 | 이용량으로 고정 역세권 반경 생성 |
| 버스정류장·승하차 | 접근축과 환승 보조 | 정류장 buffer를 Boundary로 사용 |
| 기타 수요지표 | Candidate 비교·limitation 보완 | 수치가 높다는 이유로 geometry QA 또는 사람 승인 생략 |

Soft Evidence의 양이나 긍정 점수는 `GEOMETRY_VALIDITY`, `IDENTITY_HIERARCHY`, unresolved conflict 같은 Hard Gate 실패를 상쇄하지 않는다.

현재 연결되지 않은 Source는 `evidenceRefs`에 존재하는 것처럼 작성하지 않는다.

## 7. Confidence 규칙

Repository의 `DATA_SCHEMA.md`에는 `confidence = A/B/C/D/E` convention이 있다. 따라서 `HIGH/MEDIUM/LOW`를 새로 만들지 않는다.

- 값은 `A | B | C | D | E | null`만 사용한다.
- 기존 문서에 각 등급의 Boundary-specific 의미가 정의돼 있지 않으므로 이 템플릿에서 임의 의미나 자동 산식을 만들지 않는다.
- 검토 전 또는 근거 부족 시 `null`을 허용하며 임의로 D/E를 넣지 않는다.
- 검토 완료 시 사람은 기존 convention에 따라 confidence를 기록한다.
- confidence는 reviewStatus와 독립이다.
- 어떤 confidence도 자동 승인이나 Hard Gate 우회를 허용하지 않는다.
- `APPROVED`라도 limitation과 재검토 필요시점은 별도로 보존한다.

Boundary-specific A/B/C/D/E 의미가 필요하면 별도 policy 결정을 먼저 해야 한다.

## 8. Version 관리

### 8.1 서로 다른 세 버전

- `artifactVersion`: Review Artifact 구조 버전
- `boundaryVersion`: Candidate/Verified geometry 내용 버전
- `reviewArtifactId`: 특정 사람 검토 기록의 불변 ID

세 값을 하나의 `version`으로 합치지 않는다.

### 8.2 변경 규칙

1. Candidate v1을 검토하면 v1 전용 Review Artifact를 만든다.
2. 검토 완료 artifact는 수정하지 않는다.
3. 경계 좌표, ring, 포함범위, CRS 또는 checksum이 바뀌면 v2 Candidate다.
4. 주요 evidence 교체로 판단근거가 달라져도 새 Review Artifact를 만든다.
5. v2가 승인돼도 v1 geometry, 승인 artifact와 당시 limitation을 보존한다.
6. `REVIEW_REQUIRED` 또는 `REJECTED` 수정안은 기존 record를 덮어쓰지 않고 새 boundaryVersion으로 제출한다.
7. artifact 오타 정정도 승인 의미가 바뀔 수 있으면 새 artifact로 남긴다.

### 8.3 Active Boundary 제안

향후 active pointer는 review artifact와 분리해 최소한 다음만 가리키는 구조가 적합하다.

- `entityType`, `entityId`
- `activeBoundaryVersion`
- `approvedReviewArtifactId`
- `activatedAt`

`APPROVED`는 active 전환 자격이며 자동 활성화를 뜻하지 않는다. 이번 작업에서는 pointer를 구현하거나 생성하지 않는다.

## 9. Evidence Reference 규칙

`evidenceRefs`는 원문, geometry, 대용량 Source data를 복사하지 않는다. 각 항목의 최소 구조:

| 필드 | 목적 |
|---|---|
| `evidenceId` | artifact 내부·외부에서 근거를 식별 |
| `role` | `REFERENCE_BOUNDARY`, `SPATIAL_EVIDENCE`, `DEMAND_EVIDENCE`, `BARRIER_EVIDENCE`, `HUMAN_REVIEW_EVIDENCE` 등 |
| `sourceType` | 기존 `DOCUMENT`, `FIELD_CHECK`, `PHOTO`, `PUBLIC_DATA`, `SYSTEM_CALCULATION` 등 |
| `sourceId` | Source Registry 또는 FRAMEONE 내부 Source 식별자 |
| `snapshotId` | snapshot Source인 경우의 불변 ID; 해당 없으면 `null` |
| `artifactRef` | 원문·E1/E2·field record·comparison artifact 위치 |
| `verificationStatus` | 기존 Evidence 상태 |
| `limitation` | 해당 근거의 freshness·범위·의미 제한 |

좌표·Source row·공식 Polygon 전체를 review artifact 안에 중복 저장하지 않는다.

## 10. Conflict 처리

Conflict type은 문서상 후보이며 enum을 구현하지 않는다.

| Conflict type | 의미 | 기본 처리 |
|---|---|---|
| `SAME_LAYER_OVERLAP` | Market↔Market 또는 Submarket↔Submarket overlap 의도 불명 | 해결 전 `REVIEW_REQUIRED` |
| `PARENT_CHILD_MISMATCH` | Submarket이 부모 Market과 설명되지 않는 관계 | 해결 또는 승인 예외 전 `REVIEW_REQUIRED` |
| `BARRIER_CONFLICT` | Candidate가 실제 단절 또는 횡단 evidence와 충돌 | 현장/최신 evidence 요구 |
| `DEFINITION_CONFLICT` | FRAMEONE text definition·anchor·상권 의미와 경계 불일치 | 본질적이면 `REJECTED` |
| `SOURCE_STALE` | 핵심 근거가 오래됐고 현재성을 확인하지 못함 | 유일 근거면 `REVIEW_REQUIRED`; 삭제하지 않고 limitation 보존 |
| `GEOMETRY_INVALID` | self-intersection, empty, ring/좌표 오류 등 | 해당 Candidate version `REJECTED` |

각 conflict에는 최소한 다음이 필요하다.

- `type`
- `status`: `OPEN | RESOLVED | ACCEPTED_WITH_REASON | REJECTED` 문서상 후보
- `relatedEntityIds`
- `evidenceRefs`
- `resolutionNote`

Approval 조건:

- `OPEN` 또는 `REJECTED` conflict 0
- `ACCEPTED_WITH_REASON`은 Hard Gate 실패가 아닌 설명 가능한 limitation에만 허용
- geometry invalid, identity mismatch, provenance 부재를 accepted limitation으로 바꾸지 않음

## 11. Approval 규칙

다음 식을 모두 만족해야 E4 승인으로 처리한다.

```text
모든 필수 Hard Gate = PASS
AND 승인 차단 conflict = 0
AND human reviewStatus = APPROVED
AND reviewer/reviewedAt/reviewNote 존재
AND 검토한 boundaryVersion/checksum 일치
```

추가 규칙:

- Soft Evidence와 confidence는 Hard Gate 실패를 상쇄하지 않는다.
- AI/System은 `HUMAN_APPROVAL`을 PASS로 만들거나 `APPROVED`를 부여할 수 없다.
- `REVIEW_REQUIRED`는 실패를 숨기는 임시 승인 상태가 아니다.
- `REJECTED`는 기록 삭제가 아니라 해당 Candidate version 사용 금지다.
- 승인 후 geometry가 달라지면 기존 승인은 새 geometry에 적용되지 않는다.

## 12. 최소 JSON Example

아래는 schema가 아닌 **SAMPLE**이다. 실제 entity, reviewer, geometry 또는 승인을 나타내지 않는다. `<...>` 값은 실제 작성 시 검증된 값으로 교체해야 한다.

```json
{
  "sample": true,
  "artifactKind": "FRAMEONE_BOUNDARY_REVIEW",
  "artifactVersion": "1.0.0",
  "reviewArtifactId": "<immutable-review-artifact-id>",
  "entity": {
    "entityType": "SUBMARKET",
    "entityId": "<canonical-submarket-id>",
    "parentEntityId": "<canonical-market-id>"
  },
  "candidateBoundary": {
    "boundaryVersion": "<candidate-boundary-version>",
    "geometryRef": "<immutable-geometry-reference>",
    "geometryChecksum": "sha256:<verified-checksum>",
    "geometryType": "Polygon",
    "crs": "EPSG:4326"
  },
  "candidateState": {
    "geometryStatus": "draft",
    "verificationStatus": "candidate",
    "evidenceLevel": "E3"
  },
  "evidenceRefs": [
    {
      "evidenceId": "<evidence-id>",
      "role": "SPATIAL_EVIDENCE",
      "sourceType": "DOCUMENT",
      "sourceId": "<source-id>",
      "snapshotId": null,
      "artifactRef": "<evidence-reference>",
      "verificationStatus": "VERIFIED",
      "limitation": "<evidence-limitation>"
    }
  ],
  "gateResults": [
    {
      "gateId": "IDENTITY_HIERARCHY",
      "status": "PASS",
      "evidenceRefs": ["<evidence-id>"],
      "note": "<review-basis>"
    }
  ],
  "conflicts": [],
  "limitations": ["<known-limitation>"],
  "review": {
    "reviewStatus": "APPROVED",
    "evidenceLevel": "E4",
    "reviewer": "<human-reviewer-id>",
    "reviewedAt": "<ISO-8601-timestamp>",
    "reviewNote": "<explicit-approval-reason>",
    "confidence": "<A-B-C-D-or-E>"
  }
}
```

실제 `APPROVED` artifact에는 예시처럼 Gate 하나만 두지 않고 9개 필수 Gate가 모두 있어야 한다.

## 13. Reviewer Checklist

### A. GIS / Data QA

- [ ] Entity ID, type과 parent가 canonical hierarchy와 일치한다.
- [ ] Boundary version, geometry ref, checksum과 CRS를 확인했다.
- [ ] Polygon/MultiPolygon validity와 서울 범위 이상 여부를 확인했다.
- [ ] 사용한 Source·snapshot·artifact를 다시 찾을 수 있다.
- [ ] 공식상권과 행정동 reference 차이를 확인했다.
- [ ] 같은 계층 overlap과 parent-child 관계를 확인했다.
- [ ] stale, conflict, coverage와 limitation을 모두 기록했다.

### B. 현장 / 상권 의미 QA

- [ ] 상권 이름과 실제 범위가 맞다.
- [ ] 핵심 거리·역·앵커와 주요 고객동선이 반영됐다.
- [ ] 대형도로·철도·하천·대형시설의 실제 단절 또는 연결을 확인했다.
- [ ] 인접 상권과 겹치는 부분의 의도와 처리방법이 설명된다.
- [ ] 공식상권·행정동과 다른 이유를 설명할 수 있다.
- [ ] 현장 확인이 필요한 사항이 남아 있는지 확인했다.
- [ ] 이 정확한 boundaryVersion/checksum을 승인·보류·반려한다.
- [ ] reviewer, reviewedAt, reviewNote와 confidence를 기록했다.

## 14. Market/Submarket 공통 적용

하나의 artifact 구조를 Market과 Submarket에 공통 사용한다.

- `entityType`만 `MARKET` 또는 `SUBMARKET`으로 구분한다.
- Market의 `parentEntityId`는 District, Submarket은 parent Market을 가리킨다.
- 9개 Hard Gate는 공통이다.
- Submarket은 `RELATION_CONFLICT_REVIEW`에서 parent Market 관계를 반드시 검토한다.
- Market도 같은 계층 overlap과 District scope를 검토한다.
- Submarket gap이나 `union(Submarkets) != Market`은 자동 실패가 아니다.
- 성수/성동 전용 필드, 반경, reviewer 규칙을 만들지 않는다.
- Pilot approval은 다른 entity 또는 서울 전체를 자동 승인하지 않는다.

## 15. 다음 단계로 넘기는 정보

승인된 artifact는 향후 별도 승격 단계에 다음만 제공한다.

- entity identity
- approved boundaryVersion/geometryRef/checksum/CRS
- E4 Review Artifact ID
- 모든 Hard Gate 결과
- conflicts와 limitations
- reviewer decision

승격 단계는 이 정보를 다시 검증해야 하며, 이 문서가 active pointer나 geometry 상태를 직접 바꾸지 않는다.

## 16. 다음 한 단계

**이 문서의 SAMPLE을 실제 schema로 구현하지 않은 채, 공통 Gate 문구와 직원 체크 순서를 한 번의 비공간 dry-run으로 검토한다.**

Dry-run에는 실제 Polygon, 실제 entity 승인, E2 확대 또는 생활인구 집계를 사용하지 않는다.
