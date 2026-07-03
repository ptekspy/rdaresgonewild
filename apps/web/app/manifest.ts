import { getSiteConfig } from "@/lib/site";
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const site = getSiteConfig();

  return {
    name: site.name,
    short_name: site.shortName,
    description: site.description,
    start_url: "/",
    display: "standalone",
    theme_color: site.themeColor,
    background_color: site.backgroundColor,
    icons: [
      {
        src: site.brand.mark,
        sizes: "any",
        type: site.brand.mark.endsWith(".svg") ? "image/svg+xml" : "image/png",
        purpose: "maskable",
      },
    ],
  };
}
