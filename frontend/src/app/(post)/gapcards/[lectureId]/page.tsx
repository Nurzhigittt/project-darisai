import type { Metadata } from "next";

import { GapCardsScreen } from "@/features/gapcards/gapcards-screen";

export const metadata: Metadata = { title: "GapCards", robots: { index: false, follow: false } };

export default async function GapCardsPage({ params }: { params: Promise<{ lectureId: string }> }) {
  const { lectureId } = await params;
  return <GapCardsScreen lectureId={lectureId} />;
}
