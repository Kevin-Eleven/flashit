import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/hooks/useTheme";
// setup reach-hot-toast
import { ToastProvider } from "@/components/toast-provider";

export const metadata: Metadata = {
  title: "FlashIt",
  description:
    "Created by Eleven, FlashIt is a simple and instant file and text sharing app built with Next.js, Express, and Socket.IO.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={"antialiased"}>
        <ToastProvider />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
