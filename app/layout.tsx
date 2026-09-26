import type { Metadata } from "next";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dra. Maria Carolini | Fisioterapeuta",
  description: "Controle de pacientes, pacotes, sessões, pagamentos e agenda.",
  applicationName: "Dra. Maria Carolini",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Dra. Maria Carolini",
  },
  icons: {
    icon: "/logo-dra-maria-carolini-icon-final.jpg",
    shortcut: "/logo-dra-maria-carolini-icon-final.jpg",
    apple: "/logo-dra-maria-carolini-icon-final.jpg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}<PwaRegister /></body>
    </html>
  );
}
