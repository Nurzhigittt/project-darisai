import Link from "next/link";

import { Logo } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background p-6">
      <div className="max-w-md text-center">
        <div className="flex justify-center">
          <Logo />
        </div>
        <p className="mt-10 font-mono text-sm font-semibold tracking-widest text-primary">404</p>
        <h1 className="mt-3 text-3xl font-semibold">We could not find that page</h1>
        <p className="mt-3 leading-7 text-muted">
          The link may be old, or the lecture code may belong to a different session.
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground"
        >
          Return home
        </Link>
      </div>
    </div>
  );
}
