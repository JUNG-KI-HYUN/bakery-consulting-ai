# API READINESS MATRIX

기준일: 2026-08-27

`READY`는 사용자 인증키 API가 아니라 실제 호출·다운로드가 확인된 서비스만 뜻한다. Secret은 기록하지 않는다.

| API | 상태 | 확인 근거 | 현재 필요성 |
|---|---|---|---|
| 서울 열린데이터광장 | `KEY_AVAILABLE` | 변수 정의 확인·실제 값/호출 미확인 | 현재 필요 |
| Kakao Map JavaScript | `KEY_AVAILABLE` | 기존 보유 사용자 진술·현재 호출 미실행 | 현재 필요 |
| Kakao Local/REST | `KEY_AVAILABLE` | 기존 보유 사용자 진술·현재 호출 미실행 | 주소·좌표 보완 시 필요 |
| Naver Maps | `KEY_AVAILABLE` | 변수 정의 확인·현재 호출 미실행 | 대체 지도이므로 지금 필수 아님 |
| SGIS DATA API | `KEY_AVAILABLE` | 발급 완료 사용자 진술·현재 실행환경에 실제 값 없음 | 행정경계·통계 보조 |
| 공공데이터포털 | `KEY_AVAILABLE` | 변수 정의 확인·서비스별 활용신청 미확인 | 건축물·상가정보 시 필요 |
| 소상공인365 | `APPLICATION_REQUIRED` | 키 변수 존재·서비스별 활용승인/명세 확인 필요 | 향후 상권 보조 |
| 기존 SBIZ 계열 | `SPEC_CHECK_REQUIRED` | NEXT_PUBLIC 변수 보유 사용자 진술·서비스 현행성 재확인 | 대체 여부 판단 |
| 서울 공식 파일 다운로드 | `READY` | 인증 불필요 파일 3종 실제 다운로드·파싱 확인 | 현재 사용 |

## 신규 API 판단

현재 신규 발급이 반드시 필요한 API는 없다. 기존 인증정보의 실제 호출 확인과 서비스별 활용신청 확인을 먼저 수행한다.

## SGIS 테스트

- 공식 인증 endpoint와 필수 필드는 확인했다.
- 현재 작업 실행환경에는 실제 `SGIS_CONSUMER_KEY`·`SGIS_CONSUMER_SECRET` 값이 주입되지 않아 토큰 호출을 실행하지 않았다.
- 상태: **사용자 환경에서 호출 테스트 필요**.