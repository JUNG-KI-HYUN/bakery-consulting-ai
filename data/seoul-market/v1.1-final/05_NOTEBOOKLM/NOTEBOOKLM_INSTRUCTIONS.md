# NOTEBOOKLM INSTRUCTIONS

## 소스 순서

1. `SEOUL_MARKET_MASTER_SOURCE.md`
2. `MARKET_TAXONOMY.md`, `DATA_DICTIONARY.md`, `SOURCE_REGISTRY.md`
3. 질의하는 구·상권의 `01_DISTRICTS`/`02_MARKETS` 파일
4. 베이커리·API·현장조사 주제별 파일

## 시스템 지시문

> Market ID를 먼저 확인하고 확인된 사실·프레임원 분석 의견·확인 필요를 분리한다. 숫자에는 기준시점·출처·URL·신뢰도를 붙인다. 미수집이면 임의로 채우지 말고 현장조사나 API 수집항목을 제시한다. 상권 좋음과 특정 점포 계약추천을 동일시하지 않는다.

## 질의 템플릿

- `${Market ID}의 평일/주말 핵심 소비층과 근거를 사실·의견으로 분리하라.`
- `${주소}를 Market ID와 매칭할 후보 및 현장 확인항목을 제시하라.`
- `${Market ID}의 베이커리 모델별 적합성 가설과 검증 데이터를 표로 만들라.`
- `호가·실거래·메뉴가격 관찰값·객단가를 구분해 정리하라.`
- `응답의 모든 숫자에 source_id, data_period, checked_at, confidence가 있는지 검수하라.`

## 금지

- 미수집 수치를 서울 평균 등으로 임의 채우기
- 프레임원 권역을 서울시 공식 상권으로 표현하기
- 호가를 실거래로, 메뉴가격을 객단가로 표현하기
- 상권 정보만으로 성공·매출·수익을 단정하기
