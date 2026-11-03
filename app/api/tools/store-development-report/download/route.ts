import { readStoreDevelopmentReportFile } from "@/lib/store-development-report/pork33-adapter.server";

export const runtime = "nodejs";

function contentDisposition(fileName: string) {
  const fallback = fileName.replace(/[^\x20-\x7E]+/gu, "_").replace(/["\\]/gu, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const output = await readStoreDevelopmentReportFile(query.get("generationId") ?? "", query.get("fileName") ?? "");
    return new Response(output.bytes, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": contentDisposition(output.fileName),
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "보고서 파일을 읽지 못했습니다." }, { status: 404 });
  }
}
