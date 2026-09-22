import { FIELD_STATUS, SEMANTIC_STATUS, toExportRecord, collectLeaseTerms, validateLeaseCollection } from "./src/lease-parser.js";
import { formatKoreanMoney, formatMoneyInput, parseMoneyInput } from "./src/money-ui.js";
import {
  DUPLICATE_STATUS,
  VERIFICATION_STATUS,
  findDuplicateCandidate,
  fromCollectorExport,
  withVerificationStatus,
} from "./src/research-record.js";
import { getChromeStorageLocal, loadCollectorState, saveCollectorState } from "./src/research-storage.js";

const FRAMEONE_SERVER_BASE_URL = "http://localhost:3000";

const fieldDefinitions = [
  ["address", "주소", "text"],
  ["floor", "층", "text"],
  ["exclusiveArea", "전용면적 ㎡", "number"],
  ["contractArea", "계약면적 ㎡", "number"],
  ["deposit", "보증금 원", "money"],
  ["rent", "월세 원", "money"],
  ["managementFee", "관리비 원", "money"],
  ["premium", "권리금 원", "money"],
  ["vat", "VAT", "select"],
];

const optionalDefinitions = [
  ["buildingName", "건물명"],
  ["existingBusinessType", "현재 업종"],
  ["parking", "주차"],
  ["moveIn", "입주"],
];

const statusLabels = {
  [FIELD_STATUS.AUTO_CONFIRMED]: ["✓ 자동확인", "auto"],
  [FIELD_STATUS.HUMAN_CONFIRMED]: ["✓ 검수확인", "human"],
  [FIELD_STATUS.REVIEW_REQUIRED]: ["⚠ 확인필요", "review"],
  [FIELD_STATUS.MISSING]: ["— 미확인", "missing"],
};

let current = null;
let queueEntries = [];
let activeRecordId = null;
const duplicateDecisions = new Map();
let pendingStorageWrite = Promise.resolve();
let localPersistenceStatus = "CHECKING";
const analyzeButton = document.querySelector("#analyze");
const form = document.querySelector("#review-form");
const message = document.querySelector("#message");

async function persistQueue() {
  const snapshot = structuredClone({
    queueEntries,
    activeRecordId,
    duplicateDecisions: [...duplicateDecisions.entries()],
  });
  const operation = pendingStorageWrite.then(() => saveCollectorState(getChromeStorageLocal(), snapshot));
  pendingStorageWrite = operation.then(() => undefined, () => undefined);
  try {
    await operation;
    localPersistenceStatus = "SAVED";
    renderQueue();
  } catch (error) {
    localPersistenceStatus = "FAILED";
    setMessage(`로컬 조사함 저장 실패: ${error instanceof Error ? error.message : String(error)}`, true);
    renderQueue();
  }
}

async function restoreQueue() {
  try {
    const state = await loadCollectorState(getChromeStorageLocal());
    localPersistenceStatus = "SAVED";
    queueEntries = state.queueEntries;
    activeRecordId = state.activeRecordId;
    duplicateDecisions.clear();
    for (const [key, decision] of state.duplicateDecisions) duplicateDecisions.set(key, decision);
    recalculateDuplicateCandidates();
    const active = queueEntries.find((entry) => entry.record.recordId === activeRecordId) ?? queueEntries.at(-1);
    if (active) {
      activeRecordId = active.record.recordId;
      current = active.collection;
      render();
      renderQueue();
      setMessage(`로컬 조사함 ${queueEntries.length}건을 복원했습니다.`);
    }
  } catch (error) {
    localPersistenceStatus = "FAILED";
    setMessage(`로컬 조사함 복원 실패: ${error instanceof Error ? error.message : String(error)}`, true);
    renderQueue();
  }
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "#9d2d22" : "#5b5b55";
}

function fieldValue(key, field) {
  if (key === "exclusiveArea" || key === "contractArea") return field.m2 ?? "";
  if (["deposit", "rent", "managementFee", "premium"].includes(key)) return formatMoneyInput(field.value);
  return field.value ?? "";
}

function statusMarkup(field) {
  const [label, className] = statusLabels[field.status] ?? statusLabels[FIELD_STATUS.REVIEW_REQUIRED];
  return `<span class="status ${className}">${label}</span>`;
}

function semanticControl(key, field) {
  const options = key === "premium"
    ? [["KNOWN", "금액 있음"], ["NEGOTIABLE", "협의"], ["NO_PREMIUM", "무권리"], ["UNKNOWN", "미확인"]]
    : [["KNOWN", "금액 있음"], ["NEGOTIABLE", "협의"], ["NONE", "없음"], ["SEPARATE", "별도·금액 미확인"], ["UNKNOWN", "미확인"]];
  return `<select class="semantic" aria-label="${key === "premium" ? "권리금" : "관리비"} 의미" data-semantic-field="${key}">${options.map(([value, label]) => `<option value="${value}" ${field.semanticStatus === value ? "selected" : ""}>${label}</option>`).join("")}</select>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const verificationLabels = {
  [VERIFICATION_STATUS.COLLECTED]: "수집됨",
  [VERIFICATION_STATUS.REVIEW_REQUIRED]: "검수 필요",
  [VERIFICATION_STATUS.CONFIRMED]: "확정",
  [VERIFICATION_STATUS.EXCLUDED]: "제외",
};

const freshnessLabels = {
  CURRENT_30D: "30일 이내",
  RECENT_90D: "31~90일",
  AGED_180D: "91~180일",
  STALE: "180일 초과",
};

function displayMoney(amount, semanticStatus = SEMANTIC_STATUS.KNOWN) {
  const semantic = formatKoreanMoney(amount, semanticStatus);
  if (amount === null || amount === undefined) return semantic || "미확인";
  const exact = `${formatMoneyInput(amount)}원`;
  return semantic && semantic !== exact ? `${exact} · ${semantic}` : exact;
}

function syncQueueRecord(verificationStatus) {
  if (!current) return;
  const entry = queueEntries.find((item) => item.record.recordId === activeRecordId);
  const next = fromCollectorExport(current, {
    asOf: new Date().toISOString(),
    ...(verificationStatus || entry ? { verificationStatus: verificationStatus ?? entry.record.quality.verificationStatus } : {}),
    ...(entry ? { recordId: entry.record.recordId } : {}),
  });
  if (entry) {
    next.history = entry.record.history;
    entry.record = next;
    entry.collection = current;
  } else {
    activeRecordId = next.recordId;
    queueEntries.push({ record: next, collection: current });
  }
  recalculateDuplicateCandidates();
  renderQueue();
  void persistQueue();
}

function recalculateDuplicateCandidates() {
  for (const entry of queueEntries) {
    entry.record.quality.duplicateStatus = DUPLICATE_STATUS.NO_MATCH;
    entry.record.quality.duplicateCandidates = [];
  }
  const rank = { NO_MATCH: 0, POSSIBLE_DUPLICATE: 1, LIKELY_DUPLICATE: 2 };
  for (let leftIndex = 0; leftIndex < queueEntries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < queueEntries.length; rightIndex += 1) {
      const left = queueEntries[leftIndex].record;
      const right = queueEntries[rightIndex].record;
      const decisionKey = [left.recordId, right.recordId].sort().join("|");
      if (duplicateDecisions.has(decisionKey)) continue;
      const result = findDuplicateCandidate(left, right);
      if (result.status === DUPLICATE_STATUS.NO_MATCH) continue;
      left.quality.duplicateCandidates.push({ recordId: right.recordId, ...result });
      right.quality.duplicateCandidates.push({ recordId: left.recordId, ...result });
      if (rank[result.status] > rank[left.quality.duplicateStatus]) left.quality.duplicateStatus = result.status;
      if (rank[result.status] > rank[right.quality.duplicateStatus]) right.quality.duplicateStatus = result.status;
    }
  }
}

function renderQueue() {
  const section = document.querySelector("#review-queue");
  const card = document.querySelector("#queue-card");
  if (!queueEntries.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  document.querySelector("#queue-count").textContent = `${queueEntries.length}건`;
  card.innerHTML = queueEntries.map(({ record, repository }) => {
    const { property, lease, source, quality } = record;
    const statusClass = quality.verificationStatus === VERIFICATION_STATUS.CONFIRMED
      ? "confirmed"
      : quality.verificationStatus === VERIFICATION_STATUS.EXCLUDED ? "excluded" : "";
    const warnings = quality.warnings.length
      ? `<p class="queue-warning">${escapeHtml(quality.warnings.slice(0, 3).join(" · "))}</p>`
      : "";
    const duplicate = quality.duplicateStatus !== DUPLICATE_STATUS.NO_MATCH
      ? `<div class="duplicate-panel"><strong>${escapeHtml(quality.duplicateStatus)}</strong><p>${escapeHtml(quality.duplicateCandidates[0]?.reasons.join(" · ") ?? "중복 조건 일치")} — 자동 병합하지 않습니다.</p><div class="duplicate-actions"><button type="button" data-record-id="${escapeHtml(record.recordId)}" data-duplicate-action="same" ${repository?.status === "SAVED" ? "disabled" : ""}>같은 매물</button><button type="button" data-record-id="${escapeHtml(record.recordId)}" data-duplicate-action="different" ${repository?.status === "SAVED" ? "disabled" : ""}>다른 매물</button></div></div>`
      : "";
    const isSaved = repository?.status === "SAVED";
    const localStateLabel = localPersistenceStatus === "FAILED"
      ? "로컬 조사함 저장 실패 · 현재 팝업 메모리만 사용 중"
      : localPersistenceStatus === "SAVED" ? "로컬 조사함 저장됨" : "로컬 조사함 저장 확인 중";
    return `<div class="queue-card">
    <div class="queue-card-header">
      <div><h3>${escapeHtml(property.address || property.addressRaw || "주소 미확인")}</h3><p class="queue-meta">${property.floor ? `${escapeHtml(property.floor)}층` : "층 미확인"} · ${escapeHtml(source.sourceName)} · ${escapeHtml(source.collectedAt.slice(0, 10))}</p></div>
      <span class="queue-status ${statusClass}">${escapeHtml(verificationLabels[quality.verificationStatus])}</span>
    </div>
    <div class="queue-grid">
      <div class="queue-value"><span>전용면적</span><strong>${property.exclusiveAreaM2 ?? "미확인"}${property.exclusiveAreaM2 != null ? `㎡ · ${property.exclusiveAreaPyeong ?? "-"}평` : ""}</strong></div>
      <div class="queue-value"><span>신선도</span><strong>${escapeHtml(freshnessLabels[quality.freshnessStatus])}</strong></div>
      <div class="queue-value"><span>보증금</span><strong>${escapeHtml(displayMoney(lease.depositAmount))}</strong></div>
      <div class="queue-value"><span>월세</span><strong>${escapeHtml(displayMoney(lease.rentAmount))}</strong></div>
      <div class="queue-value"><span>관리비</span><strong>${escapeHtml(displayMoney(lease.managementFeeAmount, lease.managementFeeStatus ?? SEMANTIC_STATUS.KNOWN))}</strong></div>
      <div class="queue-value"><span>권리금</span><strong>${escapeHtml(displayMoney(lease.premiumAmount, lease.premiumStatus))}</strong></div>
      <div class="queue-value"><span>중복 후보</span><strong>${escapeHtml(quality.duplicateStatus)}</strong></div>
      <div class="queue-value"><span>출처 유형</span><strong>${escapeHtml(source.sourceType)}</strong></div>
    </div>
    ${warnings}${duplicate}
    <p class="repository-state">${escapeHtml(localStateLabel)}${isSaved ? ` · FRAMEONE 저장 완료 · ${escapeHtml(repository.repositoryRecordId)}` : ""}</p>
    <div class="queue-actions"><button type="button" data-record-id="${escapeHtml(record.recordId)}" data-queue-action="confirm" ${isSaved ? "disabled" : ""}>확정</button><button type="button" data-record-id="${escapeHtml(record.recordId)}" data-queue-action="edit" ${isSaved ? "disabled" : ""}>수정</button><button type="button" data-record-id="${escapeHtml(record.recordId)}" data-queue-action="exclude" ${isSaved ? "disabled" : ""}>제외</button><button type="button" data-record-id="${escapeHtml(record.recordId)}" data-queue-action="save" ${quality.verificationStatus !== VERIFICATION_STATUS.CONFIRMED || isSaved ? "disabled" : ""}>FRAMEONE에 저장</button></div>
  </div>`;
  }).join("");
  card.querySelectorAll("[data-queue-action]").forEach((button) => button.addEventListener("click", handleQueueAction));
  card.querySelectorAll("[data-duplicate-action]").forEach((button) => button.addEventListener("click", handleDuplicateAction));
}

async function handleQueueAction(event) {
  const action = event.currentTarget.dataset.queueAction;
  const entry = queueEntries.find((item) => item.record.recordId === event.currentTarget.dataset.recordId);
  if (!entry) return;
  activeRecordId = entry.record.recordId;
  if (action === "save") {
    await saveToFrameone(entry);
    return;
  } else if (action === "edit") {
    entry.record = withVerificationStatus(entry.record, VERIFICATION_STATUS.REVIEW_REQUIRED, new Date().toISOString());
    current = entry.collection;
    render();
    document.querySelector("#fields input, #fields select")?.focus();
    setMessage("수정할 값을 고친 뒤 필드 검수 완료를 누르세요.");
  } else {
    const next = action === "confirm" ? VERIFICATION_STATUS.CONFIRMED : VERIFICATION_STATUS.EXCLUDED;
    entry.record = withVerificationStatus(entry.record, next, new Date().toISOString());
    setMessage(next === VERIFICATION_STATUS.CONFIRMED
      ? "자료를 확정했습니다. CONFIRMED 자료만 향후 분석 대상입니다."
      : "자료를 제외했습니다. 원본과 이력은 현재 JSON record에 남습니다.");
  }
  renderQueue();
  await persistQueue();
}

async function saveToFrameone(entry) {
  if (entry.record.quality.verificationStatus !== VERIFICATION_STATUS.CONFIRMED) {
    setMessage("CONFIRMED 자료만 FRAMEONE에 저장할 수 있습니다.", true);
    return;
  }
  setMessage("FRAMEONE 서버에 저장하는 중입니다.");
  try {
    const response = await fetch(`${FRAMEONE_SERVER_BASE_URL}/api/research-records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry.record),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? `HTTP ${response.status}`);
    entry.repository = {
      status: "SAVED",
      repositoryRecordId: result.repositoryRecordId,
      savedAt: new Date().toISOString(),
    };
    await persistQueue();
    renderQueue();
    setMessage(result.created ? "FRAMEONE 서버에 저장했습니다." : "이미 저장된 동일 record를 확인했습니다.");
  } catch (error) {
    setMessage(`FRAMEONE 저장 실패: ${error instanceof Error ? error.message : String(error)}`, true);
  }
}

function handleDuplicateAction(event) {
  const entry = queueEntries.find((item) => item.record.recordId === event.currentTarget.dataset.recordId);
  if (!entry) return;
  const candidateId = entry.record.quality.duplicateCandidates[0]?.recordId;
  const decision = event.currentTarget.dataset.duplicateAction === "same" ? "SAME_LISTING" : "DIFFERENT_LISTING";
  if (candidateId) duplicateDecisions.set([entry.record.recordId, candidateId].sort().join("|"), decision);
  entry.record = {
    ...entry.record,
    quality: { ...entry.record.quality, duplicateStatus: DUPLICATE_STATUS.NO_MATCH, duplicateCandidates: [] },
    history: [...entry.record.history, {
      type: "DUPLICATE_REVIEWED",
      changedAt: new Date().toISOString(),
      relatedRecordId: candidateId ?? null,
      decision,
    }],
  };
  recalculateDuplicateCandidates();
  setMessage("중복 후보 판단을 기록했습니다. 자동 병합은 수행하지 않았습니다.");
  renderQueue();
  void persistQueue();
}

function render() {
  if (!current) return;
  const fields = document.querySelector("#fields");
  fields.innerHTML = fieldDefinitions.map(([key, label, type]) => {
    const field = current.fields[key];
    const control = type === "select"
      ? `<select id="field-${key}" data-field="${key}">
          <option value="UNKNOWN">미확인</option>
          <option value="SEPARATE">별도</option>
          <option value="INCLUDED">포함</option>
        </select>`
      : `<input id="field-${key}" data-field="${key}" ${type === "money" ? `data-money-field="${key}" type="text" inputmode="numeric"` : `type="${type}" ${type === "number" ? 'min="0" step="any"' : ""}`} value="${escapeHtml(fieldValue(key, field))}" />`;
    const semantic = key === "managementFee" || key === "premium" ? semanticControl(key, field) : "";
    const moneyHint = type === "money" ? `<span class="money-hint">${escapeHtml(formatKoreanMoney(field.value, field.semanticStatus))}</span>` : "";
    return `<div class="field" data-field-row="${key}"><label for="field-${key}">${label}</label>${control}${semantic}${moneyHint}${statusMarkup(field)}</div>`;
  }).join("");
  document.querySelector("#field-vat").value = current.fields.vat.semanticStatus ?? SEMANTIC_STATUS.UNKNOWN;

  document.querySelector("#optional-list").innerHTML = optionalDefinitions.map(([key, label]) => {
    const field = current.fields[key];
    return `<div class="field" data-field-row="${key}"><label for="field-${key}">${label}</label><input id="field-${key}" data-field="${key}" type="text" value="${escapeHtml(field.value ?? "")}" />${statusMarkup(field)}</div>`;
  }).join("");

  const rawDefinitions = [...fieldDefinitions, ...optionalDefinitions];
  document.querySelector("#raw-list").innerHTML = rawDefinitions.map(([key, label]) => {
    const field = current.fields[key];
    return `<div class="raw-item"><strong>${label}</strong><p>Raw: ${escapeHtml(field.raw ?? "미확인")}</p><p>근거: ${escapeHtml(field.evidenceText ?? "없음")}</p></div>`;
  }).join("");

  renderWarnings();
  form.hidden = false;
  document.querySelectorAll("[data-field]").forEach((element) => element.addEventListener("input", handleEdit));
  document.querySelectorAll("[data-money-field]").forEach((element) => element.addEventListener("blur", formatMoneyOnBlur));
  document.querySelectorAll("[data-semantic-field]").forEach((element) => element.addEventListener("change", handleSemanticEdit));
}

function refreshStatuses() {
  for (const [key, field] of Object.entries(current.fields)) {
    const row = document.querySelector(`[data-field-row="${key}"]`);
    const status = row?.querySelector(".status");
    if (status) status.outerHTML = statusMarkup(field);
  }
}

function refreshMoneyHint(key) {
  const field = current.fields[key];
  const hint = document.querySelector(`[data-field-row="${key}"] .money-hint`);
  if (hint) hint.textContent = formatKoreanMoney(field.value, field.semanticStatus);
}

function formatMoneyOnBlur(event) {
  const amount = parseMoneyInput(event.currentTarget.value);
  if (amount !== null) event.currentTarget.value = formatMoneyInput(amount);
}

function renderWarnings() {
  const box = document.querySelector("#warnings");
  const allWarnings = [
    ...current.validationWarnings.map((warning) => warning.message),
    ...Object.values(current.fields).flatMap((field) => field.issues ?? []),
  ].filter((value, index, list) => list.indexOf(value) === index);
  box.hidden = allWarnings.length === 0;
  box.querySelector("ul").innerHTML = allWarnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
}

function handleEdit(event) {
  const key = event.currentTarget.dataset.field;
  const field = current.fields[key];
  const value = event.currentTarget.value.trim();
  if (key === "vat") {
    field.value = value;
    field.semanticStatus = value;
  } else if (key === "exclusiveArea" || key === "contractArea") {
    field.m2 = value === "" ? null : Number(value);
    field.pyeong = field.m2 === null || !Number.isFinite(field.m2) ? null : Math.round((field.m2 / 3.305785) * 100) / 100;
    field.value = field.m2;
  } else if (["deposit", "rent", "managementFee", "premium"].includes(key)) {
    const amount = parseMoneyInput(value);
    field.value = amount;
    field.issues = value !== "" && amount === null ? ["금액은 0 이상의 숫자와 comma만 입력할 수 있습니다."] : [];
    if (key === "managementFee" || key === "premium") {
      field.semanticStatus = amount === null
        ? SEMANTIC_STATUS.UNKNOWN
        : key === "managementFee" && amount === 0 ? SEMANTIC_STATUS.NONE : SEMANTIC_STATUS.KNOWN;
      const semanticSelect = document.querySelector(`[data-semantic-field="${key}"]`);
      if (semanticSelect) semanticSelect.value = field.semanticStatus;
    }
  } else {
    field.value = value || null;
  }
  field.status = value === "" || (key === "vat" && value === "UNKNOWN") ? FIELD_STATUS.MISSING : FIELD_STATUS.REVIEW_REQUIRED;
  if (!["deposit", "rent", "managementFee", "premium"].includes(key)) field.issues = [];
  current.reviewStatus = "REVIEW_REQUIRED";
  current.reviewedAt = null;
  validateLeaseCollection(current);
  refreshStatuses();
  if (["deposit", "rent", "managementFee", "premium"].includes(key)) refreshMoneyHint(key);
  renderWarnings();
  syncQueueRecord(VERIFICATION_STATUS.REVIEW_REQUIRED);
}

function handleSemanticEdit(event) {
  const key = event.currentTarget.dataset.semanticField;
  const field = current.fields[key];
  const semanticStatus = event.currentTarget.value;
  field.semanticStatus = semanticStatus;
  field.issues = [];
  if (semanticStatus === SEMANTIC_STATUS.NO_PREMIUM || semanticStatus === SEMANTIC_STATUS.NONE) {
    field.value = 0;
    document.querySelector(`#field-${key}`).value = formatMoneyInput(0);
  } else if ([SEMANTIC_STATUS.NEGOTIABLE, SEMANTIC_STATUS.SEPARATE, SEMANTIC_STATUS.UNKNOWN].includes(semanticStatus)) {
    field.value = null;
    document.querySelector(`#field-${key}`).value = "";
  }
  field.status = semanticStatus === SEMANTIC_STATUS.UNKNOWN ? FIELD_STATUS.MISSING : FIELD_STATUS.REVIEW_REQUIRED;
  current.reviewStatus = "REVIEW_REQUIRED";
  current.reviewedAt = null;
  validateLeaseCollection(current);
  refreshStatuses();
  refreshMoneyHint(key);
  renderWarnings();
  syncQueueRecord(VERIFICATION_STATUS.REVIEW_REQUIRED);
}

async function analyzeCurrentPage() {
  analyzeButton.disabled = true;
  setMessage("현재 페이지의 보이는 텍스트를 읽는 중입니다.");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("활성 탭을 찾지 못했습니다.");
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const bodyText = document.body?.innerText ?? "";
        const labels = ["매물번호", "소재지", "계약/전용", "해당층/총층", "월관리비", "입주가능일", "총주차대수"];
        const listingId = location.pathname.match(/\/articles\/(\d+)/)?.[1] ?? null;
        const candidates = new Map();
        const directText = (element) => Array.from(element.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? "")
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        for (const element of document.querySelectorAll("body *")) {
          const ownText = directText(element);
          if (!ownText || !labels.some((label) => ownText.includes(label))) continue;
          let ancestor = element;
          while (ancestor && ancestor !== document.body) {
            const text = ancestor.innerText?.trim() ?? "";
            const labelCount = labels.filter((label) => text.includes(label)).length;
            if (labelCount >= 4 && /(?:^|\n)\s*월세\s+/m.test(text)) {
              candidates.set(ancestor, {
                text,
                labelCount,
                containsListingId: Boolean(listingId && text.includes(listingId)),
                containsDescription: /상세\s*설명|매물\s*설명/.test(text),
              });
            }
            ancestor = ancestor.parentElement;
          }
        }

        const ranked = [...candidates.values()].sort((left, right) => {
          if (left.containsListingId !== right.containsListingId) return left.containsListingId ? -1 : 1;
          if (left.containsDescription !== right.containsDescription) return left.containsDescription ? -1 : 1;
          if (left.text.length !== right.text.length) return left.text.length - right.text.length;
          if (left.labelCount !== right.labelCount) return right.labelCount - left.labelCount;
          return 0;
        });
        const selected = ranked.find((candidate) => !listingId || candidate.containsListingId) ?? ranked[0] ?? null;
        const scopedText = selected && selected.text.length < bodyText.length * 0.9 ? selected.text : null;
        return {
          text: bodyText,
          scopeText: scopedText,
          pageTitle: document.title,
          sourceUrl: location.href,
        };
      },
    });
    const page = results[0]?.result;
    if (!page) throw new Error("페이지 텍스트를 읽지 못했습니다.");
    current = collectLeaseTerms({ ...page, collectedAt: new Date().toISOString() });
    activeRecordId = null;
    render();
    syncQueueRecord();
    setMessage("후보값을 찾았습니다. 확인필요·미확인 값을 검수하세요.");
  } catch (error) {
    setMessage(`분석할 수 없습니다: ${error instanceof Error ? error.message : String(error)}`, true);
  } finally {
    analyzeButton.disabled = false;
  }
}

function completeReview() {
  if (!current) return;
  validateLeaseCollection(current);
  const blockedFields = new Set(current.validationWarnings.map((warning) => warning.field));
  for (const [key, field] of Object.entries(current.fields)) {
    const hasSemanticValue = field.semanticStatus && field.semanticStatus !== SEMANTIC_STATUS.UNKNOWN;
    const hasValue = field.value !== null && field.value !== "" || field.m2 !== null && field.m2 !== undefined || hasSemanticValue;
    if (hasValue && !blockedFields.has(key)) field.status = FIELD_STATUS.HUMAN_CONFIRMED;
    else if (!hasValue) field.status = FIELD_STATUS.MISSING;
  }
  current.reviewedAt = new Date().toISOString();
  const hasWarnings = current.validationWarnings.length > 0 || Object.values(current.fields).some((field) => field.status === FIELD_STATUS.REVIEW_REQUIRED || field.issues?.length);
  const hasMissing = Object.values(current.fields).some((field) => field.status === FIELD_STATUS.MISSING);
  current.reviewStatus = hasWarnings ? "REVIEWED_WITH_WARNINGS" : hasMissing ? "REVIEWED_WITH_MISSING" : "REVIEWED";
  render();
  syncQueueRecord(VERIFICATION_STATUS.REVIEW_REQUIRED);
  setMessage(hasWarnings ? "경고가 남은 상태로 검수 기록을 만들었습니다." : "현재 값을 사람이 검수한 상태로 표시했습니다.");
}

function exportResearchJson() {
  if (!queueEntries.length) return;
  const records = queueEntries.map((entry) => entry.record);
  const blob = new Blob([`${JSON.stringify(records, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `frameone-lease-research-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  setMessage(`V1.2 Research Record ${records.length}건을 JSON으로 내보냈습니다. DB 전송은 하지 않았습니다.`);
}

function exportJson() {
  if (!current) return;
  const blob = new Blob([`${JSON.stringify(toExportRecord(current), null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `frameone-lease-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  setMessage("검수 상태와 Raw·Normalized·근거를 JSON으로 내보냈습니다.");
}

analyzeButton.addEventListener("click", analyzeCurrentPage);
document.querySelector("#complete-review").addEventListener("click", completeReview);
document.querySelector("#export-json").addEventListener("click", exportJson);
document.querySelector("#export-research-json").addEventListener("click", exportResearchJson);
void restoreQueue();
