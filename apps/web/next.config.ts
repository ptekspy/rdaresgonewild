import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

const config: NextConfig = {
  transpilePackages: ["@rdgw/database", "@rdgw/playbook"],
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
};

export default config;
