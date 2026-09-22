export const FIELD_STATUS = Object.freeze({
  AUTO_CONFIRMED: "AUTO_CONFIRMED",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
  MISSING: "MISSING",
  HUMAN_CONFIRMED: "HUMAN_CONFIRMED",
});

export const SEMANTIC_STATUS = Object.freeze({
  KNOWN: "KNOWN",
  NEGOTIABLE: "NEGOTIABLE",
  NO_PREMIUM: "NO_PREMIUM",
  NONE: "NONE",
  SEPARATE: "SEPARATE",
  INCLUDED: "INCLUDED",
  UNKNOWN: "UNKNOWN",
});

export const SOURCE_ADAPTER = Object.freeze({
  NAVER_PAY_REAL_ESTATE: "NAVER_PAY_REAL_ESTATE",
  GENERIC_VISIBLE_PAGE: "GENERIC_VISIBLE_PAGE",
});

export const TRANSACTION_TYPE = Object.freeze({
  MONTHLY_RENT: "MONTHLY_RENT",
  UNKNOWN: "UNKNOWN",
});

const M2_PER_PYEONG = 3.305785;
const MAX_REASONABLE_MONEY = 1_000_000_000_000;
const MAX_REASONABLE_AREA_M2 = 100_000;

function cleanText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "")
    .trim();
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function excerptFor(text, index, length) {
  const start = Math.max(0, text.lastIndexOf("\n", Math.max(0, index - 90)) + 1);
  const nextLine = text.indexOf("\n", index + length);
  const end = Math.min(text.length, nextLine === -1 ? index + length + 90 : nextLine);
  return cleanText(text.slice(start, end)).slice(0, 240);
}

function candidate(raw = null, value = null, status = FIELD_STATUS.MISSING, evidenceText = null, issues = []) {
  return { raw, value, status, evidenceText, issues };
}

function downgrade(result, issue) {
  if (result.status !== FIELD_STATUS.MISSING) result.status = FIELD_STATUS.REVIEW_REQUIRED;
  if (!result.issues.includes(issue)) result.issues.push(issue);
  return result;
}

function parseDigits(value) {
  const compact = value.replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(compact)) return null;
  const number = Number(compact);
  return Number.isFinite(number) ? number : null;
}

export function parseKoreanMoney(raw, options = {}) {
  const text = cleanText(raw);
  const semantic = options.semantic ?? "money";
  if (!text) return { amount: null, status: FIELD_STATUS.MISSING, semanticStatus: SEMANTIC_STATUS.UNKNOWN, issues: [] };
  if (/협의|문의/.test(text)) {
    return {
      amount: null,
      status: FIELD_STATUS.REVIEW_REQUIRED,
      semanticStatus: SEMANTIC_STATUS.NEGOTIABLE,
      issues: ["금액이 협의 또는 문의로 표시되어 있습니다."],
    };
  }
  if (semantic === "premium" && /무\s*권리|권리금\s*(?:없음|無)/.test(text)) {
    return { amount: 0, status: FIELD_STATUS.AUTO_CONFIRMED, semanticStatus: SEMANTIC_STATUS.NO_PREMIUM, issues: [] };
  }
  if (semantic === "management" && /^(?:월?관리비\s*[:：]?\s*)?(?:없음|無)$/.test(text)) {
    return { amount: 0, status: FIELD_STATUS.AUTO_CONFIRMED, semanticStatus: SEMANTIC_STATUS.NONE, issues: [] };
  }
  if (semantic === "management" && /^(?:월?관리비\s*[:：]?\s*)?0\s*(?:원|만(?:원)?|천(?:만)?원?)?$/.test(text)) {
    return { amount: 0, status: FIELD_STATUS.AUTO_CONFIRMED, semanticStatus: SEMANTIC_STATUS.NONE, issues: [] };
  }
  if (/-\s*\d/.test(text)) {
    return { amount: null, status: FIELD_STATUS.REVIEW_REQUIRED, semanticStatus: SEMANTIC_STATUS.UNKNOWN, issues: ["음수 금액은 허용되지 않습니다."] };
  }

  const normalized = text
    .replace(/(?:보증금|월세|월\s*임대료|임대료|월|관리비|권리금)/g, " ")
    .replace(/(?:부가세|vat).*$/i, " ")
    .replace(/원/g, "")
    .replace(/천만/g, "천")
    .replace(/\s+/g, "")
    .trim();

  let amount = null;
  let explicitUnit = false;
  const eokMatch = normalized.match(/^(\d+(?:\.\d+)?)억(?:(\d[\d,]*(?:\.\d+)?)(천|만)?)?$/);
  if (eokMatch) {
    explicitUnit = true;
    amount = Number(eokMatch[1]) * 100_000_000;
    if (eokMatch[2]) {
      const remainder = parseDigits(eokMatch[2]);
      const multiplier = eokMatch[3] === "천" ? 10_000_000 : 10_000;
      if (remainder === null) amount = null;
      else amount += remainder * multiplier;
    }
  } else {
    const unitMatch = normalized.match(/^(\d[\d,]*(?:\.\d+)?)(천|만)$/);
    if (unitMatch) {
      explicitUnit = true;
      const number = parseDigits(unitMatch[1]);
      if (number !== null) amount = number * (unitMatch[2] === "천" ? 10_000_000 : 10_000);
    } else {
      const bare = parseDigits(normalized);
      if (bare !== null) amount = bare * 10_000;
    }
  }

  if (amount === null || !Number.isSafeInteger(amount)) {
    return { amount: null, status: FIELD_STATUS.REVIEW_REQUIRED, semanticStatus: SEMANTIC_STATUS.UNKNOWN, issues: ["금액 형식을 안전하게 해석하지 못했습니다."] };
  }

  const issues = [];
  let status = FIELD_STATUS.AUTO_CONFIRMED;
  if (!explicitUnit) {
    status = FIELD_STATUS.REVIEW_REQUIRED;
    issues.push("금액 단위가 없어 만원 단위 후보로만 환산했습니다.");
  }
  if (amount === 0 && semantic !== "management" && semantic !== "premium") {
    status = FIELD_STATUS.REVIEW_REQUIRED;
    issues.push("0원 금액은 원문 확인이 필요합니다.");
  }
  if (amount > MAX_REASONABLE_MONEY) {
    status = FIELD_STATUS.REVIEW_REQUIRED;
    issues.push("기술적 상한을 넘는 금액이므로 자릿수와 단위를 확인해야 합니다.");
  }
  return { amount, status, semanticStatus: SEMANTIC_STATUS.KNOWN, issues };
}

export function parseArea(raw) {
  const text = cleanText(raw);
  if (!text) return { m2: null, pyeong: null, status: FIELD_STATUS.MISSING, issues: [] };
  if (/-\s*\d/.test(text)) return { m2: null, pyeong: null, status: FIELD_STATUS.REVIEW_REQUIRED, issues: ["음수 면적은 허용되지 않습니다."] };

  const m2Match = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:㎡|m2|m²|제곱미터)/i);
  const pyeongMatch = text.match(/(\d[\d,]*(?:\.\d+)?)\s*평/);
  const m2 = m2Match ? parseDigits(m2Match[1]) : null;
  const pyeong = pyeongMatch ? parseDigits(pyeongMatch[1]) : null;
  if (m2 === null && pyeong === null) return { m2: null, pyeong: null, status: FIELD_STATUS.REVIEW_REQUIRED, issues: ["면적 단위를 확인하지 못했습니다."] };

  const result = {
    m2: round(m2 ?? pyeong * M2_PER_PYEONG),
    pyeong: round(pyeong ?? m2 / M2_PER_PYEONG),
    status: FIELD_STATUS.AUTO_CONFIRMED,
    issues: [],
  };
  if (m2 !== null && pyeong !== null && Math.abs(m2 / M2_PER_PYEONG - pyeong) > 0.2) {
    downgrade(result, "㎡와 평 환산값이 일치하지 않습니다.");
  }
  if (result.m2 > MAX_REASONABLE_AREA_M2) downgrade(result, "기술적 상한을 넘는 면적이므로 자릿수와 단위를 확인해야 합니다.");
  return result;
}

function findFirst(text, patterns) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return { raw: cleanText(match[1] ?? match[0]), evidenceText: excerptFor(text, match.index, match[0].length), index: match.index };
  }
  return null;
}

function findMoney(text, labelPattern) {
  return findFirst(text, [
    new RegExp(`${labelPattern}\\s*[:：]?\\s*((?:\\d+(?:\\.\\d+)?억(?:\\s*\\d[\\d,]*(?:\\.\\d+)?\\s*(?:천\\s*만|천|만)?(?:원)?)?)|(?:\\d[\\d,]*(?:\\.\\d+)?\\s*(?:천\\s*만|천|만)(?:원)?)|협의|문의|없음|무\\s*권리)`, "i"),
  ]);
}

const AMOUNT_TOKEN = "\\d[\\d,]*(?:\\.\\d+)?(?:\\s*억(?:\\s*\\d[\\d,]*(?:\\.\\d+)?\\s*(?:천\\s*만|천|만)?)?|\\s*(?:천\\s*만|천|만)(?:원)?)?";

function matchLeaseMoneyPairs(text) {
  const explicit = new RegExp(`보증금\\s*[:：]?\\s*(${AMOUNT_TOKEN})\\s*/\\s*(?:월세|월)\\s*[:：]?\\s*(${AMOUNT_TOKEN})`, "i").exec(text);
  if (explicit) {
    const evidenceText = excerptFor(text, explicit.index, explicit[0].length);
    return {
      transactionType: TRANSACTION_TYPE.MONTHLY_RENT,
      deposit: { raw: cleanText(explicit[1]), evidenceText },
      rent: { raw: cleanText(explicit[2]), evidenceText },
      priority: "EXPLICIT_LEASE_TERMS",
    };
  }

  const transaction = new RegExp(`(?:^|\\n)\\s*월세\\s*[:：]?\\s*(${AMOUNT_TOKEN})\\s*/\\s*(${AMOUNT_TOKEN})(?=\\s|$|\\n)`, "im").exec(text);
  if (!transaction) return null;
  const evidenceText = excerptFor(text, transaction.index, transaction[0].length);
  return {
    transactionType: TRANSACTION_TYPE.MONTHLY_RENT,
    deposit: { raw: cleanText(transaction[1]), evidenceText },
    rent: { raw: cleanText(transaction[2]), evidenceText },
    priority: "TRANSACTION_SUMMARY",
  };
}

function buildMoneyCandidate(match, semantic) {
  if (!match) return { ...candidate(), semanticStatus: SEMANTIC_STATUS.UNKNOWN };
  const parsed = parseKoreanMoney(match.raw, { semantic });
  return { ...candidate(match.raw, parsed.amount, parsed.status, match.evidenceText, parsed.issues), semanticStatus: parsed.semanticStatus };
}

function buildAreaCandidate(match) {
  if (!match) return { ...candidate(), m2: null, pyeong: null };
  const parsed = parseArea(match.raw);
  return { ...candidate(match.raw, parsed.m2, parsed.status, match.evidenceText, parsed.issues), m2: parsed.m2, pyeong: parsed.pyeong };
}

function extractAddress(text) {
  const patterns = [
    /소재지[ \t]*[:：]?[ \t]*(?:\n[ \t]*)?([^\n]{3,120})/gi,
    /(?:주소|위치)[ \t]*[:：]?[ \t]*(?:\n[ \t]*)?([^\n]{3,120})/gi,
  ];
  let match = null;
  for (const pattern of patterns) {
    for (const found of text.matchAll(pattern)) {
      const context = text.slice(Math.max(0, found.index - 100), found.index + found[0].length);
      if (/중개사|공인중개사|중개사무소|중개소/.test(context)) continue;
      match = {
        raw: cleanText(found[1]),
        evidenceText: excerptFor(text, found.index, found[0].length),
      };
      break;
    }
    if (match) break;
  }
  if (!match) return candidate();
  const hasSpecificNumber = /(?:로|길|동|리)\s*\d+(?:-\d+)?(?:\s|$)/.test(match.raw);
  const isDongLevel = /(?:동|읍|면|리)\s*$/.test(match.raw);
  const autoConfirmed = hasSpecificNumber && !isDongLevel;
  return candidate(
    match.raw,
    match.raw,
    autoConfirmed ? FIELD_STATUS.AUTO_CONFIRMED : FIELD_STATUS.REVIEW_REQUIRED,
    match.evidenceText,
    autoConfirmed ? [] : ["동 단위이거나 상세 번지가 없는 주소이므로 확인이 필요합니다."],
  );
}

function extractFloor(text) {
  const match = findFirst(text, [
    /(?:해당층|층수|층)\s*[:：]?\s*((?:지하|지상)?\s*[Bb]?\s*\d+\s*층?)/i,
    /(?:^|\n)\s*((?:지하|지상)?\s*[Bb]?\s*\d+\s*층)(?:\s|$|\/)/im,
  ]);
  if (!match) return candidate();
  const source = match.raw.replace(/\s+/g, "");
  const number = source.match(/\d+/)?.[0];
  if (!number) return candidate(match.raw, null, FIELD_STATUS.REVIEW_REQUIRED, match.evidenceText, ["층을 해석하지 못했습니다."]);
  const floor = /지하|^B/i.test(source) ? `B${number}` : number;
  return candidate(match.raw, floor, FIELD_STATUS.AUTO_CONFIRMED, match.evidenceText);
}

function extractAreas(text) {
  const areaToken = "\\d[\\d,]*(?:\\.\\d+)?\\s*(?:㎡|m2|m²|제곱미터|평)(?:\\s*\\([^\\n)]{1,30}\\))?";
  const contractFirst = new RegExp(`(?:계약|공급)\\s*/\\s*전용(?:\\s*면적)?\\s*[:：]?\\s*(${areaToken})\\s*/\\s*(${areaToken})`, "i").exec(text);
  if (contractFirst) {
    const evidenceText = excerptFor(text, contractFirst.index, contractFirst[0].length);
    return {
      exclusive: buildAreaCandidate({ raw: cleanText(contractFirst[2]), evidenceText }),
      contract: buildAreaCandidate({ raw: cleanText(contractFirst[1]), evidenceText }),
    };
  }
  const exclusiveFirst = new RegExp(`전용(?:\\s*면적)?\\s*/\\s*(?:계약|공급)(?:\\s*면적)?\\s*[:：]?\\s*(${areaToken})\\s*/\\s*(${areaToken})`, "i").exec(text);
  if (exclusiveFirst) {
    const evidenceText = excerptFor(text, exclusiveFirst.index, exclusiveFirst[0].length);
    return {
      exclusive: buildAreaCandidate({ raw: cleanText(exclusiveFirst[1]), evidenceText }),
      contract: buildAreaCandidate({ raw: cleanText(exclusiveFirst[2]), evidenceText }),
    };
  }
  const exclusive = findFirst(text, [new RegExp(`(?:전용면적|전용)\\s*[:：]?\\s*(${areaToken}(?:\\s*[/,]\\s*\\d[\\d,]*(?:\\.\\d+)?\\s*(?:㎡|평))?)`, "i")]);
  const contract = findFirst(text, [new RegExp(`(?:계약면적|공급면적|계약)\\s*[:：]?\\s*(${areaToken}(?:\\s*[/,]\\s*\\d[\\d,]*(?:\\.\\d+)?\\s*(?:㎡|평))?)`, "i")]);
  const generic = !exclusive && !contract ? findFirst(text, [new RegExp(`(?:면적)\\s*[:：]?\\s*(${areaToken})`, "i")]) : null;
  return { exclusive: buildAreaCandidate(exclusive ?? generic), contract: buildAreaCandidate(contract) };
}

function extractVat(text) {
  const lines = text.split("\n");
  const matches = [];
  for (let index = 0; index < lines.length; index += 1) {
    const vat = /((?:VAT|부가세)\s*(?:포함|별도|미포함))/i.exec(lines[index]);
    if (!vat) continue;
    const context = cleanText(`${lines[index - 1] ?? ""} ${lines[index]} ${lines[index + 1] ?? ""}`);
    if (/중개보수|중개수수료|중개료/.test(context)) continue;
    if (!/월세|임대료|임대조건|보증금\s*.+월세/.test(context)) continue;
    const semanticStatus = /포함/.test(vat[1]) && !/미포함/.test(vat[1]) ? SEMANTIC_STATUS.INCLUDED : SEMANTIC_STATUS.SEPARATE;
    matches.push({ raw: cleanText(vat[1]), semanticStatus, evidenceText: context.slice(0, 240) });
  }
  if (!matches.length) return { ...candidate(), semanticStatus: SEMANTIC_STATUS.UNKNOWN };
  const statuses = new Set(matches.map((match) => match.semanticStatus));
  const result = {
    ...candidate(matches.map((match) => match.raw).join(" | "), matches[0].semanticStatus, FIELD_STATUS.AUTO_CONFIRMED, matches.map((match) => match.evidenceText).join(" | ")),
    semanticStatus: matches[0].semanticStatus,
  };
  if (statuses.size > 1) downgrade(result, "임대조건 VAT 표현이 서로 충돌합니다.");
  return result;
}

function extractOptional(text, labelPattern) {
  const match = findFirst(text, [new RegExp(`(?:${labelPattern})\\s*[:：]\\s*([^\\n]{1,100})`, "i")]);
  return match ? candidate(match.raw, match.raw, FIELD_STATUS.REVIEW_REQUIRED, match.evidenceText, ["선택 필드는 원문을 직접 확인해야 합니다."]) : candidate();
}

function extractLabeledValue(text, labelPattern, options = {}) {
  const pattern = new RegExp(`(?:${labelPattern})[ \\t]*[:：]?[ \\t]*(?:\\n[ \\t]*)?([^\\n]{1,100})`, "i");
  const match = pattern.exec(text);
  if (!match) return candidate();
  const raw = cleanText(match[1]);
  return candidate(raw, raw, options.autoConfirmed ? FIELD_STATUS.AUTO_CONFIRMED : FIELD_STATUS.REVIEW_REQUIRED, excerptFor(text, match.index, match[0].length), options.autoConfirmed ? [] : ["선택 필드는 원문을 직접 확인해야 합니다."]);
}

function extractMoveIn(text) {
  const structured = extractLabeledValue(text, "입주가능일", { autoConfirmed: true });
  if (structured.status !== FIELD_STATUS.MISSING) return structured;

  const description = /(?:^|[\s,.;()])((?:즉시\s*입주)(?:\s*협의\s*가능)?)(?=$|[\s,.;()])/i.exec(text);
  if (!description) return candidate();
  return candidate(
    cleanText(description[1]),
    cleanText(description[1]),
    FIELD_STATUS.REVIEW_REQUIRED,
    excerptFor(text, description.index, description[0].length),
    ["자유 설명의 입주 표현이 현재 매물에 적용되는지 확인해야 합니다."],
  );
}

function extractPremium(text) {
  const structured = findFirst(text, [/(권리금[ \t]*[:：]?[ \t]*(?:\n[ \t]*)?(?:없음|무\s*권리|협의|문의|\d[\d,]*(?:\.\d+)?\s*(?:천\s*만|천|만)?(?:원)?))/i]);
  if (structured) return buildMoneyCandidate(structured, "premium");

  const standalone = /(?:^|\n)[ \t]*(무\s*권리)[ \t]*(?:$|\n)/im.exec(text);
  if (standalone) {
    return buildMoneyCandidate({ raw: cleanText(standalone[1]), evidenceText: excerptFor(text, standalone.index, standalone[0].length) }, "premium");
  }

  const freeText = /무\s*권리/i.exec(text);
  if (!freeText) return { ...candidate(), semanticStatus: SEMANTIC_STATUS.UNKNOWN };
  const result = buildMoneyCandidate({ raw: cleanText(freeText[0]), evidenceText: excerptFor(text, freeText.index, freeText[0].length) }, "premium");
  return downgrade(result, "자유 설명의 무권리 표현이 현재 매물 전체에 적용되는지 확인해야 합니다.");
}

function extractParking(text) {
  const matches = [];
  const add = (raw, index, length, structured) => {
    const cleaned = cleanText(raw);
    if (!structured && /총주차대수|주차가능여부|총주차|주차장\s*총|옥내자주식|옥외자주식/.test(cleaned)) return;
    if (!cleaned || matches.some((match) => match.raw === cleaned)) return;
    matches.push({ raw: cleaned, evidenceText: excerptFor(text, index, length), structured });
  };

  const labeledPattern = /(총주차대수|주차가능여부|총주차\s*\/\s*가능주차)[ \t]*[:：]?[ \t]*(?:\n[ \t]*)?([^\n]{1,60})/gi;
  for (const match of text.matchAll(labeledPattern)) add(`${match[1]} ${match[2]}`, match.index, match[0].length, true);
  const parkingLotPattern = /주차장[ \t]*[:：]?[ \t]*(?:\n[ \t]*)?(총\s*\d+\s*대)/gi;
  for (const match of text.matchAll(parkingLotPattern)) add(`주차장 ${match[1]}`, match.index, match[0].length, true);
  const componentPattern = /((?:옥내|옥외)자주식)[ \t]*[:：]?[ \t]*(\d+\s*대)/gi;
  for (const match of text.matchAll(componentPattern)) add(`${match[1]} ${match[2]}`, match.index, match[0].length, true);
  const freePattern = /(?:^|\n)[^\n]{0,30}주차[^\n]{0,30}\d+\s*대[^\n]{0,30}(?=$|\n)/gim;
  for (const match of text.matchAll(freePattern)) add(match[0], match.index, match[0].length, false);

  if (!matches.length) return candidate();
  const raw = matches.map((match) => match.raw).join(" | ");
  const totalCounts = [];
  const componentCounts = [];
  for (const match of matches) {
    const counts = [...match.raw.matchAll(/(\d+)\s*대/g)].map((count) => Number(count[1]));
    if (/(?:옥내|옥외)자주식/.test(match.raw)) componentCounts.push(...counts);
    else totalCounts.push(...counts);
  }
  const uniqueTotalCounts = new Set(totalCounts);
  const saysImpossible = /주차가능여부\s*(?:불가능|불가|N|X)/i.test(raw);
  const saysPossible = /주차가능여부\s*(?:가능|Y|O)/i.test(raw) && !saysImpossible;
  const onlyCount = uniqueTotalCounts.size === 1 ? [...uniqueTotalCounts][0] : null;
  const componentSum = componentCounts.length ? componentCounts.reduce((sum, count) => sum + count, 0) : null;
  const conflicts = uniqueTotalCounts.size > 1
    || (saysImpossible && onlyCount !== null && onlyCount > 0)
    || (saysPossible && onlyCount === 0)
    || (componentSum !== null && onlyCount !== null && componentSum !== onlyCount);
  const allStructured = matches.every((match) => match.structured);
  const consistentStructuredEvidence = allStructured && matches.length >= 2 && !conflicts && onlyCount !== null;
  const issues = conflicts
    ? ["주차 관련 수량 또는 가능 여부가 서로 충돌하므로 원문 확인이 필요합니다."]
    : consistentStructuredEvidence
      ? []
      : ["주차 정보는 원문을 직접 확인해야 합니다."];
  return candidate(
    raw,
    raw,
    consistentStructuredEvidence ? FIELD_STATUS.AUTO_CONFIRMED : FIELD_STATUS.REVIEW_REQUIRED,
    matches.map((match) => match.evidenceText).join(" | ").slice(0, 600),
    issues,
  );
}

function selectSourceAdapter(input, text) {
  let hostname = "";
  try {
    hostname = new URL(String(input.sourceUrl ?? "")).hostname.toLowerCase();
  } catch {
    return SOURCE_ADAPTER.GENERIC_VISIBLE_PAGE;
  }
  const officialHost = hostname === "land.naver.com" || hostname === "fin.land.naver.com";
  const signatureCount = ["계약/전용", "해당층/총층", "월관리비", "입주가능일", "총주차대수", "매물번호"]
    .filter((label) => text.includes(label)).length;
  return officialHost && signatureCount >= 2
    ? SOURCE_ADAPTER.NAVER_PAY_REAL_ESTATE
    : SOURCE_ADAPTER.GENERIC_VISIBLE_PAGE;
}

function hasUsableCurrentListingScope(scopeText, sourceUrl) {
  if (!scopeText) return false;
  const signatureCount = ["매물번호", "소재지", "계약/전용", "해당층/총층", "월관리비", "입주가능일"]
    .filter((label) => scopeText.includes(label)).length;
  const listingId = String(sourceUrl ?? "").match(/\/articles\/(\d+)/)?.[1] ?? null;
  return signatureCount >= 3 && (!listingId || scopeText.includes(listingId));
}

export function validateLeaseCollection(collection) {
  for (const warning of collection.validationWarnings ?? []) {
    const target = collection.fields[warning.field];
    if (target) target.issues = target.issues.filter((issue) => issue !== warning.message);
  }
  const warnings = [];
  const add = (field, message) => {
    warnings.push({ field, message });
    const target = collection.fields[field];
    if (target) downgrade(target, message);
  };

  const { exclusiveArea, contractArea, deposit, rent, managementFee } = collection.fields;
  if (!collection.fields.address.value) add("address", "주소가 없어 확인이 필요합니다.");
  if (!collection.fields.floor.value) add("floor", "층을 확인하지 못했습니다.");
  if (exclusiveArea.m2 !== null && contractArea.m2 !== null && exclusiveArea.m2 > contractArea.m2) {
    add("exclusiveArea", "전용면적이 계약면적보다 큽니다.");
    add("contractArea", "계약면적이 전용면적보다 작습니다.");
  }
  for (const [key, field] of Object.entries({ deposit, rent, managementFee })) {
    if (typeof field.value === "number" && field.value < 0) add(key, "음수 금액은 허용되지 않습니다.");
  }
  for (const [key, field] of Object.entries({ exclusiveArea, contractArea })) {
    if (typeof field.m2 === "number" && field.m2 < 0) add(key, "음수 면적은 허용되지 않습니다.");
  }
  collection.validationWarnings = warnings;
  return collection;
}

export function collectLeaseTerms(input) {
  const fullText = cleanText(input.text).replace(/\n{3,}/g, "\n\n");
  const sourceAdapter = selectSourceAdapter(input, fullText);
  const proposedScope = cleanText(input.scopeText).replace(/\n{3,}/g, "\n\n");
  const useCurrentListingScope = sourceAdapter === SOURCE_ADAPTER.NAVER_PAY_REAL_ESTATE
    && hasUsableCurrentListingScope(proposedScope, input.sourceUrl);
  const text = useCurrentListingScope ? proposedScope : fullText;
  const pair = matchLeaseMoneyPairs(text);
  const areas = extractAreas(text);
  const explicitDepositMatch = findMoney(text, "보증금");
  const depositMatch = pair?.priority === "EXPLICIT_LEASE_TERMS"
    ? pair.deposit
    : explicitDepositMatch ?? pair?.deposit ?? null;
  const rentMatch = pair?.rent ?? findMoney(text, "(?:월세|월\\s*임대료|임대료|월)") ?? null;
  const managementMatch = findFirst(text, [
    /(?:월관리비)[ \t]*[:：]?[ \t]*(?:\n[ \t]*)?((?:\d[\d,]*(?:\.\d+)?\s*(?:천\s*만|천|만)?(?:원)?|협의|문의|없음|별도))/i,
    /(관리비\s*[:：]?\s*(?:\d[\d,]*(?:\.\d+)?\s*(?:천\s*만|천|만)?(?:원)?|협의|문의|없음|별도))/i,
  ]);

  const managementFee = buildMoneyCandidate(managementMatch, "management");
  if (managementMatch && /별도/.test(managementMatch.raw) && managementFee.value === null) {
    managementFee.semanticStatus = SEMANTIC_STATUS.SEPARATE;
    managementFee.status = FIELD_STATUS.REVIEW_REQUIRED;
    managementFee.issues = ["관리비가 별도이지만 금액이 없습니다."];
  }
  const deposit = buildMoneyCandidate(depositMatch, "money");
  const rent = buildMoneyCandidate(rentMatch, "money");
  if (
    sourceAdapter === SOURCE_ADAPTER.NAVER_PAY_REAL_ESTATE
    && useCurrentListingScope
    && pair?.priority === "TRANSACTION_SUMMARY"
    && explicitDepositMatch
    && /^\d[\d,]*(?:\.\d+)?$/.test(pair.rent.raw)
  ) {
    const headerDeposit = parseKoreanMoney(pair.deposit.raw);
    const explicitDeposit = parseKoreanMoney(explicitDepositMatch.raw);
    if (
      headerDeposit.amount !== null
      && headerDeposit.amount === explicitDeposit.amount
      && explicitDeposit.status === FIELD_STATUS.AUTO_CONFIRMED
      && rent.value !== null
    ) {
      rent.status = FIELD_STATUS.AUTO_CONFIRMED;
      rent.issues = rent.issues.filter((issue) => !/금액 단위/.test(issue));
    }
  }

  const collection = {
    schemaVersion: "frameone.research-collector.lease.v1.1.2",
    sourceAdapter,
    sourceScope: useCurrentListingScope ? "CURRENT_LISTING_SEMANTIC_PANEL" : "FULL_VISIBLE_PAGE",
    transactionType: pair?.transactionType ?? (rentMatch ? TRANSACTION_TYPE.MONTHLY_RENT : TRANSACTION_TYPE.UNKNOWN),
    sourceUrl: String(input.sourceUrl ?? ""),
    pageTitle: String(input.pageTitle ?? ""),
    collectedAt: input.collectedAt ?? new Date().toISOString(),
    reviewedAt: null,
    reviewStatus: "REVIEW_REQUIRED",
    fields: {
      address: extractAddress(text),
      floor: extractFloor(text),
      exclusiveArea: areas.exclusive,
      contractArea: areas.contract,
      deposit,
      rent,
      managementFee,
      premium: extractPremium(text),
      vat: extractVat(text),
      buildingName: extractOptional(text, "건물명|빌딩명"),
      existingBusinessType: extractOptional(text, "현업종|현재업종|업종"),
      parking: extractParking(text),
      moveIn: extractMoveIn(text),
    },
    validationWarnings: [],
  };
  return validateLeaseCollection(collection);
}

export function toExportRecord(collection) {
  const f = collection.fields;
  const status = Object.fromEntries(Object.entries(f).map(([key, value]) => [key, value.status]));
  const evidence = Object.fromEntries(Object.entries(f).map(([key, value]) => [key, value.evidenceText ?? null]));
  return {
    schemaVersion: collection.schemaVersion,
    sourceAdapter: collection.sourceAdapter,
    sourceScope: collection.sourceScope,
    transactionType: collection.transactionType,
    sourceUrl: collection.sourceUrl,
    pageTitle: collection.pageTitle,
    collectedAt: collection.collectedAt,
    reviewedAt: collection.reviewedAt,
    reviewStatus: collection.reviewStatus,
    addressRaw: f.address.raw,
    address: f.address.value,
    floorRaw: f.floor.raw,
    floor: f.floor.value,
    exclusiveAreaRaw: f.exclusiveArea.raw,
    exclusiveAreaM2: f.exclusiveArea.m2,
    exclusiveAreaPyeong: f.exclusiveArea.pyeong,
    contractAreaRaw: f.contractArea.raw,
    contractAreaM2: f.contractArea.m2,
    contractAreaPyeong: f.contractArea.pyeong,
    depositRaw: f.deposit.raw,
    depositAmount: f.deposit.value,
    rentRaw: f.rent.raw,
    rentAmount: f.rent.value,
    managementFeeRaw: f.managementFee.raw,
    managementFeeAmount: f.managementFee.value,
    managementFeeStatus: f.managementFee.semanticStatus ?? SEMANTIC_STATUS.UNKNOWN,
    premiumRaw: f.premium.raw,
    premiumAmount: f.premium.value,
    premiumStatus: f.premium.semanticStatus ?? SEMANTIC_STATUS.UNKNOWN,
    vatStatus: f.vat.semanticStatus ?? SEMANTIC_STATUS.UNKNOWN,
    buildingName: f.buildingName.value,
    existingBusinessType: f.existingBusinessType.value,
    parkingRaw: f.parking.raw,
    moveInRaw: f.moveIn.raw,
    fieldStatus: status,
    evidence,
    validationWarnings: collection.validationWarnings,
  };
}
