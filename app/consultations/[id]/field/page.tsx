import { notFound } from "next/navigation";
import { FieldTabletShell } from "@/components/field/FieldTabletShell";
import { getConsultationById } from "@/lib/diagnosis/diagnosis-service";
import { buildFieldTabletView } from "@/lib/field/tablet-view";

export default async function ConsultationFieldPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await getConsultationById(id);
  if (!record) return notFound();

  return <FieldTabletShell view={buildFieldTabletView(record)} />;
}
