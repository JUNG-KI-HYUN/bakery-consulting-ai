import Image from "next/image";
import { connection } from "next/server";
import { buildPork33BriefingPages, type Pork33BriefingCandidate, type Pork33BriefingPage, type Pork33BriefingScope } from "@/lib/pork33-candidate-shortlist/briefing-report";
import { loadPork33DecisionServerInputs } from "@/lib/pork33-candidate-shortlist/decision-snapshots.server";
import { loadCurrentPork33State } from "@/lib/pork33-candidate-shortlist/repository.server";
import "./preview.css";

type SearchParams = Promise<{ scopeType?: string; regionId?: string; candidateStoreId?: string }>;

function assetUrl(assetRef: string) {
  return `/api/tools/pork33-candidate-shortlist/briefing-assets?ref=${encodeURIComponent(assetRef)}`;
}

function scopeFrom(values: Awaited<SearchParams>): Pork33BriefingScope {
  if (values.scopeType === "REGION" && values.regionId) return { scopeType: "REGION", regionId: values.regionId };
  if (values.scopeType === "CANDIDATE" && values.candidateStoreId) return { scopeType: "CANDIDATE", candidateStoreId: values.candidateStoreId };
  return { scopeType: "ALL" };
}

export default async function Pork33BriefingPreviewPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const state = await loadCurrentPork33State();
  const inputs = await loadPork33DecisionServerInputs(state);
  const scope = scopeFrom(await searchParams);
  const pages = buildPork33BriefingPages(state, inputs.assets, inputs.sbiz365ByCandidateId, scope);
  return <main className="p33b-preview">
    <div className="p33b-toolbar"><strong>PORK33 본사 브리핑 Web Preview</strong><span>{pages.length}페이지</span><a href="/tools/pork33-candidate-shortlist">도구로 돌아가기</a></div>
    <div className="p33b-scope"><a href="/tools/pork33-candidate-shortlist/briefing-preview">전체</a>{state.regions.map((region) => <a key={region.regionId} href={`/tools/pork33-candidate-shortlist/briefing-preview?scopeType=REGION&regionId=${encodeURIComponent(region.regionId)}`}>{region.label}</a>)}</div>
    {pages.map((page, index) => <ReportPage key={`${page.kind}-${index}`} page={page} pageNumber={index + 1} pageCount={pages.length} />)}
  </main>;
}

function ReportPage({ page, pageNumber, pageCount }: { page: Pork33BriefingPage; pageNumber: number; pageCount: number }) {
  const region = page.kind === "REGION_OVERVIEW" ? page.region.label : page.candidate.regionLabel;
  return <section className="p33b-page">
    <header><b>F R A M E O N E</b><span>포크33 출점 후보점포 현장조사 · {region}</span></header>
    {page.kind === "REGION_OVERVIEW" && <RegionPage page={page} />}
    {page.kind === "CANDIDATE_SUMMARY" && <CandidatePage candidate={page.candidate} />}
    {page.kind === "FIELD_PHOTO" && <PhotoPage candidate={page.candidate} />}
    <footer><span>FRAMEONE · 현장조사 및 사용자 제공 매물자료 기준</span><b>{String(pageNumber).padStart(2, "0")} / {String(pageCount).padStart(2, "0")}</b></footer>
  </section>;
}

function RegionPage({ page }: { page: Extract<Pork33BriefingPage, { kind: "REGION_OVERVIEW" }> }) {
  const region = page.region;
  return <div className="p33b-region"><div className="p33b-title"><small>REGION OVERVIEW</small><h1>{region.label}</h1><p>포크33 출점 후보지역 · 1차 현장조사 개요</p></div><div className="p33b-region-media">{region.heroPhotoRef && <div className="p33b-image"><Image src={assetUrl(region.heroPhotoRef)} alt={`${region.label} 대표 현장사진`} fill unoptimized sizes="44vw" /></div>}<RelativeMap points={region.points} /></div><div className="p33b-region-info"><div className="p33b-region-count"><span>현장조사 후보</span><strong>{region.candidateCount}<small>곳</small></strong><em>{region.candidateIdRange}</em></div><div><small>주요 조사생활권</small><h2>{region.localities.join(" · ")}</h2></div><article><h3>FRAMEONE 1차 조사요약</h3><p>{region.frameoneSummary}</p></article><div><h3>소상공인365 참고</h3><p>{region.sbiz365Summary}</p></div></div></div>;
}

function RelativeMap({ points }: { points: Array<{ candidateId: string; latitude: number; longitude: number }> }) {
  if (points.length === 0) return null;
  const lats = points.map((point) => point.latitude); const lngs = points.map((point) => point.longitude);
  const minLat = Math.min(...lats); const maxLat = Math.max(...lats); const minLng = Math.min(...lngs); const maxLng = Math.max(...lngs);
  const latRange = Math.max(maxLat - minLat, 0.00001); const lngRange = Math.max(maxLng - minLng, 0.00001);
  return <div className="p33b-relative-map"><b>후보 위치 분포 · 검증 좌표의 상대 위치</b>{points.map((point) => <span key={point.candidateId} style={{ left: `${5 + ((point.longitude - minLng) / lngRange) * 85}%`, top: `${18 + (1 - ((point.latitude - minLat) / latRange)) * 72}%` }}>{point.candidateId.replace("P33-", "")}</span>)}</div>;
}

function CandidatePage({ candidate }: { candidate: Pork33BriefingCandidate }) {
  const sbiz = candidate.sbiz365;
  return <div className="p33b-candidate"><div className="p33b-candidate-title"><strong>{candidate.displayCode}</strong><div><small>후보점포</small><h1>{candidate.address}</h1><p>{candidate.apartmentArea}</p></div><em>● {candidate.lifecycleLabel}</em></div><div className="p33b-candidate-media">{candidate.representativePhotoRef && <div className="p33b-image"><Image src={assetUrl(candidate.representativePhotoRef)} alt={`${candidate.displayCode} 대표 현장사진`} fill unoptimized sizes="32vw" /></div>}{candidate.mapRef && <div className="p33b-image p33b-map"><Image src={assetUrl(candidate.mapRef)} alt={`${candidate.displayCode} 위치 지도`} fill unoptimized sizes="32vw" /></div>}</div><div className="p33b-candidate-info"><h2>핵심 임대조건</h2><div className="p33b-metrics">{[["전용면적",candidate.area],["보증금",candidate.deposit],["월세",candidate.rent],["관리비",candidate.maintenance],["권리금",candidate.premium]].map(([label,item]) => <span key={label}><small>{label}</small><b>{item}</b></span>)}</div><div className="p33b-two"><article><h3>주요 배후</h3><b>{candidate.mainApartment}</b><p>기존 조사 기재값 {candidate.household}</p><small>{candidate.householdSource}</small></article><article><h3>현장 위치</h3><p>· {candidate.apartmentRelationship}</p>{candidate.fieldLocation.map((item) => <p key={item}>· {item}</p>)}</article></div><article className="p33b-summary"><h3>현장 검토 요약</h3><p>{candidate.approvedSummary}</p></article><article className="p33b-sbiz"><h3>소상공인365 반경 500m</h3><p>유동 최다 {sbiz?.peakFloatingTime ?? "확인 필요"} · 주요 성·연령 {sbiz?.peakGenderAge ?? "확인 필요"}</p><p>{candidate.competitorMetric.label} {candidate.competitorMetric.value} · 세대 {candidate.sbiz365HouseholdDisplay} · 주거인구 {candidate.sbiz365ResidentialPopulationDisplay}</p></article>{(candidate.strengths.length > 0 || candidate.checks.length > 0) && <div className="p33b-strength">{candidate.strengths.length > 0 && <p><b>강점</b> {candidate.strengths.join(" · ")}</p>}{candidate.checks.length > 0 && <p><b>확인</b> {candidate.checks.join(" · ")}</p>}</div>}</div></div>;
}

function PhotoPage({ candidate }: { candidate: Pork33BriefingCandidate }) {
  return <div className="p33b-photos"><div><small>{candidate.displayCode} · FIELD PHOTO</small><h1>후보점포 현장사진</h1><p>{candidate.address}</p></div><div className={`p33b-photo-grid p33b-photo-${candidate.photos.length}`}>{candidate.photos.map((photo, index) => <figure key={photo.assetRef}><div><Image src={assetUrl(photo.assetRef)} alt={`${candidate.displayCode} 현장사진 ${index + 1}`} fill unoptimized sizes="33vw" /></div><figcaption>PHOTO {String(index + 1).padStart(2, "0")}</figcaption></figure>)}</div></div>;
}
