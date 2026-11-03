import { createHash } from "node:crypto";
import path from "node:path";
import { geocodeKakaoAddress } from "../market-data/clients/kakao-geocode";
import {
  SBIZ365_SOURCE_TYPE,
  type Sbiz365ExtractedFact,
  type Sbiz365FactGroup,
  type Sbiz365ImportResult,
  type Sbiz365SourceEvidence,
  type SimpleReportAreaInput,
} from "./types";

const EXPECTED_INDUSTRY = "정육점";
const EXPECTED_RADIUS_METERS = 1_000;

type FactRule = {
  key: string;
  label: string;
  group: Sbiz365FactGroup;
  pattern: RegExp;
};

const FACT_RULES: readonly FactRule[] = [
  { key: "storeCount", label: "점포수", group: "COMPETITION", pattern: /^(?:점포수|업종수)\s*[:：]\s*(.+)$/ },
  { key: "floatingPopulation", label: "유동인구", group: "DEMAND", pattern: /^유동인구\s*[:：]\s*(.+)$/ },
  { key: "livingPopulation", label: "생활인구", group: "DEMAND", pattern: /^생활인구\s*[:：]\s*(.+)$/ },
  { key: "age", label: "연령대", group: "DEMAND", pattern: /^(?:연령대|연령별)\s*[:：]\s*(.+)$/ },
  { key: "gender", label: "성별", group: "DEMAND", pattern: /^성별\s*[:：]\s*(.+)$/ },
  { key: "customerComposition", label: "고객구성", group: "DEMAND", pattern: /^고객\s*구성\s*[:：]\s*(.+)$/ },
  { key: "residentPopulation", label: "주거 관련 값", group: "DEMAND", pattern: /^(?:주거인구|상주인구|주거\s*인구)\s*[:：]\s*(.+)$/ },
  { key: "workerPopulation", label: "직장 관련 값", group: "DEMAND", pattern: /^(?:직장인구|직장\s*인구|종사자수)\s*[:：]\s*(.+)$/ },
  { key: "dayOfWeek", label: "요일", group: "TIME", pattern: /^(?:요일별|요일)\s*[:：]\s*(.+)$/ },
  { key: "timeOfDay", label: "시간대", group: "TIME", pattern: /^(?:시간대별|시간대)\s*[:：]\s*(.+)$/ },
  { key: "estimatedSales", label: "추정매출", group: "DEMAND", pattern: /^(?:추정매출|추정\s*매출액)\s*[:：]\s*(.+)$/ },
  { key: "sales", label: "매출", group: "DEMAND", pattern: /^(?:매출액|매출)\s*[:：]\s*(.+)$/ },
  { key: "averageTicket", label: "객단가", group: "DEMAND", pattern: /^객단가\s*[:：]\s*(.+)$/ },
  { key: "competition", label: "경쟁강도", group: "COMPETITION", pattern: /^(?:경쟁강도|경쟁도)\s*[:：]\s*(.+)$/ },
  { key: "openings", label: "개업", group: "COMPETITION", pattern: /^(?:개업수|개업)\s*[:：]\s*(.+)$/ },
  { key: "closures", label: "폐업", group: "COMPETITION", pattern: /^(?:폐업수|폐업)\s*[:：]\s*(.+)$/ },
];

type PageText = { page: number; text: string; lines: string[] };

function linesOf(text: string) {
  return text
    .replace(/\u0000/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function pagesOf(text: string): PageText[] {
  const rawPages = text.split("\f");
  if (rawPages.at(-1)?.trim() === "") rawPages.pop();
  return rawPages.map((pageText, index) => ({
    page: index + 1,
    text: pageText,
    lines: linesOf(pageText),
  }));
}

function evidence(page: number, label: string, sourceText: string): Sbiz365SourceEvidence {
  return { sourceType: SBIZ365_SOURCE_TYPE, page, label, sourceText };
}

function findSourcePage(pages: PageText[], sourceText: string) {
  return pages.find((page) => page.lines.includes(sourceText))?.page ?? 1;
}

function followingLabel(
  pages: PageText[],
  labels: readonly string[],
): { value: string; evidence: Sbiz365SourceEvidence } | null {
  for (const page of pages) {
    for (let index = 0; index < page.lines.length; index += 1) {
      const line = page.lines[index];
      const label = labels.find((candidate) => line === candidate);
      const value = page.lines[index + 1];
      if (label && value) {
        return { value, evidence: evidence(page.page, label, `${label}\n${value}`) };
      }
    }
  }
  return null;
}

function matchingLine(
  pages: PageText[],
  pattern: RegExp,
  label: string,
): { match: RegExpMatchArray; evidence: Sbiz365SourceEvidence } | null {
  for (const page of pages) {
    for (const line of page.lines) {
      const match = line.match(pattern);
      if (match) return { match, evidence: evidence(page.page, label, line) };
    }
  }
  return null;
}

function firstCaptured(lines: string[], patterns: RegExp[]) {
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      const value = match?.[1]?.trim();
      if (value) return value;
    }
  }
  return null;
}

function extractRadius(lines: string[]) {
  for (const line of lines) {
    if (!/(?:분석범위|분석반경|반경)/.test(line)) continue;
    const km = line.match(/([\d.]+)\s*km\b/i);
    if (km) return Math.round(Number(km[1]) * 1_000);
    const meters = line.match(/([\d,]+)\s*m\b/i);
    if (meters) return Number(meters[1].replaceAll(",", ""));
  }
  return null;
}

function extractFacts(lines: string[], pages: PageText[]) {
  const facts: Record<string, Sbiz365ExtractedFact> = {};
  for (const line of lines) {
    // Generic label parser는 명시적인 label:value 행만 처리한다.
    // 실제 리포트의 "매출 추이", "성별 고객" 같은 제목을 값으로 오인하지 않는다.
    if (!/[：:]/.test(line)) continue;
    for (const rule of FACT_RULES) {
      if (facts[rule.key]) continue;
      const value = line.match(rule.pattern)?.[1]?.trim();
      if (!value) continue;
      facts[rule.key] = {
        key: rule.key,
        label: rule.label,
        value,
        group: rule.group,
        sourceText: line,
        valueKind: "SOURCE_TEXT",
        evidence: evidence(findSourcePage(pages, line), rule.label, line),
      };
    }
  }
  return facts;
}

function addFact(
  facts: Record<string, Sbiz365ExtractedFact>,
  input: {
    key: string;
    label: string;
    value: string;
    group: Sbiz365FactGroup;
    evidence: Sbiz365SourceEvidence;
  },
) {
  if (facts[input.key]) return;
  facts[input.key] = {
    key: input.key,
    label: input.label,
    value: input.value,
    group: input.group,
    sourceText: input.evidence.sourceText,
    valueKind: "SOURCE_TEXT",
    evidence: input.evidence,
  };
}

function setFact(
  facts: Record<string, Sbiz365ExtractedFact>,
  input: {
    key: string;
    label: string;
    value: string;
    group: Sbiz365FactGroup;
    evidence: Sbiz365SourceEvidence;
  },
) {
  delete facts[input.key];
  addFact(facts, input);
}

function pageWithHeadings(pages: PageText[], ...headings: string[]) {
  return pages.find((page) => headings.every((heading) => page.lines.includes(heading)));
}

function numericTokens(line: string) {
  return line.match(/-?[\d,]+(?:\.\d+)?/g)?.map((value) => value.replaceAll(",", "")) ?? [];
}

function addJsonFact(
  facts: Record<string, Sbiz365ExtractedFact>,
  input: {
    key: string;
    label: string;
    value: unknown;
    group: Sbiz365FactGroup;
    page: PageText;
    sourceText: string;
  },
) {
  setFact(facts, {
    key: input.key,
    label: input.label,
    value: JSON.stringify(input.value),
    group: input.group,
    evidence: evidence(input.page.page, input.label, input.sourceText),
  });
}

function extractPork33RawFacts(
  pages: PageText[],
  facts: Record<string, Sbiz365ExtractedFact>,
) {
  const storePage = pageWithHeadings(pages, "업종분석", "업소수 추이");
  const salesPage = pageWithHeadings(pages, "매출분석", "업소당 월평균 매출액 추이");
  const transactionsPage = pageWithHeadings(pages, "매출분석", "업소당 월평균 매출건수 추이");
  const patternPage = pageWithHeadings(pages, "매출분석", "매출특성");
  const householdPage = pageWithHeadings(pages, "지역현황", "세대 수 현황");
  const housingPage = pageWithHeadings(pages, "지역현황", "공동주택 현황");
  const facilitiesPage = pageWithHeadings(pages, "지역현황", "주변시설 현황");
  const transportPage = pageWithHeadings(pages, "지역현황", "교통시설현황");

  const series: Array<{
    page: PageText | undefined;
    key: string;
    label: string;
    group: Sbiz365FactGroup;
    rowPattern: RegExp;
  }> = [
    { page: storePage, key: "selectedStoreCountTrend", label: "선택 영역 업소수 13개월 추이", group: "COMPETITION", rowPattern: /^업소수\s+/ },
    { page: salesPage, key: "selectedMonthlySalesTrend", label: "선택 영역 업소당 월평균 매출액 13개월 추이", group: "DEMAND", rowPattern: /^매출\s+/ },
    { page: transactionsPage, key: "selectedMonthlyTransactionsTrend", label: "선택 영역 업소당 월평균 매출건수 13개월 추이", group: "DEMAND", rowPattern: /^매출\s+/ },
  ];
  for (const item of series) {
    const periodLine = item.page?.lines.find((line) => /'?25\.07/.test(line) && /26\.07/.test(line));
    const valueLine = item.page?.lines.find((line) => item.rowPattern.test(line));
    if (!item.page || !periodLine || !valueLine) continue;
    const periods = periodLine.match(/\d{2}\.\d{2}/g) ?? [];
    const values = numericTokens(valueLine).map(Number);
    if (periods.length !== values.length || periods.length === 0) continue;
    addJsonFact(facts, {
      key: item.key,
      label: item.label,
      value: periods.map((period, index) => ({ period: `20${period}`, value: values[index] })),
      group: item.group,
      page: item.page,
      sourceText: `${periodLine}\n${valueLine}`,
    });
  }

  if (!facts.selectedStoreCountTrend) {
    const storeRow = matchingLine(pages, /^업소수(?:\s+\d[\d,]*){13}$/, "선택 영역 업소수 13개월 추이");
    const page = storeRow ? pages.find((candidate) => candidate.page === storeRow.evidence.page) : undefined;
    const periodLine = page?.lines.find((line) => /25\.07/.test(line) && /26\.07/.test(line));
    const periods = periodLine?.match(/\d{2}\.\d{2}/g) ?? [];
    const values = storeRow ? numericTokens(storeRow.match[0]).map(Number) : [];
    if (page && periodLine && periods.length === values.length && periods.length > 0) addJsonFact(facts, {
      key: "selectedStoreCountTrend",
      label: "선택 영역 업소수 13개월 추이",
      value: periods.map((period, index) => ({ period: `20${period}`, value: values[index] })),
      group: "COMPETITION",
      page,
      sourceText: `${periodLine}\n${storeRow?.match[0]}`,
    });
  }

  const selectedPatternLines = patternPage?.lines.filter((line) => /^선택 영역 비율\s+/.test(line)) ?? [];
  const dayLine = selectedPatternLines.find((line) => numericTokens(line).length === 9)
    ?? matchingLine(pages, /^선택 영역 비율(?:\s+[\d.]+){9}$/, "선택 영역 정육점 요일별 매출 비율")?.match[0];
  const timeLine = selectedPatternLines.find((line) => numericTokens(line).length === 6)
    ?? matchingLine(pages, /^선택 영역 비율(?:\s+[\d.]+){6}$/, "선택 영역 정육점 시간대별 매출 비율")?.match[0];
  const ageLine = selectedPatternLines.find((line) => numericTokens(line).length === 8)
    ?? matchingLine(pages, /^선택 영역 비율(?:\s+[\d.]+){8}$/, "선택 영역 정육점 연령대별 매출 비율")?.match[0];
  const effectivePatternPage = patternPage ?? pages.find((page) => [dayLine, timeLine, ageLine].some((line) => line && page.lines.includes(line)));
  if (effectivePatternPage && dayLine) {
    const values = numericTokens(dayLine).map(Number);
    if (values.length === 9) {
      addJsonFact(facts, { key: "salesWeekdayWeekendShares", label: "선택 영역 정육점 주중/주말 매출 비율", value: { weekday: values[0], weekend: values[1] }, group: "TIME", page: effectivePatternPage, sourceText: dayLine });
      addJsonFact(facts, { key: "salesDayShares", label: "선택 영역 정육점 요일별 매출 비율", value: Object.fromEntries(["월", "화", "수", "목", "금", "토", "일"].map((key, index) => [key, values[index + 2]])), group: "TIME", page: effectivePatternPage, sourceText: dayLine });
    }
  }
  if (effectivePatternPage && timeLine) {
    const values = numericTokens(timeLine).map(Number);
    if (values.length === 6) addJsonFact(facts, { key: "salesTimeBandShares", label: "선택 영역 정육점 시간대별 매출 비율", value: Object.fromEntries(["05~09", "09~12", "12~14", "14~18", "18~23", "23~05"].map((key, index) => [key, values[index]])), group: "TIME", page: effectivePatternPage, sourceText: timeLine });
  }
  if (effectivePatternPage && ageLine) {
    const values = numericTokens(ageLine).map(Number);
    if (values.length === 8) {
      addJsonFact(facts, { key: "buyerGenderShares", label: "선택 영역 정육점 구매 성별 매출 비율", value: { male: values[0], female: values[1] }, group: "DEMAND", page: effectivePatternPage, sourceText: ageLine });
      addJsonFact(facts, { key: "buyerAgeShares", label: "선택 영역 정육점 구매 연령대별 매출 비율", value: Object.fromEntries(["10대", "20대", "30대", "40대", "50대", "60대+"].map((key, index) => [key, values[index + 2]])), group: "DEMAND", page: effectivePatternPage, sourceText: ageLine });
    }
  }

  const householdLine = householdPage?.lines.find((line) => /^선택 영역(?:\s+[\d,]+){4}$/.test(line));
  const householdValues = householdLine ? numericTokens(householdLine) : [];
  if (householdPage && householdLine && householdValues.length === 4) setFact(facts, { key: "householdCount", label: "선택 영역 세대 수 · 최신 기준", value: `${householdValues.at(-1)}세대`, group: "DEMAND", evidence: evidence(householdPage.page, "세대 수 현황 · 선택 영역 · 2026년 하반기", householdLine) });

  const housingLine = housingPage?.lines.find((line) => /^선택 영역(?:\s+[\d,]+){3}$/.test(line));
  const apartmentLine = housingPage?.lines.find((line) => /^선택 영역(?:\s+[\d,]+){6}$/.test(line));
  const bucketLine = housingPage?.lines.find((line) => /^선택 영역(?:\s+\d+){6}$/.test(line));
  if (housingPage && housingLine) setFact(facts, { key: "collectiveHousingCount", label: "선택 영역 공동주택 수 · 2025년", value: `${numericTokens(housingLine).at(-1)}호`, group: "DEMAND", evidence: evidence(housingPage.page, "공동주택 수 추이 · 선택 영역 · 2025년", housingLine) });
  if (housingPage && apartmentLine) setFact(facts, { key: "apartmentUnitCount", label: "선택 영역 아파트 호수 · 2025년", value: `${numericTokens(apartmentLine).at(-1)}호`, group: "DEMAND", evidence: evidence(housingPage.page, "아파트 동/호 수 추이 · 선택 영역 · 2025년 호", apartmentLine) });
  if (housingPage && bucketLine) {
    const values = numericTokens(bucketLine).map(Number);
    addJsonFact(facts, { key: "apartmentComplexSizeBuckets", label: "선택 영역 아파트 단지규모별 현황", value: { under300: values[0], complex300To500: values[1], complex500To1000: values[2], complex1000To1500: values[3], complex1500To2000: values[4], complex2000Plus: values[5] }, group: "DEMAND", page: housingPage, sourceText: bucketLine });
  }

  const facilitiesLine = facilitiesPage?.lines.find((line) => /^선택 영역(?:\s+\d+){7}$/.test(line));
  if (facilitiesPage && facilitiesLine) {
    const values = numericTokens(facilitiesLine).map(Number);
    setFact(facts, { key: "largeRetailCount", label: "선택 영역 대형유통시설 수", value: `${values[4]}개`, group: "SPACE", evidence: evidence(facilitiesPage.page, "주요시설 현황 · 선택 영역 · 대형유통", facilitiesLine) });
    setFact(facts, { key: "majorFacilities", label: "선택 영역 주요시설", value: ["공공기관", "금융기관", "의료/복지", "학교", "대형유통", "문화시설", "숙박시설"].map((label, index) => `${label} ${values[index]}개`).join("; "), group: "SPACE", evidence: evidence(facilitiesPage.page, "주요시설 현황 · 선택 영역", facilitiesLine) });
  }

  const transportLine = transportPage?.lines.find((line) => /^선택 영역\s+\d+\s+\d+$/.test(line));
  if (transportPage && transportLine) {
    const values = numericTokens(transportLine).map(Number);
    setFact(facts, { key: "subwayStationCount", label: "선택 영역 지하철역 수", value: `${values[0]}개`, group: "SPACE", evidence: evidence(transportPage.page, "교통시설 현황 · 선택 영역 · 지하철역", transportLine) });
    setFact(facts, { key: "busStopCount", label: "선택 영역 버스정류장 수", value: `${values[1]}개`, group: "SPACE", evidence: evidence(transportPage.page, "교통시설 현황 · 선택 영역 · 버스정류장", transportLine) });
    setFact(facts, { key: "transportFacilities", label: "선택 영역 교통시설", value: `지하철역 ${values[0]}개; 버스정류장 ${values[1]}개`, group: "SPACE", evidence: evidence(transportPage.page, "교통시설 현황 · 선택 영역", transportLine) });
  }
  const stationLine = transportPage?.lines.find((line) => /^\S+선\s+\S+\s+[\d,]+\s+[\d,]+\s+[\d,]+$/.test(line));
  if (transportPage && stationLine) {
    const values = numericTokens(stationLine);
    const tokens = stationLine.split(/\s+/);
    setFact(facts, { key: "stationRidership", label: "인근 지하철역 일평균 승하차 인원 · 2025년", value: `${tokens[1]} ${values.at(-1)}명`, group: "SPACE", evidence: evidence(transportPage.page, "지하철 이용 현황 · 2025년", stationLine) });
  }

  const fallbackLine = pages.flatMap((page) => page.lines.map((line) => ({ page, line }))).find(({ line }) => /업소\s*수가?\s*3개\s*이하.*행정동/.test(line));
  if (fallbackLine) setFact(facts, { key: "salesScopeFallback", label: "저점포수 매출 범위 대체 규칙", value: "ADMIN_DONG:LOW_STORE_COUNT", group: "DEMAND", evidence: evidence(fallbackLine.page.page, "저점포수 매출 범위 대체 안내", fallbackLine.line) });
}

function extractActualReportFacts(
  pages: PageText[],
  facts: Record<string, Sbiz365ExtractedFact>,
) {
  const summaryStores = matchingLine(
    pages,
    /^(\d[\d,]*)개\s+([+-]?\d+(?:\.\d+)?)%\s+(\d[\d,]*)개\s+([+-]?\d+(?:\.\d+)?)%$/,
    "요약 · 업소 정보",
  );
  if (summaryStores) {
    const [selectedCount, selectedChange, hinterlandCount, hinterlandChange] = summaryStores.match.slice(1);
    addFact(facts, { key: "selectedStoreCount", label: "선택 영역 업소수", value: `${selectedCount}개`, group: "COMPETITION", evidence: summaryStores.evidence });
    addFact(facts, { key: "selectedStoreCountMonthOverMonth", label: "선택 영역 업소수 전월대비 증감률", value: `${selectedChange}%`, group: "COMPETITION", evidence: summaryStores.evidence });
    addFact(facts, { key: "hinterlandStoreCount", label: "배후지 업소수", value: `${hinterlandCount}개`, group: "COMPETITION", evidence: summaryStores.evidence });
    addFact(facts, { key: "hinterlandStoreCountMonthOverMonth", label: "배후지 업소수 전월대비 증감률", value: `${hinterlandChange}%`, group: "COMPETITION", evidence: summaryStores.evidence });
  }

  const summarySales = matchingLine(
    pages,
    /^(\d[\d,]*)만원\s+([+-]?\d+(?:\.\d+)?)%\s+(\d[\d,]*)만원\s+([+-]?\d+(?:\.\d+)?)%$/,
    "요약 · 월평균 추정 매출 정보",
  );
  if (summarySales) {
    const [selectedSales, selectedChange, hinterlandSales, hinterlandChange] = summarySales.match.slice(1);
    addFact(facts, { key: "estimatedMonthlyAverageSales", label: "선택 영역 업소당 월평균 추정 매출액", value: `${selectedSales}만원`, group: "DEMAND", evidence: summarySales.evidence });
    addFact(facts, { key: "estimatedMonthlyAverageSalesMonthOverMonth", label: "선택 영역 월평균 추정 매출액 전월대비 증감률", value: `${selectedChange}%`, group: "DEMAND", evidence: summarySales.evidence });
    addFact(facts, { key: "hinterlandEstimatedMonthlyAverageSales", label: "배후지 업소당 월평균 추정 매출액", value: `${hinterlandSales}만원`, group: "DEMAND", evidence: summarySales.evidence });
    addFact(facts, { key: "hinterlandEstimatedMonthlyAverageSalesMonthOverMonth", label: "배후지 월평균 추정 매출액 전월대비 증감률", value: `${hinterlandChange}%`, group: "DEMAND", evidence: summarySales.evidence });
  }

  const selectedFloating = matchingLine(pages, /^선택영역\s+([\d,]+)$/, "성별/연령대별 일평균 유동인구 · 선택영역");
  if (selectedFloating) addFact(facts, { key: "dailyAverageFloatingPopulation", label: "선택 영역 일평균 유동인구", value: `${selectedFloating.match[1]}명`, group: "DEMAND", evidence: selectedFloating.evidence });

  const demographicPage = pages.find((page) => page.page === 8);
  const demographicRatio = demographicPage?.lines.find((line) =>
    /^비율\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+$/.test(line),
  );
  if (demographicPage && demographicRatio) {
    const values = demographicRatio.split(/\s+/).slice(1);
    addFact(facts, {
      key: "floatingPopulationGenderRatios",
      label: "선택 영역 유동인구 성별 비율",
      value: `남성 ${values[0]}%; 여성 ${values[1]}%`,
      group: "DEMAND",
      evidence: evidence(8, "성별/연령대별 일평균 유동인구 · 선택영역 비율", demographicRatio),
    });
    addFact(facts, {
      key: "floatingPopulationAgeRatios",
      label: "선택 영역 유동인구 연령대별 비율",
      value: ["10대", "20대", "30대", "40대", "50대", "60대 이상"]
        .map((label, index) => `${label} ${values[index + 2]}%`)
        .join("; "),
      group: "DEMAND",
      evidence: evidence(8, "성별/연령대별 일평균 유동인구 · 선택영역 비율", demographicRatio),
    });
  }

  const timePage = pages.find((page) => page.page === 9);
  const timeRatios = timePage?.lines.filter((line) => /^비율\s+(?:[\d.]+\s+)+[\d.]+$/.test(line)) ?? [];
  const dayRatio = timeRatios.find((line) => line.split(/\s+/).length === 10);
  const bandRatio = timeRatios.find((line) => line.split(/\s+/).length === 7);
  if (dayRatio) {
    const values = dayRatio.split(/\s+/).slice(3);
    addFact(facts, {
      key: "floatingPopulationDayRatios",
      label: "선택 영역 유동인구 요일별 비율",
      value: ["월", "화", "수", "목", "금", "토", "일"]
        .map((label, index) => `${label} ${values[index]}%`)
        .join("; "),
      group: "TIME",
      evidence: evidence(9, "요일별 일평균 유동인구 · 선택영역 비율", dayRatio),
    });
  }
  if (bandRatio) {
    const values = bandRatio.split(/\s+/).slice(1);
    addFact(facts, {
      key: "floatingPopulationTimeBandRatios",
      label: "선택 영역 유동인구 시간대별 비율",
      value: ["00~06", "06~09", "09~12", "12~15", "15~18", "18~24"]
        .map((label, index) => `${label}시 ${values[index]}%`)
        .join("; "),
      group: "TIME",
      evidence: evidence(9, "시간대별 유동인구 · 선택영역 비율", bandRatio),
    });
  }

  const populationRows: Array<{ key: string; label: string; pattern: RegExp; group: Sbiz365FactGroup }> = [
    { key: "residentPopulation", label: "선택 영역 주거인구 · 최신 기준", pattern: /^선택 영역\s+[\d,]+\s+[\d,]+\s+([\d,]+)$/, group: "DEMAND" },
    { key: "workerPopulation", label: "선택 영역 직장인구 · 최신 기준", pattern: /^선택 영역\s+[\d,]+\s+[\d,]+\s+([\d,]+)$/, group: "DEMAND" },
    { key: "householdCount", label: "선택 영역 세대 수 · 최신 기준", pattern: /^선택 영역\s+[\d,]+\s+[\d,]+\s+[\d,]+\s+([\d,]+)$/, group: "DEMAND" },
    { key: "collectiveHousingCount", label: "선택 영역 공동주택 수 · 최신 기준", pattern: /^선택 영역\s+[\d,]+\s+[\d,]+\s+([\d,]+)$/, group: "DEMAND" },
  ];
  const pageByFact: Record<string, number> = {
    residentPopulation: 10,
    workerPopulation: 14,
    householdCount: 18,
    collectiveHousingCount: 19,
  };
  for (const item of populationRows) {
    const page = pages.find((candidate) => candidate.page === pageByFact[item.key]);
    const sourceText = page?.lines.find((line) => item.pattern.test(line));
    const value = sourceText?.match(item.pattern)?.[1];
    if (page && sourceText && value) {
      // 실제 SBIZ365 표의 최신 선택 영역 값이 generic 제목행("추이")보다 우선한다.
      delete facts[item.key];
      addFact(facts, { key: item.key, label: item.label, value: `${value}${item.key === "householdCount" ? "세대" : item.key === "collectiveHousingCount" ? "호" : "명"}`, group: item.group, evidence: evidence(page.page, item.label, sourceText) });
    }
  }

  const analysisClaims: Array<{ key: string; label: string; pattern: RegExp; group: Sbiz365FactGroup }> = [
    { key: "highestSalesDay", label: "선택 영역 매출 최다 요일", pattern: /매출이 가장 많은 요일은\s*(.+?)입니다\./, group: "TIME" },
    { key: "highestSalesTimeBand", label: "선택 영역 매출 최다 시간대", pattern: /매출이 가장 많은 시간대는\s*(.+?)입니다\./, group: "TIME" },
    { key: "highestFloatingDay", label: "선택 영역 유동인구 최다 요일", pattern: /요일별 일평균 유동인구 수는\s*(.+?)에 가장 많습니다\./, group: "TIME" },
    { key: "highestFloatingTimeBand", label: "선택 영역 유동인구 최다 시간대", pattern: /시간대별 유동인구 수는\s*(.+?)에 가장 많습니다\./, group: "TIME" },
  ];
  for (const item of analysisClaims) {
    const found = matchingLine(pages, item.pattern, item.label);
    if (found) addFact(facts, { key: item.key, label: item.label, value: found.match[1], group: item.group, evidence: found.evidence });
  }

  const facilitiesPage = pages.find((page) => page.page === 20);
  const facilitiesLine = facilitiesPage?.lines.find((line) => /^선택 영역\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+$/.test(line));
  if (facilitiesPage && facilitiesLine) {
    const values = facilitiesLine.split(/\s+/).slice(2);
    const labels = ["공공기관", "금융기관", "의료/복지", "학교", "대형유통", "문화시설", "숙박시설"];
    addFact(facts, { key: "majorFacilities", label: "선택 영역 주요시설", value: labels.map((label, index) => `${label} ${values[index]}개`).join("; "), group: "SPACE", evidence: evidence(20, "주요시설 현황 · 선택 영역", facilitiesLine) });
  }

  const transportPage = pages.find((page) => page.page === 21);
  const transportLine = transportPage?.lines.find((line) => /^선택 영역\s+\d+\s+\d+$/.test(line));
  if (transportPage && transportLine) {
    const [, , subway, bus] = transportLine.split(/\s+/);
    addFact(facts, { key: "transportFacilities", label: "선택 영역 교통시설", value: `지하철역 ${subway}개; 버스정류장 ${bus}개`, group: "SPACE", evidence: evidence(21, "교통시설 현황 · 선택 영역", transportLine) });
  }

  extractPork33RawFacts(pages, facts);
}

function areaId(fileName: string, areaName: string | null) {
  const readable = (areaName ?? path.basename(fileName, path.extname(fileName)))
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const hash = createHash("sha256").update(fileName).digest("hex").slice(0, 8);
  return `sbiz365-${readable || "area"}-${hash}`;
}

export function importSbiz365Text(input: {
  fileName: string;
  text: string;
  importedAt: string;
  textExtractor: string;
}, options: { expectedIndustry?: string | null; expectedRadiusMeters?: number | null } = {}): Sbiz365ImportResult {
  const pages = pagesOf(input.text);
  const lines = pages.flatMap((page) => page.lines);
  const inlineAreaName = firstCaptured(lines, [
    /^(?:상권명|분석지역|지역명|기준지역|분석대상)\s*[:：]\s*(.+)$/,
  ]);
  const areaFollowing = followingLabel(pages, ["분석지역", "상권명", "지역명", "기준지역", "분석대상"]);
  const coverArea = matchingLine(pages.slice(0, 1), /^(?:[가-힣]+(?:특별시|광역시|도))\s+.+$/, "표지 · 분석지역");
  const areaName = inlineAreaName ?? areaFollowing?.value ?? coverArea?.match[0] ?? null;
  const inlineIndustry = firstCaptured(lines, [
    /^(?:선택업종|분석업종|업종)\s*[:：]\s*(.+)$/,
  ]);
  const industryFollowing = followingLabel(pages, ["분석업종", "선택업종", "업종"]);
  const coverIndustry = matchingLine(pages.slice(0, 1), /^정육점$/, "표지 · 분석업종");
  const industry = inlineIndustry ?? industryFollowing?.value ?? coverIndustry?.match[0] ?? null;
  const inlineReferencePeriod = firstCaptured(lines, [
    /^(?:기준시점|기준시기|데이터\s*기준|기준년월|분석기준)\s*[:：]\s*(.+)$/,
  ]);
  const referenceFollowing = followingLabel(pages, ["분석일자", "분석날짜", "기준시점", "기준시기", "기준년월"]);
  const inlineDate = matchingLine(pages.slice(0, 1), /^(?:분석날짜|분석일자)\s+(.+)$/, "표지 · 분석날짜");
  const referencePeriod = inlineReferencePeriod ?? referenceFollowing?.value ?? inlineDate?.match[1] ?? null;
  const sourceAddress = firstCaptured(lines, [
    /^(?:기준점\s*주소|분석주소|주소)\s*[:：]\s*(.+)$/,
  ]);
  const analysisRadiusMeters = extractRadius(lines);
  const facts = extractFacts(lines, pages);
  extractActualReportFacts(pages, facts);
  const unknowns: string[] = [];
  const errors: string[] = [];

  if (!areaName) unknowns.push("areaName");
  if (!industry) unknowns.push("industry");
  if (!analysisRadiusMeters) unknowns.push("analysisRadiusMeters");
  if (!referencePeriod) unknowns.push("referencePeriod");
  if (!sourceAddress) unknowns.push("sourceAddress");
  const expectedIndustry = options.expectedIndustry === undefined ? EXPECTED_INDUSTRY : options.expectedIndustry;
  if (expectedIndustry && industry && industry !== expectedIndustry) errors.push(`INDUSTRY_MISMATCH:${industry}`);
  const expectedRadiusMeters = options.expectedRadiusMeters === undefined ? EXPECTED_RADIUS_METERS : options.expectedRadiusMeters;
  if (expectedRadiusMeters && analysisRadiusMeters && analysisRadiusMeters !== expectedRadiusMeters) {
    errors.push(`RADIUS_MISMATCH:${analysisRadiusMeters}`);
  }

  const blockingUnknowns = unknowns.filter((key) =>
    ["areaName", "industry", "referencePeriod"].includes(key),
  );

  const formatSignature = [
    areaName ? "AREA" : null,
    industry ? "INDUSTRY" : null,
    analysisRadiusMeters ? "RADIUS" : null,
    referencePeriod ? "REFERENCE_PERIOD" : null,
    ...Object.keys(facts).sort().map((key) => `FACT:${key}`),
  ].filter((value): value is string => Boolean(value));

  return {
    sourceType: SBIZ365_SOURCE_TYPE,
    fileName: input.fileName,
    areaName,
    industry,
    analysisRadiusMeters,
    referencePeriod,
    extractionStatus:
      errors.length > 0 ? "VALIDATION_FAILED" : blockingUnknowns.length > 0 ? "PARTIAL" : "SUCCESS",
    facts,
    unknowns,
    sourceMetadata: {
      importedAt: input.importedAt,
      textExtractor: input.textExtractor,
      sourceAddress,
      sourceLocationText: areaName,
      pageCount: pages.length,
      fieldEvidence: {
        ...(areaFollowing ? { areaName: areaFollowing.evidence } : coverArea ? { areaName: coverArea.evidence } : {}),
        ...(industryFollowing ? { industry: industryFollowing.evidence } : coverIndustry ? { industry: coverIndustry.evidence } : {}),
        ...(referenceFollowing ? { referencePeriod: referenceFollowing.evidence } : inlineDate ? { referencePeriod: inlineDate.evidence } : {}),
      },
      formatSignature,
      errors,
    },
  };
}

export function extractionFailure(input: {
  fileName: string;
  importedAt: string;
  status: "EXTRACTION_FAILED" | "UNSUPPORTED_SCANNED_PDF";
  error: string;
  textExtractor: string;
}): Sbiz365ImportResult {
  return {
    sourceType: SBIZ365_SOURCE_TYPE,
    fileName: input.fileName,
    areaName: null,
    industry: null,
    analysisRadiusMeters: null,
    referencePeriod: null,
    extractionStatus: input.status,
    facts: {},
    unknowns: ["areaName", "industry", "analysisRadiusMeters", "referencePeriod", "sourceAddress"],
    sourceMetadata: {
      importedAt: input.importedAt,
      textExtractor: input.textExtractor,
      sourceAddress: null,
      sourceLocationText: null,
      pageCount: 0,
      fieldEvidence: {},
      formatSignature: [],
      errors: [input.error],
    },
  };
}

function factsFor(result: Sbiz365ImportResult, group: Sbiz365FactGroup) {
  return Object.values(result.facts).filter((fact) => fact.group === group);
}

function addressMatchesArea(areaName: string | null, resolvedAddress: string) {
  if (!areaName) return false;
  const tokens = areaName
    .normalize("NFKC")
    .split(/[^\p{Letter}\p{Number}]+/u)
    .map((token) => token.replace(/상권$/u, ""))
    .filter((token) => token.length >= 2);
  return tokens.some((token) => resolvedAddress.includes(token));
}

export async function toSimpleReportInput(
  result: Sbiz365ImportResult,
  options: {
    geocode?: typeof geocodeKakaoAddress;
    configuredRadiusMeters?: number;
    allowAreaNameGeocode?: boolean;
  } = {},
): Promise<SimpleReportAreaInput> {
  const unknowns = [...result.unknowns];
  let location = { lat: null as number | null, lng: null as number | null };
  let resolvedAddress: string | null = null;
  let locationVerification = "NOT_RUN";
  const address = result.sourceMetadata.sourceAddress;
  const geocodeQuery = address ?? (options.allowAreaNameGeocode ? result.areaName : null);
  const geocodeInputType = address ? "SOURCE_ADDRESS" : geocodeQuery ? "AREA_NAME" : "NONE";
  if (geocodeQuery && options.geocode) {
    try {
      const geocoded = await options.geocode(geocodeQuery);
      location = { lat: geocoded.latitude, lng: geocoded.longitude };
      resolvedAddress = geocoded.resolvedAddress;
      locationVerification = addressMatchesArea(result.areaName, resolvedAddress)
        ? "MATCHED_AREA_TEXT"
        : "REVIEW_REQUIRED";
      if (locationVerification === "REVIEW_REQUIRED") {
        unknowns.push("location:AREA_MATCH_REVIEW_REQUIRED");
      }
    } catch {
      locationVerification = "GEOCODE_FAILED";
      unknowns.push("location:KAKAO_GEOCODE_FAILED");
    }
  } else if (geocodeQuery) {
    unknowns.push("location:KAKAO_GEOCODE_NOT_RUN");
  }

  const effectiveRadiusMeters =
    result.analysisRadiusMeters ?? options.configuredRadiusMeters ?? null;
  const radiusSource = result.analysisRadiusMeters
    ? SBIZ365_SOURCE_TYPE
    : options.configuredRadiusMeters
      ? "REPORT_CONFIGURATION"
      : "UNKNOWN";

  const source = {
    sourceType: SBIZ365_SOURCE_TYPE,
    fileName: result.fileName,
    referencePeriod: result.referencePeriod,
    extractionStatus: result.extractionStatus,
    fieldEvidence: result.sourceMetadata.fieldEvidence,
  };
  const demandFacts = factsFor(result, "DEMAND");
  const timeFacts = factsFor(result, "TIME");
  const competitionFacts = factsFor(result, "COMPETITION");
  const spaceFacts = factsFor(result, "SPACE");

  return {
    areaId: areaId(result.fileName, result.areaName),
    areaName: result.areaName,
    source: SBIZ365_SOURCE_TYPE,
    industry: result.industry,
    radiusMeters: effectiveRadiusMeters,
    referencePeriod: result.referencePeriod,
    location,
    p1: {
      areaName: result.areaName,
      industry: result.industry,
      radiusMeters: effectiveRadiusMeters,
      summary: null,
      positiveSignals: [],
      unknowns,
      masterSlots: {
        P1_REGION_TITLE: result.areaName,
        P1_META_1: { label: "업종", value: result.industry },
        P1_META_2: { label: "분석지역", value: result.areaName },
        P1_META_3: { label: "분석일자", value: result.referencePeriod },
        P1_META_4: {
          label: "분석범위",
          value: effectiveRadiusMeters ? `${effectiveRadiusMeters / 1_000}km` : null,
          source: radiusSource,
        },
        P1_STATUS_LABEL: null,
        P1_CORE_CONCLUSION: null,
        P1_POSITIVE_1_3: [],
        P1_CAUTION_1_3: [],
        P1_MAP_SLOT: {
          center: location,
          radiusMeters: effectiveRadiusMeters,
          centerSource: geocodeInputType,
          radiusSource,
        },
      },
    },
    p2: {
      areaName: result.areaName,
      radiusMeters: effectiveRadiusMeters,
      radiusSource,
      mapCenter: location,
      sourceAddress: address,
      sourceLocationText: result.sourceMetadata.sourceLocationText,
      geocodeQuery,
      geocodeInputType,
      resolvedAddress,
      locationVerification,
      facts: spaceFacts,
      masterSlots: {
        P2_MAP_SLOT: {
          center: location,
          radiusMeters: effectiveRadiusMeters,
          centerSource: geocodeInputType,
          radiusSource,
        },
        P2_RESIDENTIAL: result.facts.householdCount ?? result.facts.residentPopulation ?? null,
        P2_OFFICE: result.facts.workerPopulation ?? null,
        P2_TRANSPORT: result.facts.transportFacilities ?? null,
        P2_INSIGHT: null,
      },
    },
    p3: {
      facts: demandFacts,
      masterSlots: {
        P3_HERO_CHART: result.facts.floatingPopulationAgeRatios ?? null,
        P3_AGE_FOCUS: result.facts.floatingPopulationAgeRatios ?? null,
        P3_WORKER_RESIDENT: {
          worker: result.facts.workerPopulation ?? null,
          resident: result.facts.residentPopulation ?? null,
          derivedRatio: null,
        },
        P3_METRIC_1: result.facts.dailyAverageFloatingPopulation ?? null,
        P3_METRIC_2: result.facts.residentPopulation ?? null,
        P3_METRIC_3: result.facts.workerPopulation ?? null,
        P3_TARGET: null,
        P3_MARKET: null,
        P3_MATCH: null,
        P3_INSIGHT: null,
      },
    },
    p4: {
      facts: timeFacts,
      masterSlots: {
        P4_TIME_CHART: result.facts.floatingPopulationTimeBandRatios ?? null,
        P4_DAY_CHART: result.facts.floatingPopulationDayRatios ?? null,
        P4_PATTERN: null,
        P4_TIME_NOTE: null,
        P4_INSIGHT: null,
      },
    },
    p5: {
      facts: competitionFacts,
      masterSlots: {
        P5_MAP_SLOT: {
          center: location,
          radiusMeters: effectiveRadiusMeters,
          competitorMarkers: [],
          limitation: "소상공인365 PDF에는 개별 경쟁점 좌표가 없습니다.",
        },
        P5_SIMILAR_COUNT: null,
        P5_DIRECT_COUNT: null,
        P5_NEAREST: null,
        P5_OFFICIAL_STAT: result.facts.selectedStoreCount ?? null,
        P5_COMPETITOR_TABLE: [],
      },
    },
    p6: {
      claims: [],
      limitation: "P6 claim은 근거 fact 2개 이상과 포크33 Site Criteria가 연결된 경우에만 생성합니다.",
      masterSlots: {
        P6_PRIMARY: null,
        P6_REASONS: [],
        P6_MAP_SLOT: { center: location, radiusMeters: effectiveRadiusMeters, zones: [] },
        P6_PRIORITY_1_3: [],
        P6_CLIENT_CONDITION: null,
        P6_FRAMEONE_DIRECTION: null,
        P6_NEXT_STEP: null,
      },
    },
    p7: {
      summaryClaims: [],
      limitation: "P1~P6에서 검증된 기존 claim만 요약합니다.",
      masterSlots: {
        P7_MARKET: null,
        P7_CUSTOMER: null,
        P7_COMPETITION: null,
        P7_SEARCH: null,
        P7_SCOPE_DONE_1_5: [],
        P7_SCOPE_NEXT_1_6: [],
        P7_NEXT_STEP: null,
      },
    },
    unknowns,
    sources: [source],
  };
}

export function validateBatch(results: readonly Sbiz365ImportResult[]) {
  const referencePeriods = [...new Set(results.map((item) => item.referencePeriod).filter(Boolean))];
  const signatures = [...new Set(results.map((item) => item.sourceMetadata.formatSignature.join("|")))];
  return {
    fileCount: results.length,
    expectedNineFiles: results.length === 9,
    sameFormat: signatures.length === 1 && signatures[0] !== "",
    allButchers: results.every((item) => item.industry === EXPECTED_INDUSTRY),
    allOneKilometer: results.every((item) => item.analysisRadiusMeters === EXPECTED_RADIUS_METERS),
    sameReferencePeriod: referencePeriods.length === 1 && results.every((item) => item.referencePeriod),
    uniqueAreaNames:
      results.every((item) => item.areaName) &&
      new Set(results.map((item) => item.areaName)).size === results.length,
    statuses: Object.fromEntries(results.map((item) => [item.fileName, item.extractionStatus])),
  };
}
