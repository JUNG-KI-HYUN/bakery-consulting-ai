import {
  CANDIDATE_SCOPED_PHOTO_REFERENCE_SCHEMA_VERSION,
  CandidatePhotoStorageError,
  readCandidateScopedPhotoV1,
  saveCandidateScopedPhotoV1,
} from "@/lib/candidate-photo/storage.server";
import { executePork33CandidatePhotoCommand } from "@/lib/pork33-candidate-shortlist/photo-commands.server";
import { loadCurrentPork33CandidatePhotoState } from "@/lib/pork33-candidate-shortlist/photo-repository.server";
import type { Pork33CandidatePhotoCommand } from "@/lib/pork33-candidate-shortlist/photo-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorStatus(error: CandidatePhotoStorageError): number {
  if (error.code === "PHOTO_NOT_FOUND") return 404;
  if (error.code === "FOREIGN_CASE_PHOTO" || error.code === "FOREIGN_CANDIDATE_PHOTO") return 403;
  return 400;
}
function photoError(error: CandidatePhotoStorageError) {
  return Response.json(
    { code: error.code, message: error.message },
    { status: errorStatus(error), headers: { "Cache-Control": "no-store" } },
  );
}
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (!params.has("assetRef")) {
    return Response.json(await loadCurrentPork33CandidatePhotoState(), {
      headers: { "Cache-Control": "no-store" },
    });
  }
  try {
    const photo = await readCandidateScopedPhotoV1({
      schemaVersion: CANDIDATE_SCOPED_PHOTO_REFERENCE_SCHEMA_VERSION,
      caseId: params.get("caseId") ?? "",
      candidateStoreId: params.get("candidateStoreId") ?? "",
      assetRef: params.get("assetRef") ?? "",
    });
    return new Response(photo.bytes, {
      headers: { "Content-Type": photo.contentType, "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof CandidatePhotoStorageError) return photoError(error);
    return Response.json(
      { code: "PHOTO_STORAGE_ERROR", message: "Candidate Photo 읽기에 실패했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const caseId = form.get("caseId");
      const candidateStoreId = form.get("candidateStoreId");
      if (!(file instanceof File)) {
        return Response.json(
          { code: "INVALID_PHOTO_FILE", message: "Candidate Photo 파일이 필요합니다." },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }
      const saved = await saveCandidateScopedPhotoV1(
        typeof caseId === "string" ? caseId : "",
        typeof candidateStoreId === "string" ? candidateStoreId : "",
        file,
      );
      return Response.json(saved, { status: 201, headers: { "Cache-Control": "no-store" } });
    }
    const command = await request.json() as Pork33CandidatePhotoCommand;
    const state = await executePork33CandidatePhotoCommand(command);
    return Response.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof CandidatePhotoStorageError) return photoError(error);
    if (error instanceof TypeError || error instanceof RangeError) {
      return Response.json(
        { code: "INVALID_PHOTO_FILE", message: error.message },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const message = error instanceof Error ? error.message : "Candidate Photo Metadata를 저장하지 못했습니다.";
    return Response.json({ message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
