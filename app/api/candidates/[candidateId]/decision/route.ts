import { NextResponse } from "next/server";
import { ContractReadinessReferenceError, ContractReadinessRepositoryError } from "@/lib/candidates/contract-readiness-repository";
import {
  getCandidateHumanDecisionView,
  HumanDecisionRepositoryError,
  HumanDecisionRequestError,
  saveCandidateHumanDecision,
} from "@/lib/candidates/human-decision-repository";
import type { CreateHumanDecisionInput, HumanDecisionVerdict } from "@/lib/candidates/human-decision-contract";

function errorResponse(error: unknown) {
  if (error instanceof ContractReadinessReferenceError) return NextResponse.json({ message: error.message }, { status: error.status });
  if (error instanceof HumanDecisionRequestError) return NextResponse.json({ message: error.message }, { status: 400 });
  if (error instanceof ContractReadinessRepositoryError || error instanceof HumanDecisionRepositoryError) return NextResponse.json({ message: "FRAMEONE 최종 판단 저장소를 처리하지 못했습니다." }, { status: 500 });
  return NextResponse.json({ message: "FRAMEONE 최종 판단을 처리하지 못했습니다." }, { status: 500 });
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function decisionInput(body: Record<string, unknown>): CreateHumanDecisionInput {
  return {
    verdict: (typeof body.verdict === "string" ? body.verdict : "") as HumanDecisionVerdict,
    rationale: typeof body.rationale === "string" ? body.rationale : "",
    reviewerName: typeof body.reviewerName === "string" ? body.reviewerName : "",
    positiveFactors: stringList(body.positiveFactors),
    keyRisks: stringList(body.keyRisks),
    unresolvedConditions: stringList(body.unresolvedConditions),
    conditionsBeforeProceeding: stringList(body.conditionsBeforeProceeding),
    landlordConfirmations: stringList(body.landlordConfirmations),
    expertConfirmations: stringList(body.expertConfirmations),
    nextActions: stringList(body.nextActions),
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ candidateId: string }> }) {
  try {
    const caseId = new URL(request.url).searchParams.get("caseId") ?? "";
    return NextResponse.json(await getCandidateHumanDecisionView((await params).candidateId, caseId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ candidateId: string }> }) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const caseId = typeof body.caseId === "string" ? body.caseId : "";
    return NextResponse.json(await saveCandidateHumanDecision((await params).candidateId, caseId, decisionInput(body)), { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ message: "JSON 요청 본문이 올바르지 않습니다." }, { status: 400 });
    return errorResponse(error);
  }
}
