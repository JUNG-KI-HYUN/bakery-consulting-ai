import { NextResponse } from "next/server";
import { runDiagnosis } from "@/lib/diagnosis/diagnosis-service";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await runDiagnosis(id);
  if (!result) {
    return NextResponse.json({ message: "not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}
