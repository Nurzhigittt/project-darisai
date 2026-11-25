import type { Metadata } from "next";

import { PrivacyScreen } from "@/features/privacy/privacy-screen";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return <PrivacyScreen />;
}
