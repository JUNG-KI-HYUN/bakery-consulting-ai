import { NextResponse } from "next/server";
import { getConsultations, saveConsultation } from "@/lib/diagnosis/diagnosis-service";
import { ConsultationRecord } from "@/lib/diagnosis/types";

export async function GET() {
  const list = await getConsultations();
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const body = (await req.json()) as ConsultationRecord;
  const saved = await saveConsultation(body);
  return NextResponse.json(saved);
}
