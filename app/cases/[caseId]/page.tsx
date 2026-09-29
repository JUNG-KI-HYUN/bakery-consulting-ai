import { notFound } from "next/navigation";
import { CaseDetailClient } from "@/components/cases/CaseDetailClient";
import { getCase } from "@/lib/cases/case-repository";

export const dynamic = "force-dynamic";

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const record = await getCase(caseId);
  if (!record) notFound();
  return <CaseDetailClient initialRecord={record} />;
}
