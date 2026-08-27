# MARKET TREE SPEC

원천: `08_PROGRAM/MARKET_HIERARCHY.json`.

- Level 1 서울특별시
- Level 2 25개 자치구
- Level 3 156개 주요상권
- Level 4 세부상권
- Level 5 Node

기능: 열기/접기, 한글 상권명·자치구·Market ID 검색, 최근 본 상권, 즐겨찾기, 조사우선순위 배지.

기본 라벨은 한글명이며 ID·공식 코드는 상세 또는 개발자 모드에서 표시한다. 부모 선택 시 하위 결과를 집계하되, 미수집 값을 0으로 합산하지 않는다.
