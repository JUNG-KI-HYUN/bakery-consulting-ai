# CURRENT STATUS

Last updated: 2026-09-11

## 1. Current Branch

`codex-night-20260901`

---

## 2. Latest Checkpoint

Current HEAD:

`d595b51 feat: ingest seoul 250m living population snapshot`

Recent commits:

- `d595b51 feat: ingest seoul 250m living population snapshot`
- `c66da78 feat: prepare seoul 250m living population source`
- `a6753fc feat: add frameone data source registry v1`
- `b7ad30c docs: design frameone data source registry v1`
- `d6ca7a4 feat: add seoul spatial wkt parser and primitives`
- `c9e64ed docs: design seoul spatial wkt geometry evidence v1`
- `93e36af chore: verify seoul spatial source metadata`
- `fcbdb57 feat: implement seoul spatial data ingestion v1`
- `4c78f27 docs: design seoul spatial data ingestion v1`

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

### 3.1 Latest Spatial / Data Foundation Completed

Completed as of 2026-09-11:

- Seoul Pedestrian full ingestion completed
  - 491,082 rows
  - Source basis: `2020 기준`
- Seoul Crosswalk full ingestion completed
  - 31,080 rows
  - Source basis: `2020 기준`
- WKT Parser / E1 Primitive V1 completed
- FRAMEONE Data Source Registry V1 completed
- Seoul 250m Living Population official API connection completed
- Seoul 250m Living Population full source ingestion completed

Latest living-population snapshot:

- Source: `SRC-SEOUL-LIVING`
- Service: `Se250MSpopLocalResd`
- Reference YMD: `20260906`
- API total rows: `253,346`
- Fetched rows: `253,346`
- Normalized rows: `253,346`
- Quarantine rows: `0`
- Unique metric CELL_ID: `8,559`
- Existing geometry CELL_ID: `10,125`
- Snapshot status: `READY`
- Geometry Join: `NOT_PERFORMED`
- Production current pointer: `NOT_PUBLISHED`

Latest full-ingestion quality result:

- Pagination: PASS
- Count consistency: PASS
- Single YMD: PASS
- TT validation: PASS
- CELL_ID completeness: PASS
- Duplicate candidate count: 0
- Schema drift: none
- Raw / normalized checksum: PASS
- Secret exposure check: PASS

Population handling rules:

- `*` suppression values must remain suppressed.
- Suppressed values must not be converted to 0.
- Negative or invalid population values must not be silently corrected.
- `fetched_at` must not be treated as the source reference date.

Important living-population rule:

- Do not auto-fill geometry-only CELL_ID with population 0.
- Do not join living-population metrics to Market/Submarket until CELL_ID geometry compatibility is verified.
- Do not publish the production current pointer until geometry compatibility is reviewed.
- Metric and geometry datasets must remain independently traceable.

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

## 9. Data Source Registry V1

FRAMEONE Data Source Registry V1 has been implemented.

Current structure:

1. Source Contract
2. Data Source Registry
3. Runtime State type

### 9.1 Source Contract

Role:

- source schema
- key
- CRS
- compatibility
- license
- attribution
- source semantics

Existing contract structure remains under:

`data/seoul-market/v1.1-final/13_SOURCE_INGEST/source-contracts/`

### 9.2 Data Source Registry

Role:

- FRAMEONE Source list
- provider
- purpose
- access type
- authentication environment variable name
- ingestion mode
- source refresh frequency
- FRAMEONE check frequency
- connection status
- manual policy
- priority

Current Registry:

`data/seoul-market/v1.1-final/13_SOURCE_INGEST/DATA_SOURCE_REGISTRY.json`

Registered Source count:

- total: 20
- current-use target: 7
- planned: 11
- optional/future: 2

### 9.3 Ingestion modes

Current supported concepts:

- `SCHEDULED`
- `CHANGE_WATCH`
- `ON_DEMAND`

Derived data such as Trend should not be duplicated as an external Source if it is calculated from SALES/STORES.

### 9.4 Runtime health

Runtime state is currently defined as a type only.

Do not create mutable tracked runtime-state files without a specific implementation decision.

Health concepts:

- `HEALTHY`
- `STALE`
- `UPDATE_AVAILABLE`
- `REVIEW_REQUIRED`
- `ERROR`
- `NOT_CONNECTED`

Important:

Source Contract status, Manifest status, Connection status, and Runtime Health must not be treated as the same enum.

---

## 10. Seoul Spatial Source Status

### 10.1 Pedestrian

Source:

`SRC-SEOUL-PEDESTRIAN-NETWORK`

Current full snapshot:

- total: 491,082
- NODE_ONLY: 212,066
- LINK_ONLY: 279,016
- POINT: 212,066
- LINESTRING: 279,016
- malformed structurally: 0

Important:

- `source_basis = 2020 기준`
- `fetched_at` does not make the source 2026 data.
- Do not market or describe this as current real-time pedestrian network data.

### 10.2 Crosswalk

Source:

`SRC-SEOUL-CROSSWALK`

Current full snapshot:

- total: 31,080
- NODE_ONLY: 19,518
- LINK_ONLY: 11,562
- POINT: 19,518
- LINESTRING: 11,562
- malformed structurally: 0

Important:

- `source_basis = 2020 기준`
- official update timestamp and source basis must remain separate concepts.

### 10.3 WKT / E1 Primitive

WKT Parser & E1 Primitive V1 is completed.

Supported geometry:

- `POINT`
- `LINESTRING`

Unsupported geometry must fail closed.

Do not silently accept:

- MULTIPOINT
- MULTILINESTRING
- POLYGON
- MULTIPOLYGON
- GEOMETRYCOLLECTION
- Z/M/ZM
- SRID prefix
- EMPTY

Important:

- X = longitude
- Y = latitude
- NODE rows map to POINT
- LINK rows map to LINESTRING
- `"0"` counterpart IDs are sentinel values, not real duplicate IDs
- `BGNG_LNKG_ID` / `END_LNKG_ID` must not be automatically reinterpreted as confirmed start/end node IDs

---

## 11. Geometry Evidence Policy

FRAMEONE geometry remains evidence-driven.

Evidence stages:

- E0: official source
- E1: parsed structurally valid official geometry
- E2: spatial relationship evidence
- E3: candidate boundary evidence
- E4: human-reviewed evidence

Important rule:

E1 or E2 does not automatically promote FRAMEONE Market/Submarket/Node geometry.

The intended process is:

Official source  
→ Parsed primitive  
→ Evidence  
→ Candidate Geometry  
→ Human Review  
→ Verified Geometry

Do not automatically reuse Seoul official commercial district Polygon as FRAMEONE Submarket geometry.

FRAMEONE Market/Submarket/Node geometry remains separate.

---

## 12. Product Direction

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

The product should differentiate itself from generic market-analysis tools by combining:

- market/location analysis
- actual candidate-store analysis
- lease-condition review
- bakery-specific facility review
- electrical / plumbing / exhaust risk
- drawing-based layout review
- equipment-placement feasibility
- BEP / rent-burden analysis
- contract-risk review
- opening support
- post-opening marketing

The goal is not:

“이 상권이 좋은가?”

The goal is:

“이 창업자가 이 점포를 이 조건으로 계약해도 되는가?”

and:

“이 공간에 실제 베이커리를 구현할 수 있는가?”

---

## 13. One Input / History Principles

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

## 14. Research / Development Reference Documents

Research documents are stored under:

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

Government-support APIs and eligibility logic are planned for a later phase and are not part of the current market-data foundation work.

---

## 15. Current Development Priority

The current priority is to finish the Seoul-wide market-data foundation before expanding decision logic.

Current sequence:

1. `250m CELL_ID Geometry Reconciliation V1`
2. Validate metric CELL_ID ↔ 250m geometry compatibility
3. Decide safe living-population current snapshot publication
4. Validate Market/Submarket aggregation readiness
5. LOCALDATA bakery permit integration
6. Public commercial-store source integration
7. Data Source automatic update / change-watch foundation
8. Seoul-wide Spatial Evidence E2 framework
9. Submarket QA / readiness
10. Candidate-store decision integration

Important:

- Development scope is Seoul-wide.
- Seongsu / Seongdong is a pilot-validation area only.
- Do not create district-specific hardcoded logic.
- Geometry must not be promoted automatically without evidence and validation.
- Do not develop one district at a time as separate logic.
- Build one Seoul-wide common engine and validate representative areas.

Decision P0 remains a later major phase after the market-data foundation is sufficiently stable.

Later Decision-related direction includes:

- Evidence Foundation
- Data Confidence
- Risk V3
- Investment Engine
- Stress Test / Working-Capital Runway
- Deal Simulator
- Candidate Comparison
- Decision Explanation

Do not begin these major modules until the current market-data foundation reaches a stable checkpoint unless explicitly requested.

---

## 16. Immediate Next Codex Task

Next Codex task:

`250m CELL_ID Geometry Reconciliation V1`

Primary objective:

Safely compare:

- current living-population metric CELL_ID: `8,559`
- existing 250m geometry CELL_ID: `10,125`

Required classification:

- `BOTH`
- `METRIC_ONLY`
- `GEOMETRY_ONLY`

Important rules:

- Do not automatically interpret `GEOMETRY_ONLY` as population 0.
- Do not modify the existing geometry.
- Do not publish the living-population current pointer yet.
- Do not aggregate to Market/Submarket yet.
- First verify geometry source/version and CELL_ID compatibility.
- Preserve evidence for all mismatch categories.
- Do not assume the existing geometry and current living-population API are from the exact same source/version without proof.

This task should remain narrow.

Do not include:

- E2 Spatial Evidence implementation
- LOCALDATA integration
- commercial-store source integration
- Market/Submarket population aggregation
- UI changes
- DB changes
- large refactoring
- Scheduler
- automatic source update
- support-program API integration

Recommended execution style:

- GPT-5.6 Sol / Medium
- inspect only directly relevant files
- avoid full-project reread
- avoid full build unless code changes require it
- run relevant tests first
- preserve usage quota where possible

---

## 17. Data Update / Automation Direction

The long-term data-management direction is:

Official / free API  
→ Data Source Registry  
→ Source due / change check  
→ staging  
→ ingestion  
→ validation  
→ immutable snapshot  
→ current publish only when eligible

Regular manual downloads should not be a normal operating process.

Expected modes:

### SCHEDULED

Examples:

- 250m living population
- permit data
- sales/store data
- transit ridership

### CHANGE_WATCH

Examples:

- pedestrian network
- crosswalk
- official commercial-district Polygon
- static location reference datasets

### ON_DEMAND

Examples:

- Kakao
- JUSO
- Building HUB
- VWorld

Manual work should be limited to exception cases such as:

- API schema changes
- source URL changes
- CRS changes
- license changes
- abnormal row-count changes
- source-basis changes
- parser failure spikes
- API deprecation
- unexpected geometry types

Normal updates should be automated.

Abnormal changes should become `REVIEW_REQUIRED`.

---

## 18. Planned External Data Sources

Current or planned Source families include:

### Current / Connected

- Seoul Open Data
- Kakao
- Seoul official commercial districts
- SALES
- STORES
- Pedestrian
- Crosswalk
- Seoul 250m Living Population

### Planned P0 / P1

- LOCALDATA permit data
- public commercial-store data
- subway ridership
- bus ridership
- bus-stop location data
- apartment / housing reference data
- public parking data

### Planned On-demand

- SGIS
- JUSO
- Building HUB
- VWorld

### Future / Optional

- KOSIS
- Seoul real-time city data
- government-support announcement APIs
- support-program eligibility engine

Do not connect future Sources casually.

Each Source should follow:

Registry  
→ Contract  
→ Client / Adapter  
→ Limited Smoke  
→ Validation  
→ Full Ingestion if needed  
→ Snapshot  
→ downstream use only after compatibility review

---

## 19. Living Population Operational Rules

Current official target Source:

`Se250MSpopLocalResd`

Important semantics:

- `YMD` = data reference date
- `TT` = time slot
- `CELL_ID` = 250m grid identifier
- `SPOP` = living-population value
- suppression `*` is not zero
- API pagination max is handled in pages
- fetched date and source reference date must remain separate

Current latest full snapshot:

- YMD: `20260906`
- rows: `253,346`
- unique metric CELL_ID: `8,559`

Existing geometry:

- `LIVING_GRID_250M.geojson`
- geometry count: `10,125`

Known compatibility issue:

- metric CELL_ID count and geometry CELL_ID count do not match
- existing historical key coverage also showed geometry-only and metric-only cases
- this mismatch must be reconciled before spatial aggregation

Do not:

- fill missing metric grids with zero
- drop geometry-only grids silently
- drop metric-only grids silently
- infer geometry compatibility from CELL_ID string format alone

---

## 20. Data Quality / Confidence Principles

Different data Sources have different meanings.

Do not average or merge them blindly.

Examples:

- Seoul living population
- SGIS resident population
- Kakao POI
- public commercial-store data
- LOCALDATA permit data
- Seoul estimated sales

These Sources may represent different:

- definitions
- periods
- purposes
- collection methods

Future analysis should preserve:

- source
- period
- definition
- quality status
- provenance

Do not treat:

actual
estimated
verified
unknown

as the same thing.

---

## 21. Bakery Consulting Product Requirements

Final candidate-store analysis must eventually consider:

### Location

- living population
- surrounding households
- major pedestrian flow
- competition
- commercial mix
- visibility
- accessibility
- parking
- delivery suitability
- takeaway suitability

### Lease

- deposit
- rent
- management fee
- premium
- contract term
- restoration obligations
- use restrictions
- negotiation points

### Bakery Facility

- electric capacity
- water / drainage
- exhaust
- manufacturing-space feasibility
- sales-space feasibility
- refrigeration / freezing equipment
- oven / mixer / proofer installation
- equipment delivery
- showcase / counter / packing layout
- smell / noise risk

### Drawing / Layout

- manufacturing area
- sales area
- customer flow
- staff flow
- equipment layout
- storage
- utilities
- evacuation
- construction difficulty
- additional-cost risk

### Economics

- expected average ticket
- estimated daily sales
- estimated monthly sales
- ingredient cost
- labor
- rent
- management fee
- card fees
- delivery fees
- advertising
- fixed costs
- BEP
- rent burden
- premium recovery estimate
- survival sales range

### Final Verdict

Must remain one of:

- 추천
- 조건부 추천
- 보류
- 위험

Every verdict must include reasons.

Do not guarantee business success.

All sales/profit estimates must be presented as estimates.

Legal, tax, licensing, sanitation, fire, electrical, exhaust, and plumbing matters require professional or competent-authority confirmation.

---

## 22. Development Safety

Always follow `AGENTS.md`.

Key rules:

- one Codex task = one feature unit
- no unrelated refactor
- no whole-project refactor
- minimize modified files
- no unnecessary new library
- do not invent public API fields/data
- preserve user changes
- do not silently migrate historical data
- do not silently promote candidate relationships
- actual / estimated / verified / unknown must not be conflated
- public-data provenance and as-of date must be retained
- AI does not invent numbers/legal conclusions/facility estimates
- CRITICAL risk must not be offset by positive market indicators
- commit/push/merge only when explicitly requested
- generated raw / normalized / snapshot files must not be accidentally committed
- existing valid snapshots must remain usable when a new ingestion fails

For Codex usage efficiency:

- use GPT-5.6 Sol / Medium by default
- use High only when clearly necessary
- inspect directly relevant files first
- do not reread the entire Repository for every task
- run related tests for small changes
- run full regression/build at major checkpoints
- avoid repeating expensive full-data ingestion unless necessary

---

## 23. Current Git Safety State

Branch:

`codex-night-20260901`

Current HEAD:

`d595b51 feat: ingest seoul 250m living population snapshot`

Protected local files expected to remain modified:

- `data/consultations.json`
- `data/diagnosis-drafts.json.backup`

Do not reset, restore, overwrite, delete, stage, or commit these files without explicit user instruction.

Large generated Source data should remain Git-ignored.

Latest committed development chain:

`b7ad30c`
→ Data Source Registry design

`a6753fc`
→ Data Source Registry implementation

`c66da78`
→ Seoul 250m Living Population source preparation

`d595b51`
→ Seoul 250m Living Population full source ingestion

Next work must continue from this checkpoint.

---

## 24. Next Safe Development Sequence

Immediate:

`250m CELL_ID Geometry Reconciliation V1`

Then, only if compatibility is sufficiently verified:

`Living Population Current Snapshot Publication Decision`

Then:

`Market/Submarket Living Population Aggregation Readiness`

After living-population foundation:

`LOCALDATA Bakery Permit Integration`

Then:

`Public Commercial Store Source Integration`

Then:

`Automatic Source Update / Change Watch`

Then:

`Seoul-wide Spatial Evidence E2 Framework`

Then:

`Submarket QA / Readiness`

Then:

`Candidate-store Decision Integration`

Do not skip compatibility gates merely to move faster.

The goal is to reduce future rework and prevent incorrect candidate-store analysis.