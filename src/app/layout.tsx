import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppChrome } from "@/components/AppChrome";
import { DbProvider } from "@/components/DbProvider";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { SyncProvider } from "@/components/SyncProvider";

// The fonts are bundled with the app (variable woff2 files, SIL Open Font License,
// see ./fonts) instead of being fetched from Google Fonts at build time: a change in
// Google's font URLs broke every production build, and the PWA should not depend on
// a third party to render text.
const plusJakarta = localFont({
  src: "./fonts/plus-jakarta-sans-latin-wght-normal.woff2",
  variable: "--font-sans",
  weight: "200 800",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-mono",
  weight: "100 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ReComp Life",
  description: "GZCLP Workout Tracker & Body Recomposition",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ReComp Life",
  },
  icons: {
    icon: "/icons/icon-512.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${plusJakarta.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <AppChrome>
          <DbProvider>{children}</DbProvider>
        </AppChrome>
        <ServiceWorkerRegistration />
        <SyncProvider />
      </body>
    </html>
  );
}
