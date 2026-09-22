import { NextResponse } from "next/server";
import {
  ResearchRecordConflictError,
  createResearchRecord,
  listResearchRecords,
} from "@/lib/research/research-repository";

export async function GET() {
  return NextResponse.json(await listResearchRecords());
}

export async function POST(request: Request) {
  try {
    const result = await createResearchRecord(await request.json());
    return NextResponse.json(
      {
        repositoryRecordId: result.record.recordId,
        created: result.created,
        record: result.record,
      },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof ResearchRecordConflictError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
    }
    if (error instanceof TypeError) {
      return NextResponse.json({ message: error.message }, { status: 422 });
    }
    throw error;
  }
}
