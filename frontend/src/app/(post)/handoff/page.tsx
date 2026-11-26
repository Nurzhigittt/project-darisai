import type { Metadata } from "next";

import { HandoffScreen } from "@/features/handoff/handoff-screen";

export const metadata: Metadata = {
  title: "Handoff",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function HandoffPage() {
  return <HandoffScreen />;
}
