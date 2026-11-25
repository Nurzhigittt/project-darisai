import type { Metadata } from "next";

import { ProfessorLiveScreen } from "@/features/ripple/professor-live-screen";

export const metadata: Metadata = { title: "Live lecture" };

export default async function ProfessorLecturePage({
  params,
}: {
  params: Promise<{ lectureId: string }>;
}) {
  const { lectureId } = await params;
  return <ProfessorLiveScreen lectureId={lectureId} />;
}
