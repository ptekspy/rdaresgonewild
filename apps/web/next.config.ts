import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@rdgw/playbook"],
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
};

export default config;
