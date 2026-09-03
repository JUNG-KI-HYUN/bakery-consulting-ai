# CURRENT STATUS

Last updated: 2026-09-03

## 1. Current Branch

`codex-night-20260901`

## 2. Latest Checkpoint

Current HEAD:

`5366666 docs: add FRAMEONE development rules and research`

Recent commits:

- `5366666 docs: add FRAMEONE development rules and research`
- `3cbb691 feat: analyze markets from candidate store address`
- `615d357 feat: reorganize markets briefing workspace`
- `9c0c06b fix: isolate map analysis from polygon clicks`
- `2775114 feat: analyze map from selected point`

Current protected local data files:

- `data/consultations.json`
- `data/diagnosis-drafts.json.backup`

These files currently contain existing user changes and must not be reset, restored, overwritten, deleted, staged, or committed unless the user explicitly requests it.

---

## 3. Completed Baseline

The following baseline data work is complete and must not be rebuilt from scratch.

- District: 25
- FRAMEONE Market: 156
- Submarket: 382
- Node: 763
- Seoul official commercial district geometry: 1,650
- Living population 250m Grid geometry: 10,125
- Hierarchy / ID / TypeScript constraint validation completed
- Fake coordinates: none
- Fake geometry: none
- FRAMEONE Market/Submarket/Node geometry is intentionally not generated

Important rule:

FRAMEONE Market/Submarket/Node and Seoul official commercial districts are different data systems.

Do not automatically treat them as the same commercial district.

Candidate/manual-review relationships must not be silently converted to confirmed relationships.

---

## 4. `/markets` V1 Status

The previous Canvas-centered workspace has been converted into a practical Kakao Map-based market briefing/workspace.

### 4.1 Current tab structure

Desktop:
- 190px left sidebar

Mobile:
- horizontal top tabs

Tabs:
1. 브리핑
2. 상권지도
3. 경쟁점
4. 공공데이터

Default tab:
- 브리핑

### 4.2 Briefing screen

The briefing screen is intentionally simplified for customer consultation and internal briefing.

It currently includes:

- selected FRAMEONE analysis area
- Kakao Map
- 300m / 500m radius selection
- bakery / confectionery / cafe category controls
- candidate analysis point
- nearby competition summary
- selected Seoul official commercial district
- existing SALES / STORES summary
- simplified public-data status messages

The briefing screen hides technical/internal information such as:

- internal IDs
- official district codes
- `text_only`
- `manual_review`
- crosswalk review details
- administrative-dong review candidates
- detailed source/debug states

Detailed information is available in staff-oriented tabs.

### 4.3 Map size

Current Kakao Map height:

- desktop: about 410px
- mobile: about 360px

---

## 5. Kakao Map Analysis Status

Current map interaction is explicit-analysis based.

### Current behavior

1. Initial page load does not automatically run nearby-place search.
2. Map drag does not trigger nearby-place search.
3. User clicks the map to select an analysis-location candidate.
4. Candidate marker is shown.
5. User chooses 300m or 500m.
6. User presses `[이 위치 분석]`.
7. Only then is the analysis point fixed and the nearby-place REST request executed.
8. Circle and results stay fixed even if the user pans the map.
9. Clicking a new map point changes only the candidate point.
10. Existing results remain until the user explicitly analyzes the new location.

### Polygon behavior

Seoul official commercial district Polygon click remains separate from map-location analysis.

Polygon click does not change the analysis-location candidate.

---

## 6. Nearby Place Search

Current nearby-place search uses server-side Kakao Local REST.

Route:

`/api/markets/nearby-places`

Current categories:

- bakery
- confectionery
- cafe

Important interpretation rules:

- Kakao result counts are search results, not an authoritative official competitor count.
- Bakery and confectionery result sets can overlap.
- Do not sum overlapping categories as a unique competitor total without deduplication.
- Map marker display can be limited while total search result count is larger.

Current Kakao search is a briefing/reference layer only.

A future canonical competitor database will use official/public data + FRAMEONE field verification.

---

## 7. Candidate Store Address Analysis V1

Completed in commit:

`3cbb691 feat: analyze markets from candidate store address`

### Current flow

Candidate store address
→ server-side Kakao geocode
→ confirmed address
→ candidate-store marker
→ map center movement
→ choose 300m / 500m
→ candidate-store-based analysis
→ existing nearby-place search flow

### Current route

`app/api/markets/geocode/route.ts`

The route uses server-side `KAKAO_REST_API_KEY`.

API keys and raw coordinates are not shown on the customer briefing screen.

### Current limitations

- If an address is ambiguous, the current V1 uses the first Kakao address-search result.
- Users should enter a concrete road-name address/building number.
- Candidate-store DB persistence is not implemented yet.
- Candidate-store selection does not automatically confirm a Seoul official commercial district.
- Direct map-click analysis still works alongside candidate-store-based analysis.

---

## 8. Seoul Official Commercial District / Public Data

Existing Seoul official commercial district Polygon flow remains available.

Current existing public-data flow includes:

- official district selection
- SALES
- STORES
- bakery sector reference
- existing public-data status handling

Important rule:

Seoul public sales data is `estimated sales`.

Do not label it as:

- actual store sales
- candidate-store expected sales
- 300m actual sales

Technical/API failures are simplified in the briefing screen as:

`공공데이터 확인 필요`

Detailed cause belongs in the staff/public-data area.

A local environment may still return 503 from `/api/markets/bakery-data` depending on current Seoul API configuration.

This is a separate environment/data-connection issue and must not be mixed with Kakao map UX changes.

---

## 9. Product Direction

This project is not a simple commercial-area analysis program.

The target workflow is:

`매물 수집`
→ `후보점포 등록`
→ `사전분석`
→ `고객 브리핑`
→ `무료 리포트`
→ `현장출동`
→ `상세 현장조사`
→ `후보 비교`
→ `계약 전 Due Diligence`
→ `협상`
→ `최종 계약판정`
→ `최종 상세 리포트`
→ `계약/공사/오픈 지원`
→ `오픈 후 실제성과 수집`

The core product question is:

- “이 점포를 계약해도 되는가?”
- “이 공간에 실제 베이커리 매장을 구현할 수 있는가?”

The final verdict must eventually remain one of:

- 추천
- 조건부 추천
- 보류
- 위험

No startup-success guarantee is allowed.

Sales, profit, premium recovery, and similar values must be expressed as estimates unless backed by actual verified data.

---

## 10. One Input / History Principles

### One Input Principle

The same information should be entered once and reused.

Examples:

- candidate-store information
- address
- nearby competitors
- field observations
- photos
- lease conditions
- facility information
- notes

These should later be reusable across:

- briefing
- staff workspace
- field survey
- candidate comparison
- reports
- partner handoff

### History Principle

Important historical values must not be overwritten.

Examples:

- rent changes
- premium changes
- listing status changes
- field-survey rounds
- competitor changes
- facility verification changes
- negotiation scenarios
- decision changes

Use snapshot/version/history/survey-round structures.

---

## 11. Research / Development Reference Documents

Research documents are now stored under:

`docs/research/2026-09-02/`

Current reference set:

- `COMPETITOR_FEATURE_MATRIX.md`
- `FEATURE_REVERSE_ENGINEERING.md`
- `FRAMEONE_IMPLEMENTABILITY_MATRIX.md`
- `PUBLIC_DATA_API_MAP.md`
- `SALES_ANALYSIS_IMPLEMENTATION.md`
- `COMPETITOR_ANALYSIS_IMPLEMENTATION.md`
- `GOVERNMENT_SUPPORT_IMPLEMENTATION.md`
- `STARTUP_NAVIGATOR_IMPLEMENTATION.md`
- `FRAMEONE_FEATURE_ROADMAP.md`
- `CODEX_FUTURE_IMPLEMENTATION_PLAN.md`

Do not load all documents for every Codex task.

Read only the documents directly relevant to the current feature.

---

## 12. Current Development Priority

The next major development phase is Decision P0.

Recommended order:

1. Evidence Foundation
2. Data Confidence
3. Risk V3 shadow evaluation
4. Investment Engine
5. Stress Test + Working-Capital Runway
6. Deal Simulator
7. Candidate Comparison
8. Decision Explanation

Market-data expansion continues after the Decision P0 foundation.

Planned Market P1 sequence:

1. canonical competitor store
2. permit + public-store source integration
3. opening/closure history
4. Seoul estimated-sales trend
5. 100/250/300/500m Micro Market
6. later field-evidence feedback

---

## 13. Immediate Next Codex Task

Next Codex task:

`P0 Evidence Foundation — Step 1: type foundation only`

Scope:

- define Evidence-related types
- define verification status
- define evidence source type
- add optional/versioned fields where appropriate
- preserve existing JSON/sample backward compatibility

Do not include in this first task:

- Evidence UI
- photo upload
- Data Confidence calculation
- Risk V3
- Investment Engine
- DB migration
- large API refactor
- report redesign

The first Evidence step should be a small, backward-compatible foundation only.

---

## 14. Development Safety

Always follow `AGENTS.md`.

Key rules:

- one Codex task = one feature unit
- no unrelated refactor
- do not invent public API fields/data
- preserve user changes
- do not silently migrate historical data
- actual / estimated / verified / unknown must not be conflated
- public-data provenance and as-of date must be retained
- AI does not invent numbers/legal conclusions/facility estimates
- CRITICAL risk must not be offset by positive market indicators
- commit/push/merge only when explicitly requested

---

## 15. Current Git Safety State

Protected local files expected to remain modified:

- `data/consultations.json`
- `data/diagnosis-drafts.json.backup`

Do not reset, restore, overwrite, delete, stage, or commit these files without explicit user instruction.
