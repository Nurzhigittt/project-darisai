import "@/styles/globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { Providers } from "@/components/providers";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { SkipLink } from "@/components/ui/skip-link";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "DärisAI — Make understanding visible",
    template: "%s · DärisAI",
  },
  description:
    "A local-first classroom signal layer. Students speak up without interrupting; professors see the moment a room loses the thread.",
  applicationName: "DärisAI",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/daris-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/daris-apple-touch.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "DärisAI",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "DärisAI — Make understanding visible",
    description:
      "Local-first classroom intelligence. No student accounts.",
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
      "Local-first classroom intelligence. No student accounts.",
    images: ["/social-preview.png"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EAF2EF" },
    { media: "(prefers-color-scheme: dark)", color: "#122C34" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body>
        <Providers>
          <SkipLink />
          <ServiceWorkerRegister />
          {children}
        </Providers>
      </body>
    </html>
  );
}
