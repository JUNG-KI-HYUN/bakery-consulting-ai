# FRAMEONE Public Data / API Map

기준일: 2026-09-02  
범위: 서울 우선, 전국 확장 가능성 포함  
판정: **A 바로 사용 가능 / B API Key·활용신청 필요 / C 파일 적재 필요 / D 민간 데이터 계약 필요 / E 현재 확인 불가·사용 비권장**

## 1. 결론

FRAMEONE의 P0·P1에 필요한 공공 데이터 기반은 충분하다. 다만 데이터가 해결하는 질문의 범위를 지켜야 한다.

- 서울시 데이터로 가능한 것: 공식 상권·행정동 단위 **추정매출 추이**, 업종별 점포 수·개폐업 집계, 생활·상주·직장인구, 상권영역.
- 전국 데이터로 가능한 것: 영업 중 점포 탐색, 인허가·폐업 이력, 주소·좌표, 건축물대장, 통계·경계, 집객시설.
- 공공 데이터만으로 불가능한 것: 개별 점포 실제 매출분포, 상위 20%·중위점 매출, 실시간 카드매출, 통신사 수준 유동인구, POS 메뉴·객단가, 배달 비중.
- 지도 렌더링과 매출 원천 데이터는 별도 문제다. Heatmap UI는 A지만, 정밀 매출 surface는 C/D다.
- 2026년부터 지방행정 인허가 데이터의 공식 개방 창구가 공공데이터포털로 통합되었다. 과거 `localdata.go.kr` 연계를 신규 설계의 전제로 삼지 않는다. [행정안전부 공식 발표](https://www.mois.go.kr/frt/bbs/type010/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000008&nttId=123399)

## 2. 소스별 확보 지도

| 소스 | 핵심 데이터 | 방식 | 판정 | 갱신/공간단위 | FRAMEONE 용도 | 핵심 한계 |
|---|---|---:|---:|---|---|---|
| [서울 열린데이터광장 추정매출-상권](https://data.seoul.go.kr/dataList/OA-15572/S/1/datasetView.do) | 업종별 분기 추정매출·건수, 요일·시간·성별·연령 | Open API + CSV/ZIP | B/C | 분기, 서울 상권 | 추세, BEP와 시장수준 비교 | 실제매출 아님; 2024년 공간단위 변경; 일관 공개구간 2021+ |
| [서울 추정매출-행정동](https://data.seoul.go.kr/dataList/OA-22175/S/1/datasetView.do) | 행정동·업종별 분기 추정매출 | Open API + 파일 | B/C | 분기, 행정동 | 공식상권 밖 보조 비교 | 점포 반경 매출로 오해 금지 |
| [서울 점포-상권](https://data.seoul.go.kr/dataList/OA-15577/A/1/datasetView.do) | 점포, 유사업종, 개업·폐업, 프랜차이즈 집계 | Open API + 파일 | B/C | 분기, 상권 | 경쟁·개폐업 변화 | 개별 점포 위치·상호 이력 아님 |
| [서울 점포-행정동](https://data.seoul.go.kr/dataList/OA-22172/S/1/datasetView.do) | 행정동별 업종 점포·개폐업 집계 | Open API + 파일 | B/C | 분기, 행정동 | 외곽 보조지표 | 2021+ 일관성 확인 필요 |
| [서울 상권영역](https://data.seoul.go.kr/dataList/OA-15560/S/1/datasetView.do) | 상권 코드·명·폴리곤 | SHP/공간파일 | C | 비정기, EPSG:5181 | Market/Submarket 매칭 | 좌표계 변환·버전 관리 필요 |
| [서울 길단위 생활인구](https://data.seoul.go.kr/dataList/OA-15568/S/1/datasetView.do) | 성·연령·시간대 생활인구 | Open API + 파일 | B/C | 월, 상권 | 수요 구성·시간대 해설 | 휴대전화 관측의 추정·보정값; 원형반경 직접값 아님 |
| [서울 상주인구](https://data.seoul.go.kr/dataList/OA-15584/S/1/datasetView.do) | 상권별 성·연령·가구 인구 | Open API + 파일 | B/C | 연/분기 반복 | 주거 배후수요 | 갱신 지연과 반복 분기 존재 |
| 서울 직장인구/아파트/집객시설 | 직장인구, 세대·가격, 학교·교통 등 | Open API + 파일 | B/C | 상권·행정동 | Micro Market 보조 | 데이터별 기준시점 상이 |
| [소진공 상가(상권)정보](https://www.data.go.kr/data/15012005/openapi.do) | 상호, 업종코드, 주소, 경위도, 영업 점포 | REST | B | 전국, 점포 | 현재 경쟁점 후보 탐색 | 폐업일·인허가 이력 미흡; 2023년 ID 재부여로 장기 연결 주의 |
| 공공데이터포털 지방행정 인허가 | 인허가일, 영업상태, 폐업일, 업소명, 주소, 좌표 등 | REST/파일 | B/C | 전국, 점포 | 신규·폐업·영업기간 | 지자체 누락·지연·좌표 오류; 업태 분류 편차 |
| [서울 제과점 인허가 예시](https://data.seoul.go.kr/dataList/OA-18408/S/1/datasetView.do) | 제과점영업 인허가·상태·폐업·좌표 | Open API | B | 서울, 점포 | 서울 베이커리 이력 | 제과점 외 휴게·일반·즉석판매 업태도 별도 결합 필요 |
| [식품안전나라 Open API](https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31&menu_no=661) | 영업·위생등급·행정처분 등 서비스별 정보 | REST | B | 점포/기관 | 보조 검증·위생정보 | 서비스별 키·필드·공개범위 상이; 경쟁점 마스터로 단독 사용 금지 |
| [SGIS Open API](https://sgis.mods.go.kr/developer/html/openApi/api/data.html) | 통계, 경계, 주소변환, 사업체·인구 관련 API | REST + 다운로드 | B/C | 집계구·격자·행정구역 | 인구·사업체 공간분석 | 일부 격자/세부자료는 다운로드·신청; 소수값 비공개·시차 |
| [VWorld Geocoder](https://www.vworld.kr/dev/v4dv_geocoderguide2_s001.do) | 주소→좌표 | REST | B | 주소/점 | 후보점포 좌표화 | 키·도메인 등록; 주소 정제·실패 재처리 필요 |
| [건축데이터 민간개방 시스템](https://www.hub.go.kr/portal/psg/idx-intro-openApi.do) | 건축물대장 표제부·층·전유부·용도 등 | 공공데이터포털 REST | B | 필지/건물/호 | 용도·면적·구조 근거 | 영업 가능 여부를 자동 확정할 수 없음; 현행 대장·관할 확인 필요 |
| 국토부 토지이용·실거래·공시 | 용도지역, 토지·상업용 거래 보조정보 | API/파일 | B/C | 필지/거래 | 법적 입지·임대 협상 보조 | 권리금·현재 임대조건을 직접 제공하지 않음 |
| [경기데이터드림](https://data.gg.go.kr/) | 인허가·시설·방문소비 시각자료 등 | API/파일/상황판 | A/B/C | 경기도 | 전국 확장 실험 | 화면 공개와 재사용 가능한 원천 API를 구분해야 함 |
| [경기도 상권분석지원](https://sbiz.gmr.or.kr/map/trdArea.do) | 업종·소비·매출·인구·지역·점포이력 | 웹 서비스 | A(벤치마크) | 경기도 상권 | 기능 비교 | 화면 수치를 무단 수집하지 않음; 원천 제공조건 별도 확인 |
| 지자체 Open API | 음식점·제과점, 교통, 주차, 공공시설 | API/파일 | B/C | 지자체별 | 지역 보강 | 스키마·갱신주기 불균일; 공통 ETL 어댑터 필요 |
| [K-Startup 조회서비스](https://www.data.go.kr/data/15125364/openapi.do) | 사업·공고·콘텐츠·통계 | REST JSON/XML | B | 공고 | 지원사업 후보 수집 | 원문 첨부에서 금액·자부담·서류 재검증 필요 |
| [기업마당 지원사업 API](https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi) | 중앙·지자체·기관 지원사업 공고 | REST/RSS | B | 공고 | 지원사업 후보 수집 | 비정형 원문·첨부 해석 필요 |
| [소상공인24](https://www.sbiz24.kr/) | 소상공인 지원사업 신청·관리 | 웹 서비스 | E(API 미확인) | 사업/신청 | 공식 링크·수동 확인 | 공개 Open API를 확인하지 못함. 사설/비공개 엔드포인트 사용 금지 |
| 카드사 데이터 | 개별/격자 매출, 고객, 분포 | 유료 계약 | D | 점포·격자·월/일 | 중위·상위20%, 정밀 heatmap | 표본·업스케일·계약·재배포 제한 |
| 통신사 데이터 | 유동인구·체류·OD·시간대 | 유료 계약 | D | 격자·시간 | Micro Market 고도화 | 대표성·보정·privacy·재배포 제한 |
| POS/배달 데이터 | 메뉴·객단가·판매량·배달비중 | 제휴 계약 | D | 점포·주문 | 메뉴경제성·배달 | 점포 커버리지·업종 편향 |

## 3. 서울 추정매출: 실제 확인 필드

서울시 자료는 **분기 추정매출**이다. UI·API·PDF에서 `매출` 단독 표기를 금지하고 `서울시 추정매출` 또는 `분기 추정매출`로 표시한다.

확인된 주요 필드군은 다음과 같다.

| 목적 | 필드 |
|---|---|
| 기간 | `STDR_YYQU_CD` |
| 공간 | `TRDAR_SE_CD`, `TRDAR_SE_CD_NM`, `TRDAR_CD`, `TRDAR_CD_NM` |
| 업종 | `SVC_INDUTY_CD`, `SVC_INDUTY_CD_NM` |
| 총량 | `THSMON_SELNG_AMT`, `THSMON_SELNG_CO` |
| 평일/주말 | `MDWK_SELNG_AMT`, `WKEND_SELNG_AMT` 및 건수 필드 |
| 요일 | `MONDAY_…`~`SUNDAY_…` 매출액·건수 필드군 |
| 시간대 | `TMZON_00_06_…` 등 시간대별 매출액·건수 필드군 |
| 성별 | `ML_…`, `FML_…` 매출액·건수 필드군 |
| 연령 | `AGRDE_10_…`~`AGRDE_60_ABOVE_…` 매출액·건수 필드군 |
| 점포 | `STOR_CO` |

주의:

1. `THSMON`이라는 이름이 있어도 데이터셋의 공표주기는 분기이며, 분기 레코드의 추정 합계로 사용한다.
2. 전체 추정매출에는 개인·법인 거래가 포함될 수 있지만 성·연령 분해는 개인 속성이 없는 법인 거래 때문에 합계가 일치하지 않을 수 있다.
3. 2024년부터 공간단위가 표준단위구역으로 변경되었고, 일관 제공을 위해 현재 2021년 이후 자료가 제공된다. 2024년 전후 단순 패널 연결 전 `TRDAR_CD` 버전과 영역 교차표를 저장한다.
4. Open API는 한 번에 최대 1,000건이므로 페이지 적재가 필요하다. 대량 백필은 공식 ZIP/CSV, 증분은 API가 적합하다.

공통 호출 형태:

```text
http://openapi.seoul.go.kr:8088/{KEY}/{TYPE}/{SERVICE}/{START_INDEX}/{END_INDEX}/...
```

`SERVICE`는 각 데이터셋의 현재 Open API 명세에 표시된 서비스명을 배포 시점에 읽어 환경설정으로 고정한다. 문서에서 유사 이름을 추정해 하드코딩하지 않는다. [서울 Open API 이용안내](https://data.seoul.go.kr/together/guide/useGuide.do)

## 4. 지방행정 인허가: 베이커리 점포 마스터

2026년 1월 행정안전부는 인허가·생활편의 데이터를 공공데이터포털로 통합 개방했다. 공식 발표의 첨부자료 기준 인허가 195종과 생활편의 14종, 합계 209종이 API 대상이다. 신규 연계는 공공데이터포털의 현행 활용명세를 기준으로 한다. [행정안전부 공식 발표](https://www.mois.go.kr/frt/bbs/type010/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000008&nttId=123399)

대표 필드:

| 그룹 | 실제 필드 예 | 용도 |
|---|---|---|
| 식별 | `OPNSFTEAMCODE`, `MGTNO` | 원천 레코드 키 |
| 인허가 | `APVPERMYMD` | 신규 오픈 후보일 |
| 상태 | `TRDSTATEGBN`, `TRDSTATENM`, `DTLSTATEGBN`, `DTLSTATENM` | 영업/폐업/휴업 등 정규화 |
| 폐업 | `DCBYMD` | 폐업일 |
| 명칭 | `BPLCNM` | 업소명 |
| 업태 | `UPTAENM`, `SNTUPTAENM` | 제과점·카페·기타 분류 보조 |
| 주소 | `SITEWHLADDR`, `RDNWHLADDR`, `RDNPOSTNO` | 주소 정규화 |
| 좌표 | `X`, `Y` | 원천 좌표; 좌표계 확인 후 변환 |
| 면적/전화 | `SITEAREA`, `SITETEL` | 보조정보 |
| 갱신 | `LASTMODTS`, `UPDATEGBN`, `UPDATEDT` | 증분 적재·변경 추적 |

분류 규칙:

- `제과점영업`만 세면 카페형·즉석제조형 베이커리가 빠질 수 있다.
- `휴게음식점`, `일반음식점`, `즉석판매제조가공업`의 업태명·상호 키워드를 후보로 모으되, 자동 확정하지 않고 `BAKERY_CONFIRMED / BAKERY_LIKELY / CAFE_DESSERT / EXCLUDED / REVIEW`로 관리한다.
- 소진공 상가정보와 명칭·주소·좌표를 확률 매칭하되 원천 ID를 합쳐 버리지 않는다. `source_entity`와 `canonical_store`를 분리한다.

## 5. 소진공 상가(상권)정보

현행 서비스 URL 계열은 공공데이터포털 공지 기준 `/B553077/api/open/sdsc2`다. 과거 `sdsc`가 아닌 현행 활용신청과 ZIP 명세를 사용한다. [공식 변경 공지](https://www.data.go.kr/bbs/ntc/selectNotice.do?originId=NOTICE_0000000002194&pageIndex=1&searchCondition2=2&searchKeyword1=sdsc)

유용 필드군:

- 상가업소번호, 상호명·지점명
- 상권업종 대/중/소분류 코드·명
- 표준산업분류 코드·명
- 시도·시군구·행정동·법정동 코드·명
- 지번·도로명·건물 주소
- 경도·위도

사용법은 “현재 영업점 후보·위치·업종” 보강이다. 폐업일이나 장기 생존 추정의 단독 원천으로 쓰지 않는다. 원천 ID 체계 변경 이력이 있어 과거 스냅샷 연결은 주소·상호·좌표의 별도 entity resolution이 필요하다.

## 6. SGIS

인증:

```text
GET https://sgisapi.kostat.go.kr/OpenAPI3/auth/authentication.json
    ?consumer_key={KEY}&consumer_secret={SECRET}
```

응답의 `accessToken`을 데이터 API에 전달한다. 공식 문서는 토큰 유효시간을 4시간으로 안내하므로 캐시·갱신 로직을 둔다. [인증 문서](https://sgis.mods.go.kr/developer/html/newOpenApi/api/dataApi/authAndUseApi.html)

권장 역할:

- 주소/행정경계·집계구 결합.
- 인구·가구·사업체 통계를 격자·집계구로 보조.
- 전국 확장 시 서울 전용 자료의 빈 공간을 보완.

비권장 표현:

- SGIS의 모든 화면 데이터를 공개 API로 실시간 취득할 수 있다고 가정.
- 집계구/격자 값을 100m 원형 내부의 정확한 사람 수로 표현.
- 소수값 비공개·보정·기준연도 차이를 무시.

## 7. K-Startup Open API

공식 데이터셋: [창업진흥원 K-Startup 조회서비스](https://www.data.go.kr/data/15125364/openapi.do)

대표 operation:

| Operation | 내용 |
|---|---|
| `getBusinessInformation01` | 통합공고 사업정보 |
| `getAnnouncementInformation01` | 개별 지원사업 공고 |
| `getContentInformation01` | 창업 콘텐츠 |
| `getStatisticalInformation01` | 통계·보고서 |

공고 조회 운영명세의 endpoint 계열:

```text
GET https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01
    ?ServiceKey={ENCODED_KEY}
    &page=1
    &perPage=100
    &returnType=json
```

필터는 운영명세가 허용하는 경우 `cond[{field}::{operator}]` 형식을 사용한다. 실제 배포 전 데이터포털의 최신 활용가이드 ZIP/Swagger에서 대소문자, 허용 연산자와 호출량을 회귀 테스트한다.

주요 응답 필드:

| 필드 | 의미 | 추천 엔진 사용 |
|---|---|---|
| `pbanc_sn` | 공고 식별자 | 원천키 |
| `biz_pbanc_nm` | 사업 공고명 | 제목 |
| `pbanc_ntrp_nm`, `sprv_inst` | 공고/주관 기관 | 기관 |
| `pbanc_rcpt_bgng_dt`, `pbanc_rcpt_end_dt` | 접수 시작·종료 | 마감 필터 |
| `aply_trgt_ctnt` | 신청대상 내용 | 자격 규칙 후보 |
| `aply_excl_trgt_ctnt` | 제외대상 | exclusion 규칙 |
| `supt_regin` | 지원지역 | 지역 매칭 |
| `supt_biz_clsfc` | 지원사업 분류 | 카테고리 |
| `aply_trgt`, `biz_enyy`, `biz_trgt_age` | 대상·업력·연령 | 고객 프로필 매칭 |
| `prfn_matr` | 우대사항 | 설명 |
| `rcrt_prgs_yn` | 모집진행 여부 | 상태 |
| `intg_pbanc_yn`, `intg_pbanc_nm` | 통합공고 여부·명 | 중복 통합 |
| `detl_pg_url`, `biz_aply_url`, `biz_gdnc_url` | 상세·신청·안내 링크 | 공식 원문 연결 |
| `aply_mthd_onli_rcpt_istc` | 온라인 접수기관 | 신청방법 |

금액, 자부담, 필수서류는 이 필드만으로 확정하지 않는다. 상세 페이지와 첨부 원문을 저장·구조화하고 문장/페이지 근거를 붙인다.

## 8. 기업마당 Open API

공식 endpoint:

```text
GET https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do
    ?crtfcKey={KEY}
    &dataType=json
    &searchCnt=100
    &searchLclasId=06
    &hashtags=서울,창업
    &pageUnit=100
    &pageIndex=1
```

분야코드: `01 금융`, `02 기술`, `03 인력`, `04 수출`, `05 내수`, `06 창업`, `07 경영`, `09 기타`.

주요 응답 필드:

- 식별/제목: `seq`, `title`, `link`
- 기관/작성: `author`, `excInsttNm`, `jrsdInsttNm`
- 요약: `description`, `bsnsSumryCn`, `trgetNm`
- 기간: `pubDate`, `reqstDt`, `reqstBeginEndDe`, `creatPnttm`
- 신청/서류: `reqstMthPapersCn`, `rceptEngnHmpgUrl`
- 분류: `lcategory`, `pldirSportRealmLclasCodeNm`, `hashTags`
- 첨부: `flpthNm`, `fileNm`, `printFlpthNm`, `printFileNm`
- 원공고: `pblancId`, `pblancNm`, `pblancUrl`
- 기타: `refrncNm`, `inqireCo`, `totCnt`

상세 정의와 키 발급은 [기업마당 공식 API 문서](https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi)를 기준으로 한다.

## 9. 지원사업 원문 적재 계약

```text
INPUT: 고객 프로필 + 공고 API
  ↓
DATA SOURCE: K-Startup / 기업마당 / 공식 원공고·첨부
  ↓
DB: announcement_source, announcement_version, attachment, eligibility_rule
  ↓
CALCULATION: 명시 조건 일치 / 불일치 / 자료부족
  ↓
API: /support-programs/matches?customerId=
  ↓
UI: 신청 가능성 높음 / 조건 확인 필요 / 현재 대상 아님
  ↓
AI: 원문 근거가 있는 쉬운 브리핑
  ↓
REPORT: 원문 URL·수집시각·버전·확인 필요사항
```

## 10. 공공 데이터 운영 품질 기준

| 검사 | 차단 기준 | 처리 |
|---|---|---|
| Schema drift | 필수 필드 누락·형 변경 | 적재 격리, 알림, UI 마지막 정상 버전 유지 |
| Freshness | 데이터별 SLA 초과 | `STALE` 표시, 해설에서 시점 명시 |
| Geography | 좌표계/영역 버전 불일치 | 변환·버전 매칭 전 계산 금지 |
| Duplicate | 동일 source key 중복 | 최신 변경시각 기준, 원문 이력 유지 |
| Classification | 베이커리 confidence 낮음 | `REVIEW`로 분리, 확정 경쟁점 수에 미포함 |
| Suppression | 0과 비공개 구분 불가 | `NOT_AVAILABLE`, 0으로 대체 금지 |
| Provenance | source URL·기준일 없음 | 고객 리포트 사용 금지 |

## 11. 운영 전 재확인 체크리스트

- [ ] 각 API 키·이용약관·상업적 이용·재배포 조건 확인
- [ ] 최신 Swagger/ZIP으로 endpoint·필드 대소문자 회귀 테스트
- [ ] 공표주기와 마지막 데이터 기준시점 저장
- [ ] 서울 상권코드 2024 전후 crosswalk 검증
- [ ] 지방인허가 209종 중 필요한 업종 서비스 ID 확정
- [ ] 제과점/휴게/일반/즉석판매 업태 매핑을 현업이 표본 검수
- [ ] 좌표계 원문 메타데이터를 source row에 보존
- [ ] 원천값·정규화값·계산값을 분리
- [ ] 지원사업 원문 첨부의 robots/저작권/보관조건 확인
- [ ] 공개 API가 확인되지 않은 소상공인24는 링크아웃만 사용
