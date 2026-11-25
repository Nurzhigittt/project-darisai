import type { Metadata } from "next";

import { OfflineContent } from "@/features/offline/offline-content";

export const metadata: Metadata = { title: "Offline" };

export default function OfflinePage() {
  return <OfflineContent />;
}
