# MAP SCREEN SPEC

## Base map

Kakao Map JavaScript API를 메인 지도 UI로 사용한다. SGIS SDK는 메인 지도로 사용하지 않는다.

## Toggle layers

프레임원 상권 / 공식 서울 상권 / 세부상권 / 지하철 / 베이커리 / 카페 / 아파트 / 오피스 / 학교 / 병원 / 공원 / 주차 / 현장조사 Node.

## Interaction

- Tree 선택: geometry가 있으면 fitBounds, 없으면 확인된 Node/중심점으로 이동, 둘 다 없으면 지도 이동 없이 경고.
- Polygon 클릭: 해당 상권 상세패널.
- Node 클릭: Node 카드와 부모 세부상권 표시.
- 공식 상권과 프레임원 권역은 선·범례를 다르게 표시.
- `text_only`, `draft`, `validated`를 시각적으로 구분.
- 2023 공식 SHP와 2024+ 지표코드가 검증되지 않은 경우 오래된 geometry 경고를 표시.
