import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Auto check-in UCT", template: "%s · Auto check-in UCT" },
  description: "Administración del auto check-in por QR de la Universidad Católica de Temuco",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
