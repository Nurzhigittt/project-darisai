import Link from "next/link";

import { Logo } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <div className="app-page grid place-items-center px-4 py-10 sm:px-6">
      <div className="app-hero w-full max-w-xl text-center">
        <div className="flex justify-center">
          <Logo />
        </div>
        <p className="mt-10 text-6xl font-bold tracking-tight text-primary">404</p>
        <h1 className="mt-4 text-[clamp(1.9rem,5vw,2.6rem)] font-bold leading-tight">We could not find that page</h1>
        <p className="mt-3 leading-7 text-muted">
          The link may be old, or the lecture code may belong to a different session.
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex min-h-12 items-center app-primary-button rounded-2xl px-6 font-semibold text-primary-foreground shadow-soft"
        >
          Return home
        </Link>
      </div>
    </div>
  );
}
