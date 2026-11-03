import { generatePork33ShortlistPdf } from "@/lib/pork33-candidate-shortlist/pdf-export.server";
import { loadCurrentPork33State } from "@/lib/pork33-candidate-shortlist/repository.server";
import { parsePork33ReportScope } from "@/lib/pork33-candidate-shortlist/report";

export const runtime = "nodejs";

function contentDisposition(fileName: string) {
  const fallback = fileName.replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const scope = parsePork33ReportScope({ scopeType: query.get("scopeType"), regionId: query.get("regionId"), localityKey: query.get("localityKey"), candidateStoreId: query.get("candidateStoreId") });
    const output = await generatePork33ShortlistPdf(await loadCurrentPork33State(), scope);
    return new Response(output.bytes, { headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": contentDisposition(output.fileName),
      "Content-Type": "application/pdf",
      "X-FRAMEONE-Page-Count": String(output.diagnostics.pageCount),
      "X-FRAMEONE-Overlap-Count": String(output.diagnostics.overlapCount),
    } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF를 생성하지 못했습니다.";
    const status = /찾을 수 없습니다|유효한 PDF 범위/u.test(message) ? 400 : 500;
    return Response.json({ message }, { status });
  }
}
