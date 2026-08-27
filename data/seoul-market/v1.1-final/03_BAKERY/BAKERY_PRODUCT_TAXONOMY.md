# BAKERY PRODUCT TAXONOMY

**기준일:** 2026-08-26  
**목적:** 메뉴명·경쟁점·매출·장비·소비자 매칭의 공통 분류

| 대분류 코드 | 대분류 | 중분류/상품 예시 | 주요 구매목적 | 필수 확인 |
|---|---|---|---|---|
| BREAD_MEAL | 식사빵 | 식빵·사워도우·바게트·치아바타·포카치아 | 일상식·식사대용 | 생산주기·보관·반복구매 |
| PASTRY | 페이스트리 | 크루아상·뺑오쇼콜라·데니시·퀸아망 | 간식·경험·커피 동반 | 버터·공정·시터·당일성 |
| TREND_BREAD | 트렌드빵 | 소금빵·베이글·크림빵·도넛·잠봉뵈르 | 유행·목적구매·SNS | 검색추이·경쟁밀도·유행수명 |
| DESSERT | 디저트 | 케이크·타르트·휘낭시에·마들렌·쿠키·스콘 | 기념·간식·선물 | 냉장·쇼케이스·예약 |
| MEAL_REPLACEMENT | 식사대용 | 샌드위치·샐러드·브런치·세트 | 출근·점심·간편식 | 조리·위생·좌석·회전 |
| GIFT | 선물 | 구움과자·선물세트·패키지 | 방문·명절·기업·기념 | 포장·재고·예약·배송 |
| BEVERAGE_COFFEE | 커피 | 아메리카노·라떼·콜드브루 | 동반구매·체류 | 머신·급배수·교육 |
| BEVERAGE_NONCOFFEE | 비커피 | 티·에이드·주스·시그니처 음료 | 가족·학생·저녁 | 제빙·냉장·재료관리 |

## 메뉴 속성 필드

- menu_id, category_code, name_ko, aliases
- core_ingredient, allergen_note, production_process
- equipment_ids, cold_chain_required, display_type
- target_consumer_codes, target_dayparts, purchase_purpose
- dine_in_fit, takeaway_fit, delivery_fit, gift_fit
- official_price_available, observed_price, observed_at, source_id
- trend_status, trend_period, evidence_source_ids, confidence

## 규칙

1. 메뉴 인기도와 매출을 혼동하지 않는다.
2. 소금빵·베이글 등 유행 메뉴는 연도·계절·검색원천을 함께 저장한다.
3. 온라인 메뉴가격은 **온라인 메뉴가격 관찰값**이며 객단가가 아니다.
4. 알레르기·식품표시·위생은 최신 법령과 전문가 확인이 필요하다.
