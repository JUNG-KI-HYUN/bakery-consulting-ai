import { readPork33BriefingBatchFile } from "@/lib/pork33-candidate-shortlist/briefing-batch.server";

export const runtime = "nodejs";

function contentDisposition(fileName: string) {
  const fallback = fileName.replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const output = await readPork33BriefingBatchFile(query.get("batchId") ?? "", query.get("category") ?? "", query.get("fileName") ?? "");
    return new Response(output.bytes, { headers: { "Cache-Control": "no-store", "Content-Disposition": contentDisposition(output.fileName), "Content-Type": "application/pdf" } });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "파일을 읽지 못했습니다." }, { status: 400 });
  }
}
