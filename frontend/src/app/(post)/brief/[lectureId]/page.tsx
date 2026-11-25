import type { Metadata } from "next";

import { BriefScreen } from "@/features/brief/brief-screen";

export const metadata: Metadata = { title: "BriefNext & Handoff", robots: { index: false, follow: false } };

export default async function BriefPage({ params }: { params: Promise<{ lectureId: string }> }) {
  const { lectureId } = await params;
  return <BriefScreen key={lectureId} lectureId={lectureId} />;
}
