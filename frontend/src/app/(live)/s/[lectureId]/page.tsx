import type { Metadata } from "next";

import { StudentLectureScreen } from "@/features/signal/student-lecture-screen";

export const metadata: Metadata = { title: "Your lecture" };

export default async function StudentLecturePage({
  params,
}: {
  params: Promise<{ lectureId: string }>;
}) {
  const { lectureId } = await params;
  return <StudentLectureScreen lectureId={lectureId} />;
}
