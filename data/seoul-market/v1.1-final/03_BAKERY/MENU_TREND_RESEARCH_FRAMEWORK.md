# MENU TREND RESEARCH FRAMEWORK

| 필드 | 내용 |
|---|---|
| trend_id | 메뉴+연도+계절+지역 |
| menu_id | 소금빵·베이글·크루아상·사워도우·디저트·케이크·구움과자·브런치·선물·음료 |
| period | YYYY, 분기/계절 |
| geography | 전국/서울/Market ID |
| metric | 검색지수·구매조사·보고서지표·신규메뉴비중 |
| source | 네이버 데이터랩·Google Trends·공식브랜드·소비자조사·카드/배달보고서 |
| observed_value | 원천값; 스케일과 비교기간 필수 |
| interpretation | 프레임원 분석 의견 |
| confidence | A~E |

## 판단 규칙

1. 하나의 블로그·기사로 유행을 확정하지 않는다.
2. 검색량과 구매량을 같게 보지 않는다.
3. 신규성·반복구매·마진·설비부담·폐기율을 함께 본다.
4. v1에는 검증된 시계열을 적재하지 않았으므로 트렌드 숫자는 모두 `미수집`이다.
