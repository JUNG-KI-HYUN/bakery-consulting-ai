# SEOUL MARKET MASTER SOURCE · NotebookLM·Gemini·Claude·ChatGPT 공통 소스

**버전:** v1  
**기준일:** 2026-08-26  
**범위:** 서울 25개 자치구, 156개 프레임원 주요 분석권역

## 1. 목적과 정책 우선순위

이 문서는 상권 소개문이 아니라 상권분석, 베이커리 점포진단, 고객상담, 현장조사와 AI 질의의 공통 기준서다. 자료 충돌 시 최신 통합소스→베이커리지침→현재 프로그램 구조→수도권 분석관점 사례→상세 구축명세 순으로 적용한다.

최신 정책상 과거 STEP 1/2/3은 폐지되었다. 핵심 서비스는 **계약 전 점포개발·창업투자 검증 컨설팅**이며 마케팅 범위는 **오픈 초기 마케팅 실행계획 제공**이다. 90일 운영대행을 현재 서비스로 표현하지 않는다.

## 2. 필수 개념

- 상권은 배후수요·목적수요·외부유입·체류·소비동선·반복구매가 연결되는 공간이다.
- 역세권과 상권, 행정동과 상권은 서로 다르다.
- 서울시 공식 상권과 프레임원 분석권역은 N:M crosswalk로 관리한다.
- 베이커리 중요도는 분석·조사 우선순위이지 창업 성공도는 아니다.
- 최종 점포판단은 `추천 / 조건부 추천 / 보류 / 위험`으로 하되 상권만으로 결정하지 않는다.

## 3. Market ID

- Level 3: `SEOUL-{GU_CODE}-{MARKET_SLUG}`
- Level 4: 경계·운영 필요가 확정된 후 `SEOUL-{GU_CODE}-{MARKET_SLUG}-{SUBMARKET_SLUG}`
- 영문 대문자·숫자·하이픈만 사용하며 이름이 바뀌어도 ID를 유지한다.
- 폐지는 삭제 대신 `status=retired`, `replaced_by`를 사용한다.

## 4. 서울 전체 상권 인덱스

**기준일:** 2026-08-26  
**총 권역:** 156개  
**권역 성격:** 아래 권역은 공식 상권을 대체하지 않는 프레임원 분석권역이다.

| 순번 | 자치구 | 주요상권 | 세부상권 | Market ID | 대표/주요/지역 |
|---:|---|---|---|---|---|
| 1 | 종로구 | 광화문·종로권 | 광화문광장·청진동·종각·청계천 북측 | SEOUL-JONGNO-GWANGHWAMUN-JONGNO | 대표 |
| 2 | 종로구 | 인사동·익선권 | 인사동길·익선동 한옥거리·종로3가 북측 | SEOUL-JONGNO-INSADONG-IKSEON | 대표 |
| 3 | 종로구 | 삼청·북촌권 | 북촌한옥마을·삼청동길·안국동 | SEOUL-JONGNO-SAMCHEONG-BUKCHON | 주요 |
| 4 | 종로구 | 대학로권 | 혜화역·마로니에공원·성균관대 남측 | SEOUL-JONGNO-DAEHANGNO | 대표 |
| 5 | 종로구 | 서촌·경복궁권 | 경복궁 서측·통인시장·세종마을 | SEOUL-JONGNO-SEOCHON-GYEONGBOK | 주요 |
| 6 | 종로구 | 동대문·창신권 | 동대문역·창신동 봉제거리·흥인지문 북측 | SEOUL-JONGNO-DONGDAEMUN-CHANGSIN | 주요 |
| 7 | 종로구 | 부암·평창권 | 부암동 주민센터·평창동 문화시설축 | SEOUL-JONGNO-BUAM-PYEONGCHANG | 지역 |
| 8 | 중구 | 명동권 | 명동길·중앙로·을지로입구 남측 | SEOUL-JUNG-MYEONGDONG | 대표 |
| 9 | 중구 | 을지로권 | 을지로3가·세운상가·힙지로 골목 | SEOUL-JUNG-EULJIRO | 대표 |
| 10 | 중구 | 남대문권 | 남대문시장·회현역·숭례문 | SEOUL-JUNG-NAMDAEMUN | 주요 |
| 11 | 중구 | 동대문패션타운권 | DDP·두타·평화시장·광희동 | SEOUL-JUNG-DONGDAEMUN-FASHION | 대표 |
| 12 | 중구 | 서울역권 | 서울역 동측·서소문·만리동 연결축 | SEOUL-JUNG-SEOULSTN | 주요 |
| 13 | 중구 | 시청·북창권 | 서울시청·덕수궁·북창동·무교동 | SEOUL-JUNG-CITYHALL-BUKCHANG | 주요 |
| 14 | 중구 | 신당·약수권 | 신당동 떡볶이타운·중앙시장·약수역 | SEOUL-JUNG-SINDANG-YAKSU | 주요 |
| 15 | 용산구 | 이태원권 | 이태원역·세계음식거리·앤틱가구거리 | SEOUL-YONGSAN-ITAEWON | 대표 |
| 16 | 용산구 | 한남권 | 한남오거리·한남동 카페거리·리움미술관 연결축 | SEOUL-YONGSAN-HANNAM | 대표 |
| 17 | 용산구 | 해방촌·경리단권 | 신흥시장·해방촌오거리·경리단길 | SEOUL-YONGSAN-HAEBANGCHON-GYEONGNIDAN | 주요 |
| 18 | 용산구 | 용리단길·신용산권 | 신용산역 동측·용리단길·삼각지역 | SEOUL-YONGSAN-YONGLIDAN-SINYONGSAN | 대표 |
| 19 | 용산구 | 용산역권 | 용산역·아이파크몰·전자상가 | SEOUL-YONGSAN-YONGSANSTN | 주요 |
| 20 | 용산구 | 남영·숙대권 | 남영역·숙대입구·숙명여대 정문 | SEOUL-YONGSAN-NAMYEONG-SOOKMYUNG | 주요 |
| 21 | 용산구 | 효창·후암권 | 효창공원앞·후암시장·서울역 남부 | SEOUL-YONGSAN-HYOCHANG-HUAM | 지역 |
| 22 | 성동구 | 성수권 | 연무장길·성수역 북측·성수역 남측·아뜰리에길·뚝섬 연결축 | SEOUL-SEONGDONG-SEONGSU | 대표 |
| 23 | 성동구 | 서울숲권 | 서울숲·아크로서울포레스트·서울숲 카페거리 | SEOUL-SEONGDONG-SEOULFOREST | 대표 |
| 24 | 성동구 | 왕십리권 | 왕십리역·비트플렉스·행당시장 연결축 | SEOUL-SEONGDONG-WANGSIMNI | 대표 |
| 25 | 성동구 | 행당·한양대권 | 한양대 정문·행당시장·왕십리 남측 | SEOUL-SEONGDONG-HAENGDANG-HANYANG | 주요 |
| 26 | 성동구 | 금호·옥수권 | 금호역·옥수역·독서당로 주거축 | SEOUL-SEONGDONG-GEUMHO-OKSU | 주요 |
| 27 | 성동구 | 마장권 | 마장축산물시장·마장역·청계천 북측 | SEOUL-SEONGDONG-MAJANG | 지역 |
| 28 | 광진구 | 건대입구권 | 건대입구역·건대 맛의거리·커먼그라운드 | SEOUL-GWANGJIN-KONKUK | 대표 |
| 29 | 광진구 | 구의·강변권 | 구의역·강변역·테크노마트·동서울터미널 | SEOUL-GWANGJIN-GUI-GANGBYEON | 대표 |
| 30 | 광진구 | 자양권 | 자양전통시장·뚝섬한강공원 연결 주거축 | SEOUL-GWANGJIN-JAYANG | 주요 |
| 31 | 광진구 | 어린이대공원·세종대권 | 어린이대공원·세종대·능동로 | SEOUL-GWANGJIN-CHILDRENSPARK-SEJONG | 주요 |
| 32 | 광진구 | 군자·중곡권 | 군자역·중곡제일시장·용마산 남측 생활권 | SEOUL-GWANGJIN-GUNJA-JUNGGOK | 지역 |
| 33 | 동대문구 | 청량리권 | 청량리역·롯데백화점·청량리시장 | SEOUL-DONGDAEMUN-CHEONGNYANGNI | 대표 |
| 34 | 동대문구 | 회기·경희대권 | 회기역·경희대 정문·경희대로 | SEOUL-DONGDAEMUN-HOEGI-KYUNGHEE | 대표 |
| 35 | 동대문구 | 외대앞·이문권 | 외대앞역·한국외대 정문·이문동 | SEOUL-DONGDAEMUN-HUFS-IMUN | 주요 |
| 36 | 동대문구 | 장안·답십리권 | 장안동 사거리·답십리역·자동차부품상가축 | SEOUL-DONGDAEMUN-JANGAN-DAPSIMNI | 주요 |
| 37 | 동대문구 | 전농권 | 전농사거리·전농동 아파트단지·청량리 남측 | SEOUL-DONGDAEMUN-JEONNONG | 지역 |
| 38 | 동대문구 | 제기·용두·신설권 | 경동시장·서울약령시장·신설동역 | SEOUL-DONGDAEMUN-JEGI-YONGDU-SINSEOL | 주요 |
| 39 | 중랑구 | 상봉권 | 상봉역·코스트코·상봉터미널 일대 | SEOUL-JUNGNANG-SANGBONG | 대표 |
| 40 | 중랑구 | 망우권 | 망우역·우림시장·망우로 생활축 | SEOUL-JUNGNANG-MANGU | 주요 |
| 41 | 중랑구 | 면목·사가정권 | 사가정역·면목시장·용마산 서측 | SEOUL-JUNGNANG-MYEONMOK-SAGAJEONG | 대표 |
| 42 | 중랑구 | 신내권 | 신내역·신내지구·봉화산역 주거권 | SEOUL-JUNGNANG-SINNAE | 주요 |
| 43 | 중랑구 | 중화권 | 중화역·중랑천·태릉시장 생활권 | SEOUL-JUNGNANG-JUNGHWA | 지역 |
| 44 | 성북구 | 성신여대권 | 성신여대입구역·성신여대 로데오·돈암시장 | SEOUL-SEONGBUK-SUNGSHIN | 대표 |
| 45 | 성북구 | 안암·고대권 | 고려대 정문·안암역·고대병원 | SEOUL-SEONGBUK-ANAM-KOREAUNIV | 대표 |
| 46 | 성북구 | 길음권 | 길음역·길음뉴타운·미아사거리 남측 | SEOUL-SEONGBUK-GIREUM | 주요 |
| 47 | 성북구 | 한성대·성북동권 | 한성대입구역·성북동길·성곽길 | SEOUL-SEONGBUK-HANSUNG-SEONGBUK | 주요 |
| 48 | 성북구 | 석계·장위권 | 석계역·장위뉴타운·돌곶이역 | SEOUL-SEONGBUK-SEOKGYE-JANGWI | 주요 |
| 49 | 성북구 | 정릉권 | 정릉시장·국민대·북한산 입구 | SEOUL-SEONGBUK-JEONGNEUNG | 지역 |
| 50 | 강북구 | 수유권 | 수유역·수유 먹자골목·강북구청 | SEOUL-GANGBUK-SUYU | 대표 |
| 51 | 강북구 | 미아사거리권 | 미아사거리역·롯데백화점·도봉로 교차축 | SEOUL-GANGBUK-MIASAGEORI | 대표 |
| 52 | 강북구 | 미아·번동권 | 미아역·번동사거리·북서울꿈의숲 서측 | SEOUL-GANGBUK-MIA-BEON | 주요 |
| 53 | 강북구 | 우이·북한산권 | 북한산우이역·우이동 계곡·솔밭공원 | SEOUL-GANGBUK-UI-BUKHANSAN | 주요 |
| 54 | 도봉구 | 창동권 | 창동역·창동민자역사 예정권·하나로마트축 | SEOUL-DOBONG-CHANGDONG | 대표 |
| 55 | 도봉구 | 쌍문권 | 쌍문역·쌍리단길·도봉보건소 남측 | SEOUL-DOBONG-SSANGMUN | 대표 |
| 56 | 도봉구 | 방학권 | 방학역·도깨비시장·도봉구청 | SEOUL-DOBONG-BANGHAK | 주요 |
| 57 | 도봉구 | 도봉산권 | 도봉산역·도봉산 등산로 입구 | SEOUL-DOBONG-DOBONGSAN | 주요 |
| 58 | 노원구 | 노원역권 | 노원역·롯데백화점·문화의거리 | SEOUL-NOWON-NOWONSTN | 대표 |
| 59 | 노원구 | 공릉권 | 공릉역·공리단길·서울과기대 | SEOUL-NOWON-GONGNEUNG | 대표 |
| 60 | 노원구 | 중계은행사거리권 | 은행사거리 학원가·중계동 아파트단지 | SEOUL-NOWON-JUNGGYE-ACADEMY | 대표 |
| 61 | 노원구 | 태릉입구권 | 태릉입구역·먹골역·묵동 생활축 | SEOUL-NOWON-TAEREUNG | 주요 |
| 62 | 노원구 | 상계권 | 상계역·상계중앙시장·수락산 남측 | SEOUL-NOWON-SANGGYE | 주요 |
| 63 | 노원구 | 월계·광운대권 | 광운대역·월계동 아파트·석계역 북측 | SEOUL-NOWON-WOLGYE-KWANGWOON | 주요 |
| 64 | 은평구 | 연신내권 | 연신내역·로데오거리·연서시장 | SEOUL-EUNPYEONG-YEONSINNAE | 대표 |
| 65 | 은평구 | 불광권 | 불광역·NC백화점·불광천 북측 | SEOUL-EUNPYEONG-BULGWANG | 주요 |
| 66 | 은평구 | 응암·새절권 | 응암오거리·새절역·불광천 카페축 | SEOUL-EUNPYEONG-EUNGAM-SAEJEOL | 대표 |
| 67 | 은평구 | 구파발·은평뉴타운권 | 구파발역·롯데몰·은평뉴타운 | SEOUL-EUNPYEONG-GUPABAL-NEWTOWN | 대표 |
| 68 | 은평구 | 녹번·수색권 | 녹번역·은평구청·수색역·DMC 서측 | SEOUL-EUNPYEONG-NOKBEON-SUSAEK | 주요 |
| 69 | 서대문구 | 신촌권 | 신촌역·연세로·신촌기차역 연결축 | SEOUL-SEODAEMUN-SINCHON | 대표 |
| 70 | 서대문구 | 이대권 | 이대역·이화여대 정문·대현문화공원 | SEOUL-SEODAEMUN-EWHA | 주요 |
| 71 | 서대문구 | 연희권 | 연희동 사러가 주변·연희맛로·연남 북측 | SEOUL-SEODAEMUN-YEONHUI | 대표 |
| 72 | 서대문구 | 홍제권 | 홍제역·인왕시장·유진상가 | SEOUL-SEODAEMUN-HONGJE | 주요 |
| 73 | 서대문구 | 가좌·남가좌권 | 가좌역·명지대·DMC 북측 주거축 | SEOUL-SEODAEMUN-GAJWA-NAMGAJWA | 주요 |
| 74 | 서대문구 | 독립문·영천시장권 | 독립문역·서대문형무소·영천시장 | SEOUL-SEODAEMUN-DONGNIMUN-YEONGCHEON | 주요 |
| 75 | 마포구 | 홍대권 | 홍대입구역·걷고싶은거리·서교동 클럽거리 | SEOUL-MAPO-HONGDAE | 대표 |
| 76 | 마포구 | 연남권 | 연트럴파크·연남동 골목·동진시장 | SEOUL-MAPO-YEONNAM | 대표 |
| 77 | 마포구 | 합정권 | 합정역·메세나폴리스·양화진 | SEOUL-MAPO-HAPJEONG | 대표 |
| 78 | 마포구 | 망원권 | 망원시장·망리단길·한강공원 연결축 | SEOUL-MAPO-MANGWON | 대표 |
| 79 | 마포구 | 상수권 | 상수역·홍대 서측·당인리 문화공간 | SEOUL-MAPO-SANGSU | 주요 |
| 80 | 마포구 | 공덕·마포권 | 공덕역·마포역·도화동 오피스축 | SEOUL-MAPO-GONGDEOK-MAPO | 대표 |
| 81 | 마포구 | 대흥·서강대권 | 대흥역·서강대·광흥창역 | SEOUL-MAPO-DAEHEUNG-SOGANG | 주요 |
| 82 | 마포구 | 상암DMC권 | 디지털미디어시티·월드컵경기장·하늘공원 | SEOUL-MAPO-SANGAM-DMC | 대표 |
| 83 | 양천구 | 목동오거리권 | 목동오거리·목동로데오·목동역 | SEOUL-YANGCHEON-MOKDONG-OGEORI | 대표 |
| 84 | 양천구 | 오목교권 | 오목교역·현대백화점·목동운동장 남측 | SEOUL-YANGCHEON-OMOKGYO | 대표 |
| 85 | 양천구 | 목동학원가권 | 목동 학원가·파리공원·아파트단지 | SEOUL-YANGCHEON-MOKDONG-ACADEMY | 대표 |
| 86 | 양천구 | 신정네거리권 | 신정네거리역·신정시장·신정동 주거축 | SEOUL-YANGCHEON-SINJEONGNEGEORI | 주요 |
| 87 | 양천구 | 신월권 | 신월사거리·신영시장·서서울호수공원 연결축 | SEOUL-YANGCHEON-SINWOL | 지역 |
| 88 | 강서구 | 마곡권 | 마곡나루역·LG사이언스파크·서울식물원 | SEOUL-GANGSEO-MAGOK | 대표 |
| 89 | 강서구 | 발산권 | 발산역·마곡 업무지구 동측·NC백화점 | SEOUL-GANGSEO-BALSAN | 대표 |
| 90 | 강서구 | 김포공항·롯데몰권 | 김포공항·롯데몰·공항시장 | SEOUL-GANGSEO-GIMPOAIRPORT | 대표 |
| 91 | 강서구 | 화곡권 | 화곡역·화곡본동시장·강서구청 남측 | SEOUL-GANGSEO-HWAGOK | 대표 |
| 92 | 강서구 | 까치산권 | 까치산역·화곡8동 생활축 | SEOUL-GANGSEO-KKACHISAN | 주요 |
| 93 | 강서구 | 등촌·염창권 | 등촌역·염창역·증미역 업무·주거축 | SEOUL-GANGSEO-DEUNGCHON-YEOMCHANG | 주요 |
| 94 | 강서구 | 방화권 | 방화역·개화산역·방신시장 | SEOUL-GANGSEO-BANGHWA | 지역 |
| 95 | 구로구 | 구로디지털단지권 | 구로디지털단지역·G밸리 동측·깔깔거리 | SEOUL-GURO-GURODIGITAL | 대표 |
| 96 | 구로구 | 신도림권 | 신도림역·디큐브시티·테크노마트 | SEOUL-GURO-SINDORIM | 대표 |
| 97 | 구로구 | 구로역권 | 구로역·AK플라자·구로시장 | SEOUL-GURO-GUROSTN | 주요 |
| 98 | 구로구 | 고척·개봉권 | 고척스카이돔·개봉역·고척시장 | SEOUL-GURO-GOCHEOK-GAEBONG | 대표 |
| 99 | 구로구 | 오류·온수권 | 오류동역·온수역·오류시장 | SEOUL-GURO-ORYU-ONSU | 주요 |
| 100 | 구로구 | 천왕권 | 천왕역·천왕지구·항동지구 연결축 | SEOUL-GURO-CHEONWANG | 주요 |
| 101 | 금천구 | 가산디지털단지권 | 가산디지털단지역·G밸리 서측·아울렛단지 | SEOUL-GEUMCHEON-GASANDIGITAL | 대표 |
| 102 | 금천구 | 독산권 | 독산역·독산동 우시장·홈플러스축 | SEOUL-GEUMCHEON-DOKSAN | 대표 |
| 103 | 금천구 | 시흥사거리권 | 시흥사거리·은행나무시장·금천구청 남측 | SEOUL-GEUMCHEON-SIHEUNG-SAGEORI | 주요 |
| 104 | 금천구 | 금천구청권 | 금천구청역·롯데캐슬 주거복합·안양천 | SEOUL-GEUMCHEON-GEUMCHEONGU-OFFICE | 주요 |
| 105 | 영등포구 | 여의도권 | 여의도역·IFC·더현대서울·금융가·한강공원 | SEOUL-YEONGDEUNGPO-YEOUIDO | 대표 |
| 106 | 영등포구 | 영등포역·타임스퀘어권 | 영등포역·타임스퀘어·신세계백화점 | SEOUL-YEONGDEUNGPO-YEONGDEUNGPOSTN | 대표 |
| 107 | 영등포구 | 문래권 | 문래창작촌·문래역·철공소 골목 | SEOUL-YEONGDEUNGPO-MULLAE | 대표 |
| 108 | 영등포구 | 당산권 | 당산역·당산동 오피스·한강 연결축 | SEOUL-YEONGDEUNGPO-DANGSAN | 대표 |
| 109 | 영등포구 | 선유도·양평권 | 선유도공원·선유도역·양평동 업무축 | SEOUL-YEONGDEUNGPO-SEONYUDO-YANGPYEONG | 주요 |
| 110 | 영등포구 | 신길·대림권 | 신길뉴타운·대림역·대림중앙시장 | SEOUL-YEONGDEUNGPO-SINGIL-DAERIM | 주요 |
| 111 | 영등포구 | 영등포시장권 | 영등포시장·영등포로터리·국회대로 남측 | SEOUL-YEONGDEUNGPO-YEONGDEUNGPO-MARKET | 주요 |
| 112 | 동작구 | 사당권 | 사당역·남현동 먹자골목·관악산 북측 | SEOUL-DONGJAK-SADANG | 대표 |
| 113 | 동작구 | 이수권 | 이수역·태평백화점·남성사계시장 | SEOUL-DONGJAK-ISU | 대표 |
| 114 | 동작구 | 노량진권 | 노량진역·학원가·수산시장 | SEOUL-DONGJAK-NORYANGJIN | 대표 |
| 115 | 동작구 | 흑석권 | 흑석역·중앙대·흑석시장 | SEOUL-DONGJAK-HEUKSEOK | 대표 |
| 116 | 동작구 | 상도권 | 상도역·장승배기역·숭실대 | SEOUL-DONGJAK-SANGDO | 주요 |
| 117 | 동작구 | 신대방삼거리·보라매권 | 신대방삼거리·보라매공원·병원업무축 | SEOUL-DONGJAK-SINDAEBANG-BORAMAE | 주요 |
| 118 | 관악구 | 신림권 | 신림역·별빛거리·순대타운 | SEOUL-GWANAK-SILLIM | 대표 |
| 119 | 관악구 | 서울대입구·샤로수길권 | 서울대입구역·샤로수길·관악구청 | SEOUL-GWANAK-SNU-SHAROSU | 대표 |
| 120 | 관악구 | 낙성대권 | 낙성대역·인헌시장·낙성대공원 | SEOUL-GWANAK-NAKSEONGDAE | 주요 |
| 121 | 관악구 | 봉천권 | 봉천역·봉천제일시장·은천동 주거축 | SEOUL-GWANAK-BONGCHEON | 주요 |
| 122 | 관악구 | 대학동·관악산입구권 | 서울대 정문·대학동 고시촌·관악산 입구 | SEOUL-GWANAK-DAEHAKDONG-GWANAKSAN | 주요 |
| 123 | 관악구 | 신대방·난곡권 | 신대방역·난곡사거리·도림천 남측 | SEOUL-GWANAK-SINDAEBANG-NANGOK | 지역 |
| 124 | 서초구 | 강남역 서초권 | 강남역 서측·서초대로·강남대로 남단 | SEOUL-SEOCHO-GANGNAMSTN-WEST | 대표 |
| 125 | 서초구 | 교대권 | 교대역·법조타운·먹자골목 | SEOUL-SEOCHO-GYODAE | 대표 |
| 126 | 서초구 | 서초권 | 서초역·예술의전당·법원 남측 | SEOUL-SEOCHO-SEOCHO | 주요 |
| 127 | 서초구 | 반포·고속터미널권 | 고속터미널·센트럴시티·신세계강남·반포한강공원 | SEOUL-SEOCHO-BANPO-EXPRESSTERMINAL | 대표 |
| 128 | 서초구 | 잠원권 | 잠원역·신사역 남측·한강공원 | SEOUL-SEOCHO-JAMWON | 주요 |
| 129 | 서초구 | 방배·서래마을권 | 방배역·내방역·서래마을·카페골목 | SEOUL-SEOCHO-BANGBAE-SEORAE | 대표 |
| 130 | 서초구 | 양재권 | 양재역·양재시민의숲·AT센터·오피스축 | SEOUL-SEOCHO-YANGJAE | 대표 |
| 131 | 서초구 | 내곡·청계산입구권 | 청계산입구역·내곡지구·헌인릉 | SEOUL-SEOCHO-NAEGOK-CHEONGGYESAN | 주요 |
| 132 | 강남구 | 강남역권 | 강남역 동측·테헤란로 초입·역삼동 먹자축 | SEOUL-GANGNAM-GANGNAMSTN | 대표 |
| 133 | 강남구 | 역삼·테헤란로권 | 역삼역·테헤란로 오피스·강남파이낸스센터 | SEOUL-GANGNAM-YEOKSAM-TEHERAN | 대표 |
| 134 | 강남구 | 선릉권 | 선릉역·테헤란로 중부·선정릉 서측 | SEOUL-GANGNAM-SEOLLEUNG | 대표 |
| 135 | 강남구 | 삼성·코엑스권 | 삼성역·코엑스·무역센터·봉은사 | SEOUL-GANGNAM-SAMSUNG-COEX | 대표 |
| 136 | 강남구 | 청담권 | 청담사거리·명품거리·도산대로 동측 | SEOUL-GANGNAM-CHEONGDAM | 대표 |
| 137 | 강남구 | 압구정권 | 압구정역·로데오거리·갤러리아 | SEOUL-GANGNAM-APGUJEONG | 대표 |
| 138 | 강남구 | 신사·가로수길권 | 신사역·가로수길·세로수길 | SEOUL-GANGNAM-SINSA-GAROSU | 대표 |
| 139 | 강남구 | 논현권 | 논현역·영동시장·학동역 가구거리 | SEOUL-GANGNAM-NONHYEON | 주요 |
| 140 | 강남구 | 대치·도곡권 | 대치동 학원가·도곡동 주거축·한티역 | SEOUL-GANGNAM-DAECHI-DOGOK | 대표 |
| 141 | 강남구 | 수서·세곡권 | 수서역·SRT·세곡지구·대모산 남측 | SEOUL-GANGNAM-SUSEO-SEGOK | 주요 |
| 142 | 송파구 | 잠실권 | 잠실역·롯데월드몰·롯데월드·잠실종합운동장 연결축 | SEOUL-SONGPA-JAMSIL | 대표 |
| 143 | 송파구 | 송리단길권 | 석촌호수 동호·송리단길·석촌역 북측 | SEOUL-SONGPA-SONGRIDAN | 대표 |
| 144 | 송파구 | 방이권 | 방이먹자골목·몽촌토성역·올림픽공원 서측 | SEOUL-SONGPA-BANGI | 대표 |
| 145 | 송파구 | 문정권 | 문정법조단지·가든파이브·문정역 | SEOUL-SONGPA-MUNJEONG | 대표 |
| 146 | 송파구 | 가락시장권 | 가락시장·가락몰·가락시장역 | SEOUL-SONGPA-GARAKMARKET | 대표 |
| 147 | 송파구 | 석촌·삼전권 | 석촌역·삼전역·백제고분로 생활축 | SEOUL-SONGPA-SEOKCHON-SAMJEON | 주요 |
| 148 | 송파구 | 올림픽공원권 | 올림픽공원·KSPO DOME·한성백제박물관 | SEOUL-SONGPA-OLYMPICPARK | 대표 |
| 149 | 송파구 | 위례송파권 | 위례신도시 송파권·장지천·위례광장 | SEOUL-SONGPA-WIRYE-SONGPA | 대표 |
| 150 | 송파구 | 거여·마천권 | 거여역·마천중앙시장·위례 북측 | SEOUL-SONGPA-GEOYEO-MACHEON | 주요 |
| 151 | 강동구 | 천호권 | 천호역·현대백화점·로데오거리·한강공원 남측 | SEOUL-GANGDONG-CHEONHO | 대표 |
| 152 | 강동구 | 강동·길동권 | 강동역·길동사거리·길동복조리시장 | SEOUL-GANGDONG-GANGDONG-GILDONG | 대표 |
| 153 | 강동구 | 암사권 | 암사역·암사종합시장·선사유적지·한강 | SEOUL-GANGDONG-AMSA | 대표 |
| 154 | 강동구 | 고덕·상일권 | 고덕역·상일동역·고덕비즈밸리·대단지 아파트 | SEOUL-GANGDONG-GODEOK-SANGIL | 대표 |
| 155 | 강동구 | 둔촌권 | 둔촌동역·올림픽파크포레온·보훈병원 | SEOUL-GANGDONG-DUNCHON | 대표 |
| 156 | 강동구 | 명일권 | 명일역·고덕전통시장·명일동 학원가 | SEOUL-GANGDONG-MYEONGIL | 주요 |

## 해석 주의

- **데이터 확보율 구조100·수치0**은 필드·ID·원천 연결은 완료했으나 상권별 최신 숫자는 아직 적재하지 않았다는 뜻이다.
- 핵심 소비층과 상권유형은 1차 프레임원 분류 의견이며, 현장·공식 수치 적재 후 보정한다.
- 세부상권은 Level 4, 역·거리·앵커는 Level 5 Node의 초안이다.

## 5. 데이터 도메인

| 영역 | 필수 필드 | 판단 역할 |
|---|---|---|
| 위치 | 자치구·행정동·역/출구·거리·경계·인접권역 | 주소 매칭·현장관측점 |
| 인구 | 인구·세대·연령·1인가구·주거·아파트 | 배후·반복구매 |
| 생활인구 | 평일/주말·시간·성·연령·내/외국인 | 유입·체류·시간대 |
| 업무 | 사업체·종사자·오피스·기업 | 출근·점심·선물 |
| 교통 | 지하철·승하차·버스·환승·차량·주차 | 접근·통과·배달 |
| 앵커 | 학교·병원·공원·관광·몰·시장·호텔·공연 | 목적방문·회유 |
| 상권 | F&B·카페·베이커리·디저트·창폐업·추정매출 | 경쟁·수요 |
| 부동산 | 보증금·월세·관리비·권리금·공실·매매실거래 | 호가/실거래 분리·투자검증 |
| 베이커리 | 경쟁유형·메뉴·고객·시간·모델·설비 | 적합성 가설·현장검증 |

## 6. 베이커리 분석 프레임

`소비자 × 시간대 × 방문목적 × 적합메뉴 × 가격민감도 × 반복구매`를 기본 레코드로 삼는다. 공식 구매자료가 없으면 적합메뉴와 반복구매를 수치화하지 않고 **프레임원 분석 의견**으로 남긴다. 메뉴가격 관찰값은 객단가가 아니다.

## 7. 데이터 상태 규칙

- 확인된 사실: source_id·기준시점·조회일·공간단위가 있음
- 프레임원 분석 의견: 소비층·메뉴·시간대·모델에 대한 가설
- 확인 필요: 수치·경계·영업여부·인허가·시설·계약조건 미확인
- 호가·실거래·메뉴가격 관찰·객단가는 서로 대체하지 않음

## 8. 주요 공식 원천

- [서울시 상권영역](https://data.seoul.go.kr/dataList/OA-15560/S/1/datasetView.do)
- [서울시 점포·창폐업](https://data.seoul.go.kr/dataList/OA-15577/S/1/datasetView.do)
- [서울시 추정매출](https://data.seoul.go.kr/dataList/OA-15572/S/1/datasetView.do)
- [서울시 길단위인구](https://data.seoul.go.kr/dataList/OA-15568/S/1/datasetView.do)
- [서울 생활인구](https://data.seoul.go.kr/dataVisual/seoul/seoulLivingPopulation.do)
- [지하철 일별 승하차](https://data.seoul.go.kr/dataList/OA-12914/S/1/datasetView.do)
- [SGIS OpenAPI](https://sgis.mods.go.kr/view/newhelp/de_help_10_0)
- [상가(상권)정보 API](https://www.data.go.kr/data/15012005/openapi.do)
- [상업업무용 매매 실거래](https://www.data.go.kr/data/15126463/openapi.do)

## 9. AI 응답 규칙

1. 주소·역·거리를 Market ID와 먼저 연결한다.
2. 사실·분석 의견·확인 필요를 나누어 답한다.
3. 숫자는 기준시점·출처·URL·신뢰등급 없이는 제시하지 않는다.
4. 상권이 좋다는 이유만으로 점포계약을 추천하지 않는다.
5. 모델·메뉴는 가설로 제시하고 경쟁·시설·월세·손익·운영역량을 함께 확인한다.

## 10. v1 한계

전 권역의 구조·ID·분류·수집필드는 갖췄지만 개별 권역의 최신 숫자와 확정 geometry는 아직 적재하지 않았다. `구조100·수치0`은 가짜 수치 생성을 방지하기 위한 명시적 상태다.
