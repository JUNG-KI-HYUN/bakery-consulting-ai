import {
  createFieldEvidenceMeta,
  parseFieldEvidenceMeta,
  type FieldEvidenceMeta,
} from "./field-evidence-meta";

export type TriStateCheck = "YES" | "NO" | "UNKNOWN";
export type PowerPhaseType = "SINGLE_PHASE" | "THREE_PHASE" | "UNKNOWN";
export type ExpansionDiscussStatus = "NOT_CHECKED" | "DISCUSSED" | "EXPERT_REVIEW_REQUIRED";
export type RestroomLocation = "INTERNAL" | "EXTERNAL" | "UNKNOWN";
export type RestroomUsage = "EXCLUSIVE" | "SHARED" | "UNKNOWN";

/**
 * 관찰값 + Evidence 3축.
 * value만 채워도 verificationStatus를 VERIFIED로 승격하지 않는다.
 */
export interface FacilityObservation<T> {
  readonly value: T;
  readonly evidence: FieldEvidenceMeta;
}

export interface ElectricalFacility {
  /** 계약전력 kW. null이면 명시적 UNKNOWN. 필드는 항상 존재해야 Stage 응답으로 인정. */
  readonly contractPowerKw: FacilityObservation<number | null>;
  readonly phaseType: FacilityObservation<PowerPhaseType>;
  readonly panelFieldChecked: FacilityObservation<TriStateCheck>;
  readonly expansionStatus: FacilityObservation<ExpansionDiscussStatus>;
}

export interface WaterSupplyFacility {
  readonly locationChecked: FacilityObservation<TriStateCheck>;
  readonly supplyPointObserved: FacilityObservation<TriStateCheck>;
  readonly furtherCheckNeeded: FacilityObservation<TriStateCheck>;
}

export interface DrainageFacility {
  readonly locationChecked: FacilityObservation<TriStateCheck>;
  readonly floorDrainObserved: FacilityObservation<TriStateCheck>;
  readonly furtherCheckNeeded: FacilityObservation<TriStateCheck>;
}

export interface ExhaustFacility {
  readonly existingEquipmentObserved: FacilityObservation<TriStateCheck>;
  readonly externalPathChecked: FacilityObservation<TriStateCheck>;
  readonly landlordConfirmation: FacilityObservation<TriStateCheck>;
  readonly expertReviewNeeded: FacilityObservation<TriStateCheck>;
}

export interface RestroomFacility {
  readonly location: FacilityObservation<RestroomLocation>;
  readonly usage: FacilityObservation<RestroomUsage>;
  readonly fieldChecked: FacilityObservation<TriStateCheck>;
}

export interface FacilityObservations {
  readonly electrical?: ElectricalFacility;
  readonly waterSupply?: WaterSupplyFacility;
  readonly drainage?: DrainageFacility;
  readonly exhaust?: ExhaustFacility;
  readonly restroom?: RestroomFacility;
}

function obs<T>(value: T, evidence?: Partial<FieldEvidenceMeta>): FacilityObservation<T> {
  return Object.freeze({
    value,
    evidence: createFieldEvidenceMeta(evidence),
  });
}

export function createDefaultElectrical(): ElectricalFacility {
  return Object.freeze({
    contractPowerKw: obs(null),
    phaseType: obs("UNKNOWN" as const),
    panelFieldChecked: obs("UNKNOWN" as const),
    expansionStatus: obs("NOT_CHECKED" as const),
  });
}

export function createDefaultWaterSupply(): WaterSupplyFacility {
  return Object.freeze({
    locationChecked: obs("UNKNOWN" as const),
    supplyPointObserved: obs("UNKNOWN" as const),
    furtherCheckNeeded: obs("UNKNOWN" as const),
  });
}

export function createDefaultDrainage(): DrainageFacility {
  return Object.freeze({
    locationChecked: obs("UNKNOWN" as const),
    floorDrainObserved: obs("UNKNOWN" as const),
    furtherCheckNeeded: obs("UNKNOWN" as const),
  });
}

export function createDefaultExhaust(): ExhaustFacility {
  return Object.freeze({
    existingEquipmentObserved: obs("UNKNOWN" as const),
    externalPathChecked: obs("UNKNOWN" as const),
    landlordConfirmation: obs("UNKNOWN" as const),
    expertReviewNeeded: obs("YES" as const, {
      confirmationRequirement: "EXPERT_CONFIRMATION_REQUIRED",
    }),
  });
}

export function createDefaultRestroom(): RestroomFacility {
  return Object.freeze({
    location: obs("UNKNOWN" as const),
    usage: obs("UNKNOWN" as const),
    fieldChecked: obs("UNKNOWN" as const),
  });
}

function parseTriState(value: unknown): TriStateCheck | null {
  return value === "YES" || value === "NO" || value === "UNKNOWN" ? value : null;
}

function parseObservation<T>(
  value: unknown,
  parseValue: (raw: unknown) => T | null,
): FacilityObservation<T> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const parsedValue = parseValue(record.value);
  if (parsedValue === null) return null;
  const evidence = parseFieldEvidenceMeta(record.evidence);
  if (!evidence) return null;
  return Object.freeze({ value: parsedValue, evidence });
}

function parseContractPower(raw: unknown): number | null | undefined {
  if (raw === null) return null;
  if (typeof raw !== "number") return undefined;
  if (!Number.isFinite(raw) || raw < 0) return undefined;
  return raw;
}

export function parseElectrical(value: unknown): ElectricalFacility | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.contractPowerKw !== "object" || record.contractPowerKw === null) return null;
  const cp = record.contractPowerKw as Record<string, unknown>;
  const power = parseContractPower(cp.value);
  if (power === undefined) return null;
  const cpEvidence = parseFieldEvidenceMeta(cp.evidence);
  if (!cpEvidence) return null;

  const phaseType = parseObservation(record.phaseType, (raw) =>
    raw === "SINGLE_PHASE" || raw === "THREE_PHASE" || raw === "UNKNOWN" ? raw : null,
  );
  const panelFieldChecked = parseObservation(record.panelFieldChecked, parseTriState);
  const expansionStatus = parseObservation(record.expansionStatus, (raw) =>
    raw === "NOT_CHECKED" || raw === "DISCUSSED" || raw === "EXPERT_REVIEW_REQUIRED" ? raw : null,
  );
  if (!phaseType || !panelFieldChecked || !expansionStatus) return null;

  return Object.freeze({
    contractPowerKw: Object.freeze({ value: power, evidence: cpEvidence }),
    phaseType,
    panelFieldChecked,
    expansionStatus,
  });
}

export function parseWaterSupply(value: unknown): WaterSupplyFacility | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const locationChecked = parseObservation(record.locationChecked, parseTriState);
  const supplyPointObserved = parseObservation(record.supplyPointObserved, parseTriState);
  const furtherCheckNeeded = parseObservation(record.furtherCheckNeeded, parseTriState);
  if (!locationChecked || !supplyPointObserved || !furtherCheckNeeded) return null;
  return Object.freeze({ locationChecked, supplyPointObserved, furtherCheckNeeded });
}

export function parseDrainage(value: unknown): DrainageFacility | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const locationChecked = parseObservation(record.locationChecked, parseTriState);
  const floorDrainObserved = parseObservation(record.floorDrainObserved, parseTriState);
  const furtherCheckNeeded = parseObservation(record.furtherCheckNeeded, parseTriState);
  if (!locationChecked || !floorDrainObserved || !furtherCheckNeeded) return null;
  return Object.freeze({ locationChecked, floorDrainObserved, furtherCheckNeeded });
}

export function parseExhaust(value: unknown): ExhaustFacility | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const existingEquipmentObserved = parseObservation(record.existingEquipmentObserved, parseTriState);
  const externalPathChecked = parseObservation(record.externalPathChecked, parseTriState);
  const landlordConfirmation = parseObservation(record.landlordConfirmation, parseTriState);
  const expertReviewNeeded = parseObservation(record.expertReviewNeeded, parseTriState);
  if (
    !existingEquipmentObserved ||
    !externalPathChecked ||
    !landlordConfirmation ||
    !expertReviewNeeded
  ) {
    return null;
  }
  return Object.freeze({
    existingEquipmentObserved,
    externalPathChecked,
    landlordConfirmation,
    expertReviewNeeded,
  });
}

export function parseRestroom(value: unknown): RestroomFacility | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const location = parseObservation(record.location, (raw) =>
    raw === "INTERNAL" || raw === "EXTERNAL" || raw === "UNKNOWN" ? raw : null,
  );
  const usage = parseObservation(record.usage, (raw) =>
    raw === "EXCLUSIVE" || raw === "SHARED" || raw === "UNKNOWN" ? raw : null,
  );
  const fieldChecked = parseObservation(record.fieldChecked, parseTriState);
  if (!location || !usage || !fieldChecked) return null;
  return Object.freeze({ location, usage, fieldChecked });
}

export function parseFacilityObservations(value: unknown): FacilityObservations | null {
  if (value === undefined) return Object.freeze({});
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const electrical =
    record.electrical === undefined ? undefined : parseElectrical(record.electrical);
  if (record.electrical !== undefined && !electrical) return null;
  const waterSupply =
    record.waterSupply === undefined ? undefined : parseWaterSupply(record.waterSupply);
  if (record.waterSupply !== undefined && !waterSupply) return null;
  const drainage = record.drainage === undefined ? undefined : parseDrainage(record.drainage);
  if (record.drainage !== undefined && !drainage) return null;
  const exhaust = record.exhaust === undefined ? undefined : parseExhaust(record.exhaust);
  if (record.exhaust !== undefined && !exhaust) return null;
  const restroom = record.restroom === undefined ? undefined : parseRestroom(record.restroom);
  if (record.restroom !== undefined && !restroom) return null;
  return Object.freeze({
    ...(electrical ? { electrical } : {}),
    ...(waterSupply ? { waterSupply } : {}),
    ...(drainage ? { drainage } : {}),
    ...(exhaust ? { exhaust } : {}),
    ...(restroom ? { restroom } : {}),
  });
}

/** 숫자·진술만으로 VERIFIED가 되지 않았는지 검사 (테스트용). */
export function observationIsNotAutoVerified(observation: FacilityObservation<unknown>): boolean {
  return observation.evidence.verificationStatus !== "VERIFIED";
}
