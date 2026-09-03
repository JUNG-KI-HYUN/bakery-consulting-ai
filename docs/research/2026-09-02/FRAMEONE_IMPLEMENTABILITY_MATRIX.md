# FRAMEONE Implementability Matrix

기준일: 2026-09-02

## 1. 판정체계

| 등급 | 정의 |
|---:|---|
| A | 현재 데이터·기술·자체입력으로 지금 독자 구현 가능 |
| B | 공식 API 신청, ETL 또는 추가 데이터 적재 후 구현 가능 |
| C | 기능은 구현 가능하지만 공개데이터의 해상도·정확도 때문에 제한적 |
| D | 카드·통신·POS·배달 등 유료 민간데이터 계약 시 구현 가능 |
| E | 비용·정확도·법적위험·관련성 때문에 현재 구현하지 않는 것이 좋음 |

우선순위:

- P0: 현재 점포진단의 계약판단·손실방지에 직접 필요. **7개만 선정**.
- P1: 상권·현장·거래 판단 경쟁력 강화.
- P2: 지원사업·개업행정·운영 특화.
- P3: 민간데이터·충분한 자체 실적 이후.

## 2. 경쟁기능 최종 구현표

| 기능 | 벤치마킹 대상 | 독자 구현 | 데이터 | 정확도 | 난이도 | 우선순위 |
|---|---|---:|---|---|---|---:|
| 주소·marker·공식상권 매칭 | OPENUP/서울 | A | 기존+VWorld+상권 polygon | 높음 | 낮음 | 기존/P0 |
| 100/250/300/500m band | 마이프차 | B | grid+공공인구+자체DB | 중~높음 | 중 | P1 |
| 사용자 polygon | OPENUP | A/B | Viewer+spatial DB | 높음 | 중 | P1 |
| 분기 추정매출 추이 | OPENUP/서울 | B | 서울 추정매출 | 중 | 중 | P1 |
| QoQ/YoY/TTM | OPENUP | A(after B) | 적재 fact | 높음(계산) | 낮음 | P1 |
| 3년 성장률 | OPENUP PRO | B/C | 2021+ 서울·영역버전 | 중 | 중 | P1 |
| 시간·요일 소비 | OPENUP/NICE | B/C | 서울 추정매출 분해 | 중 | 중 | P1 |
| 성·연령 소비 | OPENUP/통신 | B/C | 서울 분해/생활인구 | 중 | 중 | P1 |
| 경쟁점 지도 | OPENUP | B | 인허가+상가업소+self DB | 중~높음 | 중 | P1 |
| 신규/폐업 | OPENUP/서울 | B | 인허가 | 중~높음 | 중 | P1 |
| 관찰 영업기간 | 서울/민간 | B/C | 인허가+entity history | 중 | 높음 | P1 |
| 프랜차이즈/개인점 | 마이프차 | B/C | 브랜드사전+self DB | 중 | 중 | P1 |
| 경쟁점 개별매출 | OPENUP PRO | D | 카드/POS | 계약후 | 높음 | P3 |
| 상위/중위/하위 매출 | NICE | D | 점포 매출분포 | 계약후 | 높음 | P3 |
| 생활·주거·직장인구 | 마이프차/SGIS | B/C | 서울+SGIS | 중 | 중 | P1 |
| 배후세대 | 마이프차 | B/C | 인구·건물·세대 | 중 | 중 | P1 |
| 집객시설·교통 | 마이프차 | A/B | 공공 POI/교통 | 중~높음 | 낮음 | P1 |
| Bakery Market Stability | OPENUP PRO | B/C | 3년 개폐업·기간·밀도 | 중 | 중~높음 | P1 |
| 공식상권 매출 choropleth | OPENUP | B | polygon+추정매출 | 중 | 중 | P1 |
| 100m 매출 heatmap | BigValue/카드 | C/D | 검증모델 또는 민간매출 | 낮음/계약후 | 높음 | P3 |
| 배달 비중 | OPENUP PRO | D | 배달/카드 제휴 | 계약후 | 높음 | P3 |
| AI 상권 해설 | OPENUP/NICE | A/B | 계산 fact | 높음(근거검증 시) | 낮음~중 | P0 |
| PDF 리포트 | 다수 | A | 기존 report | 높음 | 중 | P0/P1 |
| 지원사업 추천 | K-Startup/기업마당 | B | 공식 API+원문 | 중~높음 | 중 | P2 |
| 공고 AI briefing | K-Startup/기업마당 | B/C | 원문·첨부·evidence | 중~높음 | 중 | P2 |
| 개업 Navigator | 정부24 | A/B | 공식 content registry | 높음(절차 안내) | 중 | P2 |

## 3. Decision System 추가기능 Matrix

100점 평가 기준: 계약판단 30 + 손실방지 20 + 현재구조 적합 15 + 데이터준비 15 + 개발효율 10 + 법적안전 10. 점수는 개발 성공확률이 아니라 **우선순위 평가점수**다.

| 기능 | 고객가치 | 계약판단 기여 | 현재 데이터 | 추가 데이터 | 난이도 | 법적위험 | 시기 | 점수 |
|---|---|---:|---|---|---|---|---:|---:|
| Red Flag Engine V3 | 치명위험 비상쇄 | 매우 높음 | facility/risk 있음 | 전문가 rule 검증 | 중 | 낮음 | **P0** | **95** |
| Evidence + Confidence | 근거·미확인 분리 | 매우 높음 | 일부 reference/estimate | 사진/문서 metadata | 중 | 낮음~중 | **P0** | **94** |
| Investment Engine | 추가비·예산초과 방지 | 매우 높음 | 시설/창업비 있음 | 견적범위 DB | 중 | 낮음 | **P0** | **93** |
| Stress Test + Runway | 낙관계약 방지 | 매우 높음 | breakEven 있음 | ramp policy 검증 | 낮음~중 | 낮음 | **P0** | **92** |
| Deal Simulator | 협상조건 제시 | 매우 높음 | 임대/손익 있음 | 허용범위 policy | 중 | 낮음 | **P0** | **91** |
| 후보점포 비교 | 실제 후보 선택 | 높음 | 각 단일 case 있음 | comparison snapshot | 중 | 낮음 | **P0** | **90** |
| Decision Explanation | 이유·해결조건 | 매우 높음 | risk/report 있음 | rule trace schema | 중 | 낮음 | **P0** | **90** |
| Due Diligence Gate | 미확인 계약 차단 | 매우 높음 | 시설·계약 일부 | task/evidence rule | 중 | 낮음 | P1 | 89 |
| 목표 계약조건 역산 | 협상목표 | 매우 높음 | finance 있음 | policy validation | 중 | 중(“적정” 오인) | P1/F17 뒤 | 87 |
| 렌트프리 계산 | 협상안 비교 | 높음 | rent 있음 | horizon/VAT terms | 낮음 | 낮음 | Deal Simulator 포함 | 86 |
| Hidden Cost Finder | 누락비용 예방 | 매우 높음 | 창업비 일부 | category catalog | 낮음 | 낮음 | Investment에 포함 | 89 |
| Budget Guard | 예산초과 경고 | 높음 | budget 입력 필요 | 확정/예상 tagging | 낮음 | 낮음 | Investment에 포함 | 88 |
| 시설 CAPEX Risk | 큰 공사비 경고 | 매우 높음 | facility 있음 | 견적이력/self DB | 중 | 중(견적 오인) | Investment에 포함 | 90 |
| 현장 Evidence Capture | 사실확인 | 높음 | 체크폼 있음 | photo/object storage | 중~높음 | 중(위치/사진) | P1 | 84 |
| 스마트폰 현장 UX | 사용성·누락감소 | 높음 | 웹폼 있음 | offline sync | 높음 | 중 | P1 | 81 |
| 도면+시설+장비 통합 | 설계변경 비용발견 | 매우 높음 | drawing flags 있음 | equipment/spec DB | 높음 | 중 | P1/P2 | 83 |
| 장비 반입 1차검토 | 반입불가 방지 | 높음 | 문/층고 일부 | 장비·경로 치수 | 중 | 중 | P1 | 84 |
| 계약서 AI Extraction | 계약값 누락방지 | 높음 | specialTerms 있음 | OCR/document model | 중~높음 | 중~높음 | P1/P2 | 77 |
| 관리규약 AI | 업종·배기 제한 발견 | 매우 높음 | 없음 | OCR/clause taxonomy | 중~높음 | 중~높음 | P1/P2 | 80 |
| Deal Room Lite | 자료 분산 방지 | 중 | report/case 있음 | document metadata | 중 | 중(개인정보) | P1 | 72 |
| 협상 기록 | 조건변화 추적 | 높음 | deal inputs 있음 | scenario versioning | 낮음 | 낮음 | Simulator 포함 | 85 |
| 계약→오픈 Pipeline | 실행 누락 방지 | 중 | case 있음 | stages/tasks | 중 | 낮음 | P2 | 74 |
| Opening Readiness | 업무완료 가시화 | 중 | 일부 checklist | task weights | 낮음 | 낮음 | P2 | 73 |
| 예상 vs 실제 수집 | 장기 모델개선 | 중(현재) | prediction 있음 | 고객 actuals | 중 | 중(민감정보) | P2 수집 | 78 |
| Learning Loop | 모델 정확도 개선 | 장기 높음 | 표본 없음 | actual cohort | 높음 | 중 | P3 | 70 |
| Similar Store | 유사사례 | 장기 중~높음 | 표본 부족 | 충분한 actuals | 높음 | 중 | P3 | 61 |
| 생산 Capacity | 제조현실성 | 높음 | 장비 flags | 전문가 공정 DB | 높음 | 중 | P2/P3 | 76 |
| 메뉴 경제성 | 수익구조 | 중 | 없음 | 원가·시간·폐기·판매 | 중 | 낮음 | P2/P3 | 68 |
| 고객/직원 화면 분리 | 이해·보안 | 높음 | report 있음 | role/view schema | 중 | 중 | P1 | 83 |
| Meeting Mode | 상담결정 | 높음 | compare 필요 | presentation state | 중 | 낮음 | P1, 비교 뒤 | 79 |
| 자동 상담 briefing | 시간절약 | 중 | case facts | narrative templates | 낮음 | 낮음 | P1/P2 | 75 |
| 협업사 전달 package | 정보누락 감소 | 중~높음 | evidence/도면 필요 | recipient/template | 중 | 중(개인정보) | P2 | 73 |
| 정부지원+Navigator 연계 | 계약후 가치 | 낮음(계약) | 없음 | API/content | 중 | 중 | P2 | 66 |

## 4. P0 엄격 선정: 7개

| 순서 | P0 | 선정 이유 | 완료의 의미 |
|---:|---|---|---|
| 1 | Evidence + Data Confidence foundation | 나머지 모든 판단의 근거·미확인을 보존 | 값마다 status/source/checkedAt/evidence 연결 |
| 2 | Red Flag Engine V3 | CRITICAL이 점수로 상쇄되는 현재 위험 제거 | non-offsetting gate + rule trace |
| 3 | Investment Engine | 시설 CAPEX·숨은비용·예산초과를 계약 전에 계산 | low/base/high + confirmed/estimated/unknown |
| 4 | Stress Test + Working-Capital Runway | 예상매출 하나의 낙관 편향 제거 | -20/base/+20 및 실제 남는 현금 개월 |
| 5 | Deal Simulator | 월세·권리금·렌트프리 협상효과를 동일 계산식으로 비교 | base/scenario/round versioning |
| 6 | Candidate Comparison | A/B/C를 total score가 아니라 gate·비용·손익으로 선택 | 기본3·최대5, PC/mobile/PDF |
| 7 | Decision Explanation Engine | 판정 이유·해결조건·변경 후 판정을 고객이 이해 | deterministic facts + validated narrative |

P0에 경쟁지도·추정매출을 넣지 않은 이유: 중요하지만 사용자의 최종 원칙상 먼저 막아야 할 손실은 시설·계약·투자·현금흐름이다. Market 기능은 현재 상권기능 완료 직후 P1 첫 묶음으로 둔다.

## 5. 데이터 확보 방식별 답

### 질문 1. 지금 가진 데이터로 바로 구현

1. Evidence 상태/출처 schema의 기본형.
2. Hard Risk non-offsetting gate.
3. Stress Test와 현금 runway.
4. Deal Simulator 기본형.
5. 렌트프리 24/36개월 누적비용 비교.
6. 후보점포 A/B/C 비교 기본형.
7. Decision Explanation의 rule-based 구조.
8. 고객/직원 view 분리 기본형.
9. Hidden Cost catalog와 Budget Guard.
10. 기존 report의 판정 snapshot/version.

### 질문 2. 공공 API 하나 또는 적재 추가 후

1. 서울 분기 추정매출 trend.
2. QoQ/YoY/TTM.
3. 서울 점포 집계 개폐업 trend.
4. 소진공 현재 경쟁점 후보.
5. 지방인허가 신규·폐업.
6. VWorld 주소·좌표 보강.
7. SGIS 전국 인구·사업체 보조.
8. 건축물대장 근거 조회.
9. K-Startup 공고 수집.
10. 기업마당 공고 수집.

### 질문 3. 자체 DB 구축이 필요한 것

- canonical bakery store·brand·업태 taxonomy.
- 인허가/상가 entity resolution과 이력.
- 시설 CAPEX 견적범위·실견적·실공사 DB.
- 장비 치수·전력·급배수·배기·반입 DB.
- Evidence·문서·현장관찰 DB.
- 정책/risk rule version DB.
- 지원사업 공고 version·eligibility rule DB.
- 개업 절차의 관할·효력일 content registry.
- 계약 전 예측 snapshot과 1/3/6/12개월 actual DB.

### 질문 4. 돈 주고 민간데이터가 필요한 것

- 개별 경쟁점 매출·추이.
- 점포 매출 중위·상위20%·하위20%.
- 카드/현금 업스케일 매출의 정밀 미세격자.
- 통신사 시간대·체류·OD 유동인구.
- POS 메뉴·가격·거래건수·객단가 분포.
- 배달 매출·비중·플랫폼 주문 특성.

### 질문 5. 데이터가 있어도 지금 불필요

- 범용 전국 부동산 AI 가격추정.
- 경쟁사 UI와 동일한 화려한 heatmap을 위한 heatmap.
- 법률·인허가 자동 확정판정.
- 지원사업 자동 신청대행.
- 범용 CRM·문서관리·프로젝트관리 SaaS.
- “창업 성공확률/생존확률” 한 숫자.
- 초기 표본 없는 ML 예상매출·Similar Store.
- 모든 업종을 포괄하는 프랜차이즈 본사 cannibalization.

### 질문 6. FRAMEONE이 강하게 만들 수 있는 것

1. Hard Risk가 상권점수에 상쇄되지 않는 결정구조.
2. Evidence·자료확인도·핵심 미확인 gate.
3. 베이커리 시설 CAPEX·장비·도면 연결.
4. Hidden Cost·Budget·운전자금의 통합.
5. Deal Simulator와 참고 협상범위.
6. 후보 A/B/C의 gate 기반 비교.
7. BEP와 공개 시장데이터의 정직한 비교.
8. 해결조건과 판정변화를 설명하는 AI.
9. 계약→공사→오픈 업무 Navigator.
10. 예측→실제→규칙보정 Learning Loop.

## 6. 기능 통합 권고

| 분산 후보 | 통합 Engine/제품 기능 |
|---|---|
| What-if + 목표조건 역산 + 렌트프리 + 협상기록 | **DEAL SIMULATOR** |
| CAPEX + Hidden Cost + Budget Guard | **INVESTMENT ENGINE** |
| Evidence + 자료확인도 + 현장 Capture | **EVIDENCE SYSTEM** |
| Hard Risk + Due Diligence + Decision Explanation | **DECISION ENGINE V3** |
| Stress Test + 운전자금 + BEP | **FINANCE ENGINE V2** |
| Pipeline + Deal Room + Readiness | **OPENING WORKSPACE LITE** |

## 7. 금지·Gate

- 추정매출을 실제매출 또는 후보점포 예상매출로 표시하지 않는다.
- 민간 분포 없이 중위·상위20%를 만들지 않는다.
- 82% 자료확인도를 82% 성공확률처럼 표현하지 않는다.
- AI가 숫자·법률결론·견적을 생성하지 않는다.
- CRITICAL은 어떤 긍정점수로도 상쇄하지 않는다.
- `UNKNOWN`을 0·문제없음으로 취급하지 않는다.
- 사용자가 예상매출을 근거 없이 올려 판정을 개선할 때 경고·잠금을 제공한다.

