import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dra. Maria Carolini - Fisioterapeuta",
    short_name: "Maria Carolini",
    description: "Gestão de pacientes, sessões, pagamentos e agenda da Dra. Maria Carolini.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f3f8f5",
    theme_color: "#07533f",
    categories: ["medical", "business", "productivity"],
    icons: [
      {
        src: "/logo-dra-maria-carolini-icon-final.jpg",
        sizes: "1254x1254",
        type: "image/jpeg",
        purpose: "any",
      },
      {
        src: "/app-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/app-icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
