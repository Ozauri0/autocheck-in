import type { Metadata } from "next";
import { Credits } from "@/components/credits";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Auto check-in UCT", template: "%s · Auto check-in UCT" },
  description:
    "Auto check-in por QR de la Universidad Católica de Temuco y el CINAP (Centro de Innovación en Aprendizaje, Docencia y Tecnología Educativa)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {children}
        <Credits />
      </body>
    </html>
  );
}
