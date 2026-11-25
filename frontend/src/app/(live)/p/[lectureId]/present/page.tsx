import type { Metadata } from "next";

import { PresentationScreen } from "@/features/ripple/presentation-screen";

export const metadata: Metadata = { title: "Join code" };

export default async function PresentationPage({
  params,
}: {
  params: Promise<{ lectureId: string }>;
}) {
  const { lectureId } = await params;
  return <PresentationScreen lectureId={lectureId} />;
}
