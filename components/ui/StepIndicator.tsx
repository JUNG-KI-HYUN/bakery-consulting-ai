const steps = [
  "상담 정보",
  "후보 점포",
  "시설·장비",
  "손익분기점",
  "AI 진단",
];

export function StepIndicator({ current = 1 }: { current?: number }) {
  return (
    <ol className="flex flex-wrap gap-2">
      {steps.map((label, index) => {
        const step = index + 1;
        const active = step === current;
        const done = step < current;
        return (
          <li
            key={label}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              active
                ? "bg-[#0B1220] text-white"
                : done
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-600"
            }`}
          >
            {step}. {label}
          </li>
        );
      })}
    </ol>
  );
}
