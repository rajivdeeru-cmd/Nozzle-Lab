import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NozzleLab | Supersonic Jet Flow Analyzer",
  description: "Schlieren imaging and AI-assisted analysis for convergent-divergent nozzle experiments."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
