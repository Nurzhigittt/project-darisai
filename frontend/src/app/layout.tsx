import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "@/styles/globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { Providers } from "@/components/providers";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "DärisAI — Make understanding visible",
    template: "%s · DärisAI",
  },
  description:
    "A quiet, anonymous Signal & Ripple tool for lectures. Students speak up without interrupting; professors see moments that need clarification.",
  applicationName: "DärisAI",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "DärisAI",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "DärisAI — Make understanding visible",
    description:
      "A quiet, anonymous Signal & Ripple tool for lectures. No student accounts.",
    type: "website",
    images: [
      {
        url: "/social-preview.png",
        width: 1280,
        height: 640,
        alt: "DärisAI — Make understanding visible",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DärisAI — Make understanding visible",
    description:
      "A quiet, anonymous Signal & Ripple tool for lectures. No student accounts.",
    images: ["/social-preview.png"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF8F3" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body>
        <a
          href="#main"
          className="sr-only-focusable fixed left-3 top-3 z-[200] rounded-lg bg-primary px-4 py-2 font-semibold text-white"
        >
          Skip to content
        </a>
        <Providers>
          <ServiceWorkerRegister />
          {children}
        </Providers>
      </body>
    </html>
  );
}
