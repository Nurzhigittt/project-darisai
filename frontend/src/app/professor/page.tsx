import type { Metadata } from "next";

import { ProfessorHomeScreen } from "@/features/professor/professor-home-screen";

export const metadata: Metadata = { title: "Teaching space" };

export default function ProfessorPage() {
  return <ProfessorHomeScreen />;
}
