# MARKET ID FREEZE v1.1

**동결 기준일:** 2026-08-27  
**Level 3 최종 수:** 156개  
**중복:** 0건

## Naming Rule

- Level 3: `SEOUL-{GU_CODE}-{MARKET_SLUG}`
- Level 4: `{PARENT_MARKET_ID}-{DESCRIPTIVE_SLUG}`; 검증 전 일반 권역은 안정적인 `SMnn` 사용
- Level 5: `{PARENT_SUBMARKET_ID}-Nnn`
- ID는 한글 표시명과 분리하며, 표시명 변경만으로 ID를 바꾸지 않는다.

## v1 → v1.1 Crosswalk

| old_market_id | new_market_id | reason |
|---|---|---|
| `SEOUL-JONGNO-SEOCHEON-GYEONGBOK` | `SEOUL-JONGNO-SEOCHON-GYEONGBOK` | 서촌의 영문 표기 SEOCHEON은 서천으로 읽히는 명백한 오탈자 |
| `SEOUL-JUNGNANG-MYEONMOK-SAGAJUNG` | `SEOUL-JUNGNANG-MYEONMOK-SAGAJEONG` | 사가정의 표준 로마자 음절 JEONG 누락 |

## 품질검수 결론

- 동일 ID·동일 지역 중복 없음.
- 서울역·강남역·신대방 등 구 경계 인접 권역은 소속 구를 대표 저장 위치로 유지하되 `cross_district_review` 대상이다.
- 지나치게 넓은 결합권역은 Level 4로 분리하고 Level 3는 기존 156개 호환성을 유지한다.
- v1.1 이후 Level 3 ID는 프로그램·외부문서 사용 전 동결한다.