# FRAMEONE Research Collector V1.2

공개 상가 매물 페이지에서 현재 보이는 텍스트만 읽어 임대조건 후보를 만들고, 사람이 Review Queue에서 검수한 뒤 JSON으로 내보내는 Chrome Manifest V3 확장프로그램입니다.

## Chrome에 로드

1. Chrome에서 `chrome://extensions`를 엽니다.
2. 우측 상단의 `개발자 모드`를 켭니다.
3. `압축해제된 확장 프로그램을 로드합니다`를 누릅니다.
4. 이 `tools/frameone-research-collector` 디렉터리를 선택합니다.
5. 공개 상가 매물 페이지에서 확장프로그램을 열고 `현재 페이지 분석`을 누릅니다.

## 안전 경계

- 페이지 전체 HTML, 스크린샷, 쿠키, 비공개 API 응답은 저장하지 않습니다.
- 자동추출 결과를 FRAMEONE DB로 보내지 않습니다.
- Review Queue의 확정·수정·제외 상태는 팝업 메모리와 내보낸 V1.2 JSON에만 반영됩니다.
- 향후 임대시장 분석에는 `CONFIRMED` record만 사용할 수 있도록 순수 gate를 제공합니다.
- 네이버 자동수집 자료의 출처 유형은 `ONLINE_LISTING`이며 실제 계약가격으로 취급하지 않습니다.
- 중복 엔진은 `NO_MATCH` / `POSSIBLE_DUPLICATE` / `LIKELY_DUPLICATE` 후보와 근거만 반환하고 자동 병합하지 않습니다.
- 0.5㎡ 이하의 소수점·평 환산 차이만 면적 일치 후보로 인정하며, 동 단위 주소는 confidence를 제한합니다.
- `CURRENT_30D` / `RECENT_90D` / `AGED_180D` / `STALE`은 삭제 정책이 아닌 조사일 기반 상태표시입니다.
- 가격·조건 변경과 다중 출처 conflict는 이전 snapshot을 덮어쓰지 않는 history 입력용 결과로 반환합니다.
- Raw 값, 정규화 후보, 근거 excerpt, 필드 상태를 분리합니다.
- 단위 없는 금액은 만원 단위 후보로 환산하더라도 `REVIEW_REQUIRED`를 유지합니다.
- `협의`는 0원이 아니며, `무권리`와 구분됩니다.
- `월세 A/B` 거래표시는 보증금/월세 순서로 읽고, 더 명시적인 `보증금 A / 월세 B` 근거를 우선합니다.
- 중개보수 문맥의 VAT와 중개사무소 주소는 임대조건·매물 주소로 사용하지 않습니다.
- 자유 설명의 `무권리`와 상충하는 주차 수량은 `REVIEW_REQUIRED`로 남깁니다.
- 네이버페이 부동산에서는 매물번호와 의미 라벨을 함께 포함하는 현재 상세매물 영역을 우선 분석합니다.
- `입주가능일` 라벨이 있으면 그 대응값을 사용하며, 다른 매물 설명의 `즉시입주` 뒤 텍스트를 값으로 가져오지 않습니다.
- 구조화된 주차 불가능·0대 근거가 서로 일치하면 자동확인하고, 수량이나 가능 여부가 충돌하면 확인필요로 유지합니다.
- 네이버 현재 상세매물의 `월세 A/B`는 같은 scope의 명시적 보증금이 A와 일치할 때만 B의 만원 단위를 자동확인합니다.
- 금액 입력은 comma 표시·수정을 지원하지만 JSON에는 기존 숫자형 normalized 값만 저장합니다.
- 사이트 구조를 인식하지 못한 필드는 `MISSING`으로 두고 팝업에서 수동 입력할 수 있습니다.

## JSON 호환성

- `기존 JSON`은 V1.1.2 export contract를 그대로 사용합니다.
- `V1.2 Research Record JSON`은 source, property, lease, optional, quality, evidence, history 구조를 별도로 내보냅니다.
- 두 내보내기 모두 로컬 파일 다운로드만 수행하며 DB 저장은 하지 않습니다.
