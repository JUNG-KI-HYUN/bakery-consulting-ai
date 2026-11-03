import { loadCurrentPork33State } from "@/lib/pork33-candidate-shortlist/repository.server";
import { buildPork33ReportPages, parsePork33ReportScope, resolvePork33ReportSelection, type Pork33ReportCard } from "@/lib/pork33-candidate-shortlist/report";
import { groupPork33CandidatesByLocality } from "@/lib/pork33-candidate-shortlist/locality";
import "./preview.css";

type SearchParams = Promise<{ scopeType?: string; regionId?: string; localityKey?: string; candidateStoreId?: string }>;

export default async function Pork33ShortlistPreviewPage({ searchParams }: { searchParams: SearchParams }) {
  const state = await loadCurrentPork33State();
  const values = await searchParams;
  const scope = parsePork33ReportScope(values);
  const selection = resolvePork33ReportSelection(state, scope);
  const pages = buildPork33ReportPages(state, scope);
  const localities = groupPork33CandidatesByLocality(state);
  const query = new URLSearchParams(scope).toString();
  const scopeLabel = scope.scopeType === "ALL" ? "전체 27개" : scope.scopeType === "REGION" ? `Region · ${selection.region?.label}` : scope.scopeType === "LOCALITY" ? `동/읍 · ${selection.locality?.label}` : `Candidate · ${selection.candidates[0].identity.displayCode}`;
  return <div className="p33-preview"><div className="p33-preview-toolbar"><strong>A4 Landscape Web Preview</strong><span>{scopeLabel}</span><span>총 {pages.length}페이지</span><a href={`/api/tools/pork33-candidate-shortlist/export?${query}`}>PDF 내려받기</a><a href="/tools/pork33-candidate-shortlist/preview">ALL</a></div><div className="p33-preview-scope"><form><input type="hidden" name="scopeType" value="REGION" /><select name="regionId" defaultValue={scope.scopeType === "REGION" ? scope.regionId : state.regions[0]?.regionId}>{state.regions.map((region) => <option key={region.regionId} value={region.regionId}>{region.label}</option>)}</select><button type="submit">Region 미리보기</button></form><form><input type="hidden" name="scopeType" value="LOCALITY" /><select name="localityKey" defaultValue={scope.scopeType === "LOCALITY" ? scope.localityKey : localities[0]?.localityKey}>{localities.map((locality) => <option key={locality.localityKey} value={locality.localityKey}>{locality.label} · {locality.candidates.length}개</option>)}</select><button type="submit">동/읍 미리보기</button></form><form><input type="hidden" name="scopeType" value="CANDIDATE" /><select name="candidateStoreId" defaultValue={scope.scopeType === "CANDIDATE" ? scope.candidateStoreId : state.candidates[0]?.identity.candidateStoreId}>{state.candidates.map((candidate) => <option key={candidate.identity.candidateStoreId} value={candidate.identity.candidateStoreId}>{candidate.identity.displayCode} · {candidate.normalized.displayLocation}</option>)}</select><button type="submit">Candidate 미리보기</button></form></div>{pages.map((page, index) => <section className="p33-page" key={`${page.kind}-${index}`}>
    <header><span>FRAMEONE · PORK33</span><span>{page.title}</span></header>
    {page.kind === "COVER" && <div className="cover"><p>FRAMEONE</p><h1>{page.title}</h1><div className="cover-stats">{page.stats.map((item) => <strong key={item}>{item}</strong>)}</div><div className="status-lines">{page.statusLines.join(" · ")}</div>{page.mapLines && <div className="map-slot"><strong>Location / Map Reference</strong>{page.mapLines.slice(0, 15).map((line) => <span key={line}>{line}</span>)}<small>실제 지도는 웹 브리핑 화면에서 확인합니다. 미확인 좌표는 생성하지 않습니다.</small></div>}{page.areaLines && <div className="area-lines"><strong>Apartment Commercial Areas</strong>{page.areaLines.map((line) => <span key={line}>{line}</span>)}</div>}<small>현장조사 및 사용자 제공 매물자료 기준</small></div>}
    {page.kind === "CANDIDATE_BRIEF" && <CandidateBrief card={page.card} />}
    {page.kind === "CANDIDATES" && <div className="candidate-grid">{page.cards.map((card) => <PreviewCard key={card.candidateStoreId} card={card} />)}</div>}
    {(page.kind === "REGION_COMPARE" || page.kind === "FINAL") && <CompareTable cards={page.rows} />}
    {page.kind === "SOURCES" && <div className="notes"><h2>{page.title}</h2>{page.lines.map((line) => <p key={line}>• {line}</p>)}</div>}
    <footer><span>현장조사 및 사용자 제공 매물자료 기준</span><span>{index + 1} / {pages.length}</span></footer>
  </section>)}</div>;
}
function CandidateBrief({ card }: { card: Pork33ReportCard }) {
  const context = card.apartmentContext;
  return <div className="candidate-brief"><section><div className="brief-code">{card.displayCode}</div><h1>{card.address}</h1><p>{card.locality}</p><div className="brief-values"><span>면적 <b>{card.area}</b></span><span>보증금 <b>{card.deposit}</b></span><span>월세 <b>{card.rent}</b></span><span>관리비 <b>{card.maintenance}</b></span><span>권리금 <b>{card.premium}</b></span><span>유동/노출 <b>{card.flowVisibility}</b></span></div><div className="brief-state">Lifecycle {card.reviewStatus} · Site Grade {card.siteGrade}</div></section><section className="location-block"><h2>Location</h2><strong>{card.coordinate}</strong><p>{card.address}</p><p>실제 Kakao Map은 웹 브리핑에서 확인합니다.</p><small>가짜 지도 이미지 또는 임의 좌표를 사용하지 않습니다.</small></section><section><h2>배후 아파트 / 단지 특징</h2><strong>{context.mainApartmentRaw}</strong><p>{card.household}<br /><small>※ {card.householdVerification}</small></p><dl><dt>후보점포와의 관계</dt><dd>{context.storeRelationshipToApartment}</dd><dt>주요 생활동선</dt><dd>{context.mainFlowContext.join(" · ") || "확인 필요"}</dd><dt>단지/상권 특징</dt><dd>{context.apartmentCharacteristics.join(" · ") || "확인 필요"}</dd><dt>추가 확인</dt><dd>{context.checks.join(" · ")}</dd></dl><div className="brief-review"><strong>승인 현장요약</strong><p>{card.approvedSummary}</p><p>장점: {card.strengths.join(" · ")}</p><p>확인: {card.checks.join(" · ")}</p></div></section><div className="brief-disclaimer">현장조사 및 사용자 제공 매물자료 기준 · APPROVED 내용만 사용 · 매출·계약·인허가 가능성을 보장하지 않습니다.</div></div>;
}
function PreviewCard({ card }: { card: Pork33ReportCard }) {
  return <article className="preview-card"><div className="card-heading"><strong>{card.displayCode}</strong><span>{card.reviewStatus} · Grade {card.siteGrade}</span></div><h2>{card.apartmentArea}</h2><p className="address">{card.address}</p><div className="numbers"><span>면적 <b>{card.area}</b></span><span>보증금 <b>{card.deposit}</b></span><span>월세 <b>{card.rent}</b></span><span>관리비 <b>{card.maintenance}</b></span><span>권리금 <b>{card.premium}</b></span><span>유동/노출 <b>{card.flowVisibility}</b></span></div><p>{card.household}</p><div className="summary"><strong>승인 현장요약</strong><p>{card.approvedSummary}</p></div><div className="two-column"><div><strong>장점</strong><p>{card.strengths.join(" · ") || "승인 내용 없음"}</p></div><div><strong>확인사항</strong><p>{card.checks.join(" · ") || "현장메모 검토 필요"}</p></div></div><p className="coordinate">지도: {card.coordinate}</p></article>;
}
function CompareTable({ cards }: { cards: Pork33ReportCard[] }) {
  if (cards.length === 0) return <div className="empty">지정된 SHORTLIST Candidate가 없습니다.</div>;
  return <table><thead><tr><th>Candidate</th><th>Apartment Area</th><th>면적</th><th>월세</th><th>권리금</th><th>핵심 장점</th><th>확인사항</th><th>상태</th></tr></thead><tbody>{cards.map((card) => <tr key={card.candidateStoreId}><td>{card.displayCode}</td><td>{card.apartmentArea}</td><td>{card.area}</td><td>{card.rent}</td><td>{card.premium}</td><td>{card.strengths.join(" · ") || "승인 내용 없음"}</td><td>{card.checks.join(" · ") || "현장메모 검토 필요"}</td><td>{card.reviewStatus}</td></tr>)}</tbody></table>;
}
