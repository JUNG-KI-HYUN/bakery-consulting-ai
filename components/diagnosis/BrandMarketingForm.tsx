"use client";

import { BrandMarketingInput } from "@/lib/diagnosis/types";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function BrandMarketingForm({
  value,
  onChange,
}: {
  value: BrandMarketingInput;
  onChange: (next: BrandMarketingInput) => void;
}) {
  const update = <K extends keyof BrandMarketingInput>(
    key: K,
    next: BrandMarketingInput[K],
  ) => onChange({ ...value, [key]: next });

  return (
    <section className="panel-card rounded-2xl p-5">
      <p className="text-xs font-semibold text-[#2563EB]">브랜드·마케팅 설계</p>
      <h2 className="mt-1 text-lg font-bold text-[#0B1220]">브랜드·마케팅 설계</h2>
      <p className="mt-1 text-sm text-[#334155]">
        손님이 왜 이 빵집을 기억해야 할지 같이 봅니다.
      </p>
      <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        오픈 초기 3개월은 고객이 이 매장을 기억하게 만드는 시간입니다.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="브랜드 콘셉트">
          <input
            className="input"
            value={value.brandConcept}
            onChange={(e) => update("brandConcept", e.target.value)}
          />
        </Field>
        <Field label="창업 스토리">
          <input
            className="input"
            value={value.founderStory}
            onChange={(e) => update("founderStory", e.target.value)}
          />
        </Field>
        <Field label="대표 고객층">
          <input
            className="input"
            value={value.targetCustomer}
            onChange={(e) => update("targetCustomer", e.target.value)}
          />
        </Field>
        <Field label="시그니처 메뉴 후보">
          <input
            className="input"
            value={value.signatureMenu}
            onChange={(e) => update("signatureMenu", e.target.value)}
          />
        </Field>
        <Field label="브랜드 톤">
          <input
            className="input"
            value={value.brandTone}
            onChange={(e) => update("brandTone", e.target.value)}
          />
        </Field>
        <Field label="지역 키워드">
          <input
            className="input"
            value={value.localKeywords}
            onChange={(e) => update("localKeywords", e.target.value)}
          />
        </Field>
        <Field label="네이버 플레이스 전략 메모">
          <textarea
            className="input min-h-20"
            value={value.naverPlaceStrategy}
            onChange={(e) => update("naverPlaceStrategy", e.target.value)}
          />
        </Field>
        <Field label="블로그 콘텐츠 소재">
          <textarea
            className="input min-h-20"
            value={value.blogContentIdeas}
            onChange={(e) => update("blogContentIdeas", e.target.value)}
          />
        </Field>
        <Field label="인스타그램 콘텐츠 소재">
          <textarea
            className="input min-h-20"
            value={value.instagramContentIdeas}
            onChange={(e) => update("instagramContentIdeas", e.target.value)}
          />
        </Field>
        <Field label="리뷰 이벤트 아이디어">
          <textarea
            className="input min-h-20"
            value={value.reviewEventIdea}
            onChange={(e) => update("reviewEventIdea", e.target.value)}
          />
        </Field>
      </div>
    </section>
  );
}
