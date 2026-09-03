# FRAMEONE Bakery Startup Navigator Implementation

기준일: 2026-09-02  
범위: 후보점포 검토부터 영업신고·사업자등록·오픈까지의 **확인·업무 내비게이터**  
법적 성격: 법률·행정 가능 여부를 확정하는 시스템이 아니며, 관할기관·전문가 확인을 연결한다.

## 1. 대표 판단

| 기능 | 판정 | 우선순위 | 이유 |
|---|---:|---:|---|
| 업태/운영형태 질문 기반 절차 후보 생성 | A | P2 | rule-based workflow 가능 |
| 단계별 왜/어디서/서류/비용/기간/링크 | A/B | P2 | 공식 콘텐츠 registry 구축 필요 |
| 완료·확인필요·담당자 관리 | A | P2 | Pipeline task로 구현 가능 |
| 건축물 용도·영업신고 자동 확정 | E | - | 사실관계·예외·관할 판단 필요 |
| 정부24·홈택스 공식 링크 연결 | A | P2 | 링크·기준일 관리 |
| 법령/공식안내 AI 쉬운 설명 | B/C | P2 | 원문 근거·버전·검토 필요 |
| 계약서/관리규약 구조화 | B/C | P1/P2 | OCR+LLM 가능, 법률평가 금지 |
| 신청 자동대행 | E | - | 인증·책임·업무범위 밖 |

## 2. 시작 질문

고객 문장 “직접 빵을 만들어 판매하고 커피도 판매”를 바로 한 업종으로 확정하지 않는다. 다음 최소 질문으로 workflow branch를 만든다.

1. 점포에서 반죽·성형·굽기까지 하는가?
2. 제조한 제품을 해당 점포에서만 판매하는가, 다른 점포·온라인·납품도 하는가?
3. 커피·음료와 함께 좌석에서 섭취할 수 있는가?
4. 주류 판매 계획이 있는가?
5. 포장 완제품 판매와 즉석 제조의 비중은?
6. 예상 면적·층·건축물 용도·건물 유형은?
7. 쇼핑몰·지식산업센터·집합상가 관리규약이 있는가?
8. 가스·오븐·배기·급배수·전기 사용형태는?

결과는 `영업형태 후보`이지 확정이 아니다. `제과점영업`, `휴게음식점영업`, `즉석판매제조가공업`, 기타 허가·신고 검토 후보와 관할 구청 확인 질문을 생성한다.

## 3. 표준 단계

| 단계 | 왜 필요한가 | 어디서/누가 | 대표 근거·서류 | 온라인 | 비용/기간 표시 | 완료기준 |
|---|---|---|---|---|---|---|
| 1 후보점포 검토 | 주소·면적·임대조건 기준점 | FRAMEONE | 매물·임대조건 | 가능 | 내부 | 후보 등록 |
| 2 건축물 용도·입지 확인 | 계획 영업이 가능한 공간인지 사전확인 | 정부24/세움터·관할 건축과 | 건축물대장, 토지이용계획, 현황 | 일부 | 공식 페이지 기준 | 공식서류 확보 + 관할 확인 상태 |
| 3 영업형태 확인 | 신고·시설기준 분기 | 관할 위생과/보건소 | 메뉴·제조·판매·납품 계획 | 문의 | 변동 | 담당기관 확인 메모 |
| 4 시설 사전검토 | 큰 CAPEX·불가 risk 방지 | FRAMEONE·배베스토리·시설업체 | 전기·배기·급배수·소방·도면 | 현장 중심 | 견적 범위 | Hard Risk 처리 |
| 5 임대차 계약 | 공사·업종·원상복구 권리 명확화 | 당사자/중개/전문가 | 계약서·특약·관리규약 | 전자 가능 여부 별도 | 거래별 | DD gate 통과·서명본 |
| 6 설계·인테리어 | 영업·동선·시설 구현 | 설계/시공/전문업체 | 도면·견적·공정 | 일부 | 견적 | 승인도면·계약 |
| 7 위생교육 | 식품영업 신고 요건 확인 | 지정 교육기관 | 수료증 | 과정별 | 공식 안내 | 유효 수료증 |
| 8 건강진단 등 | 식품 종사자 요건 | 보건소/의료기관 | 건강진단결과서 등 | 발급 일부 | 기관별 | 대상자별 유효서류 |
| 9 영업신고 | 신고대상 영업 개시 | 관할 시·군·구 | 신고서·교육·시설 관련 서류 | 정부24/관할에 따라 | 공식 민원값 | 영업신고증 |
| 10 사업자등록 | 세무상 사업 개시 등록 | 홈택스/세무서 | 신분·임대차·인허가 서류 등 | 가능 | 공식 안내 | 사업자등록증 |
| 11 카드/POS | 결제·매출운영 | 민간 사업자 | 계약·정산계좌 | 가능 | 사업자별 | 테스트 결제 |
| 12 플레이스/채널 | 고객 발견·오픈정보 | 플랫폼 | 사업·매장 증빙 | 가능 | 플랫폼별 | 정보 검수 |
| 13 오픈 점검 | 행정·시설·장비·인력·마케팅 완료 | FRAMEONE | readiness checklist | 가능 | 내부 | critical task 0 |

순서는 사업형태·공사·기관 요구에 따라 달라질 수 있다. 시스템은 선형 고정 마법사가 아니라 dependency가 있는 task graph로 설계한다.

## 4. 확인된 공식 서비스 예시

### 4.1 식품관련영업신고

[정부24 식품관련영업신고](https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=14600000021&HighCtgCD=-)는 인터넷·방문·우편, 즉시(근무시간 내 3시간), 신고서와 구비서류, 수수료를 안내한다. 기준일 현재 페이지의 일반 신고 수수료는 방문·우편 28,000원, 전자 25,200원으로 표시된다.

이 값은 Navigator 콘텐츠 DB에 `effective_from`, `checked_at`, `official_url`과 함께 저장하며 화면 렌더링 시 최신 공식 페이지 재확인을 요구한다. 모든 영업형태·지자체 상황에 같은 금액이라고 일반화하지 않는다.

### 4.2 영업신고 대상

[찾기쉬운 생활법령](https://www.easylaw.go.kr/CSP/CnpClsMainBtr.laf?ccfNo=5&cciNo=1&cnpClsNo=1&csmSeq=839&popMenu=ov)은 휴게음식점·일반음식점·위탁급식·제과점영업이 신고대상임을 설명한다. 다만 2026년 하반기 개정 시행예정 내용과 현행 규정을 혼동하지 않도록 `effective date`를 확인한다.

### 4.3 건축물 용도

[음식점 영업이 가능한 입지](https://www.easylaw.go.kr/CSP/CnpClsMain.laf?ccfNo=2&cciNo=1&cnpClsNo=1&csmSeq=839)는 용도지역·건축물 용도를 확인해야 함을 안내한다. 제과점·휴게음식점의 면적 등에 따른 제1종/제2종 근린생활시설 설명은 참고하되, 대장상 용도만으로 현 점포의 적법성·용도변경 가능성을 AI가 확정하지 않는다.

### 4.4 사업자등록

[홈택스 개인 사업자등록 신청](https://hometax.go.kr/websquare/websquare.html?tm2lIdx=4306010000&tm3lIdx=4306010100&tmIdx=43&w2xPath=%2Fui%2Fpp%2Findex_pp.xml)을 공식 신청 링크로 연결한다. 제출서류는 임대/전대, 인허가 대상 여부, 공동사업 등 조건에 따라 달라지므로 고객 branch에 맞는 체크리스트와 공식 안내를 함께 보여준다.

### 4.5 건강진단결과서

[정부24 건강진단결과서 안내](https://www.gov.kr/portal/service/serviceInfo/135200000129)를 연결한다. 대상·검사항목·유효기간·발급비용은 보건소/기관과 현행 법령 확인 task로 둔다.

## 5. Workflow 데이터 모델

```text
navigator_template
- template_id / version
- business_model_tags[]
- jurisdiction_scope
- effective_from / effective_to
- reviewed_by / reviewed_at

navigator_step_definition
- step_definition_id
- template_id
- title / why
- prerequisite_expression
- blocking_level          REQUIRED | CONDITIONAL | INFORMATIONAL
- official_authority
- official_url
- documents_json
- online_availability
- fee_text / processing_time_text
- legal_disclaimer

case_task
- task_id / case_id / step_definition_id
- status                  NOT_STARTED | IN_PROGRESS | DONE | NEEDS_CONFIRMATION | NOT_APPLICABLE | BLOCKED
- assignee
- due_at / completed_at
- jurisdiction
- current_content_version
- evidence_ids[]
- notes
```

공식 콘텐츠와 case 진행상태를 분리하면 법령·수수료가 바뀌어도 과거 완료기록을 보존할 수 있다.

## 6. 규칙 엔진

예시이며 법적 확정 규칙이 아니다.

```text
IF on_site_baking = true
THEN add task "제과점영업 등 영업형태 관할 확인"

IF off_site_supply_or_online_distribution = true
THEN add task "제조·가공/통신판매 등 추가 요건 확인"

IF customer_seating = true AND beverage_service = true
THEN add task "휴게/일반음식점 해당 여부 확인"

IF building_type in [SHOPPING_MALL, KNOWLEDGE_INDUSTRY_CENTER, CONDOMINIUM_RETAIL]
THEN management_rules task is BLOCKING before contract

IF exhaust = UNKNOWN OR electrical_capacity = UNKNOWN
THEN contract readiness = BLOCKED
```

규칙의 출력은 `필요 가능성이 있는 확인 업무`다. 관할 담당자의 확인결과를 evidence로 저장한 뒤 status가 바뀐다.

## 7. Due Diligence Gate

계약 직전 자동 생성:

### 법적·행정

- 건축물대장·현황·용도 확인.
- 계획 영업형태와 신고 가능성 관할 확인.
- 관리규약·업종제한.
- 소방·피난·대수선/용도변경 등 해당 여부.

### 임대차

- 보증금·월세·관리비·VAT·권리금.
- 렌트프리·인상조건·계약기간.
- 업종·공사·배기·간판 허용.
- 원상복구·중도해지·특약.

### 시설

- 전기·증설, 급배수, 배기, 소방.
- 장비 반입, 천장고, 제조·판매공간.

### 금융

- 총 투자비 low/base/high.
- 예비 운전자금·stress test.
- BEP와 임대료 부담.

`CRITICAL/HIGH` 미확인 또는 실패가 있으면 `계약 준비 완료`로 자동 전환하지 않는다. 관리자 override는 이유·승인자·시각을 감사로그로 남긴다.

## 8. 계약서 AI Extraction

### 추출 대상

임대인·임차인·소재지·보증금·월세·VAT·관리비·계약기간·계약금·잔금·렌트프리·인상조건·업종·전대·간판·시설공사·원상복구·중도해지·특약.

### 처리

```text
PDF/Image → malware isolation → OCR/layout → field extraction
→ page/bbox citation → deterministic validation → staff confirmation
→ candidateStore/deal snapshot에 승인된 값만 반영
```

출력 상태:

- `EXTRACTED_UNVERIFIED`
- `STAFF_CONFIRMED`
- `CONFLICT_WITH_CURRENT_INPUT`
- `NOT_FOUND`

AI는 계약 유효성·불공정성·법률위반을 판단하지 않는다. 예:

> 특약에서 배기 설치 허용과 원상복구 책임을 확인할 수 없습니다. 제조형 베이커리라면 계약 전 서면 협의 및 필요 시 법률 전문가 검토를 권장합니다.

이 문장은 누락 질문이지 법률판단이 아니다.

## 9. 관리규약 AI 분석

추출 taxonomy:

`영업시간 / 업종제한 / 배기·냄새 / 소음·진동 / 공사시간·승인 / 소방 / 간판 / 주차·하역 / 전기 / 폐기물 / 공용부 / 원상복구`.

각 결과에 원문 페이지·문단·OCR confidence를 붙인다. `금지`, `승인 필요`, `조건부`, `언급 없음`, `판독 불가`를 구분한다. `언급 없음`은 `허용`이 아니다.

## 10. Opening Readiness

성공 점수가 아니라 업무 완료율이다.

\[
Readiness_k = \frac{\sum completed\ weights}{\sum applicable\ weights}\times100
\]

분야: 시설, 행정, 장비, 마케팅, 직원. `NOT_APPLICABLE`은 분모 제외, `NEEDS_CONFIRMATION`은 미완료. Critical task 하나라도 미완료면 전체 비율과 별도로 `OPENING BLOCKER`를 표시한다.

표현:

```text
오픈 준비상태 72% — 성공 가능성이 아니라 확인된 업무 완료율입니다.
Blocker: 영업신고 서류 1건, 소방 확인 1건
```

## 11. Deal Room

복잡한 DMS가 아니라 case attachment index다.

```text
후보점포 A
├─ 기본·지도·상권
├─ 현장사진·Evidence
├─ 건축물대장·관리규약
├─ 도면·시설·장비
├─ 임대차·협상안·계약서
├─ 견적·CAPEX
├─ Risk·Due Diligence
└─ 최종리포트·Opening tasks
```

필수 기능만: 문서유형, 버전, 업로드자, 촬영/발급일, 관련 점포, evidence link, 고객공개 여부. 범용 폴더·공동편집·전자결재는 만들지 않는다.

## 12. 스마트폰 현장조사 연결

Navigator의 `시설 사전검토` task가 모바일 Evidence Capture를 연다.

- 큰 버튼, 단계당 1개 질문.
- 사진 중심; 촬영일·담당자 자동.
- GPS는 동의·권한 후 보조 검증, 위치 불일치 경고만.
- 음성메모는 전사 후 원음/전사 구분.
- 오프라인 draft + 업로드 queue + 충돌해결.
- 후보점포 QR/짧은 코드로 잘못된 case 연결 방지.
- 완료 시 `사진 없음`, `UNKNOWN`, `충돌`에서 추가확인 task 자동 생성.

필수 사진 후보: 건물/점포 전면, 출입구, 내부, 천장, 분전반, 수도·배수, 배기 위치, 화장실, 후면, 반입경로, 엘리베이터/계단, 주차, 간판.

## 13. 기술 흐름

```text
INPUT
고객 운영형태 + 후보점포 + Evidence + Pipeline 상태
  ↓
DATA SOURCE
정부24·홈택스·생활법령·법령·관할기관 확인 + 공식 문서
  ↓
DB
versioned template/rule/content + case tasks + evidence
  ↓
CALCULATION
applicable task graph + blocking gate + readiness completion
  ↓
API
/navigator/tasks, /due-diligence, /readiness
  ↓
UI
현재단계·왜·어디서·서류·비용·기간·링크·확인상태
  ↓
AI INTERPRETATION
근거형 쉬운 설명·문서 구조화·확인질문
  ↓
REPORT
완료·미완료·blocker·공식 링크·확인자·기준일
```

## 14. 콘텐츠 거버넌스

- 공식안내마다 `jurisdiction`, `effective_from/to`, `checked_at`, `review_due_at`.
- 법률/수수료/처리기간은 정기 재검토와 링크 상태 검사.
- AI가 만든 rule은 직원 승인 전 운영 규칙으로 승격하지 않음.
- 관할기관의 case-specific 답변은 일반 규칙으로 자동 전파하지 않음.
- 고객이 확인한 체크만으로 법적 완료로 간주하지 않고 증빙 요구 수준을 task별 설정.

## 15. 단계별 개발

### P2-A: Checklist MVP

- 운영형태 질문 8개.
- 13단계 task template.
- 공식 링크·완료·확인필요.
- 계약 DD gate.

### P2-B: Pipeline 연결

- CONTRACT→DESIGN→PERMIT→CONSTRUCTION→EQUIPMENT→OPEN.
- 담당자·완료일·다음 작업·미해결 risk.
- 정부지원 재검색 event.

### P2-C: 문서 AI

- 계약서/관리규약 extraction.
- page-level evidence와 직원 확인.
- missing question 생성.

### P3: 자동화 확장

- 관할별 template library.
- 진행상태 알림.
- 협업사 전달 package.
- 신청대행은 제외.

## 16. 완료기준

- 제조+커피, 납품형, 좌석형 등 표본 10개 시나리오에서 필요한 확인 task 누락을 전문가 검토.
- 모든 비용·기간·서류에 공식 URL·확인일 존재.
- `가능/불가` 자동 법률판정 문구가 없음.
- Critical 미완료일 때 계약·오픈 readiness가 완료로 바뀌지 않음.
- 문서 AI 숫자·조항이 원문 페이지/bbox로 이동 가능.
- 고객 화면과 직원 화면의 내부 메모·Raw OCR·개인정보 권한이 분리됨.

