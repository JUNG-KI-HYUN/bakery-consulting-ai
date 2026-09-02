<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


# FRAMEONE PROJECT RULES

이 프로젝트는 FRAMEONE의 실제 점포개발·상권분석·창업지원 업무에 사용하는 프로그램이다.

AI 개발도구(Codex, Cursor 등)는 이 문서의 규칙을 우선 확인한 후 작업한다.

---

# 1. 작업 시작 전 반드시 확인

작업을 시작하기 전에 다음 순서로 현재 상태를 확인한다.

1. `COMPANY_STRUCTURE.md`
2. `CURRENT_STATUS.md`
3. `git status -sb`
4. 현재 branch
5. 최신 commit
6. 이번 작업과 관련된 기존 코드
7. 기존 데이터 구조
8. 보호해야 할 파일 또는 데이터

사용자가 기존에 수정한 파일을 임의로 reset, checkout, overwrite 또는 삭제하지 않는다.

---

# 2. 기존 구조 우선

새 기능을 만들기 전에 기존 기능과 코드를 먼저 조사한다.

가능하면 기존:

- Component
- Utility
- Type
- API
- Database schema
- Service
- Design pattern

을 재사용한다.

사용자가 요청하지 않은 대규모 refactor를 하지 않는다.

---

# 3. 데이터 관련 절대규칙

다음을 실제 데이터처럼 임의로 생성하지 않는다.

- 가짜 API
- 존재하지 않는 API 필드
- 가짜 공식 상권
- 가짜 행정구역
- 가짜 매출
- 가짜 점포
- 가짜 좌표
- 가짜 geometry
- 가짜 고객정보
- 검증되지 않은 자동 매칭

테스트 데이터가 필요한 경우 반드시 mock 또는 fixture임을 명확하게 표시하고 실제 데이터와 분리한다.

---

# 4. FRAMEONE 상권 데이터 원칙

FRAMEONE 자체 Market / Submarket / Node와 정부 또는 서울시 공식 상권 데이터는 서로 다른 데이터 체계이다.

이를 자동으로 동일한 상권이라고 확정하지 않는다.

candidate / manual_review 상태의 데이터를 confirmed 상태로 임의 변경하지 않는다.

FRAMEONE 데이터에 검증되지 않은 좌표나 geometry를 생성하지 않는다.

---

# 5. 고객정보 및 개인정보

실제 고객정보를 다음 위치에 임의로 넣지 않는다.

- 공개 GitHub
- 테스트 fixture
- console log
- demo 데이터
- screenshot
- documentation example

더성수, FRAMEONE, 텍스솔루션의 데이터를 사용권한 확인 없이 결합하지 않는다.

---

# 6. Database 변경

Database schema 변경은 특히 보수적으로 한다.

다음을 먼저 확인한다.

1. 현재 schema
2. 기존 migration
3. 실제 데이터 영향
4. 기존 API 영향
5. UI 영향

destructive migration을 임의로 실행하지 않는다.

production 데이터를 삭제하거나 초기화하지 않는다.

---

# 7. 개발 우선순위

우선순위는 다음과 같다.

P0
실제 업무에 필요한 핵심 기능

P1
직원의 업무시간 절감

P2
데이터 정확도와 품질

P3
업무 자동화

P4
향후 외부 SaaS 가능성

멋있어 보이는 기능보다 실제 업무 활용성을 우선한다.

---

# 8. 변경범위

이번 요청에 필요한 최소 범위만 변경한다.

다음은 명시적인 이유 없이 하지 않는다.

- 전체 UI 재작성
- 전체 DB 재설계
- 대규모 파일 이동
- dependency 대량 변경
- 기존 데이터 재생성
- 기존 ID 변경
- 기존 taxonomy 변경

---

# 9. 테스트

코드를 변경한 후 현재 Repository에서 사용 가능한 검증방법을 확인한다.

가능하면 다음을 실행한다.

- TypeScript typecheck
- ESLint
- Unit test
- 관련 integration test
- Production build
- `git diff --check`

실행하지 않은 테스트를 PASS라고 말하지 않는다.

테스트 실패가 있으면 다음을 구분한다.

- 기존에 이미 있던 실패
- 이번 변경으로 발생한 실패

---

# 10. Git

기존 uncommitted change가 있으면 보존한다.

사용자가 요청하지 않은 기존 변경사항을 commit하지 않는다.

하나의 작업은 가능한 작은 단위의 commit으로 분리한다.

push 또는 merge 전에 현재 상태를 다시 확인한다.

---

# 11. 회사 구조

회사 구조는 `COMPANY_STRUCTURE.md`를 기준으로 한다.

특히 다음을 기억한다.

- FRAMEONE은 현재 개인사업자다.
- 텍스솔루션은 별도 법인이다.
- 향후 법인이 FRAMEONE 사업을 승계할 계획이다.
- 현재 법적 자회사 관계가 있는 것으로 표현하지 않는다.

사업자명, 결제주체, 개인정보처리자, 데이터소유자 등을 개발자가 임의로 변경하지 않는다.

---

# 12. 완료보고 형식

작업이 끝나면 다음 순서로 보고한다.

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

branch / commit / uncommitted changes.

## 8. 다음 추천 작업

가장 안전한 다음 단계.

---

# 최우선 원칙

작업 속도보다 기존 데이터와 기능의 안전성이 우선이다.

불확실하면 임의로 결정하지 않고 확인 필요사항으로 보고한다.

실행하지 않은 것을 실행했다고 말하지 않는다.

현재 동작하는 기능을 불필요하게 망가뜨리지 않는다.

## FRAMEONE 업무 개발 원칙

1. 이 프로젝트는 단순 상권분석 프로그램이 아니라 베이커리 점포개발 업무 시스템이다.

2. 화면은 목적별로 구분한다.
   - 브리핑 화면: 고객 상담 및 내부 브리핑용, 매우 단순하게 구성
   - 업무 화면: 직원 조사·수정·현장업무용
   - 무료 리포트: 고객에게 제공하는 1차 진단자료
   - 최종 상세 리포트: 현장조사와 상세 검토가 반영된 유료 컨설팅 결과물

3. 같은 데이터는 한 번만 입력한다.
   매물정보, 주소, 경쟁점, 현장조사, 사진, 메모를 다른 화면에서 다시 입력하게 만들지 않는다.

4. 기존 데이터를 덮어쓰지 않는다.
   매물조건 변경, 현장 재조사, 경쟁점 변화 등은 반드시 날짜별 이력 또는 조사 회차로 보존한다.

5. 데이터 출처를 구분한다.
   - Kakao 지도/장소검색
   - 공공데이터
   - FRAMEONE 현장조사
   - 사용자 직접입력
   - AI 해석
   서로 다른 출처를 하나의 확정 사실처럼 합치지 않는다.

6. AI는 원본 데이터 생성자가 아니다.
   AI는 요약, 비교, 변화 정리, 리포트 문장 생성 등에 사용하며 숫자·법률·인허가 가능 여부를 임의 생성하거나 확정하지 않는다.

7. 현장조사는 재사용 가능한 구조로 저장한다.
   조사일, 조사자, 조사 회차, 사진, 경쟁점, 부동산 인터뷰, 유동조사, 시설조사를 연결한다.

8. 기능 추가 시 실제 FRAMEONE 업무시간을 줄이는지를 우선 판단한다.
   기능 수를 늘리기 위한 구현은 하지 않는다.