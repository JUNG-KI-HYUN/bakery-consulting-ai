import Image from "next/image";
import { buildPork33DecisionPages, type Pork33DecisionPage, type Pork33DecisionScope } from "@/lib/pork33-candidate-shortlist/decision-report";
import { loadPork33DecisionServerInputs } from "@/lib/pork33-candidate-shortlist/decision-snapshots.server";
import { loadCurrentPork33State } from "@/lib/pork33-candidate-shortlist/repository.server";
import "./preview.css";

type SearchParams = Promise<{ scopeType?: string; regionId?: string }>;

function assetUrl(assetRef: string) {
  return `/api/tools/pork33-candidate-shortlist/briefing-assets?ref=${encodeURIComponent(assetRef)}`;
}

function scopeFrom(values: Awaited<SearchParams>): Pork33DecisionScope {
  if (values.scopeType === "REGION" && values.regionId) return { scopeType: "REGION", regionId: values.regionId };
  return { scopeType: "ALL" };
}

function isDecisionLayerPage(page: Pork33DecisionPage) {
  return page.kind === "REGION_DEMAND_SUMMARY" || page.kind === "APARTMENT_AREA_ANALYSIS" || page.kind === "CANDIDATE_COMPARE";
}

export default async function Pork33DecisionPreviewPage({ searchParams }: { searchParams: SearchParams }) {
  const state = await loadCurrentPork33State();
  const inputs = await loadPork33DecisionServerInputs(state);
  const pages = buildPork33DecisionPages(state, inputs.assets, inputs.sbiz365ByCandidateId, scopeFrom(await searchParams)).filter(isDecisionLayerPage);
  return <main className="p33d-preview">
    <div className="p33d-toolbar"><strong>PORK33 의사결정 리포트 V2 Preview</strong><span>신규 의사결정 페이지 {pages.length}개</span><span>SBIZ365 {inputs.sbizSnapshotSourceBatchId}</span><a href="/tools/pork33-candidate-shortlist">도구로 돌아가기</a></div>
    <div className="p33d-scope"><a href="/tools/pork33-candidate-shortlist/decision-preview">전체</a>{state.regions.map((region) => <a key={region.regionId} href={`/tools/pork33-candidate-shortlist/decision-preview?scopeType=REGION&regionId=${encodeURIComponent(region.regionId)}`}>{region.label}</a>)}</div>
    {pages.map((page, index) => <DecisionPage key={`${page.kind}-${index}`} page={page} pageNumber={index + 1} pageCount={pages.length} />)}
  </main>;
}

function DecisionPage({ page, pageNumber, pageCount }: { page: Pork33DecisionPage; pageNumber: number; pageCount: number }) {
  if (!isDecisionLayerPage(page)) return null;
  const region = page.kind === "REGION_DEMAND_SUMMARY" ? page.demand.regionLabel : page.kind === "APARTMENT_AREA_ANALYSIS" ? page.area.regionLabel : page.regionLabel;
  return <section className="p33d-page">
    <header><b>F R A M E O N E</b><span>포크33 의사결정 리포트 V2 · {region}</span></header>
    {page.kind === "REGION_DEMAND_SUMMARY" && <RegionDemand page={page} />}
    {page.kind === "APARTMENT_AREA_ANALYSIS" && <ApartmentArea page={page} />}
    {page.kind === "CANDIDATE_COMPARE" && <CandidateCompare page={page} />}
    <footer><span>현장조사 및 사용자 제공 자료 기준 · 수요지표는 후보별 범위/분포이며 합계가 아닙니다.</span><b>{String(pageNumber).padStart(2, "0")} / {String(pageCount).padStart(2, "0")}</b></footer>
  </section>;
}

function RegionDemand({ page }: { page: Extract<Pork33DecisionPage, { kind: "REGION_DEMAND_SUMMARY" }> }) {
  const demand = page.demand;
  return <div className="p33d-demand"><div className="p33d-title"><small>REGION DEMAND SUMMARY</small><h1>{demand.regionLabel} 상권·수요</h1><p>후보별 반경 500m Snapshot의 범위와 분포</p></div><div className="p33d-area-field">{demand.apartmentAreas.map((area) => <article key={area.apartmentAreaId}><b>{area.label}</b><span>{area.candidateCount}개 후보</span></article>)}</div><div className="p33d-demand-info"><h2>수요 지표</h2><Metric label="주거인구" value={demand.residentialPopulationRange.display} /><Metric label="세대수" value={demand.householdRange.display} /><Metric label={`${demand.competitorMetricLabel} 수`} value={demand.meatShopRange.display} /><Metric label="유동 최다 시간대" value={demand.peakTimeDistribution} /><Metric label="주요 성·연령" value={demand.peakGenderAgeDistribution} /><Metric label="일반주거 특징" value={demand.generalResidentialSummary} /><div className="p33d-counts"><b>Apartment Area {demand.apartmentAreaCount}개</b><b>Candidate {demand.candidateCount}곳</b><b>Snapshot {demand.snapshotCount}건</b></div></div><article className="p33d-opinion"><h3>FRAMEONE 해석</h3>{demand.interpretation.map((item) => <p key={item}>{item}</p>)}</article></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="p33d-metric"><span>{label}</span><b>{value}</b></div>;
}

function ApartmentArea({ page }: { page: Extract<Pork33DecisionPage, { kind: "APARTMENT_AREA_ANALYSIS" }> }) {
  const area = page.area;
  return <div className="p33d-area"><div className="p33d-title"><small>APARTMENT AREA ANALYSIS</small><h1>{area.label}</h1><p>{area.candidateIds.join(" · ")} · 후보 {area.candidateCount}곳</p></div><div className={`p33d-map-grid p33d-map-${Math.min(area.mapThumbnails.length, 4)}`}>{area.mapThumbnails.map((map) => <figure key={map.candidateId}>{map.mapRef ? <Image src={assetUrl(map.mapRef)} alt={`${map.candidateId} 위치 지도`} fill unoptimized sizes="30vw" /> : <span>위치 지도 확인 필요</span>}<figcaption>{map.candidateId}</figcaption></figure>)}</div><div className="p33d-area-info"><Metric label="직접 배후 아파트" value={area.directApartments.join(" · ") || "확인 필요"} /><Metric label="기존 조사 기재 세대수" value={area.existingHouseholdDisplay} /><small>{area.householdSource}</small><Metric label="일반주거 배후" value={area.generalResidentialDisplay} /><Metric label="오피스텔 배후" value={area.officetelDisplay} /><Metric label={`SBIZ365 500m ${area.competitorMetricLabel}`} value={area.competitionDisplay} /><div className="p33d-relations">{area.candidateRelations.map((item) => <p key={item.candidateId}><b>{item.candidateId}</b> {item.entrance} · {item.flow.join(" · ")}</p>)}</div></div><article className="p33d-opinion"><h3>FRAMEONE 검토의견</h3>{area.frameoneOpinion.map((item) => <p key={item}>{item}</p>)}</article></div>;
}

function CandidateCompare({ page }: { page: Extract<Pork33DecisionPage, { kind: "CANDIDATE_COMPARE" }> }) {
  return <div className="p33d-compare"><div className="p33d-title"><small>CANDIDATE COMPARE</small><h1>{page.apartmentAreaLabel}{page.pageCount > 1 ? ` (${page.pageNumber}/${page.pageCount})` : ""}</h1><p>같은 Apartment Area 후보의 선택 판단 요약</p></div><div className={`p33d-card-grid p33d-cards-${page.candidates.length}`}>{page.candidates.map((candidate) => <article className="p33d-card" key={candidate.candidateStoreId}><div className="p33d-card-head"><h2>{candidate.displayCode}</h2><span>Grade {candidate.siteGrade}</span></div><p className="p33d-address">{candidate.address}</p><div className="p33d-card-photo">{candidate.representativePhotoRef ? <Image src={assetUrl(candidate.representativePhotoRef)} alt={`${candidate.displayCode} 대표사진`} fill unoptimized sizes="23vw" /> : <b>대표사진 미확보</b>}</div><div className="p33d-lease"><span>면적 <b>{candidate.area}</b></span><span>보증금 <b>{candidate.deposit}</b></span><span>월세 <b>{candidate.rent}</b></span><span>관리비 <b>{candidate.maintenance}</b></span><span>권리금 <b>{candidate.premium}</b></span></div><dl><dt>아파트 접근</dt><dd>{candidate.apartmentAccess}</dd><dt>생활동선</dt><dd>{candidate.mainFlow}</dd><dt>경쟁환경</dt><dd>{candidate.competitionEnvironment}</dd><dt>가시성</dt><dd>{candidate.visibility}</dd><dt>단기정차</dt><dd>{candidate.shortStop}</dd>{candidate.strengths.length > 0 && <><dt>장점</dt><dd>{candidate.strengths.join(" · ")}</dd></>}{candidate.checks.length > 0 && <><dt>확인사항</dt><dd>{candidate.checks.join(" · ")}</dd></>}</dl><div className={`p33d-lifecycle p33d-${candidate.lifecycleCode.toLowerCase()}`}>{candidate.lifecycle}</div></article>)}</div><p className="p33d-grade-note">Site Grade는 입지 조건 적합도 분류이며 출점 성공확률·계약추천·매출 가능성을 의미하지 않습니다.</p></div>;
}
