import type { Metadata } from "next";
import { loadStoreDevelopmentReportCenterWorkspace } from "@/lib/store-development-report/pork33-adapter.server";
import { StoreDevelopmentReportCenterClient } from "./StoreDevelopmentReportCenterClient";

export const metadata: Metadata = { title: "FRAMEONE 점포개발 보고서 | FRAMEONE" };

export default async function StoreDevelopmentReportCenterPage() {
  const workspace = await loadStoreDevelopmentReportCenterWorkspace();
  return <StoreDevelopmentReportCenterClient initialWorkspace={workspace} />;
}
