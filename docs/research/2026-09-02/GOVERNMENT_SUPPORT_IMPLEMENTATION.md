# FRAMEONE Government Support Implementation

기준일: 2026-09-02  
목표: 공고를 대신 판단하는 서비스가 아니라, **공식 공고를 놓치지 않고 고객 조건과 대조해 확인순서를 줄이는 기능**.

## 1. 최종 판정

| 기능 | 판정 | 이유 |
|---|---:|---|
| K-Startup 공고 수집 | B | 공공데이터포털 활용신청·키 필요 |
| 기업마당 공고 수집 | B | 기업마당 인증키 필요 |
| 소상공인24 공고 자동수집 | E(현재) | 공개 Open API를 공식 문서에서 확인하지 못함 |
| 고객 조건 기반 1차 매칭 | A/B | 명시 조건은 rule engine으로 비교 가능 |
| `[신청 가능성 높음/조건 확인 필요/현재 대상 아님]` 분류 | A/B | “가능성” 표현·근거·unknown 처리 전제 |
| 공고 쉬운 AI 브리핑 | B | 원문/첨부 적재, 구조화, 근거 연결 필요 |
| 지원금·자부담·서류의 완전 자동 확정 | C/E | 첨부·예외·지역별 해석, 변경공고 때문에 자동 확정 금지 |
| 자동 신청/대리 제출 | E | 범위 밖이며 인증·책임·개인정보 위험 |

## 2. 서비스 조사에서 얻은 기능 벤치마크

| 서비스 | 유용한 개념 | FRAMEONE 재설계 |
|---|---|---|
| [K-Startup](https://www.k-startup.go.kr/web) | 창업단계별 공고·콘텐츠·신청 | 고객 상태와 점포 Pipeline 단계에 맞춘 공고 후보 |
| [기업마당](https://www.bizinfo.go.kr/) | 중앙·지자체·기관 공고 통합 | API 후보 수집 + 원공고·첨부 근거 브리핑 |
| [소상공인24](https://www.sbiz24.kr/) | 소상공인 사업 신청·관리 | 공개 API가 확인될 때까지 링크아웃·완료체크 |
| [모두의창업](https://www.modoo.or.kr/) | 멘토링·시제품·사업화 연결 | 일반 콘텐츠/기관 탐색은 낮은 우선순위; 점포계약과 직접 연계되는 것만 노출 |
| 소상공인365 정책정보 | 정책정보 탐색·맞춤 알림 개념 | 계약 후 고객 상태 변화에 따라 재검색 |
| 정부24 혜택알리미 | 사용자 조건 기반 혜택 발견 | 공고 자격을 확정하지 않는 evidence-based match |

## 3. 고객 프로필

사용자가 요청한 필드에 자격 매칭에 필요한 `as_of`와 확인상태를 붙인다.

```text
support_customer_profile
- customer_id
- age / birth_date(optional)
- residence_region_code
- planned_business_region_code
- startup_status              PRE_STARTUP | EXISTING_BUSINESS
- business_registration_status
- business_registration_date
- business_age_months
- industry_codes[]
- annual_sales_amount / sales_period
- employee_count / employee_as_of
- legal_form                  INDIVIDUAL | CORPORATION | UNKNOWN
- prior_support_programs[]
- profile_as_of
- evidence_status_by_field
```

연령·매출·직원 수는 민감할 수 있으므로 최소수집, 목적 고지, 보유기간, 접근권한이 필요하다. 주민등록번호는 이 기능에 필요하지 않다.

## 4. 원천 API

### 4.1 K-Startup

공식 데이터셋: [창업진흥원 K-Startup 조회서비스](https://www.data.go.kr/data/15125364/openapi.do).

공고 operation의 endpoint 계열:

```text
GET https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01
    ?ServiceKey={KEY}
    &page=1
    &perPage=100
    &returnType=json
```

주요 필드:

| 필드 | 의미 | 구조화 |
|---|---|---|
| `pbanc_sn` | 공고번호 | source key |
| `biz_pbanc_nm` | 공고명 | title |
| `pbanc_ntrp_nm`, `sprv_inst` | 공고·주관기관 | organizations |
| `pbanc_rcpt_bgng_dt`, `pbanc_rcpt_end_dt` | 접수기간 | application window |
| `aply_trgt_ctnt` | 신청대상 | unstructured eligibility source |
| `aply_excl_trgt_ctnt` | 제외대상 | exclusion source |
| `supt_regin` | 지원지역 | region rule candidate |
| `supt_biz_clsfc` | 지원분야 | category |
| `aply_trgt`, `biz_enyy`, `biz_trgt_age` | 대상·업력·연령 | structured rule candidate |
| `prfn_matr` | 우대사항 | preference |
| `rcrt_prgs_yn` | 모집진행 여부 | state |
| `intg_pbanc_yn`, `intg_pbanc_nm` | 통합공고 | duplicate/grouping |
| `detl_pg_url`, `biz_aply_url`, `biz_gdnc_url` | 원문·신청·안내 | official links |

공공데이터포털 명세는 개정될 수 있다. 운영 전 최신 활용가이드 ZIP/Swagger에서 endpoint, `ServiceKey` 대소문자, 필터 연산자, 호출한도를 자동 contract test로 재확인한다.

### 4.2 기업마당

공식 문서: [지원사업정보 API](https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi).

```text
GET https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do
    ?crtfcKey={KEY}
    &dataType=json
    &searchCnt=100
    &searchLclasId=06
    &hashtags=서울,창업
    &pageUnit=100
    &pageIndex=1
```

주요 필드:

`title`, `link`, `seq`, `author`, `excInsttNm`, `description`, `lcategory`, `pubDate`, `reqstDt`, `trgetNm`, `inqireCo`, `flpthNm`, `fileNm`, `printFlpthNm`, `printFileNm`, `hashTags`, `totCnt`, `pblancNm`, `pblancUrl`, `pblancId`, `jrsdInsttNm`, `bsnsSumryCn`, `reqstMthPapersCn`, `refrncNm`, `rceptEngnHmpgUrl`, `pldirSportRealmLclasCodeNm`, `creatPnttm`, `reqstBeginEndDe`.

분야 `06 창업`만 조회하지 않는다. 베이커리 점포에는 금융(01), 내수(05), 경영(07), 기타(09)의 시설·고용·디지털·로컬사업도 관련될 수 있다.

### 4.3 소상공인24

공식 웹 서비스와 공고 첨부 링크는 확인되지만 공개 개발자 Open API의 존재·약관·명세를 확인하지 못했다. 따라서:

- 화면 scraping·내부 API 추정 사용 금지.
- K-Startup/기업마당에 없는 소상공인24 사업은 직원이 공식 URL을 등록하는 manual source adapter.
- 공개 API가 공식 발표되면 B로 재평가.

## 5. 공고 DB

```text
support_announcement
- announcement_id
- canonical_title
- primary_source
- source_key
- managing_org
- status
- application_start/end
- official_detail_url
- official_apply_url
- current_version_id

support_announcement_version
- version_id
- announcement_id
- source_published_at
- fetched_at
- content_hash
- raw_payload
- official_text_snapshot_ref
- supersedes_version_id

support_attachment
- attachment_id
- version_id
- official_url
- filename / mime_type
- file_hash
- extracted_text_ref
- page_count

eligibility_rule
- rule_id / version_id
- field                 age | region | status | business_age | industry | sales | employees ...
- operator              EQ | IN | LTE | GTE | BETWEEN | TEXT_REVIEW
- normalized_value
- source_locator        field or attachment page/paragraph
- extraction_method     API | RULE | AI_REVIEWED | MANUAL
- verification_status
```

정정공고는 기존 레코드를 덮어쓰지 않는다. `version + hash + fetched_at`으로 어떤 판단이 어느 원문을 사용했는지 재현한다.

## 6. 매칭 로직

### 6.1 삼값 논리

각 조건은 `PASS / FAIL / UNKNOWN`이다.

- PASS: 고객값과 공고 명시 조건이 일치.
- FAIL: 명시적인 제외·불일치.
- UNKNOWN: 고객값 누락, 공고 문구 모호, 첨부 확인 필요.

### 6.2 최종 분류

| 분류 | 규칙 | 표시 문구 |
|---|---|---|
| 신청 가능성 높음 | 필수규칙 모두 PASS, 제외규칙 FAIL 없음, 모집중 | “공고의 명시 조건과 현재 입력정보가 대체로 일치합니다. 최종 자격은 주관기관 확인이 필요합니다.” |
| 조건 확인 필요 | UNKNOWN 존재, 예외/우대/첨부 검토 필요 | 확인 질문과 원문 위치 표시 |
| 현재 대상 아님 | 명시 필수조건 FAIL 또는 제외조건 일치 | 불일치한 공식 조건을 표시; 영구 불가로 표현 금지 |

점수로 FAIL을 상쇄하지 않는다. 예: 지역 조건 불일치를 연령·업종 점수로 보완할 수 없다.

### 6.3 의사코드

```text
for rule in mandatory_rules:
  result = compare(profile[field], rule)

if any explicit exclusion matched:
  CURRENTLY_NOT_ELIGIBLE
else if any mandatory FAIL:
  CURRENTLY_NOT_ELIGIBLE
else if any mandatory UNKNOWN or source not verified:
  NEEDS_CONFIRMATION
else:
  HIGH_LIKELIHOOD
```

## 7. AI 쉬운 브리핑

### 7.1 출력 schema

```json
{
  "whatIsIt": {"text":"...","evidence":["p3#para2"]},
  "whoCanApply": {"text":"...","evidence":["api:aply_trgt_ctnt","p4"]},
  "customerFit": {"status":"NEEDS_CONFIRMATION","reasons":[]},
  "supportAmount": {"value":null,"text":"원문 확인 필요","evidence":[]},
  "selfPayment": {"status":"UNKNOWN","evidence":[]},
  "deadline": {"start":"...","end":"...","evidence":["api:..."]},
  "whereToApply": {"url":"...","evidence":["api:biz_aply_url"]},
  "documents": [],
  "mustConfirm": [],
  "officialSourceUrl": "...",
  "sourceVersion": "sha256:..."
}
```

### 7.2 근거 규칙

- 모든 금액·비율·날짜·대상·서류는 evidence locator 필수.
- 원문에 없으면 `확인되지 않음`, 일반 상식으로 채우지 않음.
- OCR confidence가 낮은 숫자는 사용자에게 원문 페이지를 열어 확인하도록 함.
- `신청 가능`, `선정`, `수령 보장` 금지. “가능성 높음/조건 확인 필요” 사용.
- 원문 링크, 첨부 링크, 수집일, 정정공고 여부를 항상 표시.

## 8. 중복·정정·마감

동일 사업이 K-Startup과 기업마당에 함께 있을 수 있다.

dedupe key 후보:

- 공식 공고번호/원공고 URL.
- 기관 + 정규화 제목 + 접수기간.
- 첨부 파일 hash.

결합 후에도 각 source record를 보존한다. 원문 충돌 시:

1. 더 최신 공식 정정공고.
2. 사업 주관기관 원문.
3. 통합포털 metadata.

순으로 우선하고 `SOURCE_CONFLICT`를 직원 검토로 보낸다.

## 9. Pipeline 연결

| FRAMEONE 단계 | 프로필 변화 | 자동 작업 |
|---|---|---|
| 상담 | PRE_STARTUP, 지역/연령 | 초기 공고 후보 |
| 후보점포 분석 | planned region/industry 확정 | 지역·업종 재매칭 |
| 계약 | 투자·시설 계획 | 시설·정책자금 사업 검색 |
| 영업신고 준비 | registration pending | 예비/초기창업 자격 재검토 |
| 사업자등록 | 등록일·업력 생성 | 기존사업자 사업으로 재매칭 |
| 오픈 1/3개월 | 매출·고용 선택 입력 | 경영개선·마케팅·고용 사업 검색 |

지원사업은 한 번의 검색 화면이 아니라 상태가 바뀔 때 재평가되는 Opening Engine task다.

## 10. UI

### 직원용

- raw API 필드, 원문·첨부 viewer, 추출 confidence.
- rule별 PASS/FAIL/UNKNOWN과 profile evidence.
- source conflict·정정공고·마감상태.
- AI 브리핑 수정·승인·publish.

### 고객용

- 세 분류와 이유 2–4개.
- 지원내용/기간/신청처/서류/자부담.
- `확인 필요`를 눈에 띄게 표시.
- 공식 공고 바로가기.
- “FRAMEONE의 1차 대조이며 주관기관이 최종 판단” 고정.

## 11. 기술 흐름

```text
INPUT
연령·지역·예비/기창업·등록·업력·업종·매출·직원
  ↓
DATA SOURCE
K-Startup API + 기업마당 API + 공식 원공고/첨부 + 수동 공식 URL
  ↓
DB
source/version/attachment + normalized rules + customer profile evidence
  ↓
CALCULATION
PASS/FAIL/UNKNOWN, exclusion gate, dedupe, deadline status
  ↓
API
/support-programs, /matches, /briefings
  ↓
UI
3단계 분류 + 근거 + 공식 링크 + 확인질문
  ↓
AI INTERPRETATION
schema-constrained extraction/summary, evidence validator
  ↓
REPORT
기준일·공고버전·원문 링크가 있는 고객 브리핑
```

## 12. 실패·법적 위험 통제

| 위험 | 통제 |
|---|---|
| 마감/정정 반영 지연 | 수집주기·정정 hash·마감 직전 재조회 |
| AI가 금액 생성 | evidence 없는 숫자 reject |
| 자격 확정 오인 | 가능성 분류·공식 판단 고지 |
| 개인정보 과수집 | 최소필드·권한·보유기간·감사로그 |
| 비공개 API 사용 | 공식 문서에 등재된 API만 allowlist |
| 원문 저작권/보관 | 내부 분석용 snapshot과 사용자 링크를 구분, 이용조건 검토 |
| 첨부 악성파일 | MIME/size 검사, 격리 OCR, active content 비활성화 |

## 13. 개발 단계

### P2-1: 검색 MVP

- K-Startup·기업마당 metadata 적재.
- 고객 프로필 최소 8필드.
- 기간·지역·창업상태·업력의 deterministic rule.
- 원문 링크와 수동 확인.

완료기준: 표본 공고 100건에서 중복·마감·기간 파싱 수동 대조 95% 이상.

### P2-2: 원문 브리핑

- PDF/HTML versioning·text extraction.
- 9개 브리핑 항목과 evidence locator.
- 직원 검토 workflow.

완료기준: 숫자·날짜·대상 문장 100%가 근거 위치로 이동 가능.

### P2-3: Opening Pipeline 자동 재검색

- 고객 상태 변화 event.
- 재매칭·알림·완료 task.
- 신청결과 최소 기록.

### P3: 정밀화

- 지역별 수동 rule library.
- 과거 신청/선정 결과를 통한 우선순위 개선. 선정확률 모델은 표본·편향 검증 전 금지.

