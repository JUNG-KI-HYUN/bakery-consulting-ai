import { readPork33BriefingAsset } from "@/lib/pork33-candidate-shortlist/briefing-assets.server";
import { loadCurrentPork33State } from "@/lib/pork33-candidate-shortlist/repository.server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const assetRef = new URL(request.url).searchParams.get("ref") ?? "";
    if (!/^(MAP:P33-\d{3}|PHOTO:P33-\d{3}:\d+)$/u.test(assetRef)) throw new Error("Asset reference가 올바르지 않습니다.");
    const output = await readPork33BriefingAsset(await loadCurrentPork33State(), assetRef);
    return new Response(output.bytes, { headers: { "Cache-Control": "private, max-age=300", "Content-Type": output.contentType, "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "Report asset을 읽지 못했습니다." }, { status: 400 });
  }
}
