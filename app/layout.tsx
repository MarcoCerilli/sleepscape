import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SleepScape",
  description: "Crea il posto in cui vuoi dormire.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#090a12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
