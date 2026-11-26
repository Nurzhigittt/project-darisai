import type { Metadata } from "next";
import { TranscriptScreen } from "@/features/transcript/transcript-screen";
export const metadata: Metadata = { title: "Transcript", robots: { index: false, follow: false } };
export default async function TranscriptPage({ params }: { params: Promise<{ lectureId: string }> }) {
  const { lectureId } = await params;
  return <TranscriptScreen key={lectureId} lectureId={lectureId} />;
}
