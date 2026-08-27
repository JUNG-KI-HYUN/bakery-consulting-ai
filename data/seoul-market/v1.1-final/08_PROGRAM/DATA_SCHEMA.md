# DATA SCHEMA · Markdown 마스터→변환규칙

## 마스터 원본

Markdown front matter와 표를 편집 원본으로 삼는다. JSON/CSV/GeoJSON은 파생물이며 직접 수정하지 않는다.

## 외부 원천·CSV 공통 키

아래 `snake_case` 키는 공공데이터 원본, 적재용 CSV 및 공간 원천에서 사용할 수 있다. 프로그램 JSON과 API Response로 진입할 때는 Adapter/Normalizer가 대응하는 `camelCase` 키로 변환한다.

| 필드 | 형식 | 규칙 |
|---|---|---|
| market_id | string | `SEOUL-{GU_CODE}-{SLUG}` 고정 |
| version | string | 스키마/geometry/스냅샷 버전 분리 |
| data_period | string | 원천 기준시점 |
| checked_at | date | 조회·검증일 |
| source_ids | array | 숫자가 있는 모든 레코드에 필수 |
| fact_status | enum | 확인된 사실/프레임원 분석 의견/확인 필요 |
| confidence | enum | A/B/C/D/E |

## JSON

- 프로그램 내부 JSON과 API Response는 UTF-8, `camelCase`를 사용한다.
- 공공 API 원본 JSON은 원래 필드명을 보존할 수 있으나 프로그램 진입 시 Adapter/Normalizer에서 `camelCase`로 변환한다.
- 금액은 원 단위 integer로 저장한다.
- 미수집은 `null`, 실제 0만 0
- 호가·실거래·온라인 메뉴가격 관찰값을 서로 다른 object로 저장

## CSV

- 인덱스와 API 적재용 평면표
- 반복 속성은 `|` 문자 또는 별도 자식 CSV로 분리
- 엑셀용 UTF-8 BOM은 배포단계에서만 선택 적용

## GeoJSON

- CRS는 WGS84(EPSG:4326)
- 원천 EPSG:5181 geometry는 좌표변환 로그·원천 버전을 남김
- v1에는 확정 좌표를 임의 생성하지 않고 `geometry: null`로 제공
- properties에 market_id, boundary_version, boundary_type, confidence, source_ids 필수

## 파싱·배포 규칙

1. front matter를 우선 읽고 본문 표는 설명용으로 사용한다.
2. Market ID 중복 또는 자치구 25개 전수 미충족이면 배포를 중단한다.
3. source_id 없는 숫자는 publish 단계에서 거부한다.
4. 분석 의견은 fact_status 없이 사실 필드로 올리지 않는다.
5. 프로그램 내부의 `MARKET_HIERARCHY.json`, TypeScript 인터페이스와 API Response는 `camelCase` 검증을 통과해야 한다.
6. Market ID 값은 기존 대문자-하이픈 형식(`SEOUL-{GU_CODE}-{SLUG}`)을 유지하며 필드명 변환 대상이 아니다.
