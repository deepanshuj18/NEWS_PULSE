import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "News Pulse - Topic-Clustered News Timeline",
  description: "A system that pulls live articles, groups them into topic clusters, and displays a visual timeline.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} bg-slate-50 text-slate-900 dark:bg-[#0B0E14] dark:text-[#F8FAFC] selection:bg-indigo-500/30 min-h-screen flex flex-col antialiased transition-colors duration-300`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <div className="bg-ambient"></div>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
