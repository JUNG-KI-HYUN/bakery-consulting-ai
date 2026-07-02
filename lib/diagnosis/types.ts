export type StoreType = "판매형" | "제조형" | "카페형" | "배달병행형";
export type Verdict = "추천" | "조건부 추천" | "보류" | "위험";

export interface ConsultationInput {
  id: string;
  title: string;
  sampleData: boolean;
  customerName: string;
  contact: string;
  startupBudget: number;
  preferredArea: string;
  hasExperience: boolean;
  storeType: StoreType;
  memo: string;
}

export interface CandidateStoreInput {
  address: string;
  deposit: number;
  rent: number;
  maintenanceFee: number;
  premium: number;
  exclusiveArea: number;
  floor: string;
  frontage: number;
  entrancePosition: string;
  signExposure: string;
  parkingAvailable: boolean;
  previousBusiness: string;
  contractPeriod: string;
  businessRestriction: string;
  restorationScope: string;
  specialTerms: string;
}

export interface FacilityCheckInput {
  electricCapacity: string;
  electricExpansionPossible: "가능" | "불확실" | "불가";
  plumbingPossible: "가능" | "불확실" | "불가";
  exhaustPossible: "가능" | "불확실" | "불가";
  ceilingHeight: string;
  restroom: string;
  fireSafetyChecked: boolean;
  pillarLocation: string;
  ovenMovePossible: "가능" | "불확실" | "불가";
  mixerMovePossible: "가능" | "불확실" | "불가";
  prooferPlacementPossible: "가능" | "불확실" | "불가";
  coldStoragePlacementPossible: "가능" | "불확실" | "불가";
  showcasePlacementPossible: "가능" | "불확실" | "불가";
  productionSpaceSecured: "가능" | "불확실" | "불가";
  salesSpaceSecured: "가능" | "불확실" | "불가";
  drawingConfirmed: boolean;
}

export interface BreakEvenInput {
  expectedUnitPrice: number;
  expectedDailyVisitors: number;
  expectedDailySales: number;
  expectedMonthlySales: number;
  materialCostRate: number;
  laborCost: number;
  rent: number;
  maintenanceFee: number;
  cardFeeRate: number;
  deliveryFeeRate: number;
  adCost: number;
  otherFixedCost: number;
  premium: number;
}

export interface BreakEvenResult {
  rentBurdenRate: number;
  totalFixedCost: number;
  variableCostRate: number;
  breakEvenSales: number;
  estimatedMonthlyNetProfit: number;
  premiumRecoveryMonths: number | null;
}

export interface BrandMarketingInput {
  brandConcept: string;
  founderStory: string;
  targetCustomer: string;
  signatureMenu: string;
  brandTone: string;
  localKeywords: string;
  naverPlaceStrategy: string;
  blogContentIdeas: string;
  instagramContentIdeas: string;
  reviewEventIdea: string;
}

export interface InteriorSketchInput {
  interiorTone: string;
  operationType: string;
  showcasePosition: string;
  counterPosition: string;
  kitchenPosition: string;
  hallUsage: string;
  customerFlow: string;
  staffFlow: string;
  lowCostIdeas: string;
  checkRequired: string;
}

export interface DiagnosisSections {
  candidateSummary: string;
  keyRisks: string[];
  locationAnalysis: string;
  leaseAnalysis: string;
  facilityRiskAnalysis: string;
  layoutFeasibilityAnalysis: string;
  breakEvenAnalysis: string;
  marketingPotentialAnalysis: string;
  brandStoryDirection: string;
  marketingPotential: string;
  threeMonthMarketingPlan: string;
  localKeywordStrategy: string;
  reviewAndRegularCustomerStrategy: string;
  interiorToneSuggestion: string;
  layoutIdea: string;
  equipmentPlacementIdea: string;
  hallUsageIdea: string;
  customerFlowOpinion: string;
  staffFlowOpinion: string;
  lowCostInteriorIdeas: string;
  interiorCheckRequired: string;
  finalJudgment: string;
  preContractQuestions: string[];
}

export interface ConsultationRecord {
  consultation: ConsultationInput;
  candidateStore: CandidateStoreInput;
  facilityCheck: FacilityCheckInput;
  breakEven: BreakEvenInput;
  brandMarketing?: BrandMarketingInput;
  interiorSketch?: InteriorSketchInput;
}

export interface DiagnosisResult {
  id: string;
  verdict: Verdict;
  reasons: string[];
  breakEvenResult: BreakEvenResult;
  sections: DiagnosisSections;
  generatedAt: string;
}
