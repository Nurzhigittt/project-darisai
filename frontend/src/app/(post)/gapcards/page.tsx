import type { Metadata } from "next";
import { LearningLibrary } from "@/features/library/learning-library";
export const metadata: Metadata = { title: "My learning", robots: { index: false, follow: false } };
export default function Page() { return <LearningLibrary />; }
