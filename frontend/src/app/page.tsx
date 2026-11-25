import type { Metadata } from "next";

import { LandingScreen } from "@/features/landing/landing-screen";

export const metadata: Metadata = {
  title: "DärisAI — Make understanding visible",
  description:
    "Students signal confusion without interrupting. Professors see a calm, real-time Ripple. No student accounts.",
};

export default function HomePage() {
  return <LandingScreen />;
}
