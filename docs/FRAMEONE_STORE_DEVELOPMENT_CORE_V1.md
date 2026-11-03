# FRAMEONE Store Development Core V1

## 1. Purpose

업종별 기능을 한 엔진에 섞지 않고, 점포개발 전 과정의 공통 계약과 확장 경계를 정의한다. V1은 계약·참조·readiness 해석만 제공하며 Candidate 평가, Grade, Risk, Confidence를 다시 계산하지 않는다.

## 2. Common Core

Case, Brand, Industry Profile, Region, Locality, Analysis Area, Candidate, Lifecycle, Survey, Map, Photo, Evidence, 수요·경쟁·시장자료, Lease, Site Criteria, Evaluation, Site Grade, Evidence Confidence, Hard Risk, Compare, Decision, Report Generation을 공통 개념으로 둔다. 공통 Candidate Dimension과 공통 Report Section은 `lib/store-development-core/contracts.ts`가 단일 목록으로 관리한다.

## 3. Profile Chain

참조 순서는 `Case → BrandProfileV1 → IndustryProfileV1 → ReportPresetV1`이며 BrandProfile은 기존 `SiteCriteriaProfileV1`을 ID와 version으로 참조한다. 업종 기본값은 IndustryProfile, 브랜드 전용 임대·면적·배후수요 기준은 SiteCriteriaProfile에 남겨 중복하지 않는다.

## 4. Extension Boundary

`IndustryExtensionV1`은 적용 가능한 industry, 추가 dimension, 추가 report section만 선언한다. Extension이 없는 업종도 유효하다. V1은 실제 Bakery, Restaurant, Beauty, Retail Extension을 구현하거나 런타임에 활성화하지 않는다.

## 5. Report and Readiness

ReportPreset은 Brand, Industry, Criteria, terminology, section, dimension, disclaimer, extension 참조를 `core` binding으로 보유한다. Readiness는 Candidate, Map, Market Data, Photo, Area, Field Summary, Site Grade와 선택 Extension의 확보 상태만 투영하며 원천 상태를 변경하지 않는다.

## 6. PORK33 Mapping

PORK33은 실제 유일한 V1 Case로 유지한다. `MEAT_RETAIL` IndustryProfile, `PORK33` BrandProfile, 기존 `pork33-site-criteria`를 연결하고 기존 Field Briefing V1, Decision Report V2, Report Center 생성 경로를 그대로 사용한다.

## 7. Future Bakery Boundary

오븐, 믹서, 발효기, 제조공간, 쇼케이스, 장비배치 같은 베이커리 전용 항목은 Common Core가 아니다. 전기용량, 급배수, 배기, 장비 반입, 작업공간, 시설 적합성은 향후 `BAKERY_FACILITY` Extension에서 별도 계약으로 정의하며 이번 V1에는 타입 테스트 fixture 외 구현이 없다.
