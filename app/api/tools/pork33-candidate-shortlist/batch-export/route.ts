import { generatePork33BatchExport } from "@/lib/pork33-candidate-shortlist/batch-export.server";
import { loadCurrentPork33State } from "@/lib/pork33-candidate-shortlist/repository.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

export async function POST() {
  try {
    const manifest = await generatePork33BatchExport(await loadCurrentPork33State());
    return Response.json(manifest, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PORK33 Batch PDF를 생성하지 못했습니다.";
    return Response.json({ message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
