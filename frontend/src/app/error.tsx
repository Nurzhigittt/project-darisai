"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="app-page grid place-items-center px-4 py-10 sm:px-6">
      <div className="app-hero w-full max-w-xl">
        <ErrorState
          title="Something went wrong"
          body="This screen could not be rendered. Your local study history was not uploaded or deleted."
          action={<Button onClick={reset}>Try again</Button>}
        />
      </div>
    </div>
  );
}
