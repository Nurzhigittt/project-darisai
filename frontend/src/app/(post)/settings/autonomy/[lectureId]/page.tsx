import type { Metadata } from "next";

import { AutonomyScreen } from "@/features/autonomy/autonomy-screen";

export const metadata: Metadata = { title: "AI autonomy", robots: { index: false, follow: false } };

export default async function AutonomyPage({ params }: { params: Promise<{ lectureId: string }> }) {
  const { lectureId } = await params;
  return <AutonomyScreen lectureId={lectureId} />;
}
