import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ThemedToaster } from "@/components/theme/ThemedToaster";
import { ThemeScript } from "@/components/theme/ThemeScript";
import { AppShell } from "@/components/theme/AppShell";
import { AuthNotice } from "@/components/auth/AuthNotice";

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Indian Trading Agent",
  description: "AI-powered short-term trading decisions for NSE/BSE",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${openSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex">
        <ThemeProvider>
          <AppShell>{children}</AppShell>
          <ThemedToaster />
          <AuthNotice />
        </ThemeProvider>
      </body>
    </html>
  );
}
