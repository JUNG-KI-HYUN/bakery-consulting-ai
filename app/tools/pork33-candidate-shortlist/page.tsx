import type { Metadata } from "next";
import { loadCurrentPork33CandidatePhotoState } from "@/lib/pork33-candidate-shortlist/photo-repository.server";
import { loadCurrentPork33State } from "@/lib/pork33-candidate-shortlist/repository.server";
import { Pork33CandidateShortlistClient } from "./Pork33CandidateShortlistClient";

export const metadata: Metadata = { title: "PORK33 후보점포 Shortlist | FRAMEONE" };

export default async function Pork33CandidateShortlistPage() {
  const [state, photoState] = await Promise.all([
    loadCurrentPork33State(),
    loadCurrentPork33CandidatePhotoState(),
  ]);
  return <Pork33CandidateShortlistClient initialState={state} initialPhotoState={photoState} />;
}
