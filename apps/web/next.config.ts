import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@rdgw/playbook", "@paidpolitely/ads-sdk"],
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
};

export default config;
