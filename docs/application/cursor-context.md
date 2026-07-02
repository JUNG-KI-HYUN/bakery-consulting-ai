# 프로젝트 컨텍스트: 프레임원 베이커리 창업진단 AI

아래는 내가 작업 중인 Next.js 프로젝트의 전체 컨텍스트야. 이 프로젝트를 이어서 도와줘.

## 1. 서비스 개요
- **서비스명**: 프레임원 베이커리 창업진단 AI
- **사업명**: AI 기반 베이커리 창업 점포진단 및 오픈 마케팅 지원 솔루션
- **목적**: 베이커리 예비창업자가 후보 점포를 **계약하기 전에**, 내부 상담 담당자가 입지·임대차·시설·도면·손익분기·마케팅을 체계적으로 검토하는 **내부 상담 보조 웹 도구(1차 MVP)**
- **중요 원칙**: 창업 성공·매출·수익·권리금 회수를 **보장하지 않음**. 모든 수치는 "추정치/참고값". 법률·세무·인허가·위생·소방·전기·배기·급배수는 "전문가 확인 필요"로 표기.

## 2. 기술 스택
- Next.js **16.2.10** (App Router) — ⚠️ 최신 버전이라 기존 관례와 다를 수 있음. API/파일구조는 `node_modules/next/dist/docs/`를 먼저 확인할 것
- React 19.2.4, TypeScript 5, Tailwind CSS 4
- 데이터 저장: **로컬 JSON 파일** (`data/consultations.json`) — 외부 DB 없음
- 패키지 관리: npm
- 프로젝트 경로: `C:\dev\bakery-consulting-ai`

## 3. 화면(라우트) 구조
| 경로 | 화면 | 설명 |
|------|------|------|
| `/` | 대시보드 | 상담 현황 요약 카드 (건수/진행중/완료/조건부·보류·위험) |
| `/consultations` | 상담 목록 | 등록 건 목록, 샘플 데이터 1건 포함 |
| `/consultations/new` | 상담 등록 | 상담정보→후보점포→시설체크→손익분기 4단계 폼 + mock 진단 실행 |
| `/consultations/[id]` | 상담 상세 | 진단 결과 + 리포트 미리보기 |
| `/reports/[id]` | 고객용 리포트 | 문서형 리포트 + `window.print()` PDF 출력 |

### API 엔드포인트
- `GET/POST /api/consultations` — 목록 조회·저장
- `GET /api/consultations/[id]` — 상세 조회
- `POST /api/consultations/[id]/diagnose` — mock AI 진단 실행

## 4. 폴더/파일 구조
```
app/                              # 페이지·API·스타일
  page.tsx                        # 대시보드
  layout.tsx                      # 공통 레이아웃/헤더/네비
  globals.css, bakery-report-print.css  # 스타일(인쇄 전용 CSS 별도)
  consultations/{page, new/page, [id]/page}.tsx
  reports/[id]/page.tsx
  api/consultations/{route, [id]/route, [id]/diagnose/route}.ts

components/
  diagnosis/                      # 입력·결과 UI
    ConsultationForm / CandidateStoreForm / FacilityCheckForm /
    BreakEvenForm / BrandMarketingForm / InteriorSketchForm /
    InteriorSketchBoard / DiagnosisResultView / RiskVerdictBadge / ChecklistSection
  reports/                        # 리포트 UI
    DiagnosisReportDocument / DiagnosisReportPreview /
    InteriorSketchReportSection / PrintButton
  ui/                             # BentoCard, StepIndicator

lib/diagnosis/                    # 진단 로직 (핵심)
  types.ts                        # 모든 타입 정의
  calculateBreakEven.ts           # 손익분기 계산
  calculateRisk.ts                # 리스크 점수 → 4단계 판단
  mockAiDiagnosis.ts              # mock 진단 오케스트레이션
  reportNarrative.ts              # 섹션별 내러티브 생성
  diagnosis-service.ts            # JSON 파일 CRUD + 진단 실행
  sample-data.ts                  # 샘플 상담 데이터

data/consultations.json           # 데이터 저장소(샘플 1건 포함)
```

## 5. 진단 흐름
`[입력] → [분석] → [검토] → [리포트 생성]`
1. **입력**: 상담정보 / 후보점포(임대차·물리조건) / 시설장비(전기·급배수·배기·장비반입 = 가능/불확실/불가) / 손익분기(매출·비용)
2. **분석**: `calculateBreakEven`(손익분기) + `calculateRisk`(리스크 점수)
3. **검토**: `mockAiDiagnosis` → `reportNarrative`로 섹션별 문구 생성
4. **리포트**: `DiagnosisReportDocument` + `PrintButton`으로 PDF 출력

### 손익분기 계산식 (calculateBreakEven.ts)
- 월세 부담률 = 월세 ÷ 예상 월매출 × 100
- 총 고정비 = 월세 + 관리비 + 인건비 + 광고비 + 기타
- 변동비율 = 원재료비율 + 카드수수료율 + 배달수수료율
- 손익분기 매출 = 총 고정비 ÷ (1 − 변동비율)
- 권리금 회수기간 = 권리금 ÷ 예상 월순이익

### 최종 판단 4단계 (calculateRisk.ts, 리스크 점수 기반)
- **추천**(0~1) / **조건부 추천**(2~4) / **보류**(5~6) / **위험**(7+)
- 가중치 예: 제조형+배기 불가/불확실 +3, 전기증설 불확실/불가 +2, 월세부담률 15%초과 +2, 제조공간 확보불가 +2, 도면 미확인 +1
- 원칙: 상권이 좋아도 전기/배기/급배수/장비반입/제조공간 문제가 크면 보류·위험. AI는 계약 가능 여부를 단정하지 않고 참고 의견만 제시.

## 6. 핵심 타입 (lib/diagnosis/types.ts)
```typescript
type StoreType = "판매형" | "제조형" | "카페형" | "배달병행형";
type Verdict = "추천" | "조건부 추천" | "보류" | "위험";

// ConsultationRecord = { consultation, candidateStore, facilityCheck,
//                        breakEven, brandMarketing?, interiorSketch? }
// DiagnosisResult = { id, verdict, reasons[], breakEvenResult, sections, generatedAt }
// 시설체크의 가능성 필드는 모두 "가능" | "불확실" | "불가" 유니온
// DiagnosisSections: candidateSummary, keyRisks[], locationAnalysis, leaseAnalysis,
//   facilityRiskAnalysis, layoutFeasibilityAnalysis, breakEvenAnalysis,
//   brandStory/marketing/interior 관련 섹션들, finalJudgment, preContractQuestions[]
```

## 7. 미구현 (1차 MVP 범위 외 / 2차 예정)
- **실제 AI API 연동 없음** → 현재는 규칙 기반 mock(`mockAiDiagnosis.ts`). 2차에 LLM으로 대체
- 서울시 상권 API / Kakao 지도 API 없음
- PPTX 리포트 생성 없음(현재 브라우저 인쇄만)
- 로그인/인증, 결제, 멀티테넌트, SMS·알림톡, 전자계약, 클라우드 DB 없음

## 8. 코딩 시 지켜야 할 규칙 (AGENTS.md)
- Next.js 16은 브레이킹 체인지가 있으니, 코드 작성 전 `node_modules/next/dist/docs/` 관련 가이드를 먼저 읽고 deprecation 경고를 반영할 것
- 리포트·진단 문구에 "성공/매출/회수 보장" 표현 금지, "추정·참고값·확인 필요" 표현 사용, 전문가 확인 고지 필수 포함
- 샘플 데이터에는 "샘플 데이터" 라벨 및 주소 접두어 유지 (실제 개인정보 미입력)

## 요청
(여기에 Cursor에게 시킬 작업을 적어줘. 예: "실제 LLM API 연동", "PPTX 생성 기능 추가" 등)
