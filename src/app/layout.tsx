import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AppChrome } from "@/components/AppChrome";
import { DbProvider } from "@/components/DbProvider";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { SyncProvider } from "@/components/SyncProvider";
import { ThemeProvider } from "@/components/ThemeProvider";

// The fonts are bundled with the app (woff2 files, SIL Open Font License,
// see ./fonts) instead of being fetched from Google Fonts at build time: a change in
// Google's font URLs broke every production build, and the PWA should not depend on
// a third party to render text.
const dmSans = localFont({
  src: "./fonts/dm-sans-latin-wght-normal.woff2",
  variable: "--font-sans",
  weight: "100 1000",
  display: "swap",
});

const dmMono = localFont({
  src: [
    { path: "./fonts/dm-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/dm-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
});

// Display face for headings and big numbers (`font-display`).
const jost = localFont({
  src: "./fonts/jost-latin-wght-normal.woff2",
  variable: "--font-display",
  weight: "100 900",
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
  // The dark theme's --background (globals.css); ThemeProvider's THEME_COLORS and
  // public/manifest.json use the same value.
  themeColor: "#1b1512",
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
    // "dark" is only the first paint (no flash for dark users); ThemeProvider removes
    // it on the client when the stored setting is "light".
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${dmSans.variable} ${dmMono.variable} ${jost.variable} antialiased`}
      >
        <ThemeProvider />
        <AppChrome>
          <DbProvider>{children}</DbProvider>
        </AppChrome>
        <ServiceWorkerRegistration />
        <SyncProvider />
      </body>
    </html>
  );
}
