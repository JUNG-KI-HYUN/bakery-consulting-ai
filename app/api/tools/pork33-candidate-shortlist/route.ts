import { executePork33ShortlistCommand } from "@/lib/pork33-candidate-shortlist/commands.server";
import { loadCurrentPork33State } from "@/lib/pork33-candidate-shortlist/repository.server";
import type { Pork33ShortlistCommand } from "@/lib/pork33-candidate-shortlist/types";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(await loadCurrentPork33State(), {
    headers: { "Cache-Control": "no-store" },
  });
}
export async function POST(request: Request) {
  try {
    const command = await request.json() as Pork33ShortlistCommand;
    const state = await executePork33ShortlistCommand(command);
    return Response.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Candidate 변경을 저장하지 못했습니다.";
    return Response.json({ message }, { status: 400 });
  }
}
