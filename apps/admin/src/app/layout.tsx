import type { Metadata } from "next";

import "~/styles/globals.css";
import { Toaster } from "~/ui/atoms/sonner";

export const metadata: Metadata = {
  title: "ApcH Admin",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
