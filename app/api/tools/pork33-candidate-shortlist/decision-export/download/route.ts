import { readPork33DecisionBatchFile } from "@/lib/pork33-candidate-shortlist/decision-batch.server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const values = new URL(request.url).searchParams;
    const batchId = values.get("batchId") ?? "";
    const category = values.get("category") ?? "";
    const fileName = values.get("fileName") ?? "";
    const file = await readPork33DecisionBatchFile(batchId, category, fileName);
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "V2 PDF를 찾을 수 없습니다." }, { status: 404 });
  }
}
