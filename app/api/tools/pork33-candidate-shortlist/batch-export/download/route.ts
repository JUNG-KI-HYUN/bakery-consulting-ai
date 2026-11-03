import { readPork33BatchFile } from "@/lib/pork33-candidate-shortlist/batch-export.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentDisposition(fileName: string) {
  const fallback = fileName.replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const batchId = query.get("batchId") ?? "";
    const category = query.get("category") ?? "";
    const fileName = query.get("fileName") ?? "";
    const output = await readPork33BatchFile(batchId, category, fileName);
    return new Response(output.bytes, { headers: { "Cache-Control": "no-store", "Content-Disposition": contentDisposition(output.fileName), "Content-Type": "application/pdf" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Batch PDF를 찾지 못했습니다.";
    return Response.json({ message }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
