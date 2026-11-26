import type { Metadata } from "next";

import { ReplayScreen } from "@/features/replay/replay-screen";

export const metadata: Metadata = { title: "Replay", robots: { index: false, follow: false } };

export default async function ReplayPage({ params }: { params: Promise<{ lectureId: string }> }) {
  const { lectureId } = await params;
  return <ReplayScreen key={lectureId} lectureId={lectureId} />;
}
