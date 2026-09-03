<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


# FRAMEONE PROJECT RULES

이 프로젝트는 FRAMEONE의 실제 베이커리 점포개발·상권분석·창업지원 업무에 사용하는 프로그램이다.

AI 개발도구(Codex, Cursor 등)는 이 문서의 규칙을 우선 적용한다.

작업 속도보다 기존 데이터와 기능의 안전성이 우선이다.

---

# 1. 작업 시작 전 확인

모든 작업에서 먼저 다음을 확인한다.

1. `git status -sb`
2. 현재 branch
3. 최신 commit
4. 이번 작업과 직접 관련된 기존 코드
5. 이번 작업과 직접 관련된 데이터 구조
6. 보호해야 할 파일 또는 기존 uncommitted changes

다음 문서는 작업과 관련될 때만 확인한다.

- `CURRENT_STATUS.md`
  - 현재 구현 상태
  - 완료 기능
  - 현재 개발 우선순위
  - 이번 작업과 충돌 가능성이 있는 경우 확인

- `COMPANY_STRUCTURE.md`
  - 회사 구조
  - 계약주체
  - 결제주체
  - 개인정보처리자
  - 데이터소유권
  - 사업자명
  - 법인/개인사업자 관계와 관련된 작업에서 확인

단순 UI 수정, 작은 버그 수정, 이미 범위가 명확한 기능 작업에서는
관련 없는 문서를 반복해서 읽지 않는다.

사용자가 기존에 수정한 파일을 임의로 다음 방식으로 변경하지 않는다.

- reset
- restore
- checkout
- overwrite
- delete

다음 Git 명령도 사용자가 명시적으로 요청하지 않는 한 실행하지 않는다.

- `git reset`
- `git restore`
- `git checkout -- <file>`
- `git clean`
- `git rebase`
- force push

불확실하면 기존 변경사항을 보존하고 확인 필요사항으로 보고한다.

---

# 2. 기존 구조 우선

새 기능을 만들기 전에 이번 작업과 직접 관련된 기존 기능과 코드를 먼저 확인한다.

가능하면 기존:

- Component
- Utility
- Type
- API
- Database schema
- Service
- Design pattern
- 계산 함수
- 화면 상태
- 기존 route

를 재사용한다.

새 기능을 만들기 위해 기존 동작을 불필요하게 다시 작성하지 않는다.

사용자가 요청하지 않은 대규모 refactor를 하지 않는다.

현재 정상 동작하는 기능을 유지하면서 최소 범위로 확장한다.

---

# 3. 데이터 관련 절대규칙

다음을 실제 데이터처럼 임의로 생성하지 않는다.

- 가짜 API
- 존재하지 않는 API endpoint
- 존재하지 않는 API 필드
- 가짜 공식 상권
- 가짜 행정구역
- 가짜 매출
- 가짜 점포
- 가짜 좌표
- 가짜 geometry
- 가짜 고객정보
- 가짜 인허가 상태
- 가짜 법률 판단
- 검증되지 않은 자동 매칭
- 검증되지 않은 시설 가능 여부

테스트 데이터가 필요한 경우 반드시:

- mock
- fixture
- sample
- demo

중 하나임을 명확하게 표시하고 실제 데이터와 분리한다.

UNKNOWN 또는 미확인 값을 임의로 0으로 변환하지 않는다.

UNKNOWN 또는 미확인을 자동으로 “문제없음” 또는 “가능”으로 처리하지 않는다.

---

# 4. 데이터 의미·상태·출처 구분

데이터의 의미, 검증상태, 출처를 혼동하지 않는다.

예:

## 값의 의미

- `actual`
- `estimated`

## 검증상태

- `VERIFIED`
- `ESTIMATED`
- `UNKNOWN`
- `CONFLICTED`
- `STALE`

## 출처

- `PUBLIC_DATA`
- `FIELD_CHECK`
- `PHOTO`
- `DOCUMENT`
- `CUSTOMER_INPUT`
- `OWNER_STATEMENT`
- `TENANT_STATEMENT`
- `EXPERT_STATEMENT`
- `SYSTEM_CALCULATION`

서로 다른 개념을 하나의 enum 또는 하나의 상태값으로 억지로 합치지 않는다.

예를 들어 `OWNER_STATEMENT`는 출처이지 `VERIFIED` 상태가 아니다.

공식기관에서 제공한 추정값은
“공식 출처로 확인된 추정값”일 수 있지만
실제값으로 변경해서 표현하지 않는다.

추정매출을 실제매출처럼 표시하지 않는다.

---

# 5. FRAMEONE 상권 데이터 원칙

FRAMEONE 자체:

- Market
- Submarket
- Node

와 정부 또는 서울시 공식 상권 데이터는 서로 다른 데이터 체계이다.

이를 자동으로 동일한 상권이라고 확정하지 않는다.

`candidate`, `manual_review` 상태의 데이터를
임의로 `confirmed` 상태로 변경하지 않는다.

FRAMEONE 데이터에 검증되지 않은 좌표나 geometry를 생성하지 않는다.

공식상권과 FRAMEONE 주요상권의 관계는
검토 후보와 확정 관계를 구분한다.

공식상권 총 추정매출을 후보점포 300m 실제매출이나
개별 점포 예상매출처럼 재표현하지 않는다.

---

# 6. 고객정보 및 개인정보

실제 고객정보를 다음 위치에 임의로 넣지 않는다.

- 공개 GitHub
- 테스트 fixture
- console log
- demo 데이터
- screenshot
- documentation example

개인정보는 필요한 최소 범위만 사용한다.

더성수, FRAMEONE, 텍스솔루션의 데이터를
사용권한 확인 없이 결합하지 않는다.

실제 고객 데이터는 테스트 목적의 sample로 재사용하지 않는다.

민감한 정보는 로그에 출력하지 않는다.

---

# 7. Database 변경

Database schema 변경은 특히 보수적으로 한다.

DB 또는 저장구조를 변경하기 전에 다음을 확인한다.

1. 현재 schema
2. 기존 migration
3. 실제 데이터 영향
4. 기존 API 영향
5. UI 영향
6. backward compatibility
7. 과거 데이터 재현 가능성

destructive migration을 임의로 실행하지 않는다.

production 데이터를 삭제하거나 초기화하지 않는다.

기존 record를 한 번에 강제 migration하지 않는다.

새 필드는 가능하면 처음에는 optional로 추가한다.

과거 계산결과, 판정, 리포트, 조사이력을 최신 값으로 조용히 덮어쓰지 않는다.

중요한 변경은 다음 구조를 우선한다.

- snapshot
- version
- history
- survey round
- source record

---

# 8. 기능 우선 판단 기준

새 기능은 다음 순서로 우선 판단한다.

1. 고객의 계약 전 금전 손실을 줄이는가
2. 실제 점포 계약 판단에 필요한가
3. 직원의 업무시간을 줄이는가
4. 데이터 정확도와 재사용성을 높이는가
5. 반복업무를 안전하게 자동화하는가
6. 향후 확장성에 도움이 되는가

현재 공식 개발 P0 / P1 / P2 / P3 우선순위는
`CURRENT_STATUS.md`와 해당 Roadmap 문서를 따른다.

멋있어 보이는 기능, 화려한 Dashboard, SaaS 확장보다
현재 FRAMEONE 실무 활용성을 우선한다.

---

# 9. 변경범위

이번 요청에 필요한 최소 범위만 변경한다.

다음은 명시적인 이유 없이 하지 않는다.

- 전체 UI 재작성
- 전체 DB 재설계
- 대규모 파일 이동
- dependency 대량 변경
- 기존 데이터 재생성
- 기존 ID 변경
- 기존 taxonomy 변경
- 기존 API contract 전체 교체
- 기존 계산식 전체 교체
- unrelated file 수정

가능하면 한 번의 Codex 작업은 하나의 기능 단위로 제한한다.

여러 Engine 또는 서로 다른 기능을 한 작업에서 동시에 구현하지 않는다.

---

# 10. 계산·판정 로직 변경

기존 계산식·API·판정 로직은 즉시 교체하지 않는다.

새로운 버전은 기존 버전과 병행 구현하고 충분히 검증한 뒤 전환한다.

예:

- Risk V2를 삭제하지 않고 Risk V3를 shadow 방식으로 비교
- 기존 BEP 계산을 유지하면서 Finance V2 별도 구현
- 기존 report 판정을 바로 바꾸지 않고 비교 후 전환

CRITICAL 위험은 상권점수나 다른 긍정요소로 상쇄하지 않는다.

점수 합계보다 Hard Risk gate를 우선한다.

판정 결과에는 가능한 경우 다음을 연결한다.

- rule version
- input snapshot
- generatedAt
- evidence
- source
- limitation

---

# 11. AI 사용 원칙

AI는 원본 데이터 생성자가 아니다.

AI는 다음 용도로 사용한다.

- 요약
- 비교
- 변화 정리
- 리포트 문장 생성
- 확인 질문 생성
- 구조화
- 설명

AI가 임의로 다음을 생성하거나 확정하지 않는다.

- 숫자
- 실제매출
- 예상매출
- 법률판단
- 세무판단
- 인허가 가능 여부
- 시설 가능 여부
- 공사 견적
- 장비 적합성 최종판단
- 창업 성공 가능성
- 생존확률

AI는 검증된 데이터, 계산결과, rule fact를 기반으로 설명한다.

AI가 생성한 숫자는 source fact에 존재해야 한다.

근거가 없으면 `확인 필요`, `자료 부족`, `미확인`으로 남긴다.

---

# 12. 외부 API 및 공공데이터

외부 API는 가능한 한 server-side adapter를 통해 사용한다.

API Key, Secret, Token을 client bundle 또는 화면에 노출하지 않는다.

공공데이터를 사용할 때는 가능한 경우 다음 정보를 함께 관리한다.

- `source`
- `sourceUrl`
- `asOf`
- `fetchedAt`
- actual / estimated 여부
- `limitation`
- `schemaVersion`
- `qualityFlags`

공공데이터 원천값과 정규화값, 계산값을 분리한다.

공식 API가 확인되지 않은 서비스를 추정 endpoint로 연결하지 않는다.

공식 화면에 보이는 값이 있다고 해서
공개 API가 존재한다고 가정하지 않는다.

API 명세가 변경될 수 있는 경우
현재 공식 문서와 schema를 기준으로 확인한다.

---

# 13. 현장조사 및 Evidence

현장조사는 재사용 가능한 구조로 저장한다.

최소 연결 대상:

- 조사일
- 조사자
- 조사 회차
- 후보점포
- 사진
- 경쟁점
- 부동산 인터뷰
- 유동조사
- 시설조사
- 메모
- 확인상태

재조사 시 기존 조사를 수정하지 않는다.

예:

- 조사 1회차
- 조사 2회차
- 조사 3회차

형태로 이력을 남긴다.

사진과 현장관찰은 가능한 경우 Evidence로 연결한다.

공공데이터와 현장확인이 충돌하면
원천 데이터를 삭제하거나 수정하지 않고
`CONFLICTED` 상태 또는 별도 observation으로 보존한다.

---

# 14. 화면 목적 구분

이 프로젝트는 단순 상권분석 프로그램이 아니라
베이커리 점포개발 업무 시스템이다.

화면은 목적별로 구분한다.

## 브리핑 화면

고객 상담 및 내부 브리핑용.

- 매우 단순하게 구성
- 내부 코드 최소화
- 핵심 수치
- 핵심 리스크
- 확인 필요사항
- 쉬운 문구

## 업무 화면

직원 조사·수정·현장업무용.

- 원천 데이터
- 상세 상태
- 검토 후보
- Evidence
- 내부 메모
- 상세 계산
- source 정보

## 무료 리포트

고객에게 제공하는 1차 진단자료.

- 핵심 입지
- 경쟁환경
- 핵심 리스크
- 계약 전 확인사항

내부 조사 노하우 전체를 노출하지 않는다.

## 최종 상세 리포트

현장조사와 상세 검토가 반영된 유료 컨설팅 결과물.

- 상권
- 임대차
- 시설
- 도면/장비
- 투자비
- BEP
- Stress
- Evidence
- Risk
- 최종판정
- 다음 행동

---

# 15. One Input Principle

같은 데이터는 가능하면 한 번만 입력한다.

예:

- 매물정보
- 주소
- 경쟁점
- 현장조사
- 사진
- 메모
- 임대조건
- 시설정보

를 다른 화면에서 반복 입력하게 만들지 않는다.

한 번 입력한 데이터가:

- 브리핑
- 업무 화면
- 현장조사
- 비교
- 리포트
- 협업사 전달

에서 재사용될 수 있도록 설계한다.

---

# 16. History Principle

기존 데이터를 덮어쓰지 않는다.

다음 변화는 반드시 날짜별 이력 또는 version으로 보존한다.

- 보증금 변경
- 월세 변경
- 관리비 변경
- 권리금 변경
- 매물상태 변경
- 현장 재조사
- 경쟁점 변화
- 시설 확인상태 변경
- 협상안 변경
- 판정 변경

과거 시점의 리포트와 판단을 재현할 수 있어야 한다.

---

# 17. Git

기존 uncommitted changes가 있으면 반드시 보존한다.

사용자가 요청하지 않은 기존 변경사항을 commit하지 않는다.

Codex 또는 다른 AI 개발도구는
사용자가 명시적으로 요청하지 않는 한
다음을 실행하지 않는다.

- commit
- push
- merge
- tag

사용자가 commit을 요청한 경우에도
이번 작업에서 변경한 파일만 명시적으로 stage한다.

`git add .`를 사용하지 않는다.

하나의 commit에는 가능한 하나의 기능 단위만 포함한다.

push 또는 merge 전에 반드시 다음을 확인한다.

- branch
- HEAD
- staged files
- uncommitted changes

현재 보호 중인 로컬 데이터 파일:

- `data/consultations.json`
- `data/diagnosis-drafts.json.backup`

사용자의 명시적 요청 없이 다음을 하지 않는다.

- restore
- reset
- overwrite
- delete
- stage
- commit

---

# 18. 테스트

코드를 변경한 후 현재 Repository에서 사용 가능한 검증방법을 확인한다.

가능하면 다음을 실행한다.

- TypeScript typecheck
- ESLint
- Unit test
- 관련 integration test
- Production build
- `git diff --check`

전용 test framework가 없으면
이번 작업 때문에 새 test framework를 임의로 추가하지 않는다.

순수 계산은 가능한 경우 fixture 또는 deterministic case로 검증한다.

실행하지 않은 테스트를 PASS라고 말하지 않는다.

테스트 실패가 있으면 다음을 구분한다.

- 기존에 이미 있던 실패
- 이번 변경으로 발생한 실패

unrelated 기존 오류를 고치기 위해 작업범위를 임의로 확장하지 않는다.

---

# 19. 회사 구조

회사 구조는 `COMPANY_STRUCTURE.md`를 기준으로 한다.

특히 다음을 기억한다.

- FRAMEONE은 현재 개인사업자다.
- 텍스솔루션은 별도 법인이다.
- 향후 법인이 FRAMEONE 사업을 승계할 계획이다.
- 현재 법적 자회사 관계가 있는 것으로 표현하지 않는다.

사업자명, 계약주체, 결제주체, 개인정보처리자, 데이터소유자 등을
개발자가 임의로 변경하지 않는다.

회사구조와 관련 없는 작은 개발작업에서는
`COMPANY_STRUCTURE.md`를 반복해서 읽을 필요는 없다.

---

# 20. 참고문서 사용 규칙

`docs/` 또는 `docs/research/`의 모든 문서를
작업 시작 시 일괄적으로 읽지 않는다.

이번 작업과 직접 관련된 문서만 확인한다.

예:

## Risk / Evidence 작업

관련 Decision 설계문서와 필요한 현재 타입만 확인한다.

## 경쟁점 작업

우선:

- `COMPETITOR_ANALYSIS_IMPLEMENTATION.md`

필요한 경우:

- `PUBLIC_DATA_API_MAP.md`

## 서울 추정매출 작업

우선:

- `SALES_ANALYSIS_IMPLEMENTATION.md`

필요한 경우:

- `PUBLIC_DATA_API_MAP.md`

## 지원사업 작업

- `GOVERNMENT_SUPPORT_IMPLEMENTATION.md`

## 개업 절차 / Navigator 작업

- `STARTUP_NAVIGATOR_IMPLEMENTATION.md`

## 전체 Roadmap 또는 개발순서 확인

필요한 경우에만:

- `FRAMEONE_FEATURE_ROADMAP.md`
- `CODEX_FUTURE_IMPLEMENTATION_PLAN.md`

Roadmap 전체를 매번 다시 조사하지 않는다.

모든 research 문서를 반복해서 읽지 않는다.

프롬프트에 특정 참고문서가 지정되어 있으면
그 문서를 우선 사용한다.

---

# 21. Next.js 작업 규칙

현재 프로젝트의 Next.js 버전은
AI의 학습 데이터에 있는 일반적인 Next.js와 다를 수 있다.

Next.js API, convention, routing, server/client component,
cache, middleware, route handler 등의 동작을 확신할 수 없는 경우
관련 코드를 작성하기 전에:

`node_modules/next/dist/docs/`

의 현재 설치 버전 문서를 확인한다.

기억에 의존해 오래된 Next.js 방식으로 구현하지 않는다.

deprecation warning을 무시하지 않는다.

단, 이번 작업과 관련 없는 Next.js 문서 전체를 읽지 않는다.

---

# 22. 완료보고 형식

작업이 끝나면 다음 순서로 짧게 보고한다.

## 1. 작업 결과

무엇을 완료했는지.

## 2. 변경 파일

어떤 파일을 변경했는지.

## 3. 핵심 변경

사용자 관점에서 무엇이 달라졌는지.

## 4. 검증 결과

실제로 실행한:

- typecheck
- lint
- test
- build
- diff-check

결과.

## 5. 변경하지 않은 것

의도적으로 보존한 데이터와 기능.

## 6. 남은 문제

아직 해결되지 않은 사항.

## 7. Git 상태

- branch
- HEAD
- uncommitted changes

## 8. 다음 추천 작업

가장 안전한 다음 단계 하나만 제안한다.

완료 후 사용자가 요청하지 않은 추가 기능을 계속 구현하지 않는다.

---

# 최우선 원칙

1. 작업 속도보다 기존 데이터와 기능의 안전성이 우선이다.

2. 불확실하면 임의로 결정하지 않고 `확인 필요`로 보고한다.

3. 실행하지 않은 것을 실행했다고 말하지 않는다.

4. 현재 정상 동작하는 기능을 불필요하게 망가뜨리지 않는다.

5. 한 번의 Codex 작업은 가능한 하나의 기능 단위로 제한한다.

6. 기능 수보다 실제 FRAMEONE 업무시간 절감과 고객 손실 방지를 우선한다.

7. 추정값을 실제값으로 바꾸지 않는다.

8. 미확인 값을 문제없음으로 처리하지 않는다.

9. CRITICAL 위험은 다른 긍정요소로 상쇄하지 않는다.

10. AI는 숫자·법률·인허가·견적을 임의 생성하거나 확정하지 않는다.

11. 과거 데이터, 조사, 판정, 리포트를 덮어쓰지 않는다.

12. 고객용 화면과 직원용 상세정보를 구분한다.
