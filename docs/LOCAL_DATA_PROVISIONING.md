# Local Data Provisioning

PORK33 고객·현장 원본과 생성 결과는 Git에 포함하지 않는다. 공용 checkout에는 명시적으로 `SANITIZED_FIXTURE`인 구조 검증용 데이터만 포함되며 고객용 PDF 생성은 fixture mode에서 차단된다.

## Git에 포함하지 않는 경로

- `data/pork33-candidate-shortlist/pork33-field-source-2026-10.v1.json`
- `data/pork33-candidate-shortlist/private/` 및 `runtime/`, `photo-runtime/`
- `data/pork33-sbiz365-source/`
- `data/pork33-candidate-photos-source/`, `pork33-candidate-photos-extracted/`
- `data/pork33-candidate-map-source/`
- `data/detailed-reports/`, `data/detailed-report-photos/`, `data/pork33-simple-reports/`
- `output/`, `tmp/`

## Fixture와 local private source

- Sanitized seed: `lib/pork33-candidate-shortlist/sanitized-fixture.ts`
- Sanitized SBIZ snapshot: `lib/pork33-candidate-shortlist/sanitized-sbiz-fixture.ts`
- Local private seed: `data/pork33-candidate-shortlist/pork33-field-source-2026-10.v1.json`
- Provisioned SBIZ snapshot: `data/pork33-candidate-shortlist/private/SBIZ365_SNAPSHOTS.json`

Seed loader는 local private seed를 우선 사용한다. 없거나 `PORK33_DATA_MODE=SANITIZED_FIXTURE`이면 fixture를 사용한다. SBIZ loader는 provisioned private snapshot을 우선하고, 기존 설치 호환을 위해 완료된 `output/pork33-briefing` batch를 다음 순위로 읽는다. Fixture state에서는 sanitized snapshot만 사용한다.

## Clean clone 검증

의존성을 설치한 뒤 fixture mode로 실행한다.

```powershell
$env:PORK33_DATA_MODE = 'SANITIZED_FIXTURE'
npx tsc --noEmit
node --test tests/pork33-candidate-shortlist/pork33-data-boundary.test.mjs
npm run build
Remove-Item Env:PORK33_DATA_MODE
```

Fixture mode는 화면·계약·build 검증 전용이다. 실제 고객 보고서 생성 API와 PDF generator는 local private seed가 아니면 실패한다.

## 실제 PORK33 보고서 실행 전

위 private seed, 지도, 추출 사진 및 SBIZ snapshot을 승인된 로컬 위치에 provisioning한다. 원본 PDF에서 새 snapshot을 생성하는 작업은 별도 명시적 import/generation 절차로 수행한다. 고객용 실행 전 `sourceDatasetId=PORK33_FIELD_SOURCE_2026_10`, Candidate 27개, 지도 27개, 사진 source 24개, SBIZ snapshot 27개를 확인한다.
