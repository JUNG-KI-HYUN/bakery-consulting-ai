export function BentoCard({
  title,
  description,
  accent = "default",
}: {
  title: string;
  description: string;
  accent?: "default" | "risk" | "finance" | "marketing";
}) {
  const accentMap = {
    default: "border-slate-200 bg-white",
    risk: "border-red-200 bg-red-50/40",
    finance: "border-amber-200 bg-amber-50/40",
    marketing: "border-blue-200 bg-blue-50/40",
  };

  return (
    <article className={`panel-card rounded-2xl border p-5 ${accentMap[accent]}`}>
      <h3 className="text-base font-semibold text-[#0B1220]">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[#334155]">{description}</p>
    </article>
  );
}
