# 프레임원 베이커리 창업진단 AI — 개발 현황

## 현재 프로젝트 경로

```
C:\Dev\bakery-consulting-ai
```

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프레임워크 | Next.js 16.2.10 (App Router) |
| 언어 | TypeScript 5 |
| 스타일 | Tailwind CSS 4 |
| 데이터 저장 | 로컬 JSON (`data/consultations.json`) |
| 패키지 관리 | npm |

---

## 구현된 화면

| 경로 | 화면명 | 렌더링 | 설명 |
|------|--------|--------|------|
| `/` | 대시보드 | Static | 상담 현황 요약 카드 |
| `/consultations` | 상담 목록 | Static | 등록된 상담 건 목록 |
| `/consultations/new` | 상담 등록 | Static (Client) | 4단계 입력 폼 + 진단 실행 |
| `/consultations/[id]` | 상담 상세 | Dynamic | 진단 결과 + 리포트 미리보기 |
| `/reports/[id]` | 고객용 리포트 | Dynamic | 문서형 리포트 + PDF 출력 |

### API 엔드포인트

| 경로 | 메서드 | 설명 |
|------|--------|------|
| `/api/consultations` | GET, POST | 상담 목록 조회·저장 |
| `/api/consultations/[id]` | GET | 상담 상세 조회 |
| `/api/consultations/[id]/diagnose` | POST | mock AI 진단 실행 |

---

## 생성 파일 목록 요약

### lib/diagnosis/ — 진단 로직

| 파일 | 역할 |
|------|------|
| `types.ts` | 타입 정의 (ConsultationRecord, DiagnosisResult, Verdict 등) |
| `calculateBreakEven.ts` | 손익분기점 계산 (한글 주석 포함) |
| `calculateRisk.ts` | 리스크 점수 기반 4단계 판단 |
| `mockAiDiagnosis.ts` | mock AI 진단 오케스트레이션 |
| `reportNarrative.ts` | 진단 섹션별 내러티브 생성 |
| `diagnosis-service.ts` | JSON 파일 CRUD 및 진단 실행 |
| `sample-data.ts` | 샘플 상담 데이터 |

### components/diagnosis/ — 입력·결과 UI

| 파일 | 역할 |
|------|------|
| `ConsultationForm.tsx` | 상담 정보 입력 |
| `CandidateStoreForm.tsx` | 후보 점포 입력 |
| `FacilityCheckForm.tsx` | 시설·장비 체크 |
| `BreakEvenForm.tsx` | 손익분기점 입력·결과 표시 |
| `DiagnosisResultView.tsx` | 진단 결과 전체 표시 |
| `RiskVerdictBadge.tsx` | 4단계 판단 배지 |
| `ChecklistSection.tsx` | 체크리스트 섹션 |

### components/reports/ — 리포트 UI

| 파일 | 역할 |
|------|------|
| `DiagnosisReportDocument.tsx` | 고객용 리포트 문서 본문 |
| `DiagnosisReportPreview.tsx` | 리포트 미리보기 + 출력 버튼 |
| `PrintButton.tsx` | 브라우저 인쇄 트리거 |

### app/ — 페이지·API·스타일

| 파일 | 역할 |
|------|------|
| `page.tsx` | 대시보드 |
| `layout.tsx` | 공통 레이아웃·헤더·네비게이션 |
| `globals.css` | 공통 스타일 |
| `bakery-report-print.css` | 인쇄 전용 CSS |
| `consultations/page.tsx` | 상담 목록 |
| `consultations/new/page.tsx` | 상담 등록 |
| `consultations/[id]/page.tsx` | 상담 상세 |
| `reports/[id]/page.tsx` | 리포트 |
| `api/consultations/route.ts` | 상담 API |
| `api/consultations/[id]/route.ts` | 상담 상세 API |
| `api/consultations/[id]/diagnose/route.ts` | 진단 API |

### data/ — 데이터 파일

| 파일 | 역할 |
|------|------|
| `consultations.json` | 상담 데이터 (샘플 1건 포함) |
| `diagnosis-drafts.json.backup` | 진단 결과 백업 |

---

## 테스트 결과

| 테스트 | 명령 | 결과 | 일시 |
|--------|------|------|------|
| TypeScript 타입체크 | `npx tsc --noEmit` | **통과** | 2026-07-02 |
| 프로덕션 빌드 | `npm run build` | **통과** | 2026-07-02 |
| ESLint | `npm run lint` | 미실행 (선택) | — |
| 수동 화면 확인 | `npm run dev` | 개발 서버 정상 기동 | 2026-07-02 |

### 빌드 결과 라우트

```
Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/consultations
├ ƒ /api/consultations/[id]
├ ƒ /api/consultations/[id]/diagnose
├ ○ /consultations
├ ƒ /consultations/[id]
├ ○ /consultations/new
└ ƒ /reports/[id]
```

---

## 다음 단계에서 수정할 파일

### 실제 AI API 연동

| 파일 | 변경 내용 |
|------|-----------|
| `lib/diagnosis/mockAiDiagnosis.ts` | 외부 LLM API 호출로 대체 |
| `lib/diagnosis/reportNarrative.ts` | AI 생성 내러티브로 전환 |
| `app/api/consultations/[id]/diagnose/route.ts` | API 키 관리, 에러 핸들링 추가 |

### 서울시 상권 API 연동

| 파일 | 변경 내용 |
|------|-----------|
| `lib/diagnosis/reportNarrative.ts` | 입지 분석 섹션에 실제 상권 데이터 반영 |
| `lib/diagnosis/types.ts` | 상권 데이터 타입 추가 |
| 신규 `lib/diagnosis/locationApi.ts` | 상권 API 클라이언트 |

### PPTX 리포트 생성

| 파일 | 변경 내용 |
|------|-----------|
| 신규 `lib/reports/pptxGenerator.ts` | PPTX 생성 모듈 |
| `components/reports/DiagnosisReportPreview.tsx` | PPTX 다운로드 버튼 추가 |
| `app/api/consultations/[id]/report/route.ts` | PPTX 생성 API |

### 데이터베이스 전환

| 파일 | 변경 내용 |
|------|-----------|
| `lib/diagnosis/diagnosis-service.ts` | JSON → DB 어댑터로 전환 |
| `data/consultations.json` | 마이그레이션 후 제거 또는 백업 |

---

## 2차 개발 연동 계획

| 순서 | 기능 | 우선순위 | 예상 변경 범위 |
|------|------|----------|----------------|
| 1 | 실제 AI API (LLM) | 높음 | `mockAiDiagnosis.ts`, `reportNarrative.ts` |
| 2 | 서울시 상권 API | 높음 | 신규 API 모듈, 입지 분석 섹션 |
| 3 | PPTX 리포트 생성 | 중간 | 신규 리포트 모듈, API 엔드포인트 |
| 4 | Kakao 지도 API | 중간 | 후보 점포 주소 입력·지도 표시 |
| 5 | 클라우드 DB | 낮음 | `diagnosis-service.ts` 전면 수정 |
| 6 | 사용자 인증 | 낮음 | 미들웨어, 로그인 UI (범위 외) |

---

## 제외된 기능 (1차 MVP 범위 외)

- Supabase / 외부 DB
- 로그인 / 회원가입
- 결제
- 멀티테넌트
- 문자발송 (SMS/알림톡)
- 전자계약

---

## 외부 프로젝트 수정 여부

| 프로젝트 | 경로 | 수정 여부 |
|----------|------|-----------|
| bakery-consulting-ai | `C:\Dev\bakery-consulting-ai` | **작업 대상** |
| tenant-manager | `C:\Dev\tenant-manager` | **수정 없음** |
| tenant-manager-main | `C:\Dev\tenant-manager-main` | **수정 없음** |

---

## 면책 사항

- 본 MVP는 창업 성공, 매출, 수익, 권리금 회수를 보장하지 않는다.
- 모든 수치는 추정치 또는 참고값이다.
- 법률, 세무, 인허가, 위생, 소방, 전기, 배기, 급배수는 전문가 확인이 필요하다.
