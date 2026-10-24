import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Instrument_Serif, Manrope, Syne } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const syne = Syne({ subsets: ["latin"], variable: "--font-syne", display: "swap" });
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], variable: "--font-instrument-serif", display: "swap", weight: "400" });

export const metadata: Metadata = {
  title: "Ilyc | Ensaios fotográficos",
  description: "Ensaios fotográficos entre a luz e a sombra.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <body className={`${manrope.variable} ${syne.variable} ${instrumentSerif.variable}`}>{children}</body>
    </html>
  );
}
