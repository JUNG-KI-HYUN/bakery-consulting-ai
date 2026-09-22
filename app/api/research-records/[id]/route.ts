import { NextResponse } from "next/server";
import {
  getResearchRecord,
  markExcluded,
  updateVerificationStatus,
} from "@/lib/research/research-repository";
import { VERIFICATION_STATUSES, type VerificationStatus } from "@/lib/research/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const record = await getResearchRecord(id);
  return record
    ? NextResponse.json(record)
    : NextResponse.json({ message: "not found" }, { status: 404 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json() as { verificationStatus?: unknown; changedAt?: unknown };
  if (!VERIFICATION_STATUSES.includes(body.verificationStatus as VerificationStatus)) {
    return NextResponse.json({ message: "Unknown verificationStatus." }, { status: 422 });
  }
  const verificationStatus = body.verificationStatus as VerificationStatus;
  const changedAt = typeof body.changedAt === "string" && Number.isFinite(Date.parse(body.changedAt))
    ? body.changedAt
    : new Date().toISOString();
  const record = verificationStatus === "EXCLUDED"
    ? await markExcluded(id, changedAt)
    : await updateVerificationStatus(id, verificationStatus, changedAt);
  return record
    ? NextResponse.json(record)
    : NextResponse.json({ message: "not found" }, { status: 404 });
}
