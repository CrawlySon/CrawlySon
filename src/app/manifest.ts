import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Rypák – denník, ktorý ti to povie",
    short_name: "Rypák",
    description: "Nutričný denník s koučom, ktorý komentuje, čo si zapíšeš.",
    lang: "sk",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6eedc",
    theme_color: "#f6eedc",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
