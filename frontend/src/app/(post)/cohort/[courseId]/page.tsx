import type { Metadata } from "next";

import { CohortScreen } from "@/features/cohort/cohort-screen";

export const metadata: Metadata = { title: "Cohort Memory", robots: { index: false, follow: false } };

export default async function CohortPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  return <CohortScreen key={courseId} courseId={courseId} />;
}
