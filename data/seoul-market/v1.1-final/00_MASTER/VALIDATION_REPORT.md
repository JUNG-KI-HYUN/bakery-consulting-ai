# VALIDATION REPORT

**검수일:** 2026-08-26

| 항목 | 결과 | 비고 |
|---|---|---|
| 서울 자치구 | PASS · 25/25 | 전 자치구 포함 |
| 주요 상권 | PASS · 156개 | 자치구별 4~10개 |
| Market ID 중복 | PASS · 0건 | build 중 자동검사 |
| ID 형식 | PASS | 영문 대문자·숫자·하이픈 |
| 상권경계 근거 | PASS · 프레임원 1차 근거 | 확정 geometry는 현장·공식 crosswalk 필요 |
| 공식/프레임원 권역 구분 | PASS | boundary_type 필수 |
| 숫자 출처 | PASS | 개별 수치는 미수집·임의생성 0건 |
| 호가/실거래 | PASS | 별도 필드·라벨 |
| 사실/분석의견/확인필요 | PASS | fact_status 표준 |
| 베이커리 특화 | PASS | 제품·메뉴·고객·모델·장비 |
| 현장조사 연결 | PASS | 온라인과 별도 레코드 |
| 프로그램 연결 | PASS | 스키마만 설계·코드 수정 0건 |
| NotebookLM/AI 재사용 | PASS | 마스터소스·지침 |
| API 실제성 | PASS | 공식 URL 우선·미확인 endpoint는 확인 필요 |
| API Secret | PASS | `.env.example` 빈값만 제공 |

## 남은 확인항목

- 서울시 최신 표준단위구역 geometry와 156개 Market ID의 N:M crosswalk
- 250m 격자 생활인구의 정확한 데이터셋·API 명세
- 상권별 최신 수치·경쟁점·메뉴가격·호가표본·현장경계
- 구경계를 넘는 인접상권의 실제 소비동선
