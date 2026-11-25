import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";

export function ErrorState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="rounded-3xl border border-ripple-warm/30 bg-ripple-warm/5 px-6 py-10 text-center"
    >
      <AlertCircle aria-hidden className="mx-auto size-8 text-ripple-warm" />
      <h3 className="mt-4 text-lg font-bold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
