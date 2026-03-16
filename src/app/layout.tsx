import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The Art of Prompt",
  description:
    "Collaborative generative art through sequential prompts to Claude.",
  openGraph: {
    title: "The Art of Prompt",
    description: "Collaborative generative art through sequential prompts to Claude.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "The Art of Prompt",
    description: "Collaborative generative art through sequential prompts to Claude.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
