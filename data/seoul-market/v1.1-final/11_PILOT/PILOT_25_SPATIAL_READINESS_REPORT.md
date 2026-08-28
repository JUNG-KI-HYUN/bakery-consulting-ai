# PILOT 25 SPATIAL READINESS REPORT

기준일: 2026-08-27

## 1. 완료 범위

- Pilot 25를 기존 hierarchy ID로 분리하고 Market·Submarket·Node 공간 준비상태를 JSON으로 구조화했다.
- 기존 Crosswalk의 참조 ID, 참조 geometry, 공식상권 자치구 일치를 자동검증했다.
- FRAMEONE geometry가 없으므로 Polygon intersection과 overlap 계산은 수행하지 않았다.
- 지도 Viewer, 좌표변환, hierarchy 및 원본 데이터 수정은 수행하지 않았다.
- `08_PROGRAM/markets.v1.geojson`에는 canonical hierarchy와 다른 구 ID 표기 2건이 있어 Pilot 원천으로 사용하지 않았다.

## 2. 공간데이터 상태 스키마

기존 `GeometryStatus = text_only | draft | validated`를 변경하지 않는다. Pilot 준비 데이터의 별도 `verificationStatus`는 다음 의미로 사용한다.

| verificationStatus | 의미 |
|---|---|
| `text_only` | 공간값 없이 텍스트 hierarchy와 앵커만 존재 |
| `candidate` | Crosswalk 후보 또는 초안이며 수동 검토 전 확정 사용 금지 |
| `verified_reference` | 참조 레이어의 ID와 geometry 자체만 검증됨. FRAMEONE 경계가 아님 |
| `verified_point` | 향후 출처·CRS가 확인된 FRAMEONE 대표점 |
| `verified_geometry` | 향후 출처·CRS가 확인된 FRAMEONE Polygon/MultiPolygon |

각 엔터티의 `spatialStatus`에는 `entityType`, `entityId`, `geometryStatus`, `verificationStatus`, `geometryType`, `geometrySource`, `sourceVersion`, `sourceDate`, `sourceCrs`, `outputCrs`, `verifiedDate`, `confidence`, `verificationMethod`, `reviewNote`를 기록한다.

## 3. Pilot 25 현황

- Market: 25
- Submarket: 66
- Node: 117
- 행정동 후보: 75
- 공식상권 후보: 136
- 생성한 좌표 또는 geometry: 0

| 자치구 | Market ID | Market | 우선순위 | 베이커리 중요도 | Submarket | Node | 행정동 후보 | 공식상권 후보 | geometry |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| 종로구 | `SEOUL-JONGNO-GWANGHWAMUN-JONGNO` | 광화문·종로권 | S | S | 4 | 5 | 3 | 8 | `text_only` |
| 중구 | `SEOUL-JUNG-SINDANG-YAKSU` | 신당·약수권 | S | A | 2 | 6 | 5 | 8 | `text_only` |
| 용산구 | `SEOUL-YONGSAN-NAMYEONG-SOOKMYUNG` | 남영·숙대권 | S | A | 2 | 6 | 3 | 5 | `text_only` |
| 성동구 | `SEOUL-SEONGDONG-SEONGSU` | 성수권 | S | S | 5 | 5 | 4 | 8 | `text_only` |
| 광진구 | `SEOUL-GWANGJIN-CHILDRENSPARK-SEJONG` | 어린이대공원·세종대권 | S | A | 2 | 3 | 3 | 5 | `text_only` |
| 동대문구 | `SEOUL-DONGDAEMUN-HOEGI-KYUNGHEE` | 회기·경희대권 | S | S | 2 | 5 | 3 | 7 | `text_only` |
| 중랑구 | `SEOUL-JUNGNANG-SINNAE` | 신내권 | S | A | 3 | 5 | 1 | 4 | `text_only` |
| 성북구 | `SEOUL-SEONGBUK-GIREUM` | 길음권 | S | A | 3 | 4 | 2 | 5 | `text_only` |
| 강북구 | `SEOUL-GANGBUK-UI-BUKHANSAN` | 우이·북한산권 | S | A | 2 | 5 | 2 | 4 | `text_only` |
| 도봉구 | `SEOUL-DOBONG-CHANGDONG` | 창동권 | S | A | 3 | 4 | 4 | 6 | `text_only` |
| 노원구 | `SEOUL-NOWON-JUNGGYE-ACADEMY` | 중계은행사거리권 | S | S | 2 | 3 | 3 | 4 | `text_only` |
| 은평구 | `SEOUL-EUNPYEONG-GUPABAL-NEWTOWN` | 구파발·은평뉴타운권 | S | S | 2 | 5 | 1 | 1 | `text_only` |
| 서대문구 | `SEOUL-SEODAEMUN-YEONHUI` | 연희권 | S | S | 3 | 3 | 2 | 8 | `text_only` |
| 마포구 | `SEOUL-MAPO-SANGAM-DMC` | 상암DMC권 | S | S | 2 | 5 | 2 | 2 | `text_only` |
| 양천구 | `SEOUL-YANGCHEON-MOKDONG-ACADEMY` | 목동학원가권 | S | S | 2 | 4 | 6 | 8 | `text_only` |
| 강서구 | `SEOUL-GANGSEO-MAGOK` | 마곡권 | S | S | 2 | 6 | 1 | 2 | `text_only` |
| 구로구 | `SEOUL-GURO-GURODIGITAL` | 구로디지털단지권 | S | S | 3 | 4 | 1 | 2 | `text_only` |
| 금천구 | `SEOUL-GEUMCHEON-SIHEUNG-SAGEORI` | 시흥사거리권 | S | A | 2 | 4 | 2 | 2 | `text_only` |
| 영등포구 | `SEOUL-YEONGDEUNGPO-MULLAE` | 문래권 | S | S | 3 | 4 | 3 | 8 | `text_only` |
| 동작구 | `SEOUL-DONGJAK-NORYANGJIN` | 노량진권 | S | S | 2 | 5 | 2 | 5 | `text_only` |
| 관악구 | `SEOUL-GWANAK-SNU-SHAROSU` | 서울대입구·샤로수길권 | S | S | 3 | 4 | 3 | 3 | `text_only` |
| 서초구 | `SEOUL-SEOCHO-YANGJAE` | 양재권 | S | S | 3 | 6 | 3 | 8 | `text_only` |
| 강남구 | `SEOUL-GANGNAM-DAECHI-DOGOK` | 대치·도곡권 | S | S | 3 | 5 | 5 | 8 | `text_only` |
| 송파구 | `SEOUL-SONGPA-MUNJEONG` | 문정권 | S | S | 2 | 5 | 4 | 7 | `text_only` |
| 강동구 | `SEOUL-GANGDONG-GODEOK-SANGIL` | 고덕·상일권 | S | S | 4 | 6 | 7 | 8 | `text_only` |

## 4. Crosswalk 자동검증 결과

| 검증 항목 | 전체 | Pilot 25 | 결과 |
|---|---:|---:|---|
| Market ↔ 행정동 행 | 458 | 75 | Market ID 누락 0, 행정동 ID 누락 0, 참조 geometry 누락 0 |
| Market ↔ 공식상권 행 | 863 | 136 | Market ID 누락 0, 공식상권 ID 누락 0, 참조 geometry 누락 0 |
| 공식상권 같은 자치구 | 863/863 | 136/136 | 불일치 0, 확인 불가 0 |
| Market ↔ Grid 행 | 0 | 0 | 미완성 |
| 저장된 overlap 값 | 행정동 0, 공식상권 면적 0 | 0 | FRAMEONE Polygon 부재로 계산 불가 |

행정동 참조 GeoJSON의 `gu`, `gu_code`, `adm_nm` 값이 비어 있어 행정동 후보의 같은 자치구 여부는 자동검증할 수 없다. 모든 기존 Crosswalk 관계는 `manual_review`이며 상태를 승격하지 않았다.

## 5. EPSG 검증

- 공식상권 1650개 모두 속성상 원천 CRS는 `EPSG:5181`, 출력 geometry CRS는 `EPSG:4326`이다.
- `center_x` 범위: 182509–215352
- `center_y` 범위: 437249–465573
- `center_x`, `center_y`는 WGS84 경위도로 직접 사용할 수 없다.
- 필요 시 수집/Adapter 단계에서 `EPSG:5181 → EPSG:4326` 변환이 필요하다. 현재 프로젝트에는 변환 라이브러리가 없으며 이번 작업에서는 설치·변환하지 않았다. 향후 후보는 `proj4` 등 검증된 좌표변환기다.

## 6. 수동 검토 및 부족 데이터

- Pilot Market 25개의 검증된 Polygon 또는 대표점
- Pilot Submarket 66개의 검증된 Polygon 또는 대표점
- Pilot Node 117개의 주소, EPSG:4326 좌표, 출처와 확인일
- 행정동 후보의 자치구 검증에 필요한 행정동 코드-명칭-자치구 매핑
- Market Polygon 확보 후 계산할 Crosswalk overlap 면적과 비율
- Market ↔ 생활인구 Grid Crosswalk
- `manual_review` 후보의 사람 검토 기록과 승인 기준

## 7. 지도 입력 규칙

- `verified_point`만 FRAMEONE 점으로, `verified_geometry`만 FRAMEONE 경계로 표시한다.
- `verified_reference`는 서울시 참조 레이어로만 표시하고 FRAMEONE 경계로 치환하지 않는다.
- `candidate`는 검토 후보로 명시하며 확정 분석이나 공간 가중치 계산에 사용하지 않는다.
- `text_only`는 지도 geometry 없이 hierarchy와 `경계 확인 필요` 상태만 표시한다.

## 8. 무결성 검증

- District / Market / Submarket / Node: 25 / 156 / 382 / 763
- Pilot Market ID 중복: 0
- Pilot Submarket ID 중복: 0
- Pilot Node ID 중복: 0
- 부모 연결 오류: 0
- 존재하지 않는 Crosswalk 참조 ID: 0
- `markets.v1.geojson`에서 canonical hierarchy에 없는 ID: 2 (SEOUL-JONGNO-SEOCHEON-GYEONGBOK, SEOUL-JUNGNANG-MYEONMOK-SAGAJUNG)
- canonical hierarchy에는 있으나 `markets.v1.geojson`에 없는 ID: 2 (SEOUL-JONGNO-SEOCHON-GYEONGBOK, SEOUL-JUNGNANG-MYEONMOK-SAGAJEONG)
- 임의 좌표 생성: 0
- 임의 geometry 생성: 0
