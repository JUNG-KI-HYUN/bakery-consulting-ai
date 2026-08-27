# API CATALOG · 프레임원 서울 상권

**확인일:** 2026-08-26  
`{KEY}`는 실제 키가 아니라 문서상 자리표시자다. 모든 키는 **사용자 발급 필요**다.

| API ID | 분야 | API 이름 | 제공기관 | 공식 URL | 가입 | 승인 | Key | 인증 | Endpoint | 형식 | 호출제한 | 갱신 | 상업적 이용 | 주요 필드 | 프레임원 활용 | 현재 상태 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| API-SEOUL-AREA | 상권 | 서울시 상권분석서비스(영역-상권) | 서울신용보증재단 | https://data.seoul.go.kr/dataList/OA-15560/S/1/datasetView.do | 필요 | 통상 자동/정책 확인 | 필요 | 서울 OpenAPI 키 또는 파일다운로드 | 페이지 내 OpenAPI 명세/공식 ZIP; 서비스코드 최신 명세 확인 | Sheet·파일·API | 계정별 정책 확인 | 비정기 | 공공누리1유형(페이지 확인) | 상권코드·유형·행정동·geometry | Market ID 공식 crosswalk | 페이지 정상·geometry 최신 파일연도 확인 필요 |
| API-SEOUL-STORES | 상권 | 점포-상권 | 서울신용보증재단 | https://data.seoul.go.kr/dataList/OA-15577/S/1/datasetView.do | 필요 | 통상 자동/정책 확인 | 필요 | 서울 OpenAPI 키 | http://openapi.seoul.go.kr:8088/{KEY}/{TYPE}/{SERVICE}/{START}/{END}/ · SERVICE는 명세서 확인 | JSON/XML | 계정별 정책 확인 | 연간 | 공공누리1유형 | 점포·개업·폐업·프랜차이즈·업종 | 베이커리 경쟁·창폐업 | 페이지 정상·2025 파일 확인 |
| API-SEOUL-SALES | 상권 | 추정매출-상권 | 서울신용보증재단 | https://data.seoul.go.kr/dataList/OA-15572/S/1/datasetView.do | 필요 | 통상 자동/정책 확인 | 필요 | 서울 OpenAPI 키 | 서울 OpenAPI 공통패턴 · SERVICE 최신 명세 확인 | JSON/XML | 계정별 정책 확인 | 페이지 명세 확인 | 공공누리1유형 | 추정매출·요일·시간·연령·성별 | 수요·시간대·매출구조 | 페이지 정상·2021년 이후 제공 변경 확인 |
| API-SEOUL-FOOT | 인구 | 길단위인구-상권 | 서울신용보증재단 | https://data.seoul.go.kr/dataList/OA-15568/S/1/datasetView.do | 필요 | 통상 자동/정책 확인 | 필요 | 서울 OpenAPI 키 | 서울 OpenAPI 공통패턴 · SERVICE 최신 명세 확인 | JSON/XML | 계정별 정책 확인 | 월간 | 공공누리1유형 | 생활/길단위인구·성별·연령·시간 | 평일·주말·시간대 | 페이지 정상·표준단위구역 변경 확인 |
| API-SEOUL-WORK | 인구 | 직장인구-상권 | 서울신용보증재단 | https://data.seoul.go.kr/dataList/OA-15569/S/1/datasetView.do | 필요 | 통상 자동/정책 확인 | 필요 | 서울 OpenAPI 키 | 서울 OpenAPI 공통패턴 · SERVICE 최신 명세 확인 | JSON/XML | 계정별 정책 확인 | 반기 표기·설명상 4분기 갱신 | 공공누리1유형 | 직장인구·성별·연령 | 오피스 수요 | 페이지 정상 |
| API-SEOUL-ANCHOR | 시설 | 집객시설-상권 | 서울신용보증재단 | https://data.seoul.go.kr/dataList/OA-15580/S/1/datasetView.do | 필요 | 통상 자동/정책 확인 | 필요 | 서울 OpenAPI 키 | 서울 OpenAPI 공통패턴 · SERVICE 최신 명세 확인 | JSON/XML | 계정별 정책 확인 | 연간 | 공공누리1유형 | 학교·병원·유통·교통 등 | 앵커시설 | 페이지 정상 |
| API-SEOUL-CONSUME | 상권 | 소비-상권 | 서울신용보증재단 | https://data.seoul.go.kr/dataList/OA-21278/S/1/datasetView.do | 필요 | 통상 자동/정책 확인 | 필요 | 서울 OpenAPI 키 | 서울 OpenAPI 공통패턴 · SERVICE 최신 명세 확인 | JSON/XML | 계정별 정책 확인 | 명세 확인 | 공식페이지 조건 확인 | 추정 소비 | 소비구조 보조 | 페이지 정상·행정동 집계와 원천 차이 주의 |
| API-SEOUL-LIVING-GRID | 인구 | 서울 생활인구 250m 격자 | 서울특별시 | https://data.seoul.go.kr/dataVisual/seoul/seoulLivingPopulation.do | 필요 가능 | 정책 확인 | 필요 가능 | 서울 데이터 인증 | 전환 후 정확한 데이터셋·endpoint 확인 필요 | CSV/API 확인 필요 | 정책 확인 | 매일(4일전 안내) | 공식페이지 조건 확인 | 시간·성별·연령·내/외국인 | 상권 생활인구 공간집계 | 전환 진행·구 행정동 생산 종료 |
| API-SEOUL-REGISTEREDPOP | 인구 | 등록인구(연령별/동별) | 서울특별시 | https://data.seoul.go.kr/dataList/DT201003A010006/S/2/datasetView.do | 불필요/Sheet 중심 | 불필요 | 불필요 가능 | 없음 또는 서울키 | 공식 Sheet/통계 API 명세 확인 | Sheet/API 확인 | 해당없음 | 분기 | 공공누리1유형 | 인구·세대·연령·외국인 | 배후주거 | 페이지 정상·2026-04-27 갱신 |
| API-SUBWAY-DAILY | 교통 | 지하철호선별 역별 승하차 | 서울특별시 | https://data.seoul.go.kr/dataList/OA-12914/S/1/datasetView.do | 필요 | 통상 자동/정책 확인 | 필요 | 서울 OpenAPI 키 | 서울 OpenAPI 공통패턴 · SERVICE 최신 명세 확인 | JSON/XML/CSV | 계정별 정책 확인 | 매일(3일전) | 공식페이지 조건 확인 | 일자·노선·역·승하차 | 핵심역 규모 | 페이지 정상·2026-07 파일 확인 |
| API-SUBWAY-HOURLY | 교통 | 역별 일별 시간대별 승하차 | 서울교통공사 | https://data.seoul.go.kr/dataList/OA-12921/F/1/datasetView.do | 파일 이용 가능 | 불필요 | 불필요 | 없음 | 공식 CSV 파일 | CSV | 해당없음 | 연간 | 공공누리3유형(변경금지) | 역·승하차·시간대 | 출근·점심·퇴근 구조 | 페이지 정상·2025-12 파일 확인 |
| API-SEOUL-REALTIME | 인구·교통·상권 | 서울 실시간 도시데이터 | 서울특별시 | https://data.seoul.go.kr/SeoulRtd/ | 필요 가능 | 정책 확인 | 필요 가능 | 서울 OpenAPI 키 | 공식 API 명세서에서 endpoint 확인 필요 | JSON/XML 가능성·명세 확인 | 정책 확인 | 실시간 | 공식페이지 조건 확인 | 인구·카드·교통·주차·날씨 | 핫스팟 단기 현황 | 포털 정상·지정 장소 한정 |
| API-SGIS | 지리·인구 | SGIS Data/Boundary/Geocoder API | 국가데이터처 | https://sgis.mods.go.kr/view/newhelp/de_help_10_0 | 필요 | 키 발급 | 필요 | consumer_key/secret→access token | 서비스별 공식 endpoint 확인 | JSON | 서비스별 확인 | 자료별 상이 | 무료·약관 확인 | 행정경계·인구·가구·주택·사업체 | 격자/행정동·배후지 분석 | 정상·로그인과 키 필요 |
| API-SHOP-SDSC | 점포·업종 | 상가(상권)정보 API | 소상공인시장진흥공단 | https://www.data.go.kr/data/15012005/openapi.do | 필요 | 활용신청 | 필요 | 공공데이터포털 serviceKey | http://apis.data.go.kr/B553077/api/open/sdsc2 · 세부 path는 최신 활용가이드 확인 | JSON/XML | 승인 화면 확인 | 명세 확인 | 공공데이터 이용조건 확인 | 상호·업종·주소·좌표·상권 | 경쟁점·업종구성 | 공식 변경 URL 확인·세부 정상호출은 키 발급 후 |
| API-SBIZ365 | 상권 | 소상공인365 Open API | 소상공인시장진흥공단 | https://bigdata.sbiz.or.kr/ | 필요 | 신청·승인 필요 가능 | 필요 | 발급키 | 로그인 후 이용안내→개방·활용→Open API 신청에서 명세 확인 | 명세 확인 | 승인 후 확인 | 명세 확인 | 약관 확인 필요 | 간단분석·상세분석·핫플레이스 | 상권 보고서 보조 | 사이트 정상·endpoint 공개 확인 필요 |
| API-RTMS-COMMERCIAL | 부동산 | 상업업무용 부동산 매매 실거래가 | 국토교통부 | https://www.data.go.kr/data/15126463/openapi.do | 필요 | 활용신청 | 필요 | 공공데이터포털 serviceKey | 공식 Swagger/명세에서 최신 endpoint 확인 | XML/JSON 여부 명세 확인 | 승인화면 확인 | 월별 조회 | 공공데이터 이용조건 확인 | 법정동코드·계약년월·거래금액·면적 | 상가 매매 실거래 | 페이지 정상·임대차 아님 |
| API-BUILDING-HUB | 부동산·시설 | 건축HUB 건축물대장정보 | 국토교통부 | https://www.data.go.kr/ | 필요 | 활용신청 | 필요 | 공공데이터포털 serviceKey | 정확한 상품 URL과 endpoint 재확인 필요 | XML/JSON | 승인화면 확인 | 자료별 상이 | 공공데이터 이용조건 확인 | 표제부·층별·용도·면적·승인일 | 점포 용도·면적·건물검토 | 서비스 존재 확인·상품 식별 재확인 |
| API-TOURISM-DATALAB | 관광 | 한국관광 데이터랩 | 한국관광공사 | https://datalab.visitkorea.or.kr/ | 웹 로그인 가능 | 자료별 승인 | 공개 API 확인 필요 | 확인 필요 | 공식 공개 API endpoint 확인 필요 | 다운로드/웹 | 정책 확인 | 자료별 상이 | 이용약관 확인 | 외지인 방문·체류·관광소비 | 관광형 상권 | 포털 정상·자동 API 미확정 |
| API-NAVER-GEOCODE | 지리 | NAVER Maps Geocoding | NAVER Cloud | https://api.ncloud-docs.com/docs/ai-naver-mapsgeocoding-geocode | 필요 | 상품 신청·결제정책 | 필요 | API Gateway Key ID/Key | GET https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode | JSON | 요금제/쿼터 확인 | 실시간 | 상업 이용 약관·요금 확인 | 도로명·지번·경위도 | 주소 정규화·좌표 | 공식 문서 정상 |

## 운영원칙

1. API 페이지가 존재한다고 정상 호출을 확정하지 않는다.
2. 키 발급 후 최소 1건 테스트에서 HTTP 상태·스키마·최신 기준시점을 확인한다.
3. endpoint나 호출제한이 공개 페이지에서 확인되지 않으면 **확인 필요**로 둔다.
4. 서울 상권데이터는 geometry_version과 기준분기를 함께 저장한다.
5. Secret은 문서·코드·로그에 넣지 않고 환경변수로만 관리한다.
6. 웹사이트 화면을 무단 크롤링하지 않고 공식 API·다운로드·이용약관을 우선한다.


## v1.1 실제 사용등급

상세 상태는 `API_READINESS_MATRIX.md`를 기준으로 한다. 상태 enum: READY / KEY_AVAILABLE / APPLICATION_REQUIRED / SPEC_CHECK_REQUIRED / NOT_REQUIRED_NOW. 2026-08-27 현재 인증 기반 API READY는 0개이며, 인증 불필요 서울 공식 파일 다운로드 1개만 READY다.

| API ID | 실사용등급 | 판정 |
|---|---|---|
| API-SEOUL-AREA | READY | 공식 SHP 실제 다운로드·변환 완료; OpenAPI 키 호출은 별도 미확인 |
| API-SEOUL-STORES | KEY_AVAILABLE | 서울 키 실제 호출 필요 |
| API-SEOUL-SALES | KEY_AVAILABLE | 서울 키 실제 호출 필요 |
| API-SEOUL-FOOT | KEY_AVAILABLE | 2024+ 표준단위구역 기준 호출 필요 |
| API-SEOUL-WORK | KEY_AVAILABLE | 서울 키 실제 호출 필요 |
| API-SEOUL-ANCHOR | KEY_AVAILABLE | 서울 키 실제 호출 필요 |
| API-SEOUL-CONSUME | KEY_AVAILABLE | 서울 키 실제 호출 필요 |
| API-SEOUL-LIVING-GRID | KEY_AVAILABLE | 250m geometry 확보; 수치 API 키 호출 필요 |
| API-SEOUL-REGISTEREDPOP | SPEC_CHECK_REQUIRED | 파일/Sheet 우선, 적재 분기 확정 필요 |
| API-SUBWAY-DAILY | KEY_AVAILABLE | 서울 키 실제 호출 필요 |
| API-SUBWAY-HOURLY | SPEC_CHECK_REQUIRED | 인증 불필요 파일 페이지 확인; 실제 파일 적재 테스트 미실행 |
| API-SEOUL-REALTIME | NOT_REQUIRED_NOW | 지정 장소 한정, 현재 핵심 아님 |
| API-SGIS | KEY_AVAILABLE | 사용자 발급 완료, 현재 환경 토큰 테스트 필요 |
| API-SHOP-SDSC | APPLICATION_REQUIRED | 공공데이터포털 서비스 활용신청 확인 필요 |
| API-SBIZ365 | APPLICATION_REQUIRED | 서비스별 승인·명세 확인 필요 |
| API-RTMS-COMMERCIAL | APPLICATION_REQUIRED | 상업업무용 매매 실거래 활용신청 확인 필요 |
| API-BUILDING-HUB | APPLICATION_REQUIRED | 정확한 상품·활용신청 확인 필요 |
| API-TOURISM-DATALAB | NOT_REQUIRED_NOW | 관광형 파일럿 보완단계에서 검토 |
| API-NAVER-GEOCODE | NOT_REQUIRED_NOW | Kakao 우선, 대체수단으로 보류 |
