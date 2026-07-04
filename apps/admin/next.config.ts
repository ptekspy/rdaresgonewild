import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@rdgw/database", "@rdgw/playbook", "@rdgw/crawler"],
  allowedDevOrigins: ["admin.paidpolitely.com"],

  outputFileTracingIncludes: {
    "/*": [
      "../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/**",
      "../../node_modules/.prisma/client/**",
      "../../packages/database/node_modules/.prisma/client/**",
    ],
  },
};

export default config;