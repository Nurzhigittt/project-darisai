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
    <div className="grid min-h-dvh place-items-center bg-background p-6">
      <div className="w-full max-w-lg">
        <ErrorState
          title="Something went wrong"
          body="This screen could not be rendered. Your local study history was not uploaded or deleted."
          action={<Button onClick={reset}>Try again</Button>}
        />
      </div>
    </div>
  );
}
