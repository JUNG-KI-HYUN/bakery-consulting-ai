"use client";

import { formatWonInput } from "@/lib/format/won";

export function WonInput({
  label,
  value,
  onChange,
  description,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <span className="input flex items-center gap-2 focus-within:border-stone-500">
        <input
          className="min-w-0 flex-1 bg-transparent outline-none"
          type="text"
          inputMode="numeric"
          value={formatWonInput(value)}
          onChange={(event) => onChange(formatWonInput(event.target.value))}
          placeholder="미입력"
          autoComplete="off"
        />
        <span className="shrink-0 text-stone-400">원</span>
      </span>
      {description ? <span className="mt-1 block text-xs leading-5 text-stone-500">{description}</span> : null}
    </label>
  );
}
