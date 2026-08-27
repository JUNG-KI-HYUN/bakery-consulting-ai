# DATA NAMING CONVENTION

**확정일:** 2026-08-27  
**적용 버전:** FRAMEONE 서울 상권 DB v1.1 final

## 확정 원칙

1. 프로그램 내부 JSON 필드는 `camelCase`를 사용한다.
2. TypeScript 변수, 타입 속성과 인터페이스 필드는 `camelCase`를 사용한다.
3. 공공 API 원본 필드는 추적성과 재현성을 위해 원형을 보존할 수 있다.
4. CSV와 공공데이터 적재 파일은 `snake_case`를 사용할 수 있다.
5. 외부 원본과 CSV가 프로그램에 진입할 때 Adapter/Normalizer에서 `camelCase`로 변환한다.
6. Market ID 값은 기존 대문자-하이픈 형식(`SEOUL-{GU_CODE}-{SLUG}`)을 유지한다.

## 적용 대상

- `MARKET_HIERARCHY.json`
- `PROGRAM_DATA_CONTRACT.md`
- 향후 TypeScript 인터페이스
- 프로그램 API Response

## 변환 예시

| 외부 원본·CSV | 프로그램 내부 |
|---|---|
| `market_id` | `marketId` |
| `submarket_id` | `submarketId` |
| `parent_market_id` | `parentMarketId` |
| `source_id` | `sourceId` |
| `geometry_status` | `geometryStatus` |
| `checked_at` | `checkedAt` |

Adapter/Normalizer는 필드명만 변환하며 원본 값, Market ID, 출처와 미수집 상태를 임의로 변경하지 않는다. 미수집 값은 `null`, 실제 0만 `0`으로 유지한다.
