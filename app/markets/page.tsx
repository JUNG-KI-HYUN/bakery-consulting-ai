import type { Metadata } from "next";
import marketHierarchyJson from "@/data/seoul-market/v1.1-final/MARKET_HIERARCHY.json";
import MarketsExplorer, { type MarketHierarchy } from "./MarketsExplorer";

export const metadata: Metadata = {
  title: "상권분석 | 프레임원 베이커리 창업진단 AI",
  description: "FRAMEONE 서울 주요상권과 세부상권, Node 구조를 탐색합니다.",
};

const marketHierarchy = marketHierarchyJson as unknown as MarketHierarchy;

export default function MarketsPage() {
  return <MarketsExplorer hierarchy={marketHierarchy} />;
}
