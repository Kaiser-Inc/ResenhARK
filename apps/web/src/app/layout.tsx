import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { Providers } from "@/components/providers";
import { ThemeProvider } from "@/components/theme-provider";

import "blobatar/motion.css";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "ResenhARK",
  description: "Uma sala para reunir o time, conversar e jogar.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable} font-sans antialiased`}
    >
      <body>
        <ThemeProvider>
          <Providers>
            <a className="skip-link" href="#main-content">
              Ir para o conteúdo
            </a>
            {children}
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
