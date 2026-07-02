export function ChecklistSection({
  title,
  items,
  highlight = false,
}: {
  title: string;
  items: string[];
  highlight?: boolean;
}) {
  return (
    <section
      className={`rounded-xl border p-4 ${
        highlight
          ? "risk-highlight border-red-200"
          : "border-slate-200 bg-white"
      }`}
    >
      <h3 className="text-base font-semibold text-[#0B1220]">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-[#334155]">
        {items.map((item, idx) => (
          <li
            key={`${title}-${idx}`}
            className={`rounded-lg p-2.5 ${
              highlight ? "bg-white/80" : "bg-slate-50"
            }`}
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
