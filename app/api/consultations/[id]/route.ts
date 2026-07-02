import { NextResponse } from "next/server";
import { getConsultationById } from "@/lib/diagnosis/diagnosis-service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const item = await getConsultationById(id);
  if (!item) {
    return NextResponse.json({ message: "not found" }, { status: 404 });
  }
  return NextResponse.json(item);
}
