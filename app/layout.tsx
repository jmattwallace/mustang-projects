import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mustang Projects Review",
  description: "A personal project-status board."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
