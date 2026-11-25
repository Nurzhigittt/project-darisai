import type { Metadata } from "next";

import { JoinScreen } from "@/features/join/join-screen";

export const metadata: Metadata = { title: "Join a lecture" };

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <JoinScreen code={code} />;
}
