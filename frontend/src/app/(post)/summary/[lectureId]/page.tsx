import type { Metadata } from "next";

import { LectureSummaryScreen } from "@/features/analytics/lecture-summary-screen";

export const metadata: Metadata = { title: "Lecture summary" };

export default async function SummaryPage({
  params,
}: {
  params: Promise<{ lectureId: string }>;
}) {
  const { lectureId } = await params;
  return <LectureSummaryScreen lectureId={lectureId} />;
}
